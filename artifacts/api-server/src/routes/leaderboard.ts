import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { bumpZoomPriceFireAndForget } from "../lib/zoomPrice";
import { recordHistoryAsync } from "../lib/history";

const router: IRouter = Router();

const SyncBody = z.object({
  telegramId: z.string().min(1),
  firstName: z.string().optional(),
  username: z.string().optional(),
  zoomBalance: z.number().min(0),
  tonBalance: z.number().min(0).optional(),
  clientEpoch: z.number().int().nonnegative().optional(),
});

router.post("/balance/sync", async (req, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { telegramId, firstName, username, zoomBalance, tonBalance, clientEpoch } = parsed.data;
  const normalizedUsername = username ? username.replace(/^@/, "").toLowerCase() : null;

  try {
    // CLIENT-AUTHORITATIVE WITH EPOCH FENCING:
    // - The client is the source of truth for its current balance whenever its
    //   epoch matches the server's. This is essential because *spends* (LAB
    //   tap-crafting, planet/SUN reactivation fees) happen client-side and
    //   must be persisted as decrements — using GREATEST(server, client) here
    //   would let the older server value resurrect the spent ZOOM on the next
    //   sync, which is exactly the bug we are fixing.
    // - Whenever the server makes an authoritative balance change (admin
    //   credit/remove, Stars/TON purchase credit, wheel/daily/referral reward,
    //   marketplace buy/sell), the corresponding endpoint MUST bump
    //   balance_epoch. On the next sync, server epoch > client epoch ⇒ the
    //   server's value wins and the client's stale value is ignored. The
    //   client then snaps to the server value via reconcileFromSyncResponse.
    const ce = clientEpoch ?? 0;
    const tb = typeof tonBalance === "number" ? Math.max(0, tonBalance) : 0;
    const [row] = await db
      .insert(usersTable)
      .values({
        telegramId,
        zoomBalance,
        tonBalance: tb,
        firstName: firstName ?? null,
        username: normalizedUsername,
        referralCount: 0,
      })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          // Add `pending_zoom_credits` on top of the post-CASE balance.
          // Postgres reads OLD column values on the RHS in a single UPDATE,
          // so this is race-free against concurrent credit appends (they
          // serialize on the row lock and the credits we don't see now will
          // simply be applied at the next sync).
          zoomBalance: sql`(CASE WHEN ${usersTable.balanceEpoch} > ${ce} THEN ${usersTable.zoomBalance} ELSE GREATEST(0, ${zoomBalance}) END) + ${usersTable.pendingZoomCredits}`,
          // Atomically clear the consumed credits in the same statement.
          pendingZoomCredits: sql`0`,
          // Bump balance_epoch ONLY when we actually consumed a credit, so
          // the client's reconcileFromSyncResponse takes the snap-up path
          // (serverAdvanced=true) and surfaces the credited amount.
          balanceEpoch: sql`${usersTable.balanceEpoch} + (CASE WHEN ${usersTable.pendingZoomCredits} > 0 THEN 1 ELSE 0 END)`,
          // TON balance uses a non-destructive merge: take the MAX of server
          // and client. Unlike ZOOM, internal TON has no client-side spends
          // (reactivation fees are paid on-chain via TonConnect and the only
          // server-side decrement, withdrawals, immediately snaps the client
          // via the zoom-server-ton-snap event before the next sync). Picking
          // MAX preserves both client-side credits (white/earth COLLECT) and
          // server-side credits (admin TON grants) without one wiping the
          // other when balance_epoch advances.
          ...(typeof tonBalance === "number"
            ? {
                tonBalance: sql`GREATEST(${usersTable.tonBalance}, ${tb})`,
              }
            : {}),
          ...(firstName ? { firstName } : {}),
          ...(normalizedUsername ? { username: normalizedUsername } : {}),
        },
      })
      .returning({
        zoomBalance: usersTable.zoomBalance,
        tonBalance: usersTable.tonBalance,
        balanceEpoch: usersTable.balanceEpoch,
      });

    res.json({
      ok: true,
      zoomBalance: row?.zoomBalance ?? zoomBalance,
      tonBalance: row?.tonBalance ?? tb,
      balanceEpoch: row?.balanceEpoch ?? 0,
    });
  } catch (err) {
    console.error("[balance/sync] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        firstName: usersTable.firstName,
        zoomBalance: usersTable.zoomBalance,
      })
      .from(usersTable)
      .where(sql`${usersTable.zoomBalance} > 0 AND ${usersTable.isDisabled} = false`)
      .orderBy(desc(usersTable.zoomBalance))
      .limit(100);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      telegramId: row.telegramId,
      firstName: row.firstName || "Player",
      zoomBalance: row.zoomBalance,
    }));

    res.json({ leaderboard });
  } catch (err) {
    console.error("[leaderboard] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/global-pool", async (_req, res) => {
  try {
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${usersTable.zoomBalance}), 0)` })
      .from(usersTable);

    res.json({ totalPool: result?.total ?? 0 });
  } catch (err) {
    console.error("[global-pool] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/balance/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db
      .select({ zoomBalance: usersTable.zoomBalance, firstName: usersTable.firstName, balanceEpoch: usersTable.balanceEpoch })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ zoomBalance: 0, firstName: null, exists: false, balanceEpoch: 0 });
      return;
    }

    res.json({ zoomBalance: rows[0]!.zoomBalance, firstName: rows[0]!.firstName, exists: true, balanceEpoch: rows[0]!.balanceEpoch });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/profile/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db
      .select({
        createdAt: usersTable.createdAt,
        totalObtainedBasic: usersTable.totalObtainedBasic,
        totalObtainedRare: usersTable.totalObtainedRare,
        totalObtainedEpic: usersTable.totalObtainedEpic,
        totalObtainedMythic: usersTable.totalObtainedMythic,
        totalObtainedPlasma: usersTable.totalObtainedPlasma,
        totalObtainedGold: usersTable.totalObtainedGold,
        totalObtainedV1: usersTable.totalObtainedV1,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ exists: false });
      return;
    }

    res.json({
      exists: true,
      createdAt: rows[0]!.createdAt,
      crafted: {
        BASIC: rows[0]!.totalObtainedBasic,
        RARE: rows[0]!.totalObtainedRare,
        EPIC: rows[0]!.totalObtainedEpic,
        MYTHIC: rows[0]!.totalObtainedMythic,
        PLASMA: rows[0]!.totalObtainedPlasma,
        GOLD: rows[0]!.totalObtainedGold,
        V1: rows[0]!.totalObtainedV1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// HALL OF FAME — Daily Referrals leaderboard.
// Public top-10 by today's referral count. Stardust prizes for ranks 1..5
// are CLIENT-SIDE constants (also baked into the response for clarity), so
// the client can render the badges directly without a config round-trip.
// Filters out users with 0 today-count and users whose stored day_key is
// stale (i.e. last referral happened on a previous UTC day and they've had
// no activity since the cron rolled the date), so a fresh DB or post-reset
// state shows an empty list rather than yesterday's stragglers.
const HOF_PRIZES = [100, 75, 50, 25, 25] as const;

function hofUtcDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

router.get("/leaderboard/daily-referrals", async (_req, res) => {
  try {
    const today = hofUtcDayKey();
    const rows = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
        count: usersTable.dailyReferralCount,
      })
      .from(usersTable)
      .where(sql`${usersTable.dailyReferralDayKey} = ${today} AND ${usersTable.dailyReferralCount} > 0 AND ${usersTable.isDisabled} = false`)
      .orderBy(desc(usersTable.dailyReferralCount))
      .limit(10);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      // Same name fallback as /stardust/leaderboard so users see a stable
      // identity in both lists.
      name: r.username || r.firstName || "Player",
      count: Number(r.count ?? 0),
      // Prize is null past rank 5; the UI hides the badge entirely there.
      prize: i < HOF_PRIZES.length ? HOF_PRIZES[i] : null,
    }));

    res.json({
      dayKey: today,
      prizes: HOF_PRIZES,
      entries,
    });
  } catch (err) {
    console.error("[leaderboard/daily-referrals] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const CraftBody = z.object({
  telegramId: z.string().min(1),
  // MYTHIC is accepted so the client stops short-circuiting to a 400 when
  // a Lab craft rolls one, but we don't currently track its lifetime
  // count (no totalCraftedMythic column yet) — see the field map below.
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1"]),
  // Costo reale in $ZOOM speso per questo forge (= numero totale di tap).
  // Sanity-clamped: in normali condizioni va da ~75 (BASIC) a ~1310 (V1).
  cost: z.number().int().min(1).max(5000).optional(),
});

router.post("/craft/record", async (req, res) => {
  const parsed = CraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { telegramId, planetType, cost } = parsed.data;
  const fieldMap: Record<string, "totalCraftedBasic" | "totalCraftedRare" | "totalCraftedEpic" | "totalCraftedMythic" | "totalCraftedPlasma" | "totalCraftedGold" | "totalCraftedV1" | null> = {
    BASIC: "totalCraftedBasic",
    RARE: "totalCraftedRare",
    EPIC: "totalCraftedEpic",
    MYTHIC: "totalCraftedMythic",
    PLASMA: "totalCraftedPlasma",
    GOLD: "totalCraftedGold",
    V1: "totalCraftedV1",
  };
  const field = fieldMap[planetType];
  if (!field) { res.json({ ok: true }); return; }

  const obtainedFieldMap: Record<string, "totalObtainedBasic" | "totalObtainedRare" | "totalObtainedEpic" | "totalObtainedMythic" | "totalObtainedPlasma" | "totalObtainedGold" | "totalObtainedV1" | null> = {
    BASIC: "totalObtainedBasic",
    RARE: "totalObtainedRare",
    EPIC: "totalObtainedEpic",
    MYTHIC: "totalObtainedMythic",
    PLASMA: "totalObtainedPlasma",
    GOLD: "totalObtainedGold",
    V1: "totalObtainedV1",
  };
  const obtainedField = obtainedFieldMap[planetType];

  try {
    const setClauses: Record<string, unknown> = { [field]: sql`${usersTable[field]} + 1` };
    if (obtainedField) {
      setClauses[obtainedField] = sql`${usersTable[obtainedField]} + 1`;
    }
    await db
      .update(usersTable)
      .set(setClauses)
      .where(eq(usersTable.telegramId, telegramId));

    // MONTHLY LAB LEADERBOARD: bump lab_points +1 SOLO se l'utente:
    //   1. possiede SUN (sun_count > 0)
    //   2. ha pagato la quota del round attivo corrente
    //      (lab_round_id == lab_rounds.id WHERE status='active')
    // L'eligibility è verificata interamente nel WHERE — nessuna race,
    // nessun extra round-trip per check separato.
    await db.execute(sql`
      UPDATE users
      SET lab_points = lab_points + 1
      WHERE telegram_id = ${telegramId}
        AND sun_count > 0
        AND lab_round_id IN (SELECT id FROM lab_rounds WHERE status = 'active')
    `);

    // Bump the global $ZOOM price — every successful craft mints supply
    // and contributes a small upward nudge. Fire-and-forget. Per-user
    // cooldown blocks scripted /craft/record loops from pumping the price.
    bumpZoomPriceFireAndForget("craft", telegramId);
    res.json({ ok: true });

    // Cronologia personale: forge nel LAB → uscita di $ZOOM. Il costo è
    // il totale dei tap spesi (1 ZOOM/tap), inviato dal client perché è
    // una variabile per-forge (= goal randomizzato base+0..10) e il bilancio
    // resta client-authoritative.
    if (typeof cost === "number" && cost > 0) {
      recordHistoryAsync({
        telegramId,
        kind: "craft_planet",
        delta: -cost,
        currency: "zoom",
        meta: { planetType },
      });
    }
  } catch (err) {
    console.error("[craft/record] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
