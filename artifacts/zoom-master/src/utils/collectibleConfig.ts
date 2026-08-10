// ─────────────────────────────────────────────────────────────────
//  COLLECTIBLE ITEMS CONFIG
//  12 unique items across 5 rarities. Items are always-on passive
//  ZOOM earners — no farming cycle, no reactivation needed.
// ─────────────────────────────────────────────────────────────────

export type ItemType =
  | "SANDWICH"   | "PIZZA"      // BASIC
  | "SKATEBOARD" | "PLUNGER"    // RARE
  | "DVD"        | "GAMEBOY"    // EPIC
  | "GUITAR"     | "ARTIFACT"   | "ROBOT"   // MYTHIC
  | "CRYSTAL"    | "TROPHY"     | "BOOK";   // GOLD

export type ItemRarity = "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "GOLD";

// ─── Runtime item (stored in items_json) ─────────────────────────
export interface CollectibleItem {
  id: string;
  type: ItemType;
  rarity: ItemRarity;
  rate: number;         // ZOOM/h — server-canonical, re-stamped on save
  emoji: string;
  color: string;
  glowColor: string;
  createdAt: number;   // epoch ms
  isListedInMarket: boolean;
  serverListingId?: number;
  marketPrice?: number | null;
}

// ─── Static catalog entry ─────────────────────────────────────────
export interface ItemConfig {
  type: ItemType;
  label: string;
  emoji: string;
  rarity: ItemRarity;
  rate: number;       // ZOOM/h
  chance: number;     // craft success probability (0-1)
  color: string;      // hex accent
  glowColor: string;  // rgba for bokeh
  craftCost: number;  // stardust cost per attempt
}

export const ITEM_CONFIG: Record<ItemType, ItemConfig> = {
  // ─── BASIC ──────────────────────────────────────────────────
  SANDWICH: {
    type: "SANDWICH", label: "Cosmic Sandwich", emoji: "🥪",
    rarity: "BASIC", rate: 1, chance: 0.35,
    color: "#f5c842", glowColor: "rgba(245,200,66,0.55)", craftCost: 5,
  },
  PIZZA: {
    type: "PIZZA", label: "Space Pizza", emoji: "🍕",
    rarity: "BASIC", rate: 1.5, chance: 0.30,
    color: "#e8734a", glowColor: "rgba(232,115,74,0.55)", craftCost: 5,
  },
  // ─── RARE ───────────────────────────────────────────────────
  SKATEBOARD: {
    type: "SKATEBOARD", label: "Gravity Board", emoji: "🛹",
    rarity: "RARE", rate: 10, chance: 0.15,
    color: "#4facfe", glowColor: "rgba(79,172,254,0.6)", craftCost: 10,
  },
  PLUNGER: {
    type: "PLUNGER", label: "Void Tool", emoji: "🪠",
    rarity: "RARE", rate: 8, chance: 0.10,
    color: "#5bc8f5", glowColor: "rgba(91,200,245,0.6)", craftCost: 10,
  },
  // ─── EPIC ───────────────────────────────────────────────────
  DVD: {
    type: "DVD", label: "Quantum Disc", emoji: "📀",
    rarity: "EPIC", rate: 45, chance: 0.05,
    color: "#c471ed", glowColor: "rgba(196,113,237,0.65)", craftCost: 20,
  },
  GAMEBOY: {
    type: "GAMEBOY", label: "Retro Console", emoji: "🕹️",
    rarity: "EPIC", rate: 55, chance: 0.035,
    color: "#b06ef5", glowColor: "rgba(176,110,245,0.65)", craftCost: 20,
  },
  // ─── MYTHIC ─────────────────────────────────────────────────
  GUITAR: {
    type: "GUITAR", label: "Star Guitar", emoji: "🎸",
    rarity: "MYTHIC", rate: 90, chance: 0.008,
    color: "#dc143c", glowColor: "rgba(220,20,60,0.7)", craftCost: 50,
  },
  ARTIFACT: {
    type: "ARTIFACT", label: "Ancient Artifact", emoji: "🏺",
    rarity: "MYTHIC", rate: 105, chance: 0.005,
    color: "#ff4500", glowColor: "rgba(255,69,0,0.7)", craftCost: 50,
  },
  ROBOT: {
    type: "ROBOT", label: "Proto Robot", emoji: "🤖",
    rarity: "MYTHIC", rate: 115, chance: 0.003,
    color: "#ff6030", glowColor: "rgba(255,96,48,0.68)", craftCost: 50,
  },
  // ─── GOLD ───────────────────────────────────────────────────
  CRYSTAL: {
    type: "CRYSTAL", label: "Stellar Crystal", emoji: "💎",
    rarity: "GOLD", rate: 160, chance: 0.001,
    color: "#ffd700", glowColor: "rgba(255,215,0,0.72)", craftCost: 80,
  },
  TROPHY: {
    type: "TROPHY", label: "Cosmic Trophy", emoji: "🏆",
    rarity: "GOLD", rate: 175, chance: 0.0008,
    color: "#ffcc00", glowColor: "rgba(255,200,0,0.72)", craftCost: 80,
  },
  BOOK: {
    type: "BOOK", label: "Ancient Tome", emoji: "📚",
    rarity: "GOLD", rate: 200, chance: 0.0002,
    color: "#f0d060", glowColor: "rgba(240,208,96,0.68)", craftCost: 80,
  },
};

// Display order for the forge grid (rarity → rate ascending)
export const ITEM_TYPES_ORDERED: ItemType[] = [
  "SANDWICH", "PIZZA",
  "SKATEBOARD", "PLUNGER",
  "DVD", "GAMEBOY",
  "GUITAR", "ARTIFACT", "ROBOT",
  "CRYSTAL", "TROPHY", "BOOK",
];

export const ITEM_RARITY_LABEL: Record<ItemRarity, string> = {
  BASIC: "Basic", RARE: "Rare", EPIC: "Epic", MYTHIC: "Mythic", GOLD: "Gold",
};

export const ITEM_RARITY_COLOR: Record<ItemRarity, string> = {
  BASIC:  "#8892b0",
  RARE:   "#4facfe",
  EPIC:   "#c471ed",
  MYTHIC: "#dc143c",
  GOLD:   "#ffd700",
};

export const ITEM_RARITY_ORDER: ItemRarity[] = ["BASIC", "RARE", "EPIC", "MYTHIC", "GOLD"];
