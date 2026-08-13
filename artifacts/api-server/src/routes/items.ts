/**
 * /items — collectible items system.
 *
 * Items are always-on passive ZOOM earners (no 24h farm cycle).
 * They live in `users.items_json` (jsonb array) and are crafted
 * via the Lab by spending stardust. Items can also be listed /
 * bought on the marketplace (kind = "item", reusing the equipment_*
 * snapshot columns).
 */
import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { usersTable, marketListingsTable } from "@workspace/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─── Server-canonical item config ─────────────────────────────────
// SECURITY: rate is ALWAYS overwritten server-side before persistence.
// Clients cannot forge a higher rate by tampering with the payload.

const VALID_ITEM_TYPES = [
  "SANDWICH", "PIZZA",
  "SKATEBOARD", "PLUNGER",
  "DVD", "GAMEBOY",
  "GUITAR", "ARTIFACT", "ROBOT",
  "CRYSTAL", "TROPHY", "BOOK",
  "PRISM_SHARD", "VOID_RELIC",
] as const;
type ItemType = typeof VALID_ITEM_TYPES[number];

interface ItemCfg {
  rate: number;
  rarity: string;
  craftCost: number;
  chance: number;
  emoji: string;
  color: string;
  glowColor: string;
  label: string;
  meshShape: string;
}

const ITEM_CFG: Record<ItemType, ItemCfg> = {
  SANDWICH:   { rate: 1,   rarity: "BASIC",  craftCost: 5,  chance: 0.35,   emoji: "", color: "#888888", glowColor: "rgba(136,136,136,0.55)",  label: "Cosmic Sandwich",  meshShape: "box" },
  PIZZA:      { rate: 1.5, rarity: "BASIC",  craftCost: 5,  chance: 0.30,   emoji: "", color: "#999999", glowColor: "rgba(153,153,153,0.55)",  label: "Space Pizza",      meshShape: "cylinder" },
  SKATEBOARD: { rate: 10,  rarity: "RARE",   craftCost: 10, chance: 0.15,   emoji: "", color: "#aaaaaa", glowColor: "rgba(170,170,170,0.6)",   label: "Gravity Board",    meshShape: "board" },
  PLUNGER:    { rate: 8,   rarity: "RARE",   craftCost: 10, chance: 0.10,   emoji: "", color: "#bbbbbb", glowColor: "rgba(187,187,187,0.6)",   label: "Void Tool",        meshShape: "cone" },
  DVD:        { rate: 45,  rarity: "EPIC",   craftCost: 20, chance: 0.05,   emoji: "", color: "#cccccc", glowColor: "rgba(204,204,204,0.65)", label: "Quantum Disc",     meshShape: "disc" },
  GAMEBOY:    { rate: 55,  rarity: "EPIC",   craftCost: 20, chance: 0.035,  emoji: "", color: "#dddddd", glowColor: "rgba(221,221,221,0.65)", label: "Retro Console",    meshShape: "box" },
  GUITAR:     { rate: 90,  rarity: "MYTHIC", craftCost: 50, chance: 0.008,  emoji: "", color: "#eeeeee", glowColor: "rgba(238,238,238,0.7)",    label: "Star Guitar",      meshShape: "torus" },
  ARTIFACT:   { rate: 105, rarity: "MYTHIC", craftCost: 50, chance: 0.005,  emoji: "", color: "#f0f0f0", glowColor: "rgba(240,240,240,0.7)",     label: "Ancient Artifact", meshShape: "octahedron" },
  ROBOT:      { rate: 115, rarity: "MYTHIC", craftCost: 50, chance: 0.003,  emoji: "", color: "#f5f5f5", glowColor: "rgba(245,245,245,0.68)",   label: "Proto Robot",      meshShape: "box" },
  CRYSTAL:    { rate: 160, rarity: "GOLD",   craftCost: 80, chance: 0.001,  emoji: "", color: "#ffffff", glowColor: "rgba(255,255,255,0.72)",   label: "Stellar Crystal",  meshShape: "octahedron" },
  TROPHY:     { rate: 175, rarity: "GOLD",   craftCost: 80, chance: 0.0008, emoji: "", color: "#ffffff", glowColor: "rgba(255,255,255,0.72)",   label: "Cosmic Trophy",    meshShape: "cone" },
  BOOK:       { rate: 200, rarity: "GOLD",   craftCost: 80, chance: 0.0002, emoji: "", color: "#ffffff", glowColor: "rgba(255,255,255,0.68)",   label: "Ancient Tome",     meshShape: "box" },
  PRISM_SHARD:{ rate: 130, rarity: "PRISM",  craftCost: 50, chance: 0.006,  emoji: "", color: "#ffffff", glowColor: "rgba(255,255,255,0.8)",    label: "Prism Shard",      meshShape: "octahedron" },
  VOID_RELIC: { rate: 220, rarity: "VOID",   craftCost: 80, chance: 0.0005, emoji: "", color: "#ffffff", glowColor: "rgba(255,255,255,0.85)",   label: "Void Relic",       meshShape: "torus" },
};

// ─── GET /items/:telegramId ───────────────────────────────────────
router.get("/items/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }
  try {
    const rows = await db
      .select({ itemsJson: usersTable.itemsJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    if (!row) { res.json({ ok: true, exists: false, items: [] }); return; }
    res.json({ ok: true, exists: true, items: Array.isArray(row.itemsJson) ? row.itemsJson : [] });
  } catch (err) {
    console.error("[items/get] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /items/save ─────────────────────────────────────────────
// SERVER-AUTHORITATIVE: Only mutable client metadata (isListedInMarket,
// serverListingId, marketPrice) is accepted from the client. All canonical
// fields (type, rarity, rate, emoji, color, glowColor, createdAt, id) come
// from the EXISTING server row; the client CANNOT add new IDs or change
// rates/types. New items can only be created via /items/craft (stardust
// spend) or /market/buy (marketplace purchase).
const MutableItemPatch = z.object({
  id: z.string().min(1).max(128),
  isListedInMarket: z.boolean().optional(),
  serverListingId: z.number().int().positive().optional().nullable(),
  marketPrice: z.number().nonnegative().optional().nullable(),
});

const SaveItemsBody = z.object({
  telegramId: z.string().min(1),
  items: z.array(MutableItemPatch).max(512),
  clientWriteAtMs: z.number().int().min(0),
});

router.post("/items/save", async (req, res) => {
  const parsed = SaveItemsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, patches, clientWriteAtMs } = { ...parsed.data, patches: parsed.data.items };

  try {
    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT items_json, items_updated_at_ms FROM users WHERE telegram_id = ${telegramId} FOR UPDATE`,
      );
      const lockedRow = (lockedRows.rows ?? lockedRows)[0] as
        | { items_json: unknown; items_updated_at_ms: number }
        | undefined;
      if (!lockedRow) return { kind: "not_found" as const };

      const storedMs = Number(lockedRow.items_updated_at_ms ?? 0);
      if (storedMs >= clientWriteAtMs) return { kind: "stale" as const };

      // Server is source of truth. Apply client patches only to matching IDs
      // that already exist server-side — unknown IDs are silently dropped.
      const existing: Record<string, unknown>[] = Array.isArray(lockedRow.items_json)
        ? (lockedRow.items_json as Record<string, unknown>[])
        : [];

      const patchMap = new Map(patches.map((p) => [p.id, p]));
      const merged = existing.map((item) => {
        const patch = patchMap.get(String(item["id"] ?? ""));
        if (!patch) return item;
        // Apply only mutable fields; all canonical fields stay from server row.
        return {
          ...item,
          ...(patch.isListedInMarket !== undefined && { isListedInMarket: patch.isListedInMarket }),
          ...(patch.serverListingId !== undefined && { serverListingId: patch.serverListingId }),
          ...(patch.marketPrice !== undefined && { marketPrice: patch.marketPrice }),
        };
      });

      await tx.update(usersTable).set({
        itemsJson: sql`${JSON.stringify(merged)}::jsonb`,
        itemsUpdatedAtMs: clientWriteAtMs,
      }).where(eq(usersTable.telegramId, telegramId));
      return { kind: "ok" as const };
    });

    if (txResult.kind === "not_found") { res.status(404).json({ error: "User not found" }); return; }
    if (txResult.kind === "stale")     { res.json({ ok: true, stale: true }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[items/save] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /items/craft ────────────────────────────────────────────
// Spend stardust → roll chance → mint item if won.
const CraftItemBody = z.object({
  telegramId: z.string().min(1),
  itemType: z.enum(VALID_ITEM_TYPES as unknown as [ItemType, ...ItemType[]]),
});

router.post("/items/craft", async (req, res) => {
  const parsed = CraftItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, itemType } = parsed.data;
  const cfg = ITEM_CFG[itemType];
  if (!cfg) { res.status(400).json({ error: "Unknown item type" }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const [user] = await txDb
      .select({ stardustBalance: usersTable.stardustBalance, itemsJson: usersTable.itemsJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .for("update")
      .limit(1);

    if (!user) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.stardustBalance < cfg.craftCost) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Not enough stardust. Need ${cfg.craftCost}★` });
      return;
    }

    const won = Math.random() < cfg.chance;
    const nowMs = Date.now();
    const newStardust = user.stardustBalance - cfg.craftCost;
    const existingItems: unknown[] = Array.isArray(user.itemsJson) ? user.itemsJson : [];

    let newItem: Record<string, unknown> | null = null;
    let newItemsJson = existingItems;
    if (won) {
      newItem = {
        id: `item-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
        type: itemType,
        rarity: cfg.rarity,
        rate: cfg.rate,
        emoji: cfg.emoji,
        color: cfg.color,
        glowColor: cfg.glowColor,
        createdAt: nowMs,
        isListedInMarket: false,
      };
      newItemsJson = [...existingItems, newItem];
    }

    await txDb.update(usersTable).set({
      stardustBalance: newStardust,
      itemsJson: sql`${JSON.stringify(newItemsJson)}::jsonb`,
      itemsUpdatedAtMs: nowMs,
    }).where(eq(usersTable.telegramId, telegramId));

    await client.query("COMMIT");
    res.json({
      ok: true,
      won,
      item: newItem,
      newStardustBalance: newStardust,
      message: won
        ? `You forged ${cfg.emoji} ${cfg.label}!`
        : `No ${cfg.label} this time. Try again!`,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[items/craft] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// ─── POST /market/list-item ───────────────────────────────────────
// List a collectible item on the marketplace. Uses the equipment_*
// snapshot columns (kind = "item") so the buy/delist handlers can
// share the same market_listings row without a schema change.
const ListItemBody = z.object({
  sellerTelegramId: z.string().min(1),
  sellerName: z.string().max(128).optional(),
  itemId: z.string().min(1),
  price: z.number().gt(0).max(10),
});

router.post("/market/list-item", async (req, res) => {
  const parsed = ListItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { sellerTelegramId, sellerName, itemId, price } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    // Load and lock seller row
    const [user] = await txDb
      .select({ itemsJson: usersTable.itemsJson, itemsUpdatedAtMs: usersTable.itemsUpdatedAtMs })
      .from(usersTable)
      .where(eq(usersTable.telegramId, sellerTelegramId))
      .for("update")
      .limit(1);

    if (!user) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }

    const items: Record<string, unknown>[] = Array.isArray(user.itemsJson)
      ? (user.itemsJson as Record<string, unknown>[])
      : [];

    const item = items.find((i) => i["id"] === itemId);
    if (!item) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Item not found in inventory" });
      return;
    }
    if (item["isListedInMarket"]) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Item already listed" });
      return;
    }

    const itemType = String(item["type"] ?? "") as ItemType;
    const cfg = ITEM_CFG[itemType];
    if (!cfg) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Unknown item type" });
      return;
    }

    // Insert listing row
    const nowMs = Date.now();
    const [listing] = await txDb.insert(marketListingsTable).values({
      sellerTelegramId,
      sellerName: sellerName ?? null,
      kind: "item",
      price,
      status: "active",
      equipmentId: itemId,
      equipmentCategory: itemType,
      equipmentRarity: String(item["rarity"] ?? cfg.rarity),
      equipmentRate: Math.round(Number(item["rate"] ?? cfg.rate)),
    }).returning();

    if (!listing) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Listing insert failed" });
      return;
    }

    // Mark item as listed in items_json
    const updatedItems = items.map((i) =>
      i["id"] === itemId
        ? { ...i, isListedInMarket: true, serverListingId: listing.id, marketPrice: price }
        : i
    );
    await txDb.update(usersTable).set({
      itemsJson: sql`${JSON.stringify(updatedItems)}::jsonb`,
      itemsUpdatedAtMs: nowMs,
    }).where(eq(usersTable.telegramId, sellerTelegramId));

    await client.query("COMMIT");
    res.json({ ok: true, listing });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[market/list-item] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

export default router;
