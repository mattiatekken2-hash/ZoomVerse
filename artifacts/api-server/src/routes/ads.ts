import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const ADS_DAILY_LIMIT = 5;

/**
 * POST /ads/watched
 * Records one watched ad and credits 1 REDSTAR.
 * Resets the daily counter at midnight UTC.
 * Body: { telegramId: string }
 */
router.post("/ads/watched", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) { res.status(400).json({ ok: false, error: "Missing telegramId" }); return; }

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT daily_ads_watched, daily_ads_date, red_star_balance
          FROM users
         WHERE telegram_id = ${telegramId}
           FOR UPDATE
      `);
      const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
      if (!row) return { ok: false as const, error: "User not found" };

      const storedDate = String(row["daily_ads_date"] ?? "");
      const currentCount = storedDate === today ? Number(row["daily_ads_watched"] ?? 0) : 0;

      if (currentCount >= ADS_DAILY_LIMIT) {
        return { ok: false as const, error: "Daily limit reached", newCount: currentCount };
      }

      const newCount = currentCount + 1;
      const newRedStar = Number(row["red_star_balance"] ?? 0) + 1;

      await tx.execute(sql`
        UPDATE users
           SET daily_ads_watched = ${newCount},
               daily_ads_date    = ${today},
               red_star_balance  = ${newRedStar}
         WHERE telegram_id = ${telegramId}
      `);

      return { ok: true as const, newCount, newRedStarBalance: newRedStar };
    });

    res.json(result);
  } catch (err) {
    console.error("[ads/watched] error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

export default router;
