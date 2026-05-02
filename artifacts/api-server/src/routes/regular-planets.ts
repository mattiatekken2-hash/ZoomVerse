import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// One row in the planets array. Matches the client-side Planet type
// closely enough for the round-trip; unknown fields are passed through
// because we store the array as opaque JSONB.
const PlanetRow = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(16),
    rate: z.number().finite().min(0),
    color: z.string().max(64).optional().nullable(),
    glowColor: z.string().max(64).optional().nullable(),
    createdAt: z.number().finite().min(0).optional(),
    farmStartedAt: z.number().finite().min(0).optional(),
    lastCollectedAt: z.number().finite().min(0).optional(),
    isListedInMarket: z.boolean().optional(),
    isFarmingActive: z.boolean().optional(),
    marketPrice: z.number().nullable().optional(),
    craftCost: z.number().optional(),
    serverListingId: z.number().int().optional(),
    slotIndex: z.number().int().nullable().optional(),
  })
  .passthrough();

const SaveBody = z.object({
  telegramId: z.string().min(1),
  planets: z.array(PlanetRow).max(256),
  // Monotonic write timestamp from the client. Required so the server can
  // reject out-of-order saves (last-write-wins by client clock). Sending a
  // value <= the stored one means "this is stale" — the row is left alone.
  clientWriteAtMs: z.number().int().min(0),
  claimedBonusBasic: z.number().int().min(0).optional(),
  claimedBonusRare: z.number().int().min(0).optional(),
  claimedBonusEpic: z.number().int().min(0).optional(),
  claimedBonusGold: z.number().int().min(0).optional(),
  claimedBonusV1: z.number().int().min(0).optional(),
  // Monotonic client-side count of every planet ever forged / crafted /
  // fused on this device's localStorage. Server stores GREATEST(stored,
  // incoming) so the value can only grow — this is the source of truth
  // for the Earn-page planet-build tasks and is retroactive: the very
  // first save after deploy populates the counter from the client's
  // existing localStorage value.
  craftsCompleted: z.number().int().min(0).optional(),
});

// GET /api/regular-planets/:telegramId
// Returns the server-stored planets array + the per-rarity claimed-bonus
// counters. The client overrides its localStorage state with this on every
// load so a cache wipe / device switch never loses planets.
router.get("/regular-planets/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    const rows = await db
      .select({
        planetsJson: usersTable.planetsJson,
        claimedBonusBasic: usersTable.claimedBonusBasic,
        claimedBonusRare: usersTable.claimedBonusRare,
        claimedBonusEpic: usersTable.claimedBonusEpic,
        claimedBonusGold: usersTable.claimedBonusGold,
        claimedBonusV1: usersTable.claimedBonusV1,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.json({
        ok: true,
        exists: false,
        planets: [],
        claimedBonusBasic: 0,
        claimedBonusRare: 0,
        claimedBonusEpic: 0,
        claimedBonusGold: 0,
        claimedBonusV1: 0,
      });
      return;
    }
    res.json({
      ok: true,
      exists: true,
      planets: Array.isArray(row.planetsJson) ? row.planetsJson : [],
      claimedBonusBasic: row.claimedBonusBasic ?? 0,
      claimedBonusRare: row.claimedBonusRare ?? 0,
      claimedBonusEpic: row.claimedBonusEpic ?? 0,
      claimedBonusGold: row.claimedBonusGold ?? 0,
      claimedBonusV1: row.claimedBonusV1 ?? 0,
    });
  } catch (err) {
    console.error("[regular-planets/get] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/regular-planets/save
// Replaces the user's planets array with the supplied one. The client
// debounces this to ~1s after a state change so we're not pinging the DB
// on every tap. claimedBonus* counters are also written so applyGrants on
// a fresh device knows how many bonuses were already materialized.
router.post("/regular-planets/save", async (req, res) => {
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const {
    telegramId,
    planets,
    clientWriteAtMs,
    claimedBonusBasic,
    claimedBonusRare,
    claimedBonusEpic,
    claimedBonusGold,
    claimedBonusV1,
    craftsCompleted,
  } = parsed.data;
  try {
    // Atomic write with three safety properties:
    //   1. Stale-write fence: only overwrite `planets_json` (and bump
    //      `planets_updated_at_ms`) if the incoming clientWriteAtMs is
    //      strictly greater than the stored one. This handles concurrent
    //      saves from two devices and same-device out-of-order requests.
    //   2. Monotonic counters: `claimed_bonus_*` are GREATEST-merged so a
    //      stale save can never lower them, which would otherwise let
    //      applyGrants re-mint bonus planets that were already burned.
    //   3. Anti-shrink fence (added after @lektig "10 RARE disappeared"
    //      report): refuse the write if the new array is dramatically
    //      smaller than what we already have stored. Burns/sales remove
    //      at most ~2 planets per debounce window (1.2s), so a save that
    //      drops 6+ items in one go is almost certainly a buggy client
    //      reconciliation we haven't found yet. We log it for audit and
    //      return 200 with `accepted:false` — the client will keep its
    //      local state, the server keeps the larger snapshot, and a
    //      legitimate operation will retry on the next debounce.
    //   The whole thing runs in a single UPDATE so we don't need a tx.
    const SHRINK_GUARD_THRESHOLD = 6; // max items a single save may drop
    const existingRow = await db
      .select({
        planetsJson: usersTable.planetsJson,
        updatedAt: usersTable.planetsUpdatedAtMs,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (existingRow.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const existingPlanets = Array.isArray(existingRow[0]!.planetsJson)
      ? (existingRow[0]!.planetsJson as unknown[])
      : [];
    const lostCount = existingPlanets.length - planets.length;
    if (lostCount >= SHRINK_GUARD_THRESHOLD) {
      console.warn(
        `[regular-planets/save] anti-shrink guard tripped for ${telegramId}: ` +
        `stored=${existingPlanets.length}, incoming=${planets.length}, lost=${lostCount}. ` +
        `Refusing to overwrite planets_json. clientWriteAtMs=${clientWriteAtMs}, storedUpdatedAt=${existingRow[0]!.updatedAt}.`
      );
      // Still allow the GREATEST-merged claimed_bonus_* counters to land —
      // they're monotonic and harmless. Just don't touch planets_json.
      await db
        .update(usersTable)
        .set({
          ...(claimedBonusBasic != null ? { claimedBonusBasic: sql`GREATEST(${usersTable.claimedBonusBasic}, ${claimedBonusBasic})` } : {}),
          ...(claimedBonusRare  != null ? { claimedBonusRare:  sql`GREATEST(${usersTable.claimedBonusRare},  ${claimedBonusRare})`  } : {}),
          ...(claimedBonusEpic  != null ? { claimedBonusEpic:  sql`GREATEST(${usersTable.claimedBonusEpic},  ${claimedBonusEpic})`  } : {}),
          ...(claimedBonusGold  != null ? { claimedBonusGold:  sql`GREATEST(${usersTable.claimedBonusGold},  ${claimedBonusGold})`  } : {}),
          ...(claimedBonusV1    != null ? { claimedBonusV1:    sql`GREATEST(${usersTable.claimedBonusV1},    ${claimedBonusV1})`    } : {}),
          ...(craftsCompleted   != null ? { totalPlanetsBuilt: sql`GREATEST(${usersTable.totalPlanetsBuilt}, ${craftsCompleted})` } : {}),
        })
        .where(eq(usersTable.telegramId, telegramId));
      res.json({
        ok: true,
        accepted: false,
        count: existingPlanets.length,
        rejected: "anti-shrink guard",
      });
      return;
    }
    const updated = await db
      .update(usersTable)
      .set({
        planetsJson: sql`CASE WHEN ${usersTable.planetsUpdatedAtMs} < ${clientWriteAtMs} THEN ${JSON.stringify(planets)}::jsonb ELSE ${usersTable.planetsJson} END`,
        planetsUpdatedAtMs: sql`GREATEST(${usersTable.planetsUpdatedAtMs}, ${clientWriteAtMs})`,
        ...(claimedBonusBasic != null ? { claimedBonusBasic: sql`GREATEST(${usersTable.claimedBonusBasic}, ${claimedBonusBasic})` } : {}),
        ...(claimedBonusRare  != null ? { claimedBonusRare:  sql`GREATEST(${usersTable.claimedBonusRare},  ${claimedBonusRare})`  } : {}),
        ...(claimedBonusEpic  != null ? { claimedBonusEpic:  sql`GREATEST(${usersTable.claimedBonusEpic},  ${claimedBonusEpic})`  } : {}),
        ...(claimedBonusGold  != null ? { claimedBonusGold:  sql`GREATEST(${usersTable.claimedBonusGold},  ${claimedBonusGold})`  } : {}),
        ...(claimedBonusV1    != null ? { claimedBonusV1:    sql`GREATEST(${usersTable.claimedBonusV1},    ${claimedBonusV1})`    } : {}),
        ...(craftsCompleted   != null ? { totalPlanetsBuilt: sql`GREATEST(${usersTable.totalPlanetsBuilt}, ${craftsCompleted})` } : {}),
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        telegramId: usersTable.telegramId,
        updatedAt: usersTable.planetsUpdatedAtMs,
      });
    if (updated.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const accepted = updated[0]!.updatedAt === clientWriteAtMs;
    res.json({ ok: true, accepted, count: planets.length });
  } catch (err) {
    console.error("[regular-planets/save] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
