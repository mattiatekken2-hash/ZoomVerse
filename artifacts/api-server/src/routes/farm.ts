import { Router, type IRouter } from "express";
import { db, farmCyclesTable, usersTable } from "../db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { bumpZoomPriceFireAndForget } from "../lib/zoomPrice";

const router: IRouter = Router();

const FARM_DURATION_MS = 24 * 60 * 60 * 1000;

const StartBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
  planetType: z.string().min(1),
  isWhite: z.boolean().optional(),
});

/**
 * Register (or refresh) a farming cycle for a planet.
 * Called by the client every time a planet is activated/reactivated. We
 * upsert by (telegramId, planetId): one row per planet per user, always
 * holding the CURRENT cycle. Old notification/collect timestamps are wiped
 * so the next 24h-elapsed scan can re-notify on the new cycle.
 */
router.post("/farm/start", async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, planetType, isWhite } = parsed.data;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FARM_DURATION_MS);
  try {
    // Atomic upsert keyed on the unique (telegram_id, planet_id) index. On
    // re-activation we wipe collected_at + notified_at so the fresh 24h cycle
    // is once again eligible for the "Farm full" reminder.
    await db
      .insert(farmCyclesTable)
      .values({
        telegramId,
        planetId,
        planetType,
        isWhite: !!isWhite,
        activatedAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [farmCyclesTable.telegramId, farmCyclesTable.planetId],
        set: {
          planetType,
          isWhite: !!isWhite,
          activatedAt: now,
          expiresAt,
          collectedAt: null,
          notifiedAt: null,
        },
      });
    // Bump the global $ZOOM price — but only if the user actually OWNS
    // the planet they claim to be activating. Without this check anyone
    // could spam /farm/start with arbitrary planet ids and pump the
    // public price index. The per-user cooldown inside bumpZoomPrice is
    // a second layer (max 1 bump per minute per user). We do the
    // ownership lookup AFTER the upsert so the user's own cycle insert
    // path stays unaffected if the lookup fails for any reason.
    void (async () => {
      try {
        const [u] = await db
          .select({ planetsJson: usersTable.planetsJson })
          .from(usersTable)
          .where(eq(usersTable.telegramId, telegramId))
          .limit(1);
        const owned = Array.isArray(u?.planetsJson)
          && (u!.planetsJson as Array<Record<string, unknown>>)
              .some((p) => p && typeof p === "object" && p["id"] === planetId);
        if (owned) bumpZoomPriceFireAndForget("farm_cycle", telegramId);
      } catch { /* ignore — price is decorative */ }
    })();
    res.json({ ok: true });
  } catch (err) {
    console.error("[farm/start] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const CollectBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
});

/**
 * Stamp the cycle as collected so the cron job knows the user has already
 * acted and there's no need to send the "Farm full" reminder.
 */
router.post("/farm/collect", async (req, res) => {
  const parsed = CollectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId } = parsed.data;
  try {
    await db
      .update(farmCyclesTable)
      .set({ collectedAt: new Date() })
      .where(and(eq(farmCyclesTable.telegramId, telegramId), eq(farmCyclesTable.planetId, planetId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[farm/collect] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const StopBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
});

/**
 * Cancel the cycle (planet sold/burned/stop-farmed). Removes the row so
 * we don't fire a notification for a planet the user no longer owns/farms.
 */
router.post("/farm/stop", async (req, res) => {
  const parsed = StopBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId } = parsed.data;
  try {
    await db
      .delete(farmCyclesTable)
      .where(and(eq(farmCyclesTable.telegramId, telegramId), eq(farmCyclesTable.planetId, planetId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[farm/stop] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
export { FARM_DURATION_MS };

/**
 * Cron scan: returns expired-but-not-yet-notified cycles where the user
 * hasn't already collected during this cycle. Caller iterates and sends
 * the Telegram notification.
 */
export async function fetchPendingFarmNotifications(limit = 100) {
  return await db
    .select()
    .from(farmCyclesTable)
    .where(sql`${farmCyclesTable.expiresAt} <= NOW()
        AND ${farmCyclesTable.notifiedAt} IS NULL
        AND ${farmCyclesTable.collectedAt} IS NULL`)
    .orderBy(farmCyclesTable.expiresAt, farmCyclesTable.id)
    .limit(limit);
}

/**
 * Mark a cycle as notified, but only if it is STILL pending. We match the
 * exact `expiresAt` snapshot the cron read so that if the user reactivated
 * the planet between fetch and mark (which resets `notifiedAt`/`collectedAt`
 * AND advances `expiresAt`), we do not stamp the brand-new cycle as already
 * notified — that brand-new cycle deserves its own future notification.
 */
export async function markFarmNotified(id: number, expectedExpiresAt: Date) {
  await db
    .update(farmCyclesTable)
    .set({ notifiedAt: new Date() })
    .where(sql`${farmCyclesTable.id} = ${id}
        AND ${farmCyclesTable.notifiedAt} IS NULL
        AND ${farmCyclesTable.collectedAt} IS NULL
        AND ${farmCyclesTable.expiresAt} = ${expectedExpiresAt}`);
}
