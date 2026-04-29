import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

// Stardust prizes for the daily Hall of Fame top 5 (positions 6-10 get
// only public ranking, no reward). The order matches positions 1..5.
export const DAILY_PRIZES = [100, 75, 50, 25, 25] as const;

const LAST_RESET_KEY = "hall_of_fame_last_reset";

function utcDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Public top-10 ranking by daily_referral_count. Returns an array of at
 * most 10 entries, each with a stable rank, public display name, count and
 * the stardust prize (0 for ranks 6-10). Players with 0 daily referrals
 * are filtered out so the list doesn't pad with empty entries on a fresh
 * day.
 */
router.get("/referral/daily-leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
        dailyCount: usersTable.dailyReferralCount,
      })
      .from(usersTable)
      .where(sql`${usersTable.dailyReferralCount} > 0`)
      .orderBy(desc(usersTable.dailyReferralCount))
      .limit(10);

    const entries = rows.map((r, idx) => ({
      rank: idx + 1,
      name: r.username || r.firstName || "Player",
      dailyCount: Number(r.dailyCount ?? 0),
      prize: idx < DAILY_PRIZES.length ? DAILY_PRIZES[idx] : 0,
    }));

    res.json({
      entries,
      prizes: DAILY_PRIZES,
      resetDayKey: utcDayKey(),
    });
  } catch (err) {
    console.error("[hall-of-fame/daily] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Run the daily Hall of Fame reset:
 *   1) snapshot the current top 5 by daily_referral_count > 0
 *   2) credit each of them their stardust prize (atomic per-row UPDATE)
 *   3) zero every user's daily_referral_count
 *   4) record today's UTC day key so we don't run twice in the same day
 *
 * Idempotent within a single UTC day: if `daily_referrals_last_reset` is
 * already today, the function returns early without touching anything.
 *
 * The whole thing runs inside a single DB transaction so a partial failure
 * (e.g. process crash mid-distribution) leaves the daily counters intact
 * for the next attempt and prizes are never half-credited.
 */
export async function runDailyReferralReset(now: Date = new Date()): Promise<{ ran: boolean; today: string; awarded?: { telegramId: string; prize: number; rank: number }[] }> {
  const today = utcDayKey(now);

  // Fast-path check OUTSIDE the transaction: avoid taking a write tx every
  // minute when nothing has to happen yet today.
  const [existing] = await db
    .select({ value: appSettingsTable.valueText })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, LAST_RESET_KEY))
    .limit(1);
  if (existing?.value === today) {
    return { ran: false, today };
  }

  const awarded = await db.transaction(async (tx) => {
    // Re-check inside the transaction with FOR UPDATE so two concurrent
    // ticks (e.g. server restart races, or a second instance) cannot both
    // distribute prizes for the same day.
    const [row] = await tx
      .select({ value: appSettingsTable.valueText })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, LAST_RESET_KEY))
      .for("update")
      .limit(1);
    if (row?.value === today) return null;

    const top = await tx
      .select({
        telegramId: usersTable.telegramId,
        dailyCount: usersTable.dailyReferralCount,
      })
      .from(usersTable)
      .where(sql`${usersTable.dailyReferralCount} > 0`)
      .orderBy(desc(usersTable.dailyReferralCount))
      .limit(DAILY_PRIZES.length);

    const credited: { telegramId: string; prize: number; rank: number }[] = [];

    // Credit stardust prizes one row at a time. Using a single UPDATE with
    // a CASE would be faster but harder to audit; the top-N is at most 5
    // rows so the per-row cost is negligible.
    for (let i = 0; i < top.length; i++) {
      const winner = top[i]!;
      const prize = DAILY_PRIZES[i]!;
      await tx
        .update(usersTable)
        .set({
          stardustBalance: sql`${usersTable.stardustBalance} + ${prize}`,
        })
        .where(eq(usersTable.telegramId, winner.telegramId));
      credited.push({ telegramId: winner.telegramId, prize, rank: i + 1 });
    }

    // Zero the daily counter for everyone, regardless of whether they
    // placed. WHERE > 0 makes this O(active-only) and avoids touching
    // the long tail of inactive rows on every reset.
    await tx
      .update(usersTable)
      .set({ dailyReferralCount: 0 })
      .where(sql`${usersTable.dailyReferralCount} > 0`);

    // Record today's day key. INSERT ... ON CONFLICT keeps the cron
    // restart-safe: even if app_settings has a stale value from a
    // previous version, today's key wins.
    await tx
      .insert(appSettingsTable)
      .values({ key: LAST_RESET_KEY, valueText: today })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueText: today, updatedAt: new Date() },
      });

    return credited;
  });

  if (awarded === null) {
    return { ran: false, today };
  }

  console.log(`[hall-of-fame] daily reset for ${today} — credited ${awarded.length} winners: ${awarded.map(a => `#${a.rank}=${a.telegramId}(+${a.prize})`).join(", ") || "none"}`);
  return { ran: true, today, awarded };
}

export default router;
