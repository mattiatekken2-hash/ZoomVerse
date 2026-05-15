import { Router, type IRouter } from "express";
import { db, usersTable } from "../db";
import { eq, sql } from "drizzle-orm";
import { recordHistoryAsync } from "../lib/history";

const router: IRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_REWARDS = [50, 100, 200, 400, 800, 1500, 3000];
const CYCLE_INCREMENT = 0.01;

function rewardForDay(dayIndex: number, cycle: number): number {
  const base = BASE_REWARDS[Math.max(0, Math.min(6, dayIndex))];
  const mult = 1 + cycle * CYCLE_INCREMENT;
  return Math.round(base * mult * 100) / 100;
}

function computeStatus(lastClaimAt: Date | null, streakDay: number, cycle: number) {
  const now = Date.now();
  const lastMs = lastClaimAt ? lastClaimAt.getTime() : 0;
  const nextAvailable = lastMs ? lastMs + DAY_MS : now;
  const hardResetAt = nextAvailable + DAY_MS;

  let effectiveDay = streakDay;
  let effectiveCycle = cycle;
  let canClaim = false;
  let willHardReset = false;

  if (!lastMs) {
    canClaim = true;
    effectiveDay = 0;
  } else if (now >= hardResetAt) {
    willHardReset = true;
    canClaim = true;
    effectiveDay = 0;
    effectiveCycle = 0;
  } else if (now >= nextAvailable) {
    canClaim = true;
  }

  const nextDayIdx = canClaim
    ? (effectiveDay >= 7 ? 0 : effectiveDay)
    : (streakDay >= 7 ? 0 : streakDay);

  const upcomingReward = rewardForDay(nextDayIdx, effectiveCycle);

  return {
    streakDay,
    streakCycle: cycle,
    lastClaimAt: lastMs,
    nextAvailableAt: nextAvailable,
    hardResetAt,
    canClaim,
    willHardReset,
    upcomingDay: nextDayIdx + 1,
    upcomingReward,
    cycleMultiplier: 1 + effectiveCycle * CYCLE_INCREMENT,
    rewardsPreview: BASE_REWARDS.map((_, i) => rewardForDay(i, effectiveCycle)),
  };
}

router.get("/daily/status/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const [u] = await db
      .select({
        last: usersTable.lastDailyClaimAt,
        day: usersTable.dailyStreakDay,
        cycle: usersTable.dailyStreakCycle,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    res.json(computeStatus(u?.last ?? null, u?.day ?? 0, u?.cycle ?? 0));
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
      .values({ telegramId, firstName: firstName ?? null, zoomBalance: 0 })
      .onConflictDoNothing();

    const [u] = await db
      .select({
        last: usersTable.lastDailyClaimAt,
        day: usersTable.dailyStreakDay,
        cycle: usersTable.dailyStreakCycle,
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

    let newDay: number;
    let newCycle: number;

    if (!lastMs || now >= hardResetAt) {
      newDay = 1;
      newCycle = 0;
    } else if (u.day >= 7) {
      newDay = 1;
      newCycle = u.cycle + 1;
    } else {
      newDay = u.day + 1;
      newCycle = u.cycle;
    }

    const reward = rewardForDay(newDay - 1, newCycle);

    await db
      .update(usersTable)
      .set({
        dailyStreakDay: newDay,
        dailyStreakCycle: newCycle,
        lastDailyClaimAt: new Date(now),
        zoomBalance: sql`${usersTable.zoomBalance} + ${reward}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));

    const status = computeStatus(new Date(now), newDay, newCycle);
    res.json({ ok: true, reward, day: newDay, cycle: newCycle, ...status });
    recordHistoryAsync({
      telegramId,
      kind: "daily_claim",
      delta: reward,
      currency: "zoom",
      meta: { day: newDay, cycle: newCycle },
    });
  } catch (err) {
    console.error("[daily/claim] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
