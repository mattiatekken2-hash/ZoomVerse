import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { settleCometStardust } from "./stardust.js";

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
  claimedBonusComet: z.number().int().min(0).optional(),
  // Last time the client credited offline farming. We GREATEST-merge it so
  // the server keeps the most recent settle moment across devices/sessions
  // and offline farming credits the exact gap on the next open. See the
  // long comment on usersTable.lastFarmingSettledAtMs.
  lastFarmingSettledAtMs: z.number().int().min(0).optional(),
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
        claimedBonusComet: usersTable.claimedBonusComet,
        lastFarmingSettledAtMs: usersTable.lastFarmingSettledAtMs,
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
        claimedBonusComet: 0,
        lastFarmingSettledAtMs: 0,
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
      claimedBonusComet: row.claimedBonusComet ?? 0,
      lastFarmingSettledAtMs: Number(row.lastFarmingSettledAtMs ?? 0),
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
    claimedBonusComet,
    lastFarmingSettledAtMs,
  } = parsed.data;
  try {
    // Settle pending COMET stardust BEFORE we overwrite planets_json. The
    // settle helper counts comets from the CURRENT planets_json; once we
    // replace it, a different count would silently take effect for the
    // window the user actually owned the previous count. Settling first
    // banks every full 24h window the OLD count earned, then the new
    // ownership applies to the next window — which is exactly what
    // "+25 stardust per comet per 24h owned" means. Cheap (one read +
    // one conditional write) and idempotent (CAS-guarded).
    await settleCometStardust(telegramId);
    // Atomic write with two safety properties:
    //   1. Stale-write fence: only overwrite `planets_json` (and bump
    //      `planets_updated_at_ms`) if the incoming clientWriteAtMs is
    //      strictly greater than the stored one. This handles concurrent
    //      saves from two devices and same-device out-of-order requests.
    //   2. Monotonic counters: `claimed_bonus_*` and
    //      `last_farming_settled_at_ms` are GREATEST-merged so a stale
    //      save can never lower them. Lowering claimed_bonus_* would let
    //      applyGrants re-mint bonus planets that were already burned;
    //      lowering last_farming_settled_at_ms would let a device replay
    //      an already-credited offline window and double-credit ZOOM.
    //   The whole thing runs in a single UPDATE so we don't need a tx.
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
        ...(claimedBonusComet != null ? { claimedBonusComet: sql`GREATEST(${usersTable.claimedBonusComet}, ${claimedBonusComet})` } : {}),
        ...(lastFarmingSettledAtMs != null ? { lastFarmingSettledAtMs: sql`GREATEST(${usersTable.lastFarmingSettledAtMs}, ${lastFarmingSettledAtMs})` } : {}),
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
