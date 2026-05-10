import { Router, type IRouter } from "express";
import { db, pool, usersTable, marketListingsTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { addClient, removeClient, broadcastSale } from "../lib/activityBus";
import { sendBotMessage } from "../lib/notify";
import { bumpZoomPriceFireAndForget } from "../lib/zoomPrice";
import { recordHistoryAsync } from "../lib/history";
import {
  FLOAT_PLANET_TYPES,
  deterministicFloatFromId,
  sanitizeIncomingFloat,
} from "../lib/planetFloat";

const router: IRouter = Router();

router.get("/market/sales", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT m.id, m.planet_type, m.planet_rate, m.price, m.sold_at,
             m.planet_float,
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
        planetType: String(r.planet_type),
        planetRate: Number(r.planet_rate),
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

const MARKETPLACE_FEE = 0.25;

const ListBody = z.object({
  sellerTelegramId: z.string().min(1),
  sellerName: z.string().optional(),
  // Required: anchors the listing to a specific planet in the seller's
  // inventory. Without this we have no way to verify ownership.
  planetId: z.string().min(1).max(128),
  // V1_NFT è incluso: il pianeta NFT esclusivo (20 TON, max 5 globali)
  // è tradabile sul marketplace come secondario. Trasferimento diretto via
  // planets_json: il counter `bonusV1NftPlatinum` non viene toccato (la cap
  // globale di 5 resta intatta perché il SUM non cambia col trade).
  // V1 invece resta soulbound (gate lato client in useGameState.listPlanet).
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "GOLD", "V1_NFT"]),
  planetRate: z.number().int().positive(),
  price: z.number().int().positive(),
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

  const { sellerTelegramId, sellerName, planetId, planetType, planetRate, price } = parsed.data;

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

    const planets = Array.isArray(seller.planetsJson) ? (seller.planetsJson as Array<Record<string, unknown>>) : [];
    const planet = planets.find((p) => p && typeof p === "object" && p["id"] === planetId);
    if (!planet) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Planet not found in your inventory" });
      return;
    }
    if (planet["name"] !== planetType || Number(planet["rate"]) !== planetRate) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Planet type or rate mismatch" });
      return;
    }
    if (planet["isListedInMarket"] === true) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Planet already listed" });
      return;
    }
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
    // "Eos-Prime" instead of the bare rarity. Truncate defensively to
    // the same 64-char bound used elsewhere; null if never renamed.
    const rawDisplayName = (planet as { displayName?: unknown }).displayName;
    const planetDisplayNameSnapshot: string | null =
      typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
        ? rawDisplayName.trim().slice(0, 64)
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
          price,
          status: "active",
        })
        .returning();
      listing = inserted;
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      // Postgres unique_violation. The unique partial index fires when
      // the seller already has an active or sold listing for this exact
      // planetId — i.e. they're trying to double-list or re-list a sold
      // planet. Reject with 409 so the client can show a clear message.
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
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
                'marketPrice', $4::int,
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
      [sellerTelegramId, planetId, listing!.id, price, nowMs],
    );

    await client.query("COMMIT");
    // Bump the global $ZOOM price index — every new listing nudges the
    // public price up. Fire-and-forget; never blocks the response.
    // Cooldown keyed on sellerTelegramId so a single user can't pump the
    // price by repeatedly listing in tight loops.
    bumpZoomPriceFireAndForget("market_list", sellerTelegramId);
    res.json({ ok: true, listing });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/list] error:", err);
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
      .limit(100);

    res.json({ listings: rows });
  } catch (err) {
    console.error("[market/listings] error:", err);
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

    const fee = Math.floor(listing.price * MARKETPLACE_FEE);
    const totalCost = listing.price + fee;

    const updated = await txDb.update(marketListingsTable)
      .set({ status: "sold", buyerTelegramId, soldAt: new Date() })
      .where(and(eq(marketListingsTable.id, listingId), eq(marketListingsTable.status, "active")))
      .returning();

    if (updated.length === 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Listing already sold" });
      return;
    }

    // Atomic, race-safe debit (compare-and-swap in a single statement).
    //
    // The previous SELECT-balance-then-UPDATE pattern allowed two
    // concurrent /market/buy calls from the same buyer to both pass the
    // check and both deduct, driving the balance negative. Because ZOOM
    // converts to TON in the withdrawal flow, a negative-balance buyer
    // who later receives a referral bonus / sale payout would see it
    // silently burned, but a buyer who just kept buying could effectively
    // double-spend across listings — a real-money loss path.
    //
    // The fix: do the debit in one UPDATE with a balance-fence in the
    // WHERE clause, then check `RETURNING` row count. Zero rows means
    // either the user doesn't exist or their balance was below totalCost
    // at the instant of the UPDATE — Postgres guarantees serializability
    // on this row-level write so two concurrent buys cannot both succeed
    // when only one is affordable.
    // Debit fences on BOTH balance >= cost AND is_disabled = false so a
    // freeze that races past the row lock above still aborts the buy.
    const debited = await txDb.update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} - ${totalCost}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(and(
        eq(usersTable.telegramId, buyerTelegramId),
        sql`${usersTable.zoomBalance} >= ${totalCost}`,
        sql`${usersTable.isDisabled} = false`,
      ))
      .returning({ id: usersTable.telegramId });

    if (debited.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Insufficient balance or account disabled" });
      return;
    }

    // Credit also fences on is_disabled = false on the seller side.
    //
    // IMPORTANT: we write to `pending_zoom_credits` (NOT directly to
    // `zoom_balance` + epoch bump). The next /balance/sync from the
    // seller atomically consumes pending_zoom_credits and adds it on top
    // of the post-CASE balance (see leaderboard.ts /balance/sync), which
    // is the race-free way to credit a player who may be actively
    // playing — directly bumping zoom_balance + epoch is silently
    // overwritten by the next sync's ELSE-GREATEST branch when the
    // seller's local balance has grown past the credited value.
    const credited = await txDb.update(usersTable)
      .set({
        pendingZoomCredits: sql`${usersTable.pendingZoomCredits} + ${listing.price}`,
      })
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

    // Surgically remove the sold planet from the seller's planets_json
    // so their UI no longer shows it on the next refresh. Best-effort
    // cleanup — the listing row (status='sold' with planet_id set) is
    // already the authoritative record, and the unique partial index
    // on (seller_telegram_id, planet_id) prevents the seller from ever
    // re-listing this planet even if a stale client save resurrects it
    // in the JSON blob. Skip for legacy listings that pre-date the
    // planet_id column (planetId === null) since there's no anchor.
    if (listing.planetId) {
      const nowMs = Date.now();
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
    }

    await client.query("COMMIT");

    try {
      const [sellerInfo] = await db.select({ name: usersTable.firstName }).from(usersTable).where(eq(usersTable.telegramId, listing.sellerTelegramId)).limit(1);
      const [buyerInfo] = await db.select({ name: usersTable.firstName }).from(usersTable).where(eq(usersTable.telegramId, buyerTelegramId)).limit(1);
      broadcastSale({
        id: listing.id,
        planetType: listing.planetType,
        planetRate: listing.planetRate,
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
    recordHistoryAsync({
      telegramId: buyerTelegramId,
      kind: "market_buy",
      delta: -totalCost,
      currency: "zoom",
      meta: {
        listingId: listing.id,
        planetType: listing.planetType,
        price: listing.price,
        fee,
      },
    });
    recordHistoryAsync({
      telegramId: listing.sellerTelegramId,
      kind: "market_sale",
      delta: listing.price,
      currency: "zoom",
      meta: {
        listingId: listing.id,
        planetType: listing.planetType,
        price: listing.price,
      },
    });

    // Echo the listing's snapshotted Float so the buyer's client can
    // mint the new planet with EXACTLY the perfection score they saw on
    // the marketplace card. Falls back to the deterministic-from-id
    // value (matches the client display fallback in
    // utils/planetFloat.ts → getListingDisplayFloat) so legacy listings
    // without a stored snapshot still produce a stable, predictable
    // float on the buyer side instead of a fresh random.
    const buyerFloat = typeof listing.planetFloat === "number"
      ? listing.planetFloat
      : (FLOAT_PLANET_TYPES.has(String(listing.planetType).toUpperCase())
          ? deterministicFloatFromId(`listing-${listing.id}`)
          : null);
    res.json({
      ok: true,
      planetType: listing.planetType,
      planetRate: listing.planetRate,
      pricePaid: totalCost,
      sellerReceived: listing.price,
      planetFloat: buyerFloat,
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
  listingId: z.number().int().positive(),
});

router.post("/market/delist", async (req, res) => {
  const parsed = DelistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { sellerTelegramId, listingId } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const result = await txDb.update(marketListingsTable)
      .set({ status: "delisted" })
      .where(
        and(
          eq(marketListingsTable.id, listingId),
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
    if (delisted.planetId) {
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

export default router;
