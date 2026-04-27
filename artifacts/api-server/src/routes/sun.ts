import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

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
