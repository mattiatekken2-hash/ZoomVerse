import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Maximum age of a pending wheel claim before /wheel/status auto-credits it.
// 30s comfortably covers the 5.2s on-screen animation plus any retry/network
// hiccup. Beyond that we assume the user closed the app between spin and
// claim and credit the prize defensively so they never "lose" a spin.
const PENDING_CLAIM_TTL_MS = 30 * 1000;

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

// Shape of the JSONB stored in users.pending_wheel_claim.
interface PendingWheelClaim {
  spinId: string;
  prizeIndex: number;
  type: "zoom" | "planet" | "stars" | "ton";
  zoomAmount?: number;
  planetType?: "BASIC" | "RARE" | "EPIC";
  starsAmount?: number;
  tonAmount?: number;
  label: string;
  color: string;
  icon: string;
  createdAt: number;
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

// Atomically credit a pending wheel claim and clear it from the user row.
// Idempotent: if pending is already NULL or has a different spinId, this
// updates 0 rows and returns null. Used by /wheel/claim, by /wheel/status
// (sweep for stale pending), and by /wheel/spin (auto-claim a prior pending
// before starting a new spin so the user is never stuck).
async function creditPendingClaim(
  telegramId: string,
  spinId: string,
): Promise<PendingWheelClaim | null> {
  // Read pending first so we know what to credit. We can't reliably do
  // "compute credit from JSONB inside a single SQL statement" because the
  // amount and the column to bump depend on the prize type. Two-step
  // (SELECT ... then UPDATE ... WHERE pending->>'spinId' = $spinId)
  // is safe because the UPDATE fences out double-credit by spinId.
  const [row] = await db
    .select({ pending: usersTable.pendingWheelClaim })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  const pending = (row?.pending as PendingWheelClaim | null) ?? null;
  if (!pending || pending.spinId !== spinId) return null;

  if (pending.type === "zoom" && pending.zoomAmount) {
    const dec = await db.execute(sql`
      UPDATE users
      SET zoom_balance = zoom_balance + ${pending.zoomAmount},
          balance_epoch = balance_epoch + 1,
          pending_wheel_claim = NULL
      WHERE telegram_id = ${telegramId}
        AND pending_wheel_claim->>'spinId' = ${spinId}
      RETURNING balance_epoch
    `);
    if (!dec.rows || dec.rows.length === 0) return null;
    return pending;
  }

  if (pending.type === "planet" && pending.planetType) {
    const col = pending.planetType === "BASIC" ? "bonus_basic"
      : pending.planetType === "RARE" ? "bonus_rare"
      : "bonus_epic";
    const dec = await db.execute(sql`
      UPDATE users
      SET ${sql.raw(col)} = ${sql.raw(col)} + 1,
          pending_wheel_claim = NULL
      WHERE telegram_id = ${telegramId}
        AND pending_wheel_claim->>'spinId' = ${spinId}
      RETURNING ${sql.raw(col)} AS bonus
    `);
    if (!dec.rows || dec.rows.length === 0) return null;
    return pending;
  }

  // stars/ton are decoys (weight 0). Still clear pending if somehow set.
  await db.execute(sql`
    UPDATE users SET pending_wheel_claim = NULL
    WHERE telegram_id = ${telegramId}
      AND pending_wheel_claim->>'spinId' = ${spinId}
  `);
  return pending;
}

// Defensive sweep: if a pending claim exists and is older than the TTL,
// auto-credit it. Returns the credited prize, or null if no sweep needed.
async function sweepStalePending(telegramId: string): Promise<PendingWheelClaim | null> {
  const [row] = await db
    .select({ pending: usersTable.pendingWheelClaim })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  const pending = (row?.pending as PendingWheelClaim | null) ?? null;
  if (!pending) return null;
  if (Date.now() - (pending.createdAt || 0) < PENDING_CLAIM_TTL_MS) return null;
  return creditPendingClaim(telegramId, pending.spinId);
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
    .select({ spins: usersTable.wheelSpins, lastDaily: usersTable.lastWheelDailyAt })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  const spins = row?.spins ?? 0;
  const lastDaily = row?.lastDaily ? row.lastDaily.getTime() : 0;
  const nextClaimAt = lastDaily ? lastDaily + DAILY_COOLDOWN_MS : 0;
  const canClaimDaily = !lastDaily || Date.now() >= nextClaimAt;
  return { spins, canClaimDaily, nextClaimAt };
}

router.get("/wheel/status/:telegramId", async (req, res) => {
  try {
    // Best-effort sweep: if the user has a pending claim older than the TTL
    // (likely because they closed the app between spin and claim), credit
    // it now so they don't perceive their spin as "lost". Errors here are
    // non-fatal; status still returns.
    try { await sweepStalePending(req.params.telegramId); } catch (e) { req.log?.warn({ err: e }, "[wheel/status] sweep failed"); }
    const status = await getStatus(req.params.telegramId);
    res.json(status);
  } catch (err) {
    req.log?.error({ err }, "[wheel/status] error");
    res.status(500).json({ error: "Internal error" });
  }
});

// Backwards-compatible
router.get("/wheel/spins/:telegramId", async (req, res) => {
  try {
    // Same defensive sweep as /wheel/status — older clients that only poll
    // this endpoint must also benefit from auto-claiming pending prizes
    // older than the TTL, otherwise they'd leave the user's spin in limbo.
    try { await sweepStalePending(req.params.telegramId); } catch (e) { req.log?.warn({ err: e }, "[wheel/spins] sweep failed"); }
    const status = await getStatus(req.params.telegramId);
    res.json({ spins: status.spins, canClaimDaily: status.canClaimDaily, nextClaimAt: status.nextClaimAt });
  } catch (err) {
    req.log?.error({ err }, "[wheel/spins] error");
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
    req.log?.error({ err }, "[wheel/claim-daily] error");
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

router.post("/wheel/spin", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    // If the user already has a pending claim from a prior spin (e.g. they
    // closed the app before the claim fired), credit it FIRST so we never
    // leave them stuck and so the new spin's atomic UPDATE (which requires
    // pending IS NULL) can succeed.
    const [pre] = await db
      .select({ pending: usersTable.pendingWheelClaim })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const priorPending = (pre?.pending as PendingWheelClaim | null) ?? null;
    if (priorPending) {
      try { await creditPendingClaim(telegramId, priorPending.spinId); }
      catch (e) { req.log?.warn({ err: e }, "[wheel/spin] failed to auto-claim prior pending"); }
    }

    const prize = pickPrize();
    const spinId = randomUUID();
    const pendingPayload: PendingWheelClaim = {
      spinId,
      prizeIndex: prize.index,
      type: prize.type,
      zoomAmount: prize.zoomAmount,
      planetType: prize.planetType,
      starsAmount: prize.starsAmount,
      tonAmount: prize.tonAmount,
      label: prize.label,
      color: prize.color,
      icon: prize.icon,
      createdAt: Date.now(),
    };

    // Atomic: decrement spins AND park the prize as pending. The
    // pending_wheel_claim IS NULL guard prevents racing two spins from
    // creating two pending claims (the auto-claim above already cleared
    // any prior pending; this guard catches the unlikely concurrent-spin
    // race). NO balance change, NO epoch bump here — those happen in
    // /wheel/claim once the on-screen wheel finishes spinning.
    const dec = await db.execute(sql`
      UPDATE users
      SET wheel_spins = wheel_spins - 1,
          pending_wheel_claim = ${JSON.stringify(pendingPayload)}::jsonb
      WHERE telegram_id = ${telegramId}
        AND wheel_spins > 0
        AND pending_wheel_claim IS NULL
      RETURNING wheel_spins
    `);

    if (!dec.rows || dec.rows.length === 0) {
      // Either no spins, or another concurrent spin won the race and a
      // pending claim is already in flight — return a clean 409 so the
      // client UI can re-fetch status.
      res.status(409).json({ error: "No spins available" });
      return;
    }

    const remaining = Number((dec.rows[0] as { wheel_spins: number }).wheel_spins);

    // Push to public feed (best-effort, non-blocking on errors). We push
    // here (at spin time, not claim time) because the prize is already
    // determined and the feed is a marketing/social signal — claim time
    // would just delay the public broadcast by 5 seconds.
    try {
      const [u] = await db
        .select({ first: usersTable.firstName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      pushFeed({
        ts: Date.now(),
        name: maskName(u?.first ?? null, u?.username ?? null, telegramId),
        prizeLabel: prize.label,
        prizeIcon: prize.icon,
        prizeColor: prize.color,
        prizeType: prize.type,
      });
    } catch { /* ignore */ }

    res.json({
      spinId,
      prizeIndex: prize.index,
      prize: {
        type: prize.type,
        zoomAmount: prize.zoomAmount,
        planetType: prize.planetType,
        starsAmount: prize.starsAmount,
        tonAmount: prize.tonAmount,
        label: prize.label,
        color: prize.color,
        icon: prize.icon,
      },
      spinsRemaining: remaining,
    });
  } catch (err) {
    req.log?.error({ err }, "[wheel/spin] error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/wheel/claim", async (req, res) => {
  const { telegramId, spinId } = req.body as { telegramId?: string; spinId?: string };
  if (!telegramId || !spinId) {
    res.status(400).json({ error: "Missing telegramId or spinId" });
    return;
  }
  try {
    const credited = await creditPendingClaim(telegramId, spinId);
    if (credited) {
      // Successfully credited the pending claim atomically.
      res.json({ ok: true, credited: true, prize: {
        type: credited.type,
        zoomAmount: credited.zoomAmount,
        planetType: credited.planetType,
        starsAmount: credited.starsAmount,
        tonAmount: credited.tonAmount,
        label: credited.label,
        color: credited.color,
        icon: credited.icon,
      } });
      return;
    }
    // No row updated. Either the spinId doesn't match the current pending
    // (already claimed by a previous request, or a different spin is now
    // pending), or the user simply has no pending. In all of these cases
    // the right answer is "ok, nothing to do" — never error, never re-credit.
    res.json({ ok: true, credited: false, alreadyCredited: true });
  } catch (err) {
    req.log?.error({ err }, "[wheel/claim] error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
