import { Router, type IRouter } from "express";
import { db, pool, usersTable, marketListingsTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { addClient, removeClient, broadcastSale } from "../lib/activityBus";

const router: IRouter = Router();

router.get("/market/sales", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT m.id, m.planet_type, m.planet_rate, m.price, m.sold_at,
             COALESCE(s.first_name, m.seller_name, 'Anon') AS seller_name,
             COALESCE(b.first_name, 'Anon') AS buyer_name
      FROM market_listings m
      LEFT JOIN users s ON s.telegram_id = m.seller_telegram_id
      LEFT JOIN users b ON b.telegram_id = m.buyer_telegram_id
      WHERE m.status = 'sold' AND m.sold_at IS NOT NULL
      ORDER BY m.sold_at DESC
      LIMIT 20
    `);
    const sales = rows.rows.map((r: any) => ({
      id: Number(r.id),
      planetType: String(r.planet_type),
      planetRate: Number(r.planet_rate),
      price: Number(r.price),
      sellerName: String(r.seller_name),
      buyerName: String(r.buyer_name),
      soldAt: r.sold_at instanceof Date ? r.sold_at.getTime() : new Date(r.sold_at).getTime(),
    }));
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
  planetType: z.enum(["BASIC", "RARE", "EPIC", "GOLD"]),
  planetRate: z.number().int().positive(),
  price: z.number().int().positive(),
});

router.post("/market/list", async (req, res) => {
  const parsed = ListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { sellerTelegramId, sellerName, planetType, planetRate, price } = parsed.data;

  try {
    const [listing] = await db
      .insert(marketListingsTable)
      .values({
        sellerTelegramId,
        sellerName: sellerName ?? null,
        planetType,
        planetRate,
        price,
        status: "active",
      })
      .returning();

    res.json({ ok: true, listing });
  } catch (err) {
    console.error("[market/list] error:", err);
    res.status(500).json({ error: "Database error" });
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

    const [buyer] = await txDb
      .select({ zoomBalance: usersTable.zoomBalance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, buyerTelegramId))
      .limit(1);

    if (!buyer || buyer.zoomBalance < totalCost) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    await txDb.update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} - ${totalCost}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, buyerTelegramId));

    await txDb.update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} + ${listing.price}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, listing.sellerTelegramId));

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
      });
    } catch (e) { console.error("[market/buy] broadcast failed:", e); }

    res.json({
      ok: true,
      planetType: listing.planetType,
      planetRate: listing.planetRate,
      pricePaid: totalCost,
      sellerReceived: listing.price,
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

  try {
    const result = await db.update(marketListingsTable)
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
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[market/delist] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
