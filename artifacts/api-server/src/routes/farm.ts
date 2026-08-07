import { Router, type IRouter } from "express";
import { db, farmCyclesTable, usersTable } from "@workspace/db";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { bumpZoomPriceFireAndForget } from "../lib/zoomPrice";

const router: IRouter = Router();

// Default farm cycle = 1 hour. Users can upgrade per-planet up to 24h.
const BASE_FARM_DURATION_MS = 1 * 60 * 60 * 1000;

// Cost table (GRAM / TON) for permanent per-planet farm-duration upgrades.
const UPGRADE_COSTS: Record<number, number> = {
  1: 1,
  2: 1.5,
  4: 2,
  6: 2.5,
  8: 3,
  16: 3.5,
  24: 5,
};

const VALID_DURATIONS = new Set(Object.keys(UPGRADE_COSTS).map(Number));

const StartBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
  planetType: z.string().min(1),
  isWhite: z.boolean().optional(),
  // Farm duration in hours (default 1). Stored in farm_cycles.expires_at so
  // notification crons fire at the correct time for upgraded planets.
  farmDurationHours: z.number().int().positive().max(24).optional(),
});

/**
 * Register (or refresh) a farming cycle for a planet.
 * Called by the client every time a planet is activated/reactivated. We
 * upsert by (telegramId, planetId): one row per planet per user, always
 * holding the CURRENT cycle. Old notification/collect timestamps are wiped
 * so the next elapsed scan can re-notify on the new cycle.
 */
router.post("/farm/start", async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, planetType, isWhite, farmDurationHours } = parsed.data;
  const durationMs = (farmDurationHours ?? 1) * 60 * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);
  try {
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

const ReactivateBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
  planetType: z.string().min(1),
  farmDurationHours: z.number().int().positive().max(24).optional(),
});

/**
 * Reactivate an expired planet's farm cycle by spending 1 REDSTAR.
 * Atomically validates balance, deducts 1 red_star_balance, and upserts
 * the farm cycle. Returns the new redStarBalance so the client can snap.
 */
router.post("/farm/reactivate", async (req, res) => {
  const parsed = ReactivateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, planetType, farmDurationHours } = parsed.data;
  const durationMs = (farmDurationHours ?? 1) * 60 * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);

  try {
    const result = await db.transaction(async (tx) => {
      // Atomically deduct 1 redstar — only succeeds if balance >= 1.
      const rows = await tx.execute(sql`
        UPDATE users
           SET red_star_balance = red_star_balance - 1
         WHERE telegram_id = ${telegramId}
           AND red_star_balance >= 1
        RETURNING red_star_balance
      `);
      const updated = (rows as unknown as { rows: Array<{ red_star_balance: number }> }).rows;
      if (!updated || updated.length === 0) {
        return null; // insufficient REDSTAR
      }
      const newRedStarBalance = updated[0]!.red_star_balance;

      // Upsert farm cycle with the (possibly upgraded) duration.
      await tx
        .insert(farmCyclesTable)
        .values({ telegramId, planetId, planetType, isWhite: false, activatedAt: now, expiresAt })
        .onConflictDoUpdate({
          target: [farmCyclesTable.telegramId, farmCyclesTable.planetId],
          set: {
            planetType,
            isWhite: false,
            activatedAt: now,
            expiresAt,
            collectedAt: null,
            notifiedAt: null,
          },
        });

      return newRedStarBalance;
    });

    if (result === null) {
      res.status(400).json({ ok: false, error: "Insufficient REDSTAR balance" });
      return;
    }
    res.json({ ok: true, newRedStarBalance: result });
  } catch (err) {
    console.error("[farm/reactivate] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const UpgradeDurationBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
  durationHours: z.number().int().positive().max(24),
});

/**
 * Permanently upgrade a planet's farm duration (stored in planetsJson).
 * Charges the GRAM cost from the user's ton_balance deposit balance.
 * The upgrade persists even when the planet is listed/sold on the market.
 */
router.post("/farm/upgrade-duration", async (req, res) => {
  const parsed = UpgradeDurationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, durationHours } = parsed.data;

  if (!VALID_DURATIONS.has(durationHours)) {
    res.status(400).json({ error: "Invalid duration" });
    return;
  }
  const cost = UPGRADE_COSTS[durationHours]!;

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT ton_balance, planets_json FROM users WHERE telegram_id = ${telegramId} FOR UPDATE
      `);
      const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
      if (!row) return { ok: false, error: "User not found" };

      const tonBalance = Number(row["ton_balance"] ?? 0);
      if (tonBalance < cost) return { ok: false, error: "Insufficient GRAM balance" };

      const rawPlanets = row["planets_json"];
      const planets: Array<Record<string, unknown>> = Array.isArray(rawPlanets) ? rawPlanets as Array<Record<string, unknown>> : [];
      const idx = planets.findIndex((p) => String(p["id"] ?? "") === planetId);
      if (idx < 0) return { ok: false, error: "Planet not found" };

      planets[idx] = { ...planets[idx], farmDurationHours: durationHours };

      await tx.execute(sql`
        UPDATE users
           SET ton_balance    = ton_balance - ${cost},
               balance_epoch  = balance_epoch + 1,
               planets_json   = ${JSON.stringify(planets)}::jsonb
         WHERE telegram_id = ${telegramId}
           AND ton_balance  >= ${cost}
      `);

      return { ok: true, newTonBalance: tonBalance - cost };
    });

    res.json(result);
  } catch (err) {
    console.error("[farm/upgrade-duration] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const CollectionReactivateBody = z.object({
  telegramId: z.string().min(1),
  // How many collection-planet slots are being reactivated. Each costs 1 REDSTAR.
  count: z.number().int().positive().max(100),
});

/**
 * Reactivate `count` collection-planet slots by deducting `count` REDSTARs
 * from the user's balance. Collection planets (White, Earth, Black, Supernova,
 * REDSTAR/Stella Rossa) previously required a TonConnect on-chain payment;
 * they now use REDSTAR from the user's in-game balance.
 */
router.post("/collection/reactivate", async (req, res) => {
  const parsed = CollectionReactivateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, count } = parsed.data;
  try {
    const rows = await db.execute(sql`
      UPDATE users
         SET red_star_balance = red_star_balance - ${count}
       WHERE telegram_id = ${telegramId}
         AND red_star_balance >= ${count}
      RETURNING red_star_balance
    `);
    const updated = (rows as unknown as { rows: Array<{ red_star_balance: number }> }).rows;
    if (!updated || updated.length === 0) {
      res.status(400).json({ ok: false, error: "Insufficient ★ Redstar balance" });
      return;
    }
    res.json({ ok: true, newRedStarBalance: updated[0]!.red_star_balance });
  } catch (err) {
    console.error("[collection/reactivate] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const CollectBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
});

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
export { BASE_FARM_DURATION_MS as FARM_DURATION_MS };

export async function fetchPendingFarmNotifications(limit = 100) {
  return await db
    .select()
    .from(farmCyclesTable)
    .where(
      and(
        lte(farmCyclesTable.expiresAt, new Date()),
        isNull(farmCyclesTable.notifiedAt),
        isNull(farmCyclesTable.collectedAt),
      ),
    )
    .orderBy(farmCyclesTable.expiresAt, farmCyclesTable.id)
    .limit(limit);
}

export async function markFarmNotified(id: number, expectedExpiresAt: Date) {
  await db
    .update(farmCyclesTable)
    .set({ notifiedAt: new Date() })
    .where(sql`${farmCyclesTable.id} = ${id}
        AND ${farmCyclesTable.notifiedAt} IS NULL
        AND ${farmCyclesTable.collectedAt} IS NULL
        AND ${farmCyclesTable.expiresAt} = ${expectedExpiresAt}`);
}
