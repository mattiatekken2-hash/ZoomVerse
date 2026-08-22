import { Router, type IRouter } from "express";
import { db, pool, usersTable, marketListingsTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { addClient, removeClient, broadcastSale } from "../lib/activityBus";
import { sendBotMessage, sendMarketShareToGroup } from "../lib/notify";
import { bumpZoomPriceFireAndForget } from "../lib/zoomPrice";
import { recordHistoryAsync } from "../lib/history";
import {
  FLOAT_PLANET_TYPES,
  deterministicFloatFromId,
  sanitizeIncomingFloat,
} from "../lib/planetFloat";
import {
  isLabZoomShapeId,
  resolveLabShapeIdFromPlanet,
  resolveLabStardustShapeId,
  labMarketPathForPlanet,
  LAB_ZOOM_FARM_RATE,
  LAB_STARDUST_FARM_RATE,
  labModelDisplayName,
} from "@workspace/game-models";

type MarketPriceCurrency = "gram" | "zoom" | "stardust";
const MARKET_BOUNDS: Record<MarketPriceCurrency, { min: number; max: number }> = {
  gram: { min: 0.05, max: 2 },
  zoom: { min: 8, max: 400 },
  stardust: { min: 1, max: 25 },
};
function parseMarketPriceCurrency(v: unknown): MarketPriceCurrency {
  return v === "zoom" || v === "stardust" ? v : "gram";
}
function isMarketPriceInRange(price: number, currency: MarketPriceCurrency): boolean {
  const b = MARKET_BOUNDS[currency];
  return Number.isFinite(price) && price >= b.min && price <= b.max;
}

function canonicalLabFarmRate(shapeId: string | null | undefined): number | null {
  if (isLabZoomShapeId(shapeId)) return LAB_ZOOM_FARM_RATE[shapeId];
  const sd = resolveLabStardustShapeId(shapeId);
  return sd ? LAB_STARDUST_FARM_RATE[sd] : null;
}

const router: IRouter = Router();

void pool.query(`ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'gram'`).catch(() => {});

router.get("/market/sales", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT m.id, m.kind, m.planet_type, m.planet_rate, m.price, m.sold_at,
             m.planet_float,
             m.equipment_category, m.equipment_rarity, m.equipment_rate,
             COALESCE(s.first_name, m.seller_name, 'Anon') AS seller_name,
             COALESCE(b.first_name, 'Anon') AS buyer_name
      FROM market_listings m
      LEFT JOIN users s ON s.telegram_id = m.seller_telegram_id
      LEFT JOIN users b ON b.telegram_id = m.buyer_telegram_id
      WHERE m.status = 'sold' AND m.sold_at IS NOT NULL
      ORDER BY m.sold_at DESC
      LIMIT 20
    `);
    const sales = rows.rows.map((r: any) => {
      const rawFloat = r.planet_float;
      const planetFloat = typeof rawFloat === "number"
        ? rawFloat
        : (rawFloat != null && Number.isFinite(Number(rawFloat)) ? Number(rawFloat) : null);
      return {
        id: Number(r.id),
        kind: (r.kind === "equipment" ? "equipment" : r.kind === "item" ? "item" : "planet") as "planet" | "equipment" | "item",
        planetType: r.planet_type == null ? null : String(r.planet_type),
        planetRate: r.planet_rate == null ? null : Number(r.planet_rate),
        equipmentCategory: r.equipment_category == null ? null : String(r.equipment_category),
        equipmentRarity: r.equipment_rarity == null ? null : String(r.equipment_rarity),
        equipmentRate: r.equipment_rate == null ? null : Number(r.equipment_rate),
        price: Number(r.price),
        sellerName: String(r.seller_name),
        buyerName: String(r.buyer_name),
        soldAt: r.sold_at instanceof Date ? r.sold_at.getTime() : new Date(r.sold_at).getTime(),
        planetFloat,
      };
    });
    res.json({ sales });
  } catch (err) {
    console.error("[market/sales] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/market/activity/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);
  addClient(res);
  const heartbeat = setInterval(() => {
    try { res.write(`: hb\n\n`); } catch { /* */ }
  }, 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

// Price is in TON (supports decimals), capped between 0.25 and 10.0
// per the Global P2P Marketplace rules.
const TON_MIN = 0.25;
const TON_MAX = 10.0;
/** Public shop shelf — listing auto-hides after this unless seller reactivates. */
export const MARKET_LISTING_TTL_MS = 60 * 60 * 1000;

function listingTimeMs(listing: {
  lastActivatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  last_activated_at?: Date | string | null;
  created_at?: Date | string | null;
}): number {
  const raw = listing.lastActivatedAt ?? listing.createdAt ?? listing.last_activated_at ?? listing.created_at;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function listingShelfDeadline(listing: {
  lastActivatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  last_activated_at?: Date | string | null;
  created_at?: Date | string | null;
}): number {
  const t = listingTimeMs(listing);
  return t > 0 ? t + MARKET_LISTING_TTL_MS : 0;
}

function isListingOnShelf(listing: {
  lastActivatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  last_activated_at?: Date | string | null;
  created_at?: Date | string | null;
}, now = Date.now()): boolean {
  const t = listingTimeMs(listing);
  // Active rows with missing timestamps must still appear in LISTINGS.
  if (t <= 0) return true;
  return now < t + MARKET_LISTING_TTL_MS;
}

const ListBody = z.object({
  sellerTelegramId: z.string().min(1),
  sellerName: z.string().optional(),
  // Required: anchors the listing to a specific planet in the seller's
  // inventory. Without this we have no way to verify ownership.
  planetId: z.string().min(1).max(128),
  // Tutte le rarità di pianeti sono tradeabili sul marketplace globale P2P
  // in TON: Basic, Rare, Epic, Mythic, Plasma, Gold, V1, V1_NFT.
  // V1_NFT è l'esclusivo NFT (20 TON, max 5 globali) tradabile secondario.
  // V1 era precedentemente soulbound — ora è tradeable.
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1", "V1_NFT", "MUSHROOM", "NOVA"]),
  planetRate: z.number().positive(),
  price: z.number().positive(),
  priceCurrency: z.enum(["gram", "zoom", "stardust"]).optional(),
  // Lab generators: client may send shapeId so the Market card/widget
  // still render even if planets_json is momentarily missing the field.
  shapeId: z.string().min(1).max(32).optional(),
  displayName: z.string().min(1).max(64).optional(),
});

/**
 * Create a marketplace listing for one of the seller's regular planets.
 *
 * SECURITY MODEL — closes the "sell a planet you don't own" exploit
 * (which would let a malicious client mint ZOOM out of thin air and
 * convert it to TON via the withdrawal flow).
 *
 * The handler runs in a single transaction and enforces, IN ORDER:
 *   1. The seller's user row exists.
 *   2. The seller actually has a planet with that `planetId` in
 *      `users.planets_json`.
 *   3. The submitted `planetType` and `planetRate` match what is stored
 *      on the planet (prevents the "list a BASIC at GOLD's rate" scam
 *      that would inflate the asking price).
 *   4. The planet is not already marked as listed in the inventory.
 *   5. The planet is not currently farming (you can't sell a working
 *      planet — the buyer would inherit the timer state, which is a
 *      separate exploit surface we don't open here).
 *   6. The unique partial index `uq_market_seller_planet_active_sold`
 *      catches the "I already sold this planet, let me list it again"
 *      case at the DB level, so even a race between two /market/list
 *      requests is safe.
 *
 * After the listing row is inserted we surgically mark the matching
 * planet inside `planets_json` as listed (`isListedInMarket: true`,
 * `serverListingId`, `marketPrice`) and bump `planets_updated_at_ms`.
 * This is best-effort — the client may overwrite it with a higher
 * `clientWriteAtMs` on the next /regular-planets/save — but that is
 * acceptable because the unique-index check on subsequent /market/list
 * calls is what actually blocks money-impacting reuse.
 */
router.post("/market/list", async (req, res) => {
  const parsed = ListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const {
    sellerTelegramId,
    sellerName,
    planetId,
    planetType,
    planetRate,
    price,
    shapeId: bodyShapeId,
    displayName: bodyDisplayName,
    priceCurrency: bodyPriceCurrency,
  } = parsed.data;

  const priceCurrency = parseMarketPriceCurrency(bodyPriceCurrency);
  if (!isMarketPriceInRange(price, priceCurrency)) {
    res.status(400).json({ error: `Price out of range for ${priceCurrency}` });
    return;
  }

  // Block disabled accounts from creating new listings. Cheap pre-check
  // outside the transaction; the buy-side check is the authoritative
  // guard but stopping listings here keeps frozen accounts from even
  // appearing in the market feed.
  const [sellerFlag] = await db
    .select({ isDisabled: usersTable.isDisabled })
    .from(usersTable)
    .where(eq(usersTable.telegramId, sellerTelegramId))
    .limit(1);
  if (sellerFlag?.isDisabled) {
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    // Lock the seller's user row so a concurrent /market/list or
    // /regular-planets/save can't race with the ownership check.
    const [seller] = await txDb
      .select({ planetsJson: usersTable.planetsJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, sellerTelegramId))
      .for("update")
      .limit(1);

    if (!seller) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }

    let planets = Array.isArray(seller.planetsJson) ? (seller.planetsJson as Array<Record<string, unknown>>) : [];
    let planet = planets.find((p) => p && typeof p === "object" && p["id"] === planetId);

    const existingActive = await txDb
      .select()
      .from(marketListingsTable)
      .where(and(
        eq(marketListingsTable.sellerTelegramId, sellerTelegramId),
        eq(marketListingsTable.planetId, planetId),
        eq(marketListingsTable.status, "active"),
      ))
      .limit(1);
    if (existingActive[0]) {
      await client.query("COMMIT");
      res.json({
        ok: true,
        listing: {
          ...existingActive[0],
          priceCurrency: parseMarketPriceCurrency(existingActive[0].priceCurrency),
          marketPath: labMarketPathForPlanet({
            shapeId: existingActive[0].shapeId,
            displayName: existingActive[0].planetDisplayName,
            rate: existingActive[0].planetRate,
          }),
        },
      });
      return;
    }

    const resolvedShape = resolveLabShapeIdFromPlanet({
      shapeId: (typeof planet?.["shapeId"] === "string" ? planet["shapeId"] : bodyShapeId) as string | undefined,
      displayName: (typeof planet?.["displayName"] === "string" ? planet["displayName"] : bodyDisplayName) as string | undefined,
    });
    const canonRate = canonicalLabFarmRate(resolvedShape);

    if (!planet) {
      // Lab model exists on the client but never landed in planets_json
      // (failed /save, stale fence). Accept a verified Lab snapshot so SELL
      // still creates a real marketplace row.
      if (!resolvedShape || canonRate == null || planetType !== "BASIC") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Planet not found in your inventory" });
        return;
      }
      if (Math.abs(Number(planetRate) - canonRate) > 0.05) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Planet type or rate mismatch" });
        return;
      }
      planet = {
        id: planetId,
        name: "BASIC",
        rate: canonRate,
        shapeId: resolvedShape,
        displayName: typeof bodyDisplayName === "string" && bodyDisplayName.trim()
          ? bodyDisplayName.trim().slice(0, 64)
          : resolvedShape,
        isListedInMarket: false,
        isFarmingActive: false,
        marketPrice: null,
        createdAt: Date.now(),
        farmStartedAt: 0,
        lastCollectedAt: 0,
        farmDurationHours: 1,
      };
      planets = [...planets, planet];
      await client.query(
        `UPDATE users SET planets_json = $2::jsonb, planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint) WHERE telegram_id = $1`,
        [sellerTelegramId, JSON.stringify(planets), Date.now()],
      );
    } else {
      const storedName = String(planet["name"] ?? "");
      const storedRate = Number(planet["rate"]);
      const rateOk = Number.isFinite(storedRate) && (
        Math.abs(storedRate - planetRate) <= 0.05
        || (canonRate != null && Math.abs(planetRate - canonRate) <= 0.05)
      );
      if (storedName !== planetType || !rateOk) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Planet type or rate mismatch" });
        return;
      }
    }
    // Ghost isListedInMarket (optimistic save, no listing row) is ignored —
    // we already returned if an active listing exists.
    // NOTE: we no longer reject when `isFarmingActive === true`. Listing
    // a planet PAUSES its 24h farming cycle (see pausedAt logic in the
    // client + the planets_json patch below). The previous rejection
    // caused a race: client sets isFarmingActive=true on START, the
    // debounced /regular-planets/save flushes that to the server, then
    // the user immediately taps "list" and the server still sees
    // isFarmingActive=true (the optimistic pause hasn't been saved yet)
    // and refuses with HTTP 400 "Cannot list a farming planet". The
    // listing itself is the authoritative pause action — the planets_json
    // patch below stamps isFarmingActive=false + pausedAt=now atomically
    // so the server state always matches the new pause-preserving model.

    // Snapshot the planet's cosmetic Float into the listing so the
    // marketplace card can show the perfection bar without an extra
    // join back to the seller's planets_json. Falls back to the
    // deterministic-from-id seed for legacy planets that don't have a
    // float stored yet (matches what the client UI shows them anyway).
    let planetFloatSnapshot: number | null = null;
    if (FLOAT_PLANET_TYPES.has(String(planetType).toUpperCase())) {
      const stored = sanitizeIncomingFloat((planet as { float?: unknown }).float);
      planetFloatSnapshot = typeof stored === "number"
        ? stored
        : deterministicFloatFromId(planetId);
    }

    // Snapshot the seller's user-chosen displayName (set via the paid
    // /planets/rename endpoint) so the marketplace card can show
    // "Eos-Prime" instead of the bare rarity. Lab-forged 3D objects use
    // `modelName` the same way. Truncate defensively to the same 64-char
    // bound used elsewhere; null if never renamed / not a model.
    const rawModelId = (planet as { modelId?: unknown }).modelId;
    const modelIdSnapshot: string | null =
      typeof rawModelId === "string" && rawModelId.trim().length > 0
        ? rawModelId.trim().slice(0, 32)
        : null;
    const rawShapeId = (planet as { shapeId?: unknown }).shapeId;
    const shapeIdSnapshot: string | null =
      resolvedShape
      ?? (typeof rawShapeId === "string" && rawShapeId.trim().length > 0
        ? rawShapeId.trim().slice(0, 32)
        : (typeof bodyShapeId === "string" && bodyShapeId.trim().length > 0
          ? bodyShapeId.trim().slice(0, 32)
          : null));

    const rawDisplayName = (planet as { displayName?: unknown }).displayName;
    const rawModelName = (planet as { modelName?: unknown }).modelName;
    const planetDisplayNameSnapshot: string | null =
      labModelDisplayName({ shapeId: shapeIdSnapshot, displayName: typeof rawDisplayName === "string" ? rawDisplayName : bodyDisplayName })
      ?? (typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
        ? rawDisplayName.trim().slice(0, 64)
        : (typeof rawModelName === "string" && rawModelName.trim().length > 0
          ? rawModelName.trim().slice(0, 64)
          : (typeof bodyDisplayName === "string" && bodyDisplayName.trim().length > 0
            ? bodyDisplayName.trim().slice(0, 64)
            : null)));

    // Snapshot the farm-duration upgrade (hours). Only store when > 1 to
    // keep legacy/default planets with a clean null. Buyers can then
    // distinguish "no upgrade" from "explicitly 1h".
    const rawFarmDuration = (planet as { farmDurationHours?: unknown }).farmDurationHours;
    const planetFarmDurationHoursSnapshot: number | null =
      typeof rawFarmDuration === "number" && rawFarmDuration > 1
        ? rawFarmDuration
        : null;

    let listing;
    try {
      const [inserted] = await txDb
        .insert(marketListingsTable)
        .values({
          sellerTelegramId,
          sellerName: sellerName ?? null,
          planetId,
          planetType,
          planetRate,
          planetFloat: planetFloatSnapshot,
          planetDisplayName: planetDisplayNameSnapshot,
          planetFarmDurationHours: planetFarmDurationHoursSnapshot,
          modelId: modelIdSnapshot,
          shapeId: shapeIdSnapshot,
          price,
          priceCurrency,
          status: "active",
          lastActivatedAt: new Date(),
        })
        .returning();
      listing = inserted;
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        const [dup] = await db
          .select()
          .from(marketListingsTable)
          .where(and(
            eq(marketListingsTable.sellerTelegramId, sellerTelegramId),
            eq(marketListingsTable.planetId, planetId),
            eq(marketListingsTable.status, "active"),
          ))
          .limit(1);
        if (dup) {
          res.json({
            ok: true,
            listing: { ...dup, priceCurrency: parseMarketPriceCurrency(dup.priceCurrency) },
          });
          return;
        }
        res.status(409).json({ error: "This planet was previously listed and cannot be sold again" });
        return;
      }
      throw err;
    }

    // Mark the planet as listed in planets_json. This is a best-effort
    // sync so the seller's UI reflects the listing on next refresh; the
    // listing row (with its unique constraint) is the actual source of
    // truth for ownership.
    const nowMs = Date.now();
    // Stamp the listing on planets_json AND simultaneously pause the
    // 24h farming cycle (isFarmingActive=false, pausedAt=nowMs). The
    // pause stamp is what startFarming uses on resume to shift the
    // cycle anchor by the pause duration so the user gets back the
    // exact remaining time. We only set pausedAt if the planet was
    // actually farming (CASE on the prior isFarmingActive); otherwise
    // we preserve any existing pausedAt (don't overwrite an earlier
    // pause stamp from a previous list/delist round-trip).
    await client.query(
      `UPDATE users
       SET planets_json = COALESCE(
         (SELECT jsonb_agg(
            CASE WHEN p->>'id' = $2
              THEN p || jsonb_build_object(
                'isListedInMarket', true,
                'serverListingId', $3::int,
                'marketPrice', $4::real,
                'marketCurrency', $6::text,
                'isFarmingActive', false,
                'pausedAt', CASE
                  WHEN (p->>'isFarmingActive')::boolean IS TRUE THEN $5::bigint
                  ELSE COALESCE((p->>'pausedAt')::bigint, 0)
                END
              )
              ELSE p
            END
          )
          FROM jsonb_array_elements(planets_json) p),
         '[]'::jsonb
       ),
       planets_updated_at_ms = GREATEST(planets_updated_at_ms, $5::bigint)
       WHERE telegram_id = $1`,
      [sellerTelegramId, planetId, listing!.id, price, nowMs, priceCurrency],
    );

    await client.query("COMMIT");
    // Bump the global $ZOOM price index — every new listing nudges the
    // public price up. Fire-and-forget; never blocks the response.
    // Cooldown keyed on sellerTelegramId so a single user can't pump the
    // price by repeatedly listing in tight loops.
    bumpZoomPriceFireAndForget("market_list", sellerTelegramId);
    res.json({
      ok: true,
      listing: {
        ...listing,
        priceCurrency,
        planetDisplayName: listing.planetDisplayName ?? planetDisplayNameSnapshot,
        shapeId: listing.shapeId ?? shapeIdSnapshot,
        marketPath: labMarketPathForPlanet({
          shapeId: listing.shapeId ?? shapeIdSnapshot,
          displayName: listing.planetDisplayName ?? planetDisplayNameSnapshot,
          rate: listing.planetRate ?? planetRate,
        }),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/list] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// ───────────────── List equipment on the market ─────────────────
//
// Mirrors /market/list for the equipment inventory. Same security model:
// ownership verified inside a transaction under FOR UPDATE; the unique
// partial index uq_market_seller_equipment_active_sold prevents
// double-listing or re-listing of sold items.

const ListEquipmentBody = z.object({
  sellerTelegramId: z.string().min(1),
  sellerName: z.string().optional(),
  equipmentId: z.string().min(1).max(128),
  price: z.number().positive(),
});

router.post("/market/list-equipment", async (req, res) => {
  const parsed = ListEquipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { sellerTelegramId, sellerName, equipmentId, price } = parsed.data;

  // Price cap: 0.25 – 10.0 TON per any equipment (same rules as planets)
  if (price < TON_MIN || price > TON_MAX) {
    res.status(400).json({ error: `Prezzo deve essere tra ${TON_MIN} e ${TON_MAX} TON` });
    return;
  }

  const [sellerFlag] = await db
    .select({ isDisabled: usersTable.isDisabled })
    .from(usersTable)
    .where(eq(usersTable.telegramId, sellerTelegramId))
    .limit(1);
  if (sellerFlag?.isDisabled) {
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const [seller] = await txDb
      .select({ equipmentJson: usersTable.equipmentJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, sellerTelegramId))
      .for("update")
      .limit(1);

    if (!seller) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }

    const items = Array.isArray(seller.equipmentJson)
      ? (seller.equipmentJson as Array<Record<string, unknown>>)
      : [];
    const item = items.find((it) => it && typeof it === "object" && it["id"] === equipmentId);
    if (!item) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Equipment not found in your inventory" });
      return;
    }
    if (item["isListedInMarket"] === true) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Equipment already listed" });
      return;
    }
    const category = String(item["category"] || "");
    const rarity = String(item["rarity"] || "");
    const validCat = ["HELMET", "JETPACK", "HAT", "SCANNER"].includes(category);
    const validRar = ["BASIC", "RARE", "EPIC", "GOLD", "PLASMA", "MYTHIC"].includes(rarity);
    if (!validCat || !validRar) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Corrupt equipment record" });
      return;
    }
    const { EQUIPMENT_RATE_SERVER } = await import("./equipment");
    const canonicalRate = (EQUIPMENT_RATE_SERVER as Record<string, Record<string, number>>)[category]![rarity]!;

    let listing;
    try {
      const [inserted] = await txDb
        .insert(marketListingsTable)
        .values({
          sellerTelegramId,
          sellerName: sellerName ?? null,
          kind: "equipment",
          equipmentId,
          equipmentCategory: category,
          equipmentRarity: rarity,
          equipmentRate: canonicalRate,
          planetType: null,
          planetRate: null,
          planetId: null,
          price,
          status: "active",
        })
        .returning();
      listing = inserted;
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        res.status(409).json({ error: "This equipment was previously listed and cannot be sold again" });
        return;
      }
      throw err;
    }

    const nowMs = Date.now();
    await client.query(
      `UPDATE users
       SET equipment_json = COALESCE(
         (SELECT jsonb_agg(
            CASE WHEN e->>'id' = $2
              THEN e || jsonb_build_object(
                'isListedInMarket', true,
                'serverListingId', $3::int,
                'marketPrice', $4::real,
                'isFarmingActive', false,
                'pausedAt', CASE
                  WHEN (e->>'isFarmingActive')::boolean IS TRUE THEN $5::bigint
                  ELSE COALESCE((e->>'pausedAt')::bigint, 0)
                END
              )
              ELSE e
            END
          )
          FROM jsonb_array_elements(equipment_json) e),
         '[]'::jsonb
       ),
       equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $5::bigint)
       WHERE telegram_id = $1`,
      [sellerTelegramId, equipmentId, listing!.id, price, nowMs],
    );

    await client.query("COMMIT");
    bumpZoomPriceFireAndForget("market_list", sellerTelegramId);
    res.json({ ok: true, listing });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/list-equipment] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

router.get("/market/listings", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(marketListingsTable)
      .where(eq(marketListingsTable.status, "active"))
      .orderBy(desc(marketListingsTable.createdAt))
      .limit(200);

    const listings = rows.map((r) => {
      const planetDisplayName = labModelDisplayName({
        shapeId: r.shapeId,
        displayName: r.planetDisplayName,
      }) ?? r.planetDisplayName;
      return {
        ...r,
        planetDisplayName,
        marketPath: labMarketPathForPlanet({
          shapeId: r.shapeId,
          displayName: planetDisplayName,
          rate: r.planetRate,
        }),
      };
    });
    res.json({ listings });
  } catch (err) {
    console.error("[market/listings] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** Seller's own Lab listings (including expired shelf) for the Market widget. */
router.get("/market/my-listings/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(marketListingsTable)
      .where(and(
        eq(marketListingsTable.sellerTelegramId, telegramId),
        eq(marketListingsTable.status, "active"),
      ))
      .orderBy(desc(marketListingsTable.createdAt))
      .limit(100);
    const now = Date.now();
    res.json({
      listings: rows.map((r) => {
        const expiresAt = listingShelfDeadline(r);
        const planetDisplayName = labModelDisplayName({
          shapeId: r.shapeId,
          displayName: r.planetDisplayName,
        }) ?? r.planetDisplayName;
        return {
          ...r,
          planetDisplayName,
          expiresAt,
          expired: false,
          remainingMs: expiresAt > 0 ? Math.max(0, expiresAt - now) : 0,
          marketPath: labMarketPathForPlanet({
            shapeId: r.shapeId,
            displayName: planetDisplayName,
            rate: r.planetRate,
          }),
        };
      }),
    });
  } catch (err) {
    console.error("[market/my-listings] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const ReactivateBody = z.object({
  sellerTelegramId: z.string().min(1),
  listingId: z.number().int().positive(),
});

/** Reset the 1h shop shelf clock so the listing shows again. */
router.post("/market/reactivate", async (req, res) => {
  const parsed = ReactivateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { sellerTelegramId, listingId } = parsed.data;
  try {
    const [row] = await db
      .select()
      .from(marketListingsTable)
      .where(and(
        eq(marketListingsTable.id, listingId),
        eq(marketListingsTable.sellerTelegramId, sellerTelegramId),
        eq(marketListingsTable.status, "active"),
      ))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const feeZoom = Math.max(1, Math.ceil(Number(row.planetRate ?? 1)));
    const [seller] = await db
      .select({ zoom: usersTable.zoomBalance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, sellerTelegramId))
      .limit(1);
    if ((Number(seller?.zoom ?? 0)) < feeZoom) {
      res.status(409).json({ error: `Need ${feeZoom} $ZOOM to reactivate` });
      return;
    }
    await db
      .update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} - ${feeZoom}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, sellerTelegramId));
    const now = new Date();
    const [updated] = await db
      .update(marketListingsTable)
      .set({ lastActivatedAt: now })
      .where(eq(marketListingsTable.id, listingId))
      .returning();
    const expiresAt = listingShelfDeadline(updated ?? { lastActivatedAt: now, createdAt: now });
    recordHistoryAsync({
      telegramId: sellerTelegramId,
      kind: "market_reactivate",
      delta: -feeZoom,
      currency: "zoom",
      meta: { listingId, feeZoom },
    });
    res.json({
      ok: true,
      listing: updated,
      expiresAt,
      remainingMs: Math.max(0, expiresAt - Date.now()),
      feeZoom,
    });
  } catch (err) {
    console.error("[market/reactivate] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const BuyBody = z.object({
  buyerTelegramId: z.string().min(1),
  listingId: z.number().int().positive(),
});

router.post("/market/buy", async (req, res) => {
  const parsed = BuyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { buyerTelegramId, listingId } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const [listing] = await txDb
      .select()
      .from(marketListingsTable)
      .where(and(eq(marketListingsTable.id, listingId), eq(marketListingsTable.status, "active")))
      .limit(1);

    if (!listing) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Listing not found or already sold" });
      return;
    }

    if (listing.sellerTelegramId === buyerTelegramId) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Cannot buy your own listing" });
      return;
    }

    // ── Anti-abuse: block buy/sell between users in the same referral
    // ancestry. The "Nebo MVP" exploit (May 2026) used 17 alts created
    // via the host's referral link to launder ZOOM into the host account
    // by spamming purchases from the host's listings. The check walks
    // both ancestry chains (up to 8 hops to guard against cycles / deep
    // trees) and rejects if either user appears in the other's chain —
    // this also catches sibling-in-same-tree and 2+ hop laundering, not
    // just direct parent/child.
    //
    // We acquire row locks on both user rows BEFORE reading the
    // is_disabled flag so a concurrent /admin/disable-user can't commit
    // between our read and the debit/credit below. The monetary UPDATEs
    // further fence on `is_disabled = false` so even if a freeze races
    // past the lock acquisition, the debit fails and the tx rolls back.
    //
    // Lock order: lower telegramId first, to remove any deadlock risk
    // between two concurrent /market/buy that touch the same pair of
    // users in opposite roles.
    const [aId, bId] = buyerTelegramId < listing.sellerTelegramId
      ? [buyerTelegramId, listing.sellerTelegramId]
      : [listing.sellerTelegramId, buyerTelegramId];
    await client.query(
      `SELECT telegram_id FROM users WHERE telegram_id IN ($1, $2) ORDER BY telegram_id FOR UPDATE`,
      [aId, bId],
    );

    const [buyerInfo, sellerInfo] = await Promise.all([
      txDb.select({
        referredBy: usersTable.referredBy,
        isDisabled: usersTable.isDisabled,
      }).from(usersTable).where(eq(usersTable.telegramId, buyerTelegramId)).limit(1),
      txDb.select({
        referredBy: usersTable.referredBy,
        isDisabled: usersTable.isDisabled,
      }).from(usersTable).where(eq(usersTable.telegramId, listing.sellerTelegramId)).limit(1),
    ]);
    const buyer = buyerInfo[0];
    const seller = sellerInfo[0];
    if (!buyer) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Buyer not found" });
      return;
    }
    if (buyer.isDisabled || seller?.isDisabled) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Account disabled" });
      return;
    }

    // Anti-fraud: block trades only between direct referrer and direct
    // referee (1 level). Wider chain bans were too restrictive for
    // legitimate players. Multi-account self-dealing on the direct edge
    // is still prevented; broader network trades are allowed.
    const chainCheck = await client.query<{ blocked: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM users
         WHERE (telegram_id = $1 AND referred_by = $2)
            OR (telegram_id = $2 AND referred_by = $1)
       ) AS blocked`,
      [buyerTelegramId, listing.sellerTelegramId],
    );
    if (chainCheck.rows[0]?.blocked) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Cannot trade with your direct inviter or invitee" });
      return;
    }

    const payCurRow = await client.query<{ price_currency: string | null }>(
      `SELECT price_currency FROM market_listings WHERE id = $1`,
      [listingId],
    );
    const payCurrency: MarketPriceCurrency = parseMarketPriceCurrency(payCurRow.rows[0]?.price_currency);
    const priceAmt = Number(listing.price);
    const totalDebit = payCurrency === "stardust"
      ? Math.round(priceAmt)
      : +priceAmt.toFixed(6);
    const adminShare = payCurrency === "stardust"
      ? Math.max(0, Math.round(totalDebit * 0.1))
      : +(totalDebit * 0.1).toFixed(6);
    const sellerShare = +(totalDebit - adminShare).toFixed(payCurrency === "stardust" ? 0 : 6);

    const updated = await txDb.update(marketListingsTable)
      .set({ status: "sold", buyerTelegramId, soldAt: new Date() })
      .where(and(eq(marketListingsTable.id, listingId), eq(marketListingsTable.status, "active")))
      .returning();

    if (updated.length === 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Listing already sold" });
      return;
    }

    let debited: { id: string }[] = [];
    if (payCurrency === "gram") {
      // Full price from combined GRAM (deposit first, then earned). No 50/50 split.
      debited = await txDb.update(usersTable)
        .set({
          depositBalance: sql`${usersTable.depositBalance} - LEAST(COALESCE(${usersTable.depositBalance}, 0), ${totalDebit})`,
          tonBalance: sql`${usersTable.tonBalance} - GREATEST(0, ${totalDebit} - LEAST(COALESCE(${usersTable.depositBalance}, 0), ${totalDebit}))`,
        })
        .where(and(
          eq(usersTable.telegramId, buyerTelegramId),
          sql`COALESCE(${usersTable.depositBalance}, 0) + COALESCE(${usersTable.tonBalance}, 0) >= ${totalDebit}`,
          sql`${usersTable.isDisabled} = false`,
        ))
        .returning({ id: usersTable.telegramId });
    } else if (payCurrency === "zoom") {
      debited = await txDb.update(usersTable)
        .set({
          zoomBalance: sql`${usersTable.zoomBalance} - ${totalDebit}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(and(
          eq(usersTable.telegramId, buyerTelegramId),
          sql`${usersTable.zoomBalance} >= ${totalDebit}`,
          sql`${usersTable.isDisabled} = false`,
        ))
        .returning({ id: usersTable.telegramId });
    } else {
      debited = await txDb.update(usersTable)
        .set({
          stardustBalance: sql`${usersTable.stardustBalance} - ${totalDebit}`,
        })
        .where(and(
          eq(usersTable.telegramId, buyerTelegramId),
          sql`${usersTable.stardustBalance} >= ${totalDebit}`,
          sql`${usersTable.isDisabled} = false`,
        ))
        .returning({ id: usersTable.telegramId });
    }

    if (debited.length === 0) {
      await client.query("ROLLBACK");
      const need =
        payCurrency === "gram" ? "Not enough GRAM"
          : payCurrency === "zoom" ? "Not enough $ZOOM"
            : "Not enough ★ Stardust";
      res.status(400).json({ error: need });
      return;
    }

    const sellerSet =
      payCurrency === "gram"
        ? { tonBalance: sql`${usersTable.tonBalance} + ${sellerShare}` }
        : payCurrency === "zoom"
          ? { zoomBalance: sql`${usersTable.zoomBalance} + ${sellerShare}`, balanceEpoch: sql`${usersTable.balanceEpoch} + 1` }
          : { stardustBalance: sql`${usersTable.stardustBalance} + ${sellerShare}` };
    const credited = await txDb.update(usersTable)
      .set(sellerSet)
      .where(and(
        eq(usersTable.telegramId, listing.sellerTelegramId),
        sql`${usersTable.isDisabled} = false`,
      ))
      .returning({ id: usersTable.telegramId });
    if (credited.length === 0) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Seller account disabled" });
      return;
    }

    const ADMIN_ID = "8144744644";
    const adminCol =
      payCurrency === "zoom" ? "zoom_balance"
        : payCurrency === "stardust" ? "stardust_balance"
          : "ton_balance";
    await client.query(
      `UPDATE users SET ${adminCol} = ${adminCol} + $1 WHERE telegram_id = $2 AND is_disabled = false`,
      [adminShare, ADMIN_ID],
    );

    // Surgically remove the sold planet from the seller's planets_json
    // so their UI no longer shows it on the next refresh. Best-effort
    // cleanup — the listing row (status='sold' with planet_id set) is
    // already the authoritative record, and the unique partial index
    // on (seller_telegram_id, planet_id) prevents the seller from ever
    // re-listing this planet even if a stale client save resurrects it
    // in the JSON blob. Skip for legacy listings that pre-date the
    // planet_id column (planetId === null) since there's no anchor.
    const isEquipmentListing = listing.kind === "equipment";
    const isItemListing = listing.kind === "item";
    // Identify the new buyer-side item id BEFORE the transaction commits
    // so we can echo it back in the response. The buyer's equipment_json
    // gets a fresh row appended; the seller's matching row is removed.
    let buyerEquipmentId: string | null = null;
    if (isItemListing && listing.equipmentId) {
      // Collectible item: mirror from seller's items_json → buyer's items_json
      const nowMs = Date.now();
      await client.query(
        `UPDATE users
         SET items_json = COALESCE(
           (SELECT jsonb_agg(e) FROM jsonb_array_elements(items_json) e WHERE e->>'id' != $2),
           '[]'::jsonb
         ),
         items_updated_at_ms = GREATEST(items_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [listing.sellerTelegramId, listing.equipmentId, nowMs],
      );
      buyerEquipmentId = `item-mkt-${listing.id}-${nowMs}`;
      const newItem = {
        id: buyerEquipmentId,
        type: listing.equipmentCategory,
        rarity: listing.equipmentRarity,
        rate: listing.equipmentRate,
        createdAt: nowMs,
        isListedInMarket: false,
      };
      await client.query(
        `UPDATE users
         SET items_json = COALESCE(items_json, '[]'::jsonb) || $2::jsonb,
             items_updated_at_ms = GREATEST(items_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [buyerTelegramId, JSON.stringify([newItem]), nowMs],
      );
    } else if (isEquipmentListing && listing.equipmentId) {
      const nowMs = Date.now();
      // Remove from seller's equipment_json.
      await client.query(
        `UPDATE users
         SET equipment_json = COALESCE(
           (SELECT jsonb_agg(e) FROM jsonb_array_elements(equipment_json) e WHERE e->>'id' != $2),
           '[]'::jsonb
         ),
         equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [listing.sellerTelegramId, listing.equipmentId, nowMs],
      );
      // Append fresh item to buyer's equipment_json. New id is derived
      // from the listing id so it's stable & unique across re-syncs.
      buyerEquipmentId = `mkt-${listing.id}-${nowMs}`;
      const newItem = {
        id: buyerEquipmentId,
        category: listing.equipmentCategory,
        rarity: listing.equipmentRarity,
        rate: listing.equipmentRate,
        createdAt: nowMs,
        // Cycle is INACTIVE on mint — buyer must press Reactivate to
        // start the 24h farming window, same as planet purchases.
        isFarmingActive: false,
        farmStartedAt: 0,
        lastCollectedAt: 0,
        pausedAt: 0,
        isListedInMarket: false,
      };
      await client.query(
        `UPDATE users
         SET equipment_json = COALESCE(equipment_json, '[]'::jsonb) || $2::jsonb,
             equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [buyerTelegramId, JSON.stringify([newItem]), nowMs],
      );
    } else if (listing.planetId) {
      const nowMs = Date.now();
      const planetTypeUpper = String(listing.planetType ?? "").toUpperCase();
      const obtainedCol =
        planetTypeUpper === "BASIC" ? "total_obtained_basic"
        : planetTypeUpper === "RARE" ? "total_obtained_rare"
        : planetTypeUpper === "EPIC" ? "total_obtained_epic"
        : planetTypeUpper === "MYTHIC" ? "total_obtained_mythic"
        : planetTypeUpper === "PLASMA" ? "total_obtained_plasma"
        : planetTypeUpper === "GOLD" ? "total_obtained_gold"
        : planetTypeUpper === "V1" ? "total_obtained_v1"
        : null;

      await client.query(
        `UPDATE users
         SET planets_json = COALESCE(
           (SELECT jsonb_agg(p) FROM jsonb_array_elements(planets_json) p WHERE p->>'id' != $2),
           '[]'::jsonb
         ),
         planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [listing.sellerTelegramId, listing.planetId, nowMs],
      );

      const buyerPlanet = {
        id: `bought-${listing.id}-${nowMs}`,
        name: listing.planetType || "BASIC",
        rate: Number(listing.planetRate ?? 0),
        color: "#7bed9f",
        glowColor: "#2ed573",
        createdAt: nowMs,
        farmStartedAt: 0,
        lastCollectedAt: 0,
        isListedInMarket: false,
        isFarmingActive: false,
        marketPrice: null,
        craftCost: Number(listing.price ?? 0),
        shapeId: listing.shapeId ?? null,
        displayName: listing.planetDisplayName ?? null,
        modelId: listing.modelId ?? null,
        modelName: listing.planetDisplayName ?? null,
        float: typeof listing.planetFloat === "number" ? listing.planetFloat : 0.5,
        durability: 100,
        durabilityUpdatedAt: nowMs,
        farmDurationHours: listing.planetFarmDurationHours ?? 1,
      };
      await client.query(
        `UPDATE users
         SET planets_json = COALESCE(planets_json, '[]'::jsonb) || $2::jsonb,
             planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [buyerTelegramId, JSON.stringify([buyerPlanet]), nowMs],
      );

      // Buyer: also increment lifetime obtained counter for the planet type.
      if (obtainedCol) {
        await client.query(
          `UPDATE users SET ${obtainedCol} = ${obtainedCol} + 1 WHERE telegram_id = $1`,
          [buyerTelegramId],
        );
      }
    }

    await client.query("COMMIT");

    try {
      const [sellerInfo] = await db.select({ name: usersTable.firstName }).from(usersTable).where(eq(usersTable.telegramId, listing.sellerTelegramId)).limit(1);
      const [buyerInfo] = await db.select({ name: usersTable.firstName }).from(usersTable).where(eq(usersTable.telegramId, buyerTelegramId)).limit(1);
      broadcastSale({
        id: listing.id,
        kind: isItemListing ? "item" : isEquipmentListing ? "equipment" : "planet",
        planetType: listing.planetType,
        planetRate: listing.planetRate,
        equipmentCategory: listing.equipmentCategory,
        equipmentRarity: listing.equipmentRarity,
        equipmentRate: listing.equipmentRate,
        price: listing.price,
        sellerName: sellerInfo?.name || listing.sellerName || "Anon",
        buyerName: buyerInfo?.name || "Anon",
        soldAt: Date.now(),
        // Carry the listing's snapshotted Float so the live-activity
        // feed shows the SAME perfection score the buyer paid for.
        planetFloat: typeof listing.planetFloat === "number" ? listing.planetFloat : null,
      });
    } catch (e) { console.error("[market/buy] broadcast failed:", e); }

    // Fire-and-forget: notify the seller that their listing was bought.
    // We don't await so a slow Telegram call doesn't delay the response,
    // and the helper itself is failure-tolerant (returns false on 403/etc).
    sendBotMessage(
      listing.sellerTelegramId,
      "💰 Great news! One of your planets has been sold! Check your balance.",
    ).catch((e) => console.error("[market/buy] seller notify failed:", e));

    // Bump the global $ZOOM price index — buys move the price more than
    // listings (real demand-side signal). Fire-and-forget. Cooldown keyed
    // on the buyer so a wash-trader running scripted buys still only
    // contributes one bump per cooldown window.
    bumpZoomPriceFireAndForget("market_buy", buyerTelegramId);

    // Cronologia personale per entrambe le parti — fire-and-forget.
    // Ora la valuta è TON (non ZOOM).
    recordHistoryAsync({
      telegramId: buyerTelegramId,
      kind: "market_buy",
      delta: -(listing.price as number),
      currency: "ton",
      meta: {
        listingId: listing.id,
        planetType: listing.planetType,
        price: listing.price,
      },
    });
    recordHistoryAsync({
      telegramId: listing.sellerTelegramId,
      kind: "market_sale",
      delta: sellerShare,
      currency: "ton",
      meta: {
        listingId: listing.id,
        planetType: listing.planetType,
        price: listing.price,
        sellerShare,
        adminShare,
      },
    });

    // Echo the listing's snapshotted Float so the buyer's client can
    // mint the new planet with EXACTLY the perfection score they saw on
    // the marketplace card. Falls back to the deterministic-from-id
    // value (matches the client display fallback in
    // utils/planetFloat.ts → getListingDisplayFloat) so legacy listings
    // without a stored snapshot still produce a stable, predictable
    // float on the buyer side instead of a fresh random.
    const buyerFloat = !isEquipmentListing && listing.planetType
      ? (typeof listing.planetFloat === "number"
          ? listing.planetFloat
          : (FLOAT_PLANET_TYPES.has(String(listing.planetType).toUpperCase())
              ? deterministicFloatFromId(`listing-${listing.id}`)
              : null))
      : null;
    res.json({
      ok: true,
      kind: isItemListing ? "item" : isEquipmentListing ? "equipment" : "planet",
      planetType: listing.planetType,
      planetRate: listing.planetRate,
      equipmentId: buyerEquipmentId,
      equipmentCategory: listing.equipmentCategory,
      equipmentRarity: listing.equipmentRarity,
      equipmentRate: listing.equipmentRate,
      pricePaid: listing.price,
      sellerReceived: sellerShare,
      planetFloat: buyerFloat,
      modelId: listing.modelId ?? null,
      shapeId: listing.shapeId ?? null,
      modelName: listing.planetDisplayName ?? null,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/buy] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

const DelistBody = z.object({
  sellerTelegramId: z.string().min(1),
  listingId: z.number().int().positive().optional(),
  planetId: z.string().min(1).optional(),
}).refine((d) => d.listingId != null || !!d.planetId, { message: "listingId or planetId required" });

router.post("/market/delist", async (req, res) => {
  const parsed = DelistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { sellerTelegramId, listingId, planetId } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    let targetId = listingId ?? null;
    if (targetId == null && planetId) {
      const [found] = await txDb
        .select({ id: marketListingsTable.id })
        .from(marketListingsTable)
        .where(and(
          eq(marketListingsTable.sellerTelegramId, sellerTelegramId),
          eq(marketListingsTable.planetId, planetId),
          eq(marketListingsTable.status, "active"),
        ))
        .limit(1);
      targetId = found?.id ?? null;
    }
    if (targetId == null) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const result = await txDb.update(marketListingsTable)
      .set({ status: "delisted" })
      .where(
        and(
          eq(marketListingsTable.id, targetId),
          eq(marketListingsTable.sellerTelegramId, sellerTelegramId),
          eq(marketListingsTable.status, "active"),
        )
      )
      .returning();

    if (result.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    // Sync planets_json: clear isListedInMarket + serverListingId +
    // marketPrice on the matching planet so the seller's UI shows it
    // back in the inventory on next refresh. Same best-effort caveat
    // as in /market/list. Skipped for legacy listings (planetId null).
    const delisted = result[0]!;
    if (delisted.kind === "item" && delisted.equipmentId) {
      const nowMs = Date.now();
      await client.query(
        `UPDATE users
         SET items_json = COALESCE(
           (SELECT jsonb_agg(
              CASE WHEN e->>'id' = $2
                THEN (e - 'serverListingId' - 'marketPrice') || jsonb_build_object('isListedInMarket', false)
                ELSE e
              END
            )
            FROM jsonb_array_elements(items_json) e),
           '[]'::jsonb
         ),
         items_updated_at_ms = GREATEST(items_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [sellerTelegramId, delisted.equipmentId, nowMs],
      );
    } else if (delisted.kind === "equipment" && delisted.equipmentId) {
      const nowMs = Date.now();
      await client.query(
        `UPDATE users
         SET equipment_json = COALESCE(
           (SELECT jsonb_agg(
              CASE WHEN e->>'id' = $2
                THEN (e - 'serverListingId' - 'marketPrice') || jsonb_build_object('isListedInMarket', false)
                ELSE e
              END
            )
            FROM jsonb_array_elements(equipment_json) e),
           '[]'::jsonb
         ),
         equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [sellerTelegramId, delisted.equipmentId, nowMs],
      );
    } else if (delisted.planetId) {
      const nowMs = Date.now();
      await client.query(
        `UPDATE users
         SET planets_json = COALESCE(
           (SELECT jsonb_agg(
              CASE WHEN p->>'id' = $2
                THEN (p - 'serverListingId' - 'marketPrice') || jsonb_build_object('isListedInMarket', false)
                ELSE p
              END
            )
            FROM jsonb_array_elements(planets_json) p),
           '[]'::jsonb
         ),
         planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [sellerTelegramId, delisted.planetId, nowMs],
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/delist] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Planet sharing — POST /market/share
//
// Lets a player broadcast an active listing to the community group. The bot
// posts a looping rotating-planet animation (one mp4 per visual family, served
// from the web artifact's /planets/ dir) with the planet stats as a caption and
// an inline button carrying a deep link that reopens the Mini App focused on the
// listing (start_param `mkt_<listingId>`).
// ---------------------------------------------------------------------------

// Telegram start_param accepts only A-Za-z0-9_- (max 64). `mkt_<id>` is safe.
const BOT_USERNAME = (process.env["BOT_USERNAME"] || "ZoomVerse_bot").replace(/^@/, "");

// Public HTTPS base where the web artifact (and its /planets/*.mp4 assets) is
// reachable by Telegram's servers. In deployments REPLIT_DOMAINS holds the
// public domain(s); overridable via env.
function publicAssetBaseUrl(): string | null {
  const explicit = process.env["PUBLIC_ASSET_BASE_URL"];
  if (explicit) return explicit.replace(/\/+$/, "");
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return null;
}

// Map every concrete planet type to one of the 12 generated family videos.
function planetVideoFamily(planetType: string): string {
  const t = planetType.toUpperCase();
  if (t.startsWith("WHITE")) return "WHITE";
  if (t.startsWith("EARTH")) return "EARTH";
  if (t.startsWith("BLACK")) return "BLACK";
  if (t.startsWith("SUPERNOVA")) return "SUPERNOVA";
  const core = new Set(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1", "V1_NFT"]);
  if (core.has(t)) return t;
  return "BASIC";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// In-memory per-user cooldown to keep the group from being spammed. Resets on
// server restart — adequate for an anti-flood guard (not a security boundary).
const SHARE_COOLDOWN_MS = 20_000;
const lastShareAtByUser = new Map<string, number>();

const ShareBody = z.object({
  telegramId: z.string().min(1),
  listingId: z.number().int().positive(),
});

router.post("/market/share", async (req, res) => {
  const parsed = ShareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { listingId } = parsed.data;

  // Key the cooldown off the cryptographically verified Telegram id, never the
  // public body `telegramId` (which an attacker could spoof). Fall back to the
  // body id only in soft/dev mode where req.tgUser may be absent.
  const cooldownKey = req.tgUser?.id ? String(req.tgUser.id) : parsed.data.telegramId;

  // Reserve the cooldown slot atomically BEFORE the first await so two
  // near-simultaneous requests can't both pass the check and double-post.
  const now = Date.now();
  const last = lastShareAtByUser.get(cooldownKey) || 0;
  if (now - last < SHARE_COOLDOWN_MS) {
    res.status(429).json({ error: "Too many shares, slow down" });
    return;
  }
  lastShareAtByUser.set(cooldownKey, now);

  const [listing] = await db
    .select()
    .from(marketListingsTable)
    .where(and(eq(marketListingsTable.id, listingId), eq(marketListingsTable.status, "active")))
    .limit(1);

  // Accept planet listings; legacy rows may have a null `kind` but a valid
  // planetType, so only reject explicit equipment listings.
  if (!listing || listing.kind === "equipment" || !listing.planetType) {
    lastShareAtByUser.delete(cooldownKey);
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const base = publicAssetBaseUrl();
  if (!base) {
    lastShareAtByUser.delete(cooldownKey);
    req.log.warn("[market/share] no public base url — cannot build animation url");
    res.status(503).json({ error: "Sharing unavailable" });
    return;
  }

  // Fetch seller's display name for the caption (non-critical — skip silently on failure).
  let sellerDisplay: string | null = null;
  try {
    const [sellerInfo] = await db
      .select({ username: usersTable.username, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.telegramId, listing.sellerTelegramId))
      .limit(1);
    sellerDisplay = sellerInfo?.username
      ? `@${sellerInfo.username}`
      : (sellerInfo?.firstName || null);
  } catch { /**/ }

  const family = planetVideoFamily(listing.planetType);
  const animationUrl = `${base}/planets/${family}.mp4`;
  const deepLink = `https://t.me/${BOT_USERNAME}?startapp=mkt_${listing.id}`;

  const displayName = listing.planetDisplayName || `${listing.planetType} Planet`;
  const rate = listing.planetRate != null ? Number(listing.planetRate) : null;
  const floatVal = typeof listing.planetFloat === "number" ? listing.planetFloat : null;

  const lines: string[] = [];
  lines.push(`🪐 <b>${escapeHtml(displayName)}</b>`);
  lines.push(`✨ Rarità: <b>${escapeHtml(listing.planetType)}</b>`);
  if (rate != null) lines.push(`⚡ +${rate.toLocaleString("en-US")} $ZOOM/hr`);
  if (floatVal != null) lines.push(`🎚 Float: <b>${floatVal.toFixed(4)}</b>`);
  lines.push(`💎 Prezzo: <b>${Number(listing.price).toLocaleString("en-US")} TON</b>`);
  if (sellerDisplay) lines.push(`👤 Venditore: <b>${escapeHtml(sellerDisplay)}</b>`);
  lines.push("");
  lines.push("👇 Aprilo nel Mercato per acquistarlo");
  const caption = lines.join("\n");

  const sent = await sendMarketShareToGroup({
    animationUrl,
    caption,
    buttonText: "🛒 Apri nel Mercato",
    buttonUrl: deepLink,
  });

  if (!sent) {
    // Roll back the reserved cooldown slot so the user can retry immediately.
    lastShareAtByUser.delete(cooldownKey);
    res.status(502).json({ error: "Could not post to group" });
    return;
  }

  res.json({ ok: true, deepLink });
});

export default router;
