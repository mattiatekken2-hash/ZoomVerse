import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  FLOAT_PLANET_TYPES,
  deterministicFloatFromId,
  sanitizeIncomingFloat,
} from "../lib/planetFloat";

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
    // Optional user-chosen name from /planets/rename. Length is bounded
    // here as a defense-in-depth check on incoming /regular-planets/save
    // payloads; the rename endpoint itself enforces stricter rules.
    displayName: z.string().max(64).optional(),
    // CS:GO-style cosmetic perfection score in [0, 1], 3 decimals.
    // Server uses the FIRST value it sees per planet id (server-merge
    // below); subsequent saves can't change it. Out-of-range values are
    // sanitized to undefined and the server falls back to the
    // deterministic-from-id seed.
    float: z.number().finite().min(0).max(1).optional(),
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
  claimedBonusMythic: z.number().int().min(0).optional(),
  claimedBonusV1: z.number().int().min(0).optional(),
  claimedBonusV1NftPlatinum: z.number().int().min(0).optional(),
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
        claimedBonusMythic: usersTable.claimedBonusMythic,
        claimedBonusV1: usersTable.claimedBonusV1,
        claimedBonusV1NftPlatinum: usersTable.claimedBonusV1NftPlatinum,
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
        claimedBonusMythic: 0,
        claimedBonusV1: 0,
        claimedBonusV1NftPlatinum: 0,
      });
      return;
    }
    res.json({
      ok: true,
      exists: true,
      // Float backfill on read: any regular planet that doesn't yet
      // have a `float` (legacy data from before the feature) gets a
      // deterministic-from-id value materialized in the response so
      // the UI shows the perfection bar instantly on first load. We
      // don't persist here — the next /save will, via the server-merge
      // logic above. The seed function is shared, so the value the
      // user sees now equals the value persisted later.
      planets: Array.isArray(row.planetsJson)
        ? (row.planetsJson as Array<Record<string, unknown>>).map((p) => {
            if (!p || typeof p !== "object") return p;
            if (typeof p.float === "number") return p;
            const planetType = String((p as { name?: string }).name ?? "").toUpperCase();
            if (!FLOAT_PLANET_TYPES.has(planetType)) return p;
            const id = typeof p.id === "string" ? p.id : "";
            if (!id) return p;
            return { ...p, float: deterministicFloatFromId(id) };
          })
        : [],
      claimedBonusBasic: row.claimedBonusBasic ?? 0,
      claimedBonusRare: row.claimedBonusRare ?? 0,
      claimedBonusEpic: row.claimedBonusEpic ?? 0,
      claimedBonusGold: row.claimedBonusGold ?? 0,
      claimedBonusMythic: row.claimedBonusMythic ?? 0,
      claimedBonusV1: row.claimedBonusV1 ?? 0,
      claimedBonusV1NftPlatinum: row.claimedBonusV1NftPlatinum ?? 0,
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
    claimedBonusMythic,
    claimedBonusV1,
    claimedBonusV1NftPlatinum,
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
    // Run the read+merge+write inside a single transaction with FOR
    // UPDATE on the user row. Without this lock, a concurrent
    // /planets/rename can commit a paid displayName between our SELECT
    // and our UPDATE — we'd then strip the client's incoming
    // displayName (correct, paid-action integrity) AND fail to pin the
    // server-stored one (because we read it before the rename
    // committed), silently wiping the rename. The lock serializes
    // /save with /rename so whichever runs second always sees the
    // first's writes.
    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT planets_json, planets_updated_at_ms
            FROM users
            WHERE telegram_id = ${telegramId}
            FOR UPDATE`,
      );
      const lockedRow = (lockedRows.rows ?? lockedRows)[0] as
        | { planets_json: unknown; planets_updated_at_ms: number }
        | undefined;
      if (!lockedRow) return { kind: "not_found" as const };
      const existingPlanets = Array.isArray(lockedRow.planets_json)
        ? (lockedRow.planets_json as unknown[])
        : [];
      const lostCount = existingPlanets.length - planets.length;
      if (lostCount >= SHRINK_GUARD_THRESHOLD) {
        console.warn(
          `[regular-planets/save] anti-shrink guard tripped for ${telegramId}: ` +
          `stored=${existingPlanets.length}, incoming=${planets.length}, lost=${lostCount}. ` +
          `Refusing to overwrite planets_json. clientWriteAtMs=${clientWriteAtMs}, storedUpdatedAt=${lockedRow.planets_updated_at_ms}.`
        );
        // Still allow the GREATEST-merged claimed_bonus_* counters to land —
        // they're monotonic and harmless. Just don't touch planets_json.
        await tx
          .update(usersTable)
          .set({
            ...(claimedBonusBasic != null ? { claimedBonusBasic: sql`GREATEST(${usersTable.claimedBonusBasic}, ${claimedBonusBasic})` } : {}),
            ...(claimedBonusRare  != null ? { claimedBonusRare:  sql`GREATEST(${usersTable.claimedBonusRare},  ${claimedBonusRare})`  } : {}),
            ...(claimedBonusEpic  != null ? { claimedBonusEpic:  sql`GREATEST(${usersTable.claimedBonusEpic},  ${claimedBonusEpic})`  } : {}),
            ...(claimedBonusGold  != null ? { claimedBonusGold:  sql`GREATEST(${usersTable.claimedBonusGold},  ${claimedBonusGold})`  } : {}),
            ...(claimedBonusMythic != null ? { claimedBonusMythic: sql`GREATEST(${usersTable.claimedBonusMythic}, ${claimedBonusMythic})` } : {}),
            ...(claimedBonusV1    != null ? { claimedBonusV1:    sql`GREATEST(${usersTable.claimedBonusV1},    ${claimedBonusV1})`    } : {}),
            ...(claimedBonusV1NftPlatinum != null ? { claimedBonusV1NftPlatinum: sql`GREATEST(${usersTable.claimedBonusV1NftPlatinum}, ${claimedBonusV1NftPlatinum})` } : {}),
            ...(craftsCompleted   != null ? { totalPlanetsBuilt: sql`GREATEST(${usersTable.totalPlanetsBuilt}, ${craftsCompleted})` } : {}),
          })
          .where(eq(usersTable.telegramId, telegramId));
        return { kind: "rejected" as const, count: existingPlanets.length };
      }
    // PAID-ACTION INTEGRITY: `displayName` is set EXCLUSIVELY by the
    // /planets/rename endpoint after debiting stardust. /save must NOT
    // be a back door — both for letting users name planets for free AND
    // for letting a stale snapshot revert a paid rename. We strip every
    // incoming displayName and overlay the server-stored one (matched by
    // planet.id) before writing. The save can still update every other
    // field; only displayName is server-pinned.
    // Build lookup maps for server-pinned fields. Both `displayName`
    // and `float` are server-owned: once stored, the client can never
    // overwrite them via /save. (`displayName` is set ONLY by the paid
    // /planets/rename endpoint; `float` is set ONLY on the very first
    // save for each planet id, then frozen.)
    const storedNamesById = new Map<string, string>();
    const storedFloatsById = new Map<string, number>();
    // Server-pinned marketplace + pause fields. /market/list,
    // /market/delist and /market/buy are the ONLY authoritative writers
    // for these. Without pinning, a stale or mid-air /save can flip
    // `isListedInMarket` back to false (ghost-unlist), zero out
    // `pausedAt` (breaking pause-preserving resume), or restore a
    // stale `isFarmingActive=true` while the planet is listed (letting
    // farm/settle credit ZOOM for a paused asset).
    const storedListingById = new Map<string, {
      isListedInMarket: boolean;
      serverListingId: number | undefined;
      marketPrice: number | null;
      pausedAt: number;
    }>();
    for (const p of existingPlanets) {
      if (p && typeof p === "object") {
        const obj = p as Record<string, unknown>;
        const id = typeof obj.id === "string" ? obj.id : "";
        if (!id) continue;
        const dn = typeof obj.displayName === "string" ? obj.displayName : "";
        if (dn) storedNamesById.set(id, dn);
        const f = sanitizeIncomingFloat(obj.float);
        if (typeof f === "number") storedFloatsById.set(id, f);
        storedListingById.set(id, {
          isListedInMarket: obj.isListedInMarket === true,
          serverListingId: typeof obj.serverListingId === "number" ? obj.serverListingId : undefined,
          marketPrice: typeof obj.marketPrice === "number" ? obj.marketPrice : null,
          pausedAt: typeof obj.pausedAt === "number" && Number.isFinite(obj.pausedAt) ? obj.pausedAt : 0,
        });
      }
    }
    const sanitizedPlanets = planets.map((incoming) => {
      const { displayName: _ignoredDn, float: _ignoredFloat, ...rest } = incoming as Record<string, unknown>;
      void _ignoredDn; void _ignoredFloat;
      const id = String(rest.id ?? "");
      const planetType = String((rest as { name?: string }).name ?? "").toUpperCase();
      const out: Record<string, unknown> = { ...rest };
      // displayName: pin to stored if any (paid action, /save can't mutate it).
      const storedName = storedNamesById.get(id);
      if (storedName) out.displayName = storedName;
      // float: pin to stored if any; otherwise (first save for this
      // planet) accept an in-range incoming value; otherwise (legacy
      // planet, no incoming) seed deterministically from id so the
      // user keeps seeing the same bar value across reloads. Only
      // applies to FLOAT_PLANET_TYPES — white/earth/sun never carry one.
      if (FLOAT_PLANET_TYPES.has(planetType)) {
        const stored = storedFloatsById.get(id);
        if (typeof stored === "number") {
          out.float = stored;
        } else {
          const incomingFloat = sanitizeIncomingFloat((incoming as { float?: unknown }).float);
          out.float = typeof incomingFloat === "number"
            ? incomingFloat
            : deterministicFloatFromId(id);
        }
      }
      // Marketplace + pause pinning. The server-stored values for
      // `isListedInMarket`, `serverListingId`, `marketPrice` and
      // `pausedAt` are authoritative — only /market/* endpoints may
      // change them. We overlay them onto the incoming row so the
      // client save can never desync the listing state. When the
      // server says the planet is listed, we ALSO force
      // `isFarmingActive=false` (a listed planet must always be
      // paused so /farm/settle never credits ZOOM for it).
      const storedListing = storedListingById.get(id);
      if (storedListing) {
        out.isListedInMarket = storedListing.isListedInMarket;
        if (storedListing.serverListingId !== undefined) {
          out.serverListingId = storedListing.serverListingId;
        } else {
          delete out.serverListingId;
        }
        out.marketPrice = storedListing.marketPrice;
        out.pausedAt = storedListing.pausedAt;
        if (storedListing.isListedInMarket) {
          out.isFarmingActive = false;
        }
      }
      return out;
    });
      const updated = await tx
        .update(usersTable)
        .set({
          planetsJson: sql`CASE WHEN ${usersTable.planetsUpdatedAtMs} < ${clientWriteAtMs} THEN ${JSON.stringify(sanitizedPlanets)}::jsonb ELSE ${usersTable.planetsJson} END`,
          planetsUpdatedAtMs: sql`GREATEST(${usersTable.planetsUpdatedAtMs}, ${clientWriteAtMs})`,
          ...(claimedBonusBasic != null ? { claimedBonusBasic: sql`GREATEST(${usersTable.claimedBonusBasic}, ${claimedBonusBasic})` } : {}),
          ...(claimedBonusRare  != null ? { claimedBonusRare:  sql`GREATEST(${usersTable.claimedBonusRare},  ${claimedBonusRare})`  } : {}),
          ...(claimedBonusEpic  != null ? { claimedBonusEpic:  sql`GREATEST(${usersTable.claimedBonusEpic},  ${claimedBonusEpic})`  } : {}),
          ...(claimedBonusGold  != null ? { claimedBonusGold:  sql`GREATEST(${usersTable.claimedBonusGold},  ${claimedBonusGold})`  } : {}),
          ...(claimedBonusMythic != null ? { claimedBonusMythic: sql`GREATEST(${usersTable.claimedBonusMythic}, ${claimedBonusMythic})` } : {}),
          ...(claimedBonusV1    != null ? { claimedBonusV1:    sql`GREATEST(${usersTable.claimedBonusV1},    ${claimedBonusV1})`    } : {}),
          ...(claimedBonusV1NftPlatinum != null ? { claimedBonusV1NftPlatinum: sql`GREATEST(${usersTable.claimedBonusV1NftPlatinum}, ${claimedBonusV1NftPlatinum})` } : {}),
          ...(craftsCompleted   != null ? { totalPlanetsBuilt: sql`GREATEST(${usersTable.totalPlanetsBuilt}, ${craftsCompleted})` } : {}),
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({
          telegramId: usersTable.telegramId,
          updatedAt: usersTable.planetsUpdatedAtMs,
        });
      const accepted = updated[0]?.updatedAt === clientWriteAtMs;
      return { kind: "ok" as const, accepted, count: sanitizedPlanets.length };
    });
    if (txResult.kind === "not_found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (txResult.kind === "rejected") {
      res.json({
        ok: true,
        accepted: false,
        count: txResult.count,
        rejected: "anti-shrink guard",
      });
      return;
    }
    res.json({ ok: true, accepted: txResult.accepted, count: txResult.count });
  } catch (err) {
    console.error("[regular-planets/save] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /api/planets/rename ──────────────────────────────────────────
//
// Lets the user rename ONE of their regular-rarity planets (Basic / Rare
// / Epic / Gold / V1). White Collection, Earth Collection and the SUN
// are excluded by RENAMABLE_TYPES on the server (and never exposed in
// the rename UI on the client). Two modes:
//
//   • "random" — client picks a fresh procedural name, server charges
//     RENAME_RANDOM_COST stardust (currently 100).
//   • "custom" — client supplies the user-typed name, server validates
//     length / charset / profanity, charges RENAME_CUSTOM_COST stardust
//     (currently 500).
//
// Atomicity: the stardust debit AND the planets_json mutation must
// either both happen or neither. Done in a single transaction with two
// guards: the user's row is locked FOR UPDATE, the debit is fenced on
// `stardust_balance >= cost AND is_disabled = false`, and the JSONB
// update only proceeds if the matching planet is still in the array
// (defends against burn / sell racing the rename).
import { RENAMABLE_TYPES, RENAME_RANDOM_COST, RENAME_CUSTOM_COST, validateRenameName, generateRandomPlanetName } from "../lib/planetNames";

const RenameBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1).max(128),
  mode: z.enum(["random", "custom"]),
  // ONLY used in mode:"custom" — the user-typed string. In mode:"random"
  // the server generates the name itself and ignores any client value;
  // this prevents users from buying a custom name at the random price.
  name: z.string().min(1).max(128).optional(),
});

router.post("/planets/rename", async (req, res) => {
  const parsed = RenameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, mode } = parsed.data;

  // Decide the final name BEFORE the transaction so a slow tx doesn't
  // hold the row lock during string work.
  let finalName: string;
  if (mode === "random") {
    // Server is the only source of names in random mode. We don't even
    // look at parsed.data.name. Generated names are guaranteed to pass
    // the profanity filter (word banks are curated) and the charset
    // rules, but we still run them through validateRenameName as a
    // belt-and-suspenders sanity check.
    const generated = generateRandomPlanetName();
    const v = validateRenameName(generated);
    if (!v.ok) {
      // Should be impossible — log loudly and bail rather than silently
      // persisting a name we don't trust.
      console.error("[planets/rename] generated name failed validation:", generated, v);
      res.status(500).json({ ok: false, error: "Server name generation error" });
      return;
    }
    finalName = v.name;
  } else {
    const v = validateRenameName(parsed.data.name ?? "");
    if (!v.ok) {
      res.status(400).json({ ok: false, error: v.message, code: v.code });
      return;
    }
    finalName = v.name;
  }
  const cost = mode === "custom" ? RENAME_CUSTOM_COST : RENAME_RANDOM_COST;

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the user row so a concurrent burn / sell / save can't
      // mutate planets_json under us between the read and the write.
      const rows = await tx.execute(
        sql`SELECT planets_json, stardust_balance, is_disabled
            FROM users
            WHERE telegram_id = ${telegramId}
            FOR UPDATE`,
      );
      const row = (rows.rows ?? rows)[0] as
        | { planets_json: unknown; stardust_balance: number; is_disabled: boolean }
        | undefined;
      if (!row) return { status: 404, body: { ok: false, error: "User not found" } };
      if (row.is_disabled) return { status: 403, body: { ok: false, error: "Account disabled" } };

      const balance = Number(row.stardust_balance ?? 0);
      if (balance < cost) {
        return {
          status: 402,
          body: { ok: false, error: "Not enough stardust", code: "insufficient_stardust", have: balance, need: cost },
        };
      }

      const arr = Array.isArray(row.planets_json) ? (row.planets_json as Array<Record<string, unknown>>) : [];
      const idx = arr.findIndex((p) => String(p?.id ?? "") === planetId);
      if (idx < 0) {
        return { status: 404, body: { ok: false, error: "Planet not found", code: "planet_not_found" } };
      }
      const planet = arr[idx]!;
      const planetType = String(planet.name ?? "").toUpperCase();
      if (!RENAMABLE_TYPES.has(planetType)) {
        return {
          status: 400,
          body: { ok: false, error: "This planet type cannot be renamed", code: "type_not_renamable" },
        };
      }

      const nextArr = arr.slice();
      nextArr[idx] = { ...planet, displayName: finalName };

      const updated = await tx
        .update(usersTable)
        .set({
          stardustBalance: sql`${usersTable.stardustBalance} - ${cost}`,
          planetsJson: sql`${JSON.stringify(nextArr)}::jsonb`,
          planetsUpdatedAtMs: sql`GREATEST(${usersTable.planetsUpdatedAtMs}, ${Date.now()})`,
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({
          stardustBalance: usersTable.stardustBalance,
        });
      const newBalance = updated[0]?.stardustBalance ?? balance - cost;
      return {
        status: 200,
        body: { ok: true, displayName: finalName, stardustBalance: newBalance, mode, cost },
      };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[planets/rename] error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

export default router;
