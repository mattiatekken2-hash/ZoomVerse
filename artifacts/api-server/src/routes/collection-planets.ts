import { Router, type IRouter } from "express";
import { db } from "../db";
import { collectionPlanetsTable } from "../db/schema/planets";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const KIND = z.enum(["white", "earth", "black"]);

const PlanetStateSchema = z.object({
  kind: KIND,
  bundleIndex: z.number().int().min(0).max(64),
  subIndex: z.number().int().min(0).max(3),
  slotIndex: z.number().int().min(-1).max(255).nullable().optional(),
  isFarmingActive: z.boolean(),
  farmStartedAtMs: z.number().min(0),
  lastCollectedAtMs: z.number().min(0),
});

// GET /api/collection-planets/:telegramId
// Returns the full server-side state for both white and earth collection
// planets belonging to a user. The client merges this over its locally
// materialized planets so slot placements and farming timers survive any
// localStorage reset.
router.get("/collection-planets/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(collectionPlanetsTable)
      .where(eq(collectionPlanetsTable.telegramId, telegramId));
    res.json({
      ok: true,
      planets: rows.map((r) => ({
        kind: r.kind as "white" | "earth" | "black",
        bundleIndex: r.bundleIndex,
        subIndex: r.subIndex,
        slotIndex: r.slotIndex,
        isFarmingActive: r.isFarmingActive,
        farmStartedAtMs: r.farmStartedAtMs,
        lastCollectedAtMs: r.lastCollectedAtMs,
      })),
    });
  } catch (err) {
    console.error("[collection-planets/get] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const UpsertBody = z.object({
  telegramId: z.string().min(1),
  planet: PlanetStateSchema,
});

// POST /api/collection-planets/upsert
// Last-write-wins upsert of one planet record. Called by the client on
// every place / collect / reactivate / mark-reactivated operation.
router.post("/collection-planets/upsert", async (req, res) => {
  const parsed = UpsertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planet } = parsed.data;
  const slotIndex =
    planet.slotIndex == null || planet.slotIndex < 0 ? null : planet.slotIndex;
  // The client computes timestamps from `serverNow()` which adds a half-RTT
  // calibration offset and can therefore be a float (e.g. `1777195777655.5`).
  // The DB columns are `bigint`, so Postgres rejects fractional values and
  // the whole upsert fails — silently from the client's POV. Round here so
  // any float value from any client always lands cleanly in the bigint column.
  const farmStartedAtMs = Math.round(planet.farmStartedAtMs);
  const lastCollectedAtMs = Math.round(planet.lastCollectedAtMs);
  try {
    await db
      .insert(collectionPlanetsTable)
      .values({
        telegramId,
        kind: planet.kind,
        bundleIndex: planet.bundleIndex,
        subIndex: planet.subIndex,
        slotIndex,
        isFarmingActive: planet.isFarmingActive,
        farmStartedAtMs,
        lastCollectedAtMs,
      })
      .onConflictDoUpdate({
        target: [
          collectionPlanetsTable.telegramId,
          collectionPlanetsTable.kind,
          collectionPlanetsTable.bundleIndex,
          collectionPlanetsTable.subIndex,
        ],
        set: {
          slotIndex,
          isFarmingActive: planet.isFarmingActive,
          // Use GREATEST for monotonic timestamps so a stale request from
          // a slow client never rewinds farming timers backwards.
          farmStartedAtMs: sql`GREATEST(${collectionPlanetsTable.farmStartedAtMs}, ${farmStartedAtMs})`,
          lastCollectedAtMs: sql`GREATEST(${collectionPlanetsTable.lastCollectedAtMs}, ${lastCollectedAtMs})`,
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("[collection-planets/upsert] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const BulkSeedBody = z.object({
  telegramId: z.string().min(1),
  planets: z.array(PlanetStateSchema).max(64),
});

// POST /api/collection-planets/bulk-seed
// Used exactly once per client to migrate placements that already exist in
// localStorage to the server. Inserts only rows that are missing on the
// server (DO NOTHING on conflict) so it can never overwrite a fresher
// server-side change made from another device.
router.post("/collection-planets/bulk-seed", async (req, res) => {
  const parsed = BulkSeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, planets } = parsed.data;
  if (planets.length === 0) {
    res.json({ ok: true, inserted: 0 });
    return;
  }
  try {
    const values = planets.map((p) => ({
      telegramId,
      kind: p.kind,
      bundleIndex: p.bundleIndex,
      subIndex: p.subIndex,
      slotIndex: p.slotIndex == null || p.slotIndex < 0 ? null : p.slotIndex,
      isFarmingActive: p.isFarmingActive,
      // See upsert handler above: client `serverNow()` can be a float because
      // of half-RTT calibration; bigint columns reject fractional values, so
      // we round here. Without this, the entire bulk-seed migration fails
      // and placed planets silently revert to inventory after a reload.
      farmStartedAtMs: Math.round(p.farmStartedAtMs),
      lastCollectedAtMs: Math.round(p.lastCollectedAtMs),
    }));
    await db
      .insert(collectionPlanetsTable)
      .values(values)
      .onConflictDoNothing({
        target: [
          collectionPlanetsTable.telegramId,
          collectionPlanetsTable.kind,
          collectionPlanetsTable.bundleIndex,
          collectionPlanetsTable.subIndex,
        ],
      });
    res.json({ ok: true, inserted: values.length });
  } catch (err) {
    console.error("[collection-planets/bulk-seed] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
