import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";

// ─── SUN farm-duration upgrade (mirrors /farm/upgrade-duration for planets) ───
const SUN_UPGRADE_COSTS: Record<number, number> = {
  1: 1,
  2: 1.5,
  4: 2,
  6: 2.5,
  8: 3,
  16: 3.5,
  24: 5,
};
const SUN_VALID_DURATIONS = new Set(Object.keys(SUN_UPGRADE_COSTS).map(Number));

const UpgradeSunDurationBody = z.object({
  telegramId: z.string().min(1),
  durationHours: z.number().int().positive(),
});

const router: IRouter = Router();

/**
 * Permanently upgrade the SUN's farm-cycle duration.
 * Deducts GRAM (ton_balance) atomically; returns the new balance.
 * Uses the same cost table as /farm/upgrade-duration for consistency.
 */
router.post("/sun/upgrade-duration", async (req, res) => {
  const parsed = UpgradeSunDurationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, durationHours } = parsed.data;

  if (!SUN_VALID_DURATIONS.has(durationHours)) {
    res.status(400).json({ error: "Invalid duration" }); return;
  }
  const cost = SUN_UPGRADE_COSTS[durationHours]!;

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT ton_balance FROM users WHERE telegram_id = ${telegramId} FOR UPDATE
      `);
      const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
      if (!row) return { ok: false as const, error: "User not found" };

      const tonBalance = Number(row["ton_balance"] ?? 0);
      if (tonBalance < cost) return { ok: false as const, error: "Insufficient GRAM balance" };

      await tx.execute(sql`
        UPDATE users
           SET ton_balance             = ton_balance - ${cost},
               balance_epoch           = balance_epoch + 1,
               sun_farm_duration_hours = ${durationHours}
         WHERE telegram_id = ${telegramId}
           AND ton_balance  >= ${cost}
      `);

      return { ok: true as const, newTonBalance: tonBalance - cost };
    });

    res.json(result);
  } catch (err) {
    console.error("[sun/upgrade-duration] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const SyncBody = z.object({
  telegramId: z.string().min(1),
  // Epoch ms. Float values from the client's serverNow() (half-RTT
  // calibration) are accepted but rounded server-side because the column
  // is bigint and Postgres rejects fractional values.
  sunFarmStartedAtMs: z.number().nonnegative(),
  sunLastCollectedAtMs: z.number().nonnegative(),
  sunCycleCount: z.number().int().nonnegative(),
});

/**
 * Persist the SUN's 24h cycle on the server so it survives localStorage
 * loss (browser cache wipe, switching device, certain Telegram WebView
 * cleanups). Merge semantics: we always keep the GREATEST value seen
 * so far per field.
 *
 *   - sunFarmStartedAtMs: a monotonically advancing "last activation
 *     timestamp"; the latest activation wins, which matches user intent
 *     ("I just pressed FARM").
 *   - sunLastCollectedAtMs: monotonic — collects only ever move forward.
 *   - sunCycleCount: monotonic counter; max across devices is the safe
 *     upper bound (the field is purely a stat).
 *
 * This makes the endpoint idempotent and safe to retry — replaying an
 * older snapshot can never roll back a newer one. The response echoes
 * the post-merge values so the client can immediately reconcile.
 */
router.post("/sun/cycle", async (req, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });
  const { telegramId } = parsed.data;
  const startedAt = Math.round(parsed.data.sunFarmStartedAtMs);
  const collectedAt = Math.round(parsed.data.sunLastCollectedAtMs);
  const cycleCount = parsed.data.sunCycleCount;

  try {
    const updated = await db
      .update(usersTable)
      .set({
        sunFarmStartedAtMs: sql`GREATEST(${usersTable.sunFarmStartedAtMs}, ${startedAt})`,
        sunLastCollectedAtMs: sql`GREATEST(${usersTable.sunLastCollectedAtMs}, ${collectedAt})`,
        sunCycleCount: sql`GREATEST(${usersTable.sunCycleCount}, ${cycleCount})`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        sunFarmStartedAtMs: usersTable.sunFarmStartedAtMs,
        sunLastCollectedAtMs: usersTable.sunLastCollectedAtMs,
        sunCycleCount: usersTable.sunCycleCount,
      });

    if (updated.length === 0) {
      // No row yet — the user record is created lazily by /balance/sync.
      // Until that lands we just echo the proposed values so the client
      // doesn't think the cycle was rejected. The next /sun/cycle call
      // after the user row exists will land normally.
      return res.json({
        sunFarmStartedAtMs: startedAt,
        sunLastCollectedAtMs: collectedAt,
        sunCycleCount: cycleCount,
      });
    }
    return res.json(updated[0]);
  } catch (err) {
    console.error("[sun/cycle] error:", err);
    return res.status(500).json({ error: "INTERNAL" });
  }
});

export default router;
