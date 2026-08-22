import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { recordHistoryAsync } from "../lib/history";

const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
// Rewards in STARDUST, one per day (D1–D7). No cycle multiplier.
// Pizza forge = 3 ★. Week ≈ 18 ★ (~6 pizzas) — helper, not Lab bypass.
const BASE_REWARDS = [1, 2, 3, 4, 5, 6, 7];

function rewardForDay(dayIndex: number): number {
  return BASE_REWARDS[Math.max(0, Math.min(6, dayIndex))] ?? 1;
}

function computeStatus(lastClaimAt: Date | null, streakDay: number) {
  const now = Date.now();
  const lastMs = lastClaimAt ? lastClaimAt.getTime() : 0;
  const nextAvailable = lastMs ? lastMs + DAY_MS : now;
  const hardResetAt = nextAvailable + DAY_MS;

  let effectiveDay = streakDay;
  let canClaim = false;
  let willHardReset = false;

  if (!lastMs) {
    canClaim = true;
    effectiveDay = 0;
  } else if (now >= hardResetAt) {
    willHardReset = true;
    canClaim = true;
    effectiveDay = 0;
  } else if (now >= nextAvailable) {
    canClaim = true;
  }

  const nextDayIdx = canClaim
    ? (effectiveDay >= 7 ? 0 : effectiveDay)
    : (streakDay >= 7 ? 0 : streakDay);

  const upcomingReward = rewardForDay(nextDayIdx);

  return {
    streakDay,
    streakCycle: 0,
    lastClaimAt: lastMs,
    nextAvailableAt: nextAvailable,
    hardResetAt,
    canClaim,
    willHardReset,
    upcomingDay: nextDayIdx + 1,
    upcomingReward,
    cycleMultiplier: 1,
    rewardsPreview: BASE_REWARDS.map((_, i) => rewardForDay(i)),
  };
}

router.get("/daily/status/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const [u] = await db
      .select({
        last: usersTable.lastDailyClaimAt,
        day: usersTable.dailyStreakDay,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    res.json(computeStatus(u?.last ?? null, u?.day ?? 0));
  } catch (err) {
    console.error("[daily/status] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/daily/claim", async (req, res) => {
  const { telegramId, firstName } = req.body as { telegramId?: string; firstName?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    await db
      .insert(usersTable)
      .values({ telegramId, firstName: firstName ?? null, zoomBalance: 0, stardustBalance: 30, redStarBalance: 5 })
      .onConflictDoNothing();

    const [u] = await db
      .select({
        last: usersTable.lastDailyClaimAt,
        day: usersTable.dailyStreakDay,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const now = Date.now();
    const lastMs = u.last ? u.last.getTime() : 0;
    const nextAvailable = lastMs ? lastMs + DAY_MS : now;
    const hardResetAt = nextAvailable + DAY_MS;

    if (lastMs && now < nextAvailable) {
      res.status(409).json({ error: "Not available yet", nextAvailableAt: nextAvailable });
      return;
    }

    const prevDay = Math.max(0, Math.min(7, Number(u.day) || 0));
    let newDay: number;

    if (!lastMs || now >= hardResetAt) {
      // Missed the 24h claim window after reward became available.
      newDay = 1;
    } else if (prevDay >= 7) {
      // Completed the 7-day loop — start fresh.
      newDay = 1;
    } else {
      newDay = prevDay + 1;
    }

    const reward = rewardForDay(newDay - 1);

    const [updated] = await db
      .update(usersTable)
      .set({
        dailyStreakDay: newDay,
        dailyStreakCycle: 0,
        lastDailyClaimAt: new Date(now),
        stardustBalance: sql`${usersTable.stardustBalance} + ${reward}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        stardustBalance: usersTable.stardustBalance,
        balanceEpoch: usersTable.balanceEpoch,
      });

    const status = computeStatus(new Date(now), newDay);
    res.json({
      ok: true,
      reward,
      day: newDay,
      cycle: 0,
      stardustBalance: updated?.stardustBalance ?? 0,
      balanceEpoch: updated?.balanceEpoch ?? 0,
      ...status,
    });
    recordHistoryAsync({
      telegramId,
      kind: "daily_claim",
      delta: reward,
      currency: "stardust",
      meta: { day: newDay },
    });
  } catch (err) {
    console.error("[daily/claim] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
