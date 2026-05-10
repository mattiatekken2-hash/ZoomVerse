import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { recordHistoryAsync } from "../lib/history";

const router: IRouter = Router();

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Maximum age of a pending claim before the next /wheel/spin is allowed to
// overwrite it. Protects against a user whose tab crashed mid-spin getting
// permanently blocked from spinning. Generous so any real animation+claim
// round-trip (target ≤ 6s) finishes well within the window.
const PENDING_CLAIM_TTL_MS = 5 * 60 * 1000;

export interface WheelPrize {
  index: number;
  type: "zoom" | "planet" | "stars" | "ton";
  zoomAmount?: number;
  planetType?: "BASIC" | "RARE" | "EPIC";
  starsAmount?: number;
  tonAmount?: number;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  weight: number;
}

// 12 segments. Decoys (stars/ton) have weight 0 — visible but never selected.
export const WHEEL_PRIZES: WheelPrize[] = [
  { index: 0,  type: "zoom",   zoomAmount: 100,   label: "100 $ZOOM",   shortLabel: "100",   icon: "🪐", color: "#8892b0", weight: 35 },
  { index: 1,  type: "stars",  starsAmount: 100,  label: "100 STARS",   shortLabel: "100",   icon: "⭐", color: "#ffd700", weight: 0 },
  { index: 2,  type: "zoom",   zoomAmount: 500,   label: "500 $ZOOM",   shortLabel: "500",   icon: "🪐", color: "#4facfe", weight: 25 },
  { index: 3,  type: "ton",    tonAmount: 1,      label: "1 TON",       shortLabel: "1",     icon: "💎", color: "#0098ea", weight: 0 },
  { index: 4,  type: "zoom",   zoomAmount: 1000,  label: "1K $ZOOM",    shortLabel: "1K",    icon: "🪐", color: "#00f2fe", weight: 15 },
  { index: 5,  type: "planet", planetType: "BASIC", label: "BASIC PLANET", shortLabel: "BASIC", icon: "◇", color: "#a0aec0", weight: 10 },
  { index: 6,  type: "zoom",   zoomAmount: 2500,  label: "2.5K $ZOOM",  shortLabel: "2.5K",  icon: "🪐", color: "#43e97b", weight: 7 },
  { index: 7,  type: "stars",  starsAmount: 200,  label: "200 STARS",   shortLabel: "200",   icon: "⭐", color: "#ffb347", weight: 0 },
  { index: 8,  type: "planet", planetType: "RARE",  label: "RARE PLANET",  shortLabel: "RARE",  icon: "◈", color: "#4facfe", weight: 5 },
  { index: 9,  type: "ton",    tonAmount: 10,     label: "10 TON",      shortLabel: "10",    icon: "💎", color: "#00d4ff", weight: 0 },
  { index: 10, type: "zoom",   zoomAmount: 5000,  label: "5K $ZOOM",    shortLabel: "5K",    icon: "🪐", color: "#f093fb", weight: 2.5 },
  { index: 11, type: "planet", planetType: "EPIC",  label: "EPIC PLANET",  shortLabel: "EPIC",  icon: "⬡", color: "#c471ed", weight: 0.5 },
];

function pickPrize(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of WHEEL_PRIZES) {
    if (p.weight <= 0) continue;
    r -= p.weight;
    if (r <= 0) return p;
  }
  return WHEEL_PRIZES[0];
}

// Compact public-facing prize shape (no `weight`). Stored inside
// `pendingWheelClaim` and echoed back to the client at /spin and /status.
type PublicPrize = Omit<WheelPrize, "weight" | "shortLabel">;
function toPublicPrize(p: WheelPrize): PublicPrize {
  return {
    index: p.index,
    type: p.type,
    zoomAmount: p.zoomAmount,
    planetType: p.planetType,
    starsAmount: p.starsAmount,
    tonAmount: p.tonAmount,
    label: p.label,
    icon: p.icon,
    color: p.color,
  };
}

interface PendingClaim {
  token: string;
  prizeIndex: number;
  prize: PublicPrize;
  createdAt: number;
}

router.get("/wheel/config", (_req, res) => {
  res.json({
    prizes: WHEEL_PRIZES.map(({ index, type, zoomAmount, planetType, starsAmount, tonAmount, label, shortLabel, icon, color }) => ({
      index, type, zoomAmount, planetType, starsAmount, tonAmount, label, shortLabel, icon, color,
    })),
  });
});

async function getStatus(telegramId: string) {
  const [row] = await db
    .select({
      spins: usersTable.wheelSpins,
      lastDaily: usersTable.lastWheelDailyAt,
      pendingClaim: usersTable.pendingWheelClaim,
    })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  const spins = row?.spins ?? 0;
  const lastDaily = row?.lastDaily ? row.lastDaily.getTime() : 0;
  const nextClaimAt = lastDaily ? lastDaily + DAILY_COOLDOWN_MS : 0;
  const canClaimDaily = !lastDaily || Date.now() >= nextClaimAt;
  const rawPending = row?.pendingClaim as PendingClaim | null | undefined;
  // Validate shape; treat malformed values as no pending so the user can spin again.
  const pendingPrize: PendingClaim | null =
    rawPending && typeof rawPending === "object"
      && typeof rawPending.token === "string"
      && typeof rawPending.prizeIndex === "number"
      && rawPending.prize && typeof rawPending.prize === "object"
      ? rawPending
      : null;
  return { spins, canClaimDaily, nextClaimAt, pendingPrize };
}

router.get("/wheel/status/:telegramId", async (req, res) => {
  try {
    const status = await getStatus(req.params.telegramId);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "[wheel/status] error");
    res.status(500).json({ error: "Internal error" });
  }
});

// Backwards-compatible
router.get("/wheel/spins/:telegramId", async (req, res) => {
  try {
    const status = await getStatus(req.params.telegramId);
    res.json({ spins: status.spins, canClaimDaily: status.canClaimDaily, nextClaimAt: status.nextClaimAt });
  } catch (err) {
    req.log.error({ err }, "[wheel/spins] error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/wheel/claim-daily", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    const cutoff = new Date(Date.now() - DAILY_COOLDOWN_MS);
    const updated = await db.execute(sql`
      UPDATE users
      SET wheel_spins = wheel_spins + 1,
          last_wheel_daily_at = NOW()
      WHERE telegram_id = ${telegramId}
        AND (last_wheel_daily_at IS NULL OR last_wheel_daily_at <= ${cutoff.toISOString()})
      RETURNING wheel_spins, last_wheel_daily_at
    `);

    if (!updated.rows || updated.rows.length === 0) {
      // Need to also create user row if missing
      const [exists] = await db.select({ id: usersTable.telegramId }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      if (!exists) {
        await db.insert(usersTable).values({ telegramId, wheelSpins: 1, lastWheelDailyAt: new Date() }).onConflictDoNothing();
        const status = await getStatus(telegramId);
        res.json({ ok: true, ...status });
        return;
      }
      const status = await getStatus(telegramId);
      res.status(409).json({ error: "Daily already claimed", ...status });
      return;
    }

    const status = await getStatus(telegramId);
    res.json({ ok: true, ...status });
  } catch (err) {
    req.log.error({ err }, "[wheel/claim-daily] error");
    res.status(500).json({ error: "Internal error" });
  }
});

interface FeedEntry {
  ts: number;
  name: string;
  prizeLabel: string;
  prizeIcon: string;
  prizeColor: string;
  prizeType: "zoom" | "planet" | "stars" | "ton";
}
const FEED_MAX = 40;
const recentSpins: FeedEntry[] = [];
function pushFeed(entry: FeedEntry) {
  recentSpins.unshift(entry);
  if (recentSpins.length > FEED_MAX) recentSpins.length = FEED_MAX;
}
function maskName(first: string | null | undefined, username: string | null | undefined, telegramId: string): string {
  const raw = (first && first.trim()) || (username && username.trim()) || `Player${telegramId.slice(-4)}`;
  if (raw.length <= 2) return raw + "•";
  if (raw.length <= 4) return raw.slice(0, 2) + "•".repeat(raw.length - 2);
  return raw.slice(0, 3) + "•".repeat(Math.min(3, raw.length - 4)) + raw.slice(-1);
}

router.get("/wheel/feed", (_req, res) => {
  res.json({ entries: recentSpins });
});

// ─────────────────────────────────────────────────────────────────────────────
// Two-step spin: /wheel/spin RESERVES the prize (decrements spins, picks the
// outcome, stores it as `pendingWheelClaim`) but DOES NOT yet credit the user.
// The client animates the wheel for ~5s and then calls /wheel/spin/claim,
// which actually credits balance / planet bonus and pushes the public feed.
//
// Why this matters: previously /wheel/spin both picked AND credited. If the
// user closed the app mid-animation they would still receive the prize but
// would never see the wheel stop on it — the credit was disconnected from
// the visual outcome. Worse, a second device opening the app could see the
// new balance before the wheel had even stopped on the first one. The user
// asked: "deve accreditare solo quando si ferma sul premio." — that is now
// the contract.
//
// Concurrency safety:
// - A single `pendingWheelClaim` slot per user. A second /spin while a
//   pending claim is alive is rejected unless the previous one is older
//   than PENDING_CLAIM_TTL_MS (covers tab-crash recovery).
// - The /claim endpoint validates the token and atomically clears the
//   pending row in the same UPDATE that credits the balance, so a
//   double-claim race only credits once.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/wheel/spin", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    // Whole flow in ONE transaction with a row lock on the user. This
    // closes a race where two concurrent /wheel/spin calls would each
    // pass the freshness check, both decrement wheel_spins, and the
    // second pending-write would orphan the first one's prize.
    // SELECT … FOR UPDATE serializes them so the second waits, then sees
    // the fresh pending and 409s without consuming a spin.
    const out = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          spins: usersTable.wheelSpins,
          pending: usersTable.pendingWheelClaim,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);

      if (!row) {
        // Lazy-create the user row to match /wheel/claim-daily's behaviour
        // (a brand-new telegram_id should not crash the spin endpoint with
        // a 404). With wheel_spins = 0 the next branch returns the normal
        // "No spins available" 409 — same UX as an existing user with no
        // spins left.
        await tx
          .insert(usersTable)
          .values({ telegramId, wheelSpins: 0 })
          .onConflictDoNothing();
        return { kind: "err" as const, status: 409, error: "No spins available" };
      }

      const pendingExisting = row.pending as PendingClaim | null | undefined;
      if (
        pendingExisting && typeof pendingExisting === "object"
        && typeof pendingExisting.createdAt === "number"
        && Date.now() - pendingExisting.createdAt < PENDING_CLAIM_TTL_MS
      ) {
        return {
          kind: "err" as const,
          status: 409,
          error: "Pending spin not yet claimed",
          pendingPrize: pendingExisting,
        };
      }

      if ((row.spins ?? 0) <= 0) {
        return { kind: "err" as const, status: 409, error: "No spins available" };
      }

      const prize = pickPrize();
      // Defensive guard: only "zoom" and "planet" are creditable today.
      // `pickPrize` skips weight=0 entries so this can't trigger with the
      // current catalog, but if anyone ever raises a stars/ton weight
      // without first adding credit logic in /wheel/spin/claim, we refuse
      // to reserve the prize rather than create a pending claim that the
      // claim endpoint cannot honor.
      if (prize.type !== "zoom" && prize.type !== "planet") {
        req.log.error({ prizeIndex: prize.index, prizeType: prize.type }, "[wheel/spin] unsupported prize type picked");
        return { kind: "err" as const, status: 500, error: "Internal error" };
      }
      const claim: PendingClaim = {
        token: randomUUID(),
        prizeIndex: prize.index,
        prize: toPublicPrize(prize),
        createdAt: Date.now(),
      };

      // Decrement + write pending in the same UPDATE so they cannot
      // diverge. If this single statement fails the whole tx rolls back
      // and the spin counter is untouched — no lost spin, no stranded
      // pending claim.
      const [updated] = await tx
        .update(usersTable)
        .set({
          wheelSpins: sql`${usersTable.wheelSpins} - 1`,
          pendingWheelClaim: claim,
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({ spins: usersTable.wheelSpins });

      return {
        kind: "ok" as const,
        prizeIndex: claim.prizeIndex,
        prize: claim.prize,
        claimToken: claim.token,
        spinsRemaining: updated?.spins ?? 0,
      };
    });

    if (out.kind === "err") {
      const body: Record<string, unknown> = { error: out.error };
      if (out.pendingPrize) body.pendingPrize = out.pendingPrize;
      res.status(out.status).json(body);
      return;
    }

    res.json({
      prizeIndex: out.prizeIndex,
      prize: out.prize,
      claimToken: out.claimToken,
      spinsRemaining: out.spinsRemaining,
    });
  } catch (err) {
    req.log.error({ err }, "[wheel/spin] error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/wheel/spin/claim", async (req, res) => {
  const { telegramId, claimToken } = req.body as { telegramId?: string; claimToken?: string };
  if (!telegramId || !claimToken) {
    res.status(400).json({ error: "Missing telegramId or claimToken" });
    return;
  }

  try {
    // Whole claim in ONE transaction so the credit + the pending-clear
    // are atomic. Previously they were two separate UPDATEs — if the
    // process died between them, the pending row was gone but no credit
    // had landed and the prize was permanently lost. With one tx,
    // either both happen or neither does.
    //
    // SELECT … FOR UPDATE on the user row also serializes a concurrent
    // /spin/claim with the same token: only one passes the token check,
    // the second sees the now-NULL pending and returns alreadyClaimed.
    const out = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          pending: usersTable.pendingWheelClaim,
          first: usersTable.firstName,
          username: usersTable.username,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);

      const pending = row?.pending as PendingClaim | null | undefined;
      if (!pending || typeof pending !== "object" || pending.token !== claimToken) {
        // Token mismatch OR already claimed. Soft-success so the client
        // doesn't show an error; their balance is whatever the server
        // says it is.
        return { kind: "already" as const, name: row ? maskName(row.first, row.username, telegramId) : "" };
      }

      const prize = pending.prize;

      if (prize.type === "zoom" && typeof prize.zoomAmount === "number" && prize.zoomAmount > 0) {
        await tx
          .update(usersTable)
          .set({
            zoomBalance: sql`${usersTable.zoomBalance} + ${prize.zoomAmount}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
            pendingWheelClaim: null,
          })
          .where(eq(usersTable.telegramId, telegramId));
      } else if (prize.type === "planet" && prize.planetType) {
        const col =
          prize.planetType === "BASIC" ? "bonusBasic" :
          prize.planetType === "RARE"  ? "bonusRare"  :
                                         "bonusEpic";
        await tx
          .update(usersTable)
          .set({
            [col]: sql`${usersTable[col as keyof typeof usersTable.$inferSelect] as never} + 1`,
            pendingWheelClaim: null,
          })
          .where(eq(usersTable.telegramId, telegramId));
      } else {
        // Unsupported / malformed prize: do NOT clear pending and do NOT
        // credit. Throwing here rolls back the whole tx so the pending
        // claim stays intact for inspection / repair / a future deploy
        // that adds the missing credit logic. This is the safer failure
        // mode than silently swallowing the prize.
        return { kind: "unsupported" as const, prize };
      }

      return {
        kind: "credited" as const,
        prize,
        name: maskName(row?.first ?? null, row?.username ?? null, telegramId),
      };
    });

    if (out.kind === "unsupported") {
      req.log.error(
        { prizeType: out.prize.type, prizeLabel: out.prize.label },
        "[wheel/spin/claim] unsupported prize type — pending preserved",
      );
      res.status(500).json({ error: "Internal error" });
      return;
    }

    if (out.kind === "already") {
      res.json({ ok: true, alreadyClaimed: true });
      return;
    }

    // Cronologia personale: registra il premio appena creditato.
    if (out.prize.type === "zoom" && typeof out.prize.zoomAmount === "number" && out.prize.zoomAmount > 0) {
      recordHistoryAsync({
        telegramId,
        kind: "wheel_prize",
        delta: out.prize.zoomAmount,
        currency: "zoom",
        meta: { prizeLabel: out.prize.label },
      });
    } else if (out.prize.type === "planet" && out.prize.planetType) {
      recordHistoryAsync({
        telegramId,
        kind: "wheel_prize",
        delta: 1,
        currency: "planet",
        meta: { planetType: out.prize.planetType, prizeLabel: out.prize.label },
      });
    }

    // Push to public feed only AFTER the credit transaction commits, so
    // a rolled-back claim never appears in the feed and the timestamp
    // matches when the wheel actually stopped on the prize.
    try {
      pushFeed({
        ts: Date.now(),
        name: out.name,
        prizeLabel: out.prize.label,
        prizeIcon: out.prize.icon,
        prizeColor: out.prize.color,
        prizeType: out.prize.type,
      });
    } catch { /* ignore */ }

    res.json({ ok: true, alreadyClaimed: false, prize: out.prize });
  } catch (err) {
    req.log.error({ err }, "[wheel/spin/claim] error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
