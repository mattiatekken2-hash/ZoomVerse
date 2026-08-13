/**
 * Season 3 unified forge — 1★ crafts a random planet OR item.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  PLANET_POOL_WEIGHT,
  UNIFIED_FORGE_COST,
  rollForgePlanetType,
} from "../lib/season3-forge";
import { recordHistoryAsync } from "../lib/history";

const router: IRouter = Router();

const VALID_ITEM_TYPES = [
  "SANDWICH", "PIZZA", "SKATEBOARD", "PLUNGER", "DVD", "GAMEBOY",
  "GUITAR", "ARTIFACT", "ROBOT", "CRYSTAL", "TROPHY", "BOOK",
  "PRISM_SHARD", "VOID_RELIC",
] as const;
type ItemType = typeof VALID_ITEM_TYPES[number];

interface ItemCfg {
  rate: number;
  rarity: string;
  chance: number;
  emoji: string;
  color: string;
  glowColor: string;
  label: string;
  meshShape: string;
}

const ITEM_CFG: Record<ItemType, ItemCfg> = {
  SANDWICH: { rate: 1, rarity: "BASIC", chance: 0.35, emoji: "", color: "#888", glowColor: "rgba(136,136,136,0.5)", label: "Cosmic Sandwich", meshShape: "box" },
  PIZZA: { rate: 1.5, rarity: "BASIC", chance: 0.30, emoji: "", color: "#999", glowColor: "rgba(153,153,153,0.5)", label: "Space Pizza", meshShape: "cylinder" },
  SKATEBOARD: { rate: 10, rarity: "RARE", chance: 0.15, emoji: "", color: "#aaa", glowColor: "rgba(170,170,170,0.55)", label: "Gravity Board", meshShape: "board" },
  PLUNGER: { rate: 8, rarity: "RARE", chance: 0.10, emoji: "", color: "#bbb", glowColor: "rgba(187,187,187,0.55)", label: "Void Tool", meshShape: "cone" },
  DVD: { rate: 45, rarity: "EPIC", chance: 0.05, emoji: "", color: "#ccc", glowColor: "rgba(204,204,204,0.6)", label: "Quantum Disc", meshShape: "disc" },
  GAMEBOY: { rate: 55, rarity: "EPIC", chance: 0.035, emoji: "", color: "#ddd", glowColor: "rgba(221,221,221,0.6)", label: "Retro Console", meshShape: "box" },
  GUITAR: { rate: 90, rarity: "MYTHIC", chance: 0.008, emoji: "", color: "#eee", glowColor: "rgba(238,238,238,0.65)", label: "Star Guitar", meshShape: "torus" },
  ARTIFACT: { rate: 105, rarity: "MYTHIC", chance: 0.005, emoji: "", color: "#f0f0f0", glowColor: "rgba(240,240,240,0.65)", label: "Ancient Artifact", meshShape: "octahedron" },
  ROBOT: { rate: 115, rarity: "MYTHIC", chance: 0.003, emoji: "", color: "#f5f5f5", glowColor: "rgba(245,245,245,0.68)", label: "Proto Robot", meshShape: "box" },
  CRYSTAL: { rate: 160, rarity: "GOLD", chance: 0.001, emoji: "", color: "#fff", glowColor: "rgba(255,255,255,0.72)", label: "Stellar Crystal", meshShape: "octahedron" },
  TROPHY: { rate: 175, rarity: "GOLD", chance: 0.0008, emoji: "", color: "#fff", glowColor: "rgba(255,255,255,0.72)", label: "Cosmic Trophy", meshShape: "cone" },
  BOOK: { rate: 200, rarity: "GOLD", chance: 0.0002, emoji: "", color: "#fff", glowColor: "rgba(255,255,255,0.68)", label: "Ancient Tome", meshShape: "box" },
  PRISM_SHARD: { rate: 130, rarity: "PRISM", chance: 0.006, emoji: "", color: "#fff", glowColor: "rgba(255,255,255,0.8)", label: "Prism Shard", meshShape: "octahedron" },
  VOID_RELIC: { rate: 220, rarity: "VOID", chance: 0.0005, emoji: "", color: "#fff", glowColor: "rgba(255,255,255,0.85)", label: "Void Relic", meshShape: "torus" },
};

const SEASON3_ITEM_BOOST = 1.75;

function pickRandomItemType(): ItemType {
  const idx = Math.floor(Math.random() * VALID_ITEM_TYPES.length);
  return VALID_ITEM_TYPES[idx] ?? "SANDWICH";
}

const UnifiedForgeBody = z.object({
  telegramId: z.string().min(1),
});

router.post("/forge/unified", async (req, res) => {
  const parsed = UnifiedForgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const [user] = await txDb
      .select({
        stardustBalance: usersTable.stardustBalance,
        itemsJson: usersTable.itemsJson,
        planetsJson: usersTable.planetsJson,
        bonusSlots: usersTable.bonusSlots,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .for("update")
      .limit(1);

    if (!user) {
      await client.query("ROLLBACK");
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }
    if ((user.stardustBalance ?? 0) < UNIFIED_FORGE_COST) {
      await client.query("ROLLBACK");
      res.status(400).json({ ok: false, error: "NOT_ENOUGH_STARDUST", need: UNIFIED_FORGE_COST, have: user.stardustBalance ?? 0 });
      return;
    }

    const newStardust = (user.stardustBalance ?? 0) - UNIFIED_FORGE_COST;
    const nowMs = Date.now();
    const rollPlanet = Math.random() < PLANET_POOL_WEIGHT;

    if (rollPlanet) {
      const planetType = rollForgePlanetType();
      await txDb.update(usersTable).set({
        stardustBalance: newStardust,
      }).where(eq(usersTable.telegramId, telegramId));
      await client.query("COMMIT");
      recordHistoryAsync({
        telegramId,
        kind: "unified_forge",
        delta: -UNIFIED_FORGE_COST,
        currency: "stardust",
        meta: { kind: "planet", planetType },
      });
      res.json({
        ok: true,
        cost: UNIFIED_FORGE_COST,
        resultKind: "planet",
        planetType,
        season: 3,
        newStardustBalance: newStardust,
      });
      return;
    }

    const itemType = pickRandomItemType();
    const cfg = ITEM_CFG[itemType];
    const won = Math.random() < Math.min(0.95, cfg.chance * SEASON3_ITEM_BOOST);
    const existingItems: unknown[] = Array.isArray(user.itemsJson) ? user.itemsJson : [];

    let newItem: Record<string, unknown> | null = null;
    let newItemsJson = existingItems;
    if (won) {
      newItem = {
        id: `item-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
        type: itemType,
        rarity: cfg.rarity,
        rate: cfg.rate,
        emoji: "",
        meshShape: cfg.meshShape,
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
    recordHistoryAsync({
      telegramId,
      kind: "unified_forge",
      delta: -UNIFIED_FORGE_COST,
      currency: "stardust",
      meta: { kind: "item", itemType, won },
    });
    res.json({
      ok: true,
      cost: UNIFIED_FORGE_COST,
      resultKind: won ? "item" : "dust",
      item: newItem,
      itemType,
      label: cfg.label,
      rarity: cfg.rarity,
      rate: cfg.rate,
      meshShape: cfg.meshShape,
      season: 3,
      newStardustBalance: newStardust,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[forge/unified] error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  } finally {
    client.release();
  }
});

export default router;
