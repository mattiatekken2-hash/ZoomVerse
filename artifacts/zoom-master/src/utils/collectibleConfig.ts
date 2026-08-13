// ─────────────────────────────────────────────────────────────────
//  COLLECTIBLE ITEMS CONFIG — Season 3 (3D meshes, expanded rarities)
// ─────────────────────────────────────────────────────────────────

export type ItemType =
  | "SANDWICH"   | "PIZZA"
  | "SKATEBOARD" | "PLUNGER"
  | "DVD"        | "GAMEBOY"
  | "GUITAR"     | "ARTIFACT"   | "ROBOT"
  | "CRYSTAL"    | "TROPHY"     | "BOOK"
  | "PRISM_SHARD" | "VOID_RELIC";

export type ItemRarity = "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "GOLD" | "PRISM" | "VOID";

export type MeshShape =
  | "box" | "cylinder" | "cone" | "disc" | "torus" | "octahedron" | "board";

export interface CollectibleItem {
  id: string;
  type: ItemType;
  rarity: ItemRarity;
  rate: number;
  emoji: string;
  meshShape?: MeshShape | string;
  color: string;
  glowColor: string;
  createdAt: number;
  isListedInMarket: boolean;
  serverListingId?: number;
  marketPrice?: number | null;
}

export interface ItemConfig {
  type: ItemType;
  label: string;
  emoji: string;
  meshShape: MeshShape;
  rarity: ItemRarity;
  rate: number;
  chance: number;
  color: string;
  glowColor: string;
  craftCost: number;
}

export const ITEM_CONFIG: Record<ItemType, ItemConfig> = {
  SANDWICH: {
    type: "SANDWICH", label: "Cosmic Sandwich", emoji: "", meshShape: "box",
    rarity: "BASIC", rate: 1, chance: 0.35,
    color: "#888888", glowColor: "rgba(136,136,136,0.55)", craftCost: 1,
  },
  PIZZA: {
    type: "PIZZA", label: "Space Pizza", emoji: "", meshShape: "cylinder",
    rarity: "BASIC", rate: 1.5, chance: 0.30,
    color: "#999999", glowColor: "rgba(153,153,153,0.55)", craftCost: 1,
  },
  SKATEBOARD: {
    type: "SKATEBOARD", label: "Gravity Board", emoji: "", meshShape: "board",
    rarity: "RARE", rate: 10, chance: 0.15,
    color: "#aaaaaa", glowColor: "rgba(170,170,170,0.6)", craftCost: 1,
  },
  PLUNGER: {
    type: "PLUNGER", label: "Void Tool", emoji: "", meshShape: "cone",
    rarity: "RARE", rate: 8, chance: 0.10,
    color: "#bbbbbb", glowColor: "rgba(187,187,187,0.6)", craftCost: 1,
  },
  DVD: {
    type: "DVD", label: "Quantum Disc", emoji: "", meshShape: "disc",
    rarity: "EPIC", rate: 45, chance: 0.05,
    color: "#cccccc", glowColor: "rgba(204,204,204,0.65)", craftCost: 1,
  },
  GAMEBOY: {
    type: "GAMEBOY", label: "Retro Console", emoji: "", meshShape: "box",
    rarity: "EPIC", rate: 55, chance: 0.035,
    color: "#dddddd", glowColor: "rgba(221,221,221,0.65)", craftCost: 1,
  },
  GUITAR: {
    type: "GUITAR", label: "Star Guitar", emoji: "", meshShape: "torus",
    rarity: "MYTHIC", rate: 90, chance: 0.008,
    color: "#eeeeee", glowColor: "rgba(238,238,238,0.7)", craftCost: 1,
  },
  ARTIFACT: {
    type: "ARTIFACT", label: "Ancient Artifact", emoji: "", meshShape: "octahedron",
    rarity: "MYTHIC", rate: 105, chance: 0.005,
    color: "#f0f0f0", glowColor: "rgba(240,240,240,0.7)", craftCost: 1,
  },
  ROBOT: {
    type: "ROBOT", label: "Proto Robot", emoji: "", meshShape: "box",
    rarity: "MYTHIC", rate: 115, chance: 0.003,
    color: "#f5f5f5", glowColor: "rgba(245,245,245,0.68)", craftCost: 1,
  },
  CRYSTAL: {
    type: "CRYSTAL", label: "Stellar Crystal", emoji: "", meshShape: "octahedron",
    rarity: "GOLD", rate: 160, chance: 0.001,
    color: "#ffffff", glowColor: "rgba(255,255,255,0.72)", craftCost: 1,
  },
  TROPHY: {
    type: "TROPHY", label: "Cosmic Trophy", emoji: "", meshShape: "cone",
    rarity: "GOLD", rate: 175, chance: 0.0008,
    color: "#ffffff", glowColor: "rgba(255,255,255,0.72)", craftCost: 1,
  },
  BOOK: {
    type: "BOOK", label: "Ancient Tome", emoji: "", meshShape: "box",
    rarity: "GOLD", rate: 200, chance: 0.0002,
    color: "#ffffff", glowColor: "rgba(255,255,255,0.68)", craftCost: 1,
  },
  PRISM_SHARD: {
    type: "PRISM_SHARD", label: "Prism Shard", emoji: "", meshShape: "octahedron",
    rarity: "PRISM", rate: 130, chance: 0.006,
    color: "#ffffff", glowColor: "rgba(255,255,255,0.8)", craftCost: 1,
  },
  VOID_RELIC: {
    type: "VOID_RELIC", label: "Void Relic", emoji: "", meshShape: "torus",
    rarity: "VOID", rate: 220, chance: 0.0005,
    color: "#ffffff", glowColor: "rgba(255,255,255,0.85)", craftCost: 1,
  },
};

export const ITEM_TYPES_ORDERED: ItemType[] = [
  "SANDWICH", "PIZZA",
  "SKATEBOARD", "PLUNGER",
  "DVD", "GAMEBOY",
  "GUITAR", "ARTIFACT", "ROBOT",
  "CRYSTAL", "TROPHY", "BOOK",
  "PRISM_SHARD", "VOID_RELIC",
];

export const ITEM_RARITY_LABEL: Record<ItemRarity, string> = {
  BASIC: "Basic", RARE: "Rare", EPIC: "Epic", MYTHIC: "Mythic", GOLD: "Gold",
  PRISM: "Prism", VOID: "Void",
};

export const ITEM_RARITY_COLOR: Record<ItemRarity, string> = {
  BASIC:  "#888888",
  RARE:   "#aaaaaa",
  EPIC:   "#cccccc",
  MYTHIC: "#eeeeee",
  GOLD:   "#ffffff",
  PRISM:  "#ffffff",
  VOID:   "#ffffff",
};

export const ITEM_RARITY_ORDER: ItemRarity[] = [
  "BASIC", "RARE", "EPIC", "MYTHIC", "GOLD", "PRISM", "VOID",
];
