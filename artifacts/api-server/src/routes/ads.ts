import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

export const WEEKLY_REDSTAR_REWARD = 5;
export const WEEKLY_CYCLE_DAYS = 7;

function utcDateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateStr(d);
}

export function computeWeeklyRedStarStatus(
  lastClaimDate: string,
  lastCycleDay: number,
): { cycleDay: number; claimedToday: boolean; canClaim: boolean } {
  const today = utcDateStr();
  const yesterday = yesterdayStr();
  const storedDay = Math.min(WEEKLY_CYCLE_DAYS, Math.max(1, lastCycleDay || 1));

  if (lastClaimDate === today) {
    return { cycleDay: storedDay, claimedToday: true, canClaim: false };
  }

  let nextDay = 1;
  if (lastClaimDate === yesterday) {
    nextDay = storedDay >= WEEKLY_CYCLE_DAYS ? 1 : storedDay + 1;
  }

  return { cycleDay: nextDay, claimedToday: false, canClaim: true };
}

/**
 * GET /earn/weekly-redstar/status?telegramId=
 */
router.get("/earn/weekly-redstar/status", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "");
  if (!telegramId) { res.status(400).json({ ok: false, error: "Missing telegramId" }); return; }

  try {
    const rows = await db.execute(sql`
      SELECT weekly_redstar_day, last_weekly_redstar_claim_date
        FROM users
       WHERE telegram_id = ${telegramId}
       LIMIT 1
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!row) { res.status(404).json({ ok: false, error: "User not found" }); return; }

    const status = computeWeeklyRedStarStatus(
      String(row["last_weekly_redstar_claim_date"] ?? ""),
      Number(row["weekly_redstar_day"] ?? 0),
    );

    res.json({
      ok: true,
      reward: WEEKLY_REDSTAR_REWARD,
      cycleDays: WEEKLY_CYCLE_DAYS,
      ...status,
    });
  } catch (err) {
    console.error("[earn/weekly-redstar/status] error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

/**
 * POST /earn/weekly-redstar/claim
 * Credits 5 REDSTAR once per UTC day for a 7-day cycle, then repeats.
 */
router.post("/earn/weekly-redstar/claim", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ ok: false, error: "Missing telegramId" }); return; }

  const today = utcDateStr();

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT weekly_redstar_day, last_weekly_redstar_claim_date, red_star_balance
          FROM users
         WHERE telegram_id = ${telegramId}
           FOR UPDATE
      `);
      const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
      if (!row) return { ok: false as const, error: "User not found" };

      const status = computeWeeklyRedStarStatus(
        String(row["last_weekly_redstar_claim_date"] ?? ""),
        Number(row["weekly_redstar_day"] ?? 0),
      );

      if (!status.canClaim) {
        return { ok: false as const, error: "Already claimed today", cycleDay: status.cycleDay, claimedToday: true };
      }

      const newRedStar = Number(row["red_star_balance"] ?? 0) + WEEKLY_REDSTAR_REWARD;

      await tx.execute(sql`
        UPDATE users
           SET weekly_redstar_day = ${status.cycleDay},
               last_weekly_redstar_claim_date = ${today},
               red_star_balance = ${newRedStar}
         WHERE telegram_id = ${telegramId}
      `);

      return {
        ok: true as const,
        cycleDay: status.cycleDay,
        claimedToday: true,
        reward: WEEKLY_REDSTAR_REWARD,
        newRedStarBalance: newRedStar,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[earn/weekly-redstar/claim] error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

export default router;
