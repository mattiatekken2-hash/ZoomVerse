import { Router, type IRouter } from "express";
import { db, pool, usersTable, marketListingsTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

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
      .set({ zoomBalance: sql`${usersTable.zoomBalance} - ${totalCost}` })
      .where(eq(usersTable.telegramId, buyerTelegramId));

    await txDb.update(usersTable)
      .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${listing.price}` })
      .where(eq(usersTable.telegramId, listing.sellerTelegramId));

    await client.query("COMMIT");

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
