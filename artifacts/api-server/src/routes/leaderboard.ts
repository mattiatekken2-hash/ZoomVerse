import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

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
          zoomBalance: sql`CASE WHEN ${usersTable.balanceEpoch} > ${ce} THEN ${usersTable.zoomBalance} ELSE GREATEST(0, ${zoomBalance}) END`,
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
      .where(sql`${usersTable.zoomBalance} > 0`)
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
        totalCraftedBasic: usersTable.totalCraftedBasic,
        totalCraftedRare: usersTable.totalCraftedRare,
        totalCraftedEpic: usersTable.totalCraftedEpic,
        totalCraftedGold: usersTable.totalCraftedGold,
        totalCraftedV1: usersTable.totalCraftedV1,
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
        BASIC: rows[0]!.totalCraftedBasic,
        RARE: rows[0]!.totalCraftedRare,
        EPIC: rows[0]!.totalCraftedEpic,
        GOLD: rows[0]!.totalCraftedGold,
        V1: rows[0]!.totalCraftedV1,
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
      .where(sql`${usersTable.dailyReferralDayKey} = ${today} AND ${usersTable.dailyReferralCount} > 0`)
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
  planetType: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "V1"]),
});

router.post("/craft/record", async (req, res) => {
  const parsed = CraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { telegramId, planetType } = parsed.data;
  const fieldMap = {
    BASIC: "totalCraftedBasic" as const,
    RARE: "totalCraftedRare" as const,
    EPIC: "totalCraftedEpic" as const,
    GOLD: "totalCraftedGold" as const,
    V1: "totalCraftedV1" as const,
  };
  const field = fieldMap[planetType];

  try {
    await db
      .update(usersTable)
      .set({ [field]: sql`${usersTable[field]} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[craft/record] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
