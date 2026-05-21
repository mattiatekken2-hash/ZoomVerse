/**
 * Equipment catalogue — space gear that produces $ZOOM passively.
 *
 * 4 categories × 6 rarities = 24 items. Rarity mirrors the planet scale
 * (Basic → Rare → Epic → Gold → Plasma → Mythic). Each owned item
 * contributes its `rate` (ZOOM/hr) to the player's live earning rate;
 * unlike planets there is no 24h cycle or activation cost — equipment
 * is always-on as long as it sits in the inventory.
 */

export type EquipmentCategory = "HELMET" | "JETPACK" | "HAT" | "SCANNER";
export type EquipmentRarity = "BASIC" | "RARE" | "EPIC" | "GOLD" | "PLASMA" | "MYTHIC";

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  rarity: EquipmentRarity;
  rate: number;
  color?: string;
  createdAt?: number;
}

export interface EquipmentCategoryInfo {
  label: string;
  icon: string;
}

export const EQUIPMENT_CATEGORIES: Record<EquipmentCategory, EquipmentCategoryInfo> = {
  HELMET:  { label: "Helmets",  icon: "🪖" },
  JETPACK: { label: "Jetpacks", icon: "🚀" },
  HAT:     { label: "Hats",     icon: "🎩" },
  SCANNER: { label: "Scanners", icon: "📡" },
};

export const EQUIPMENT_CATEGORY_ORDER: EquipmentCategory[] = [
  "HELMET",
  "JETPACK",
  "HAT",
  "SCANNER",
];

export interface EquipmentRarityInfo {
  label: string;
  color: string;
  glowColor: string;
}

// Same colour scale as PLANET_CONFIG so the visual language stays
// consistent across the inventory.
export const EQUIPMENT_RARITY_INFO: Record<EquipmentRarity, EquipmentRarityInfo> = {
  BASIC:  { label: "Basic",  color: "#9aa4b2", glowColor: "rgba(154,164,178,0.5)" },
  RARE:   { label: "Rare",   color: "#4fc3f7", glowColor: "rgba(79,195,247,0.5)" },
  EPIC:   { label: "Epic",   color: "#ab47bc", glowColor: "rgba(171,71,188,0.55)" },
  GOLD:   { label: "Gold",   color: "#ffd700", glowColor: "rgba(255,215,0,0.5)" },
  PLASMA: { label: "Plasma", color: "#00e676", glowColor: "rgba(0,230,118,0.7)" },
  MYTHIC: { label: "Mythic", color: "#ff1744", glowColor: "rgba(255,23,68,0.6)" },
};

export const EQUIPMENT_RARITY_ORDER: EquipmentRarity[] = [
  "BASIC",
  "RARE",
  "EPIC",
  "GOLD",
  "PLASMA",
  "MYTHIC",
];

/**
 * ZOOM/hr produced per equipment piece. Curve is per-category × per-rarity
 * so a Mythic Scanner can produce a different amount than a Mythic Helmet.
 *
 * Tuning intent: every piece adds a meaningful boost without trivialising
 * planet farming. Basic ≈ a Basic planet (10/hr); the curve climbs to
 * Mythic at 220–280/hr — about 2× a Mythic planet (115/hr) since gear is
 * expected to be much rarer and cannot be mass-crafted.
 */
export const EQUIPMENT_RATE: Record<EquipmentCategory, Record<EquipmentRarity, number>> = {
  HELMET:  { BASIC: 10, RARE: 25, EPIC: 60, GOLD: 120, PLASMA: 180, MYTHIC: 260 },
  JETPACK: { BASIC: 12, RARE: 30, EPIC: 70, GOLD: 130, PLASMA: 195, MYTHIC: 280 },
  HAT:     { BASIC:  8, RARE: 22, EPIC: 55, GOLD: 110, PLASMA: 170, MYTHIC: 240 },
  SCANNER: { BASIC: 10, RARE: 26, EPIC: 65, GOLD: 125, PLASMA: 185, MYTHIC: 250 },
};

export function getEquipmentRate(category: EquipmentCategory, rarity: EquipmentRarity): number {
  return EQUIPMENT_RATE[category][rarity];
}

export function getEquipmentTotalRate(items: ReadonlyArray<EquipmentItem>): number {
  let total = 0;
  for (const it of items) total += Math.max(0, it.rate || 0);
  return total;
}

/**
 * Helper used by future shop / drop / admin grant flows. Builds a fresh
 * client-side equipment item with a unique id and the canonical rate
 * pulled from EQUIPMENT_RATE so the rate can never drift from the table.
 */
export function makeEquipmentItem(category: EquipmentCategory, rarity: EquipmentRarity): EquipmentItem {
  const id = `eq-${category.toLowerCase()}-${rarity.toLowerCase()}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    id,
    category,
    rarity,
    rate: getEquipmentRate(category, rarity),
    color: EQUIPMENT_RARITY_INFO[rarity].color,
    createdAt: Date.now(),
  };
}
