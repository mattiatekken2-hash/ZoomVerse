/**
 * Equipment catalogue — space gear that produces $ZOOM passively.
 *
 * 4 categories × 6 rarities = 24 items. Rarity mirrors the planet scale
 * (Basic → Rare → Epic → Gold → Plasma → Mythic). Each owned item
 * contributes its `rate` (ZOOM/hr) to the player's live earning rate;
 * each item also runs a 24h farming cycle (mirrors planets) — the user
 * activates it, it earns for up to 24h, then needs a fresh Reactivate
 * click. Items can be burned for nothing or listed on the marketplace.
 */

import type { CSSProperties } from "react";

export type EquipmentCategory = "HELMET" | "JETPACK" | "HAT" | "SCANNER";
export type EquipmentRarity = "BASIC" | "RARE" | "EPIC" | "GOLD" | "PLASMA" | "MYTHIC";

export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  rarity: EquipmentRarity;
  rate: number;
  color?: string;
  createdAt?: number;
  // 24h cycle state. Mirrors the Planet shape so server-side accrual
  // (artifacts/api-server/src/routes/farm-settle.ts) can reuse the same
  // effectiveStart=max(farmStartedAt, lastCollectedAt) anchor.
  // farmStartedAt=0 means "never activated". When set, accrual happens
  // from max(watermark, effectiveStart) to min(now, effectiveStart+24h).
  farmStartedAt?: number;
  lastCollectedAt?: number;
  isFarmingActive?: boolean;
  // When a piece is listed on the market we pause its farming so the
  // remaining cycle isn't lost while it sits in escrow. pausedAt records
  // the moment we paused; on delist we shift farmStartedAt forward by
  // (now - pausedAt) so the user keeps the same time-left they had at
  // listing time (mirrors the planet pause/delist logic).
  pausedAt?: number;
  isListedInMarket?: boolean;
  serverListingId?: number;
  marketPrice?: number;
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

/**
 * Sum the LIVE earning rate of an equipment array. Only items with an
 * active 24h cycle (isFarmingActive && !isListedInMarket && cycle window
 * still open) contribute. Burned / inactive / listed / expired items
 * count as 0 so the +$ZOOM/hr chip stays honest.
 */
export const EQUIPMENT_CYCLE_MS = 24 * 60 * 60 * 1000;

export function effectiveEquipmentStart(item: EquipmentItem): number {
  return Math.max(item.farmStartedAt || 0, item.lastCollectedAt || 0);
}

export function isEquipmentCycleActive(item: EquipmentItem, now: number): boolean {
  if (!item.isFarmingActive) return false;
  if (item.isListedInMarket) return false;
  const eff = effectiveEquipmentStart(item);
  if (eff <= 0) return false;
  return now < eff + EQUIPMENT_CYCLE_MS;
}

export function getEquipmentTimeRemaining(item: EquipmentItem, now: number): number {
  const eff = effectiveEquipmentStart(item);
  if (eff <= 0) return 0;
  return Math.max(0, eff + EQUIPMENT_CYCLE_MS - now);
}

export function getEquipmentTotalRate(
  items: ReadonlyArray<EquipmentItem>,
  now: number = Date.now(),
): number {
  let total = 0;
  for (const it of items) {
    if (!isEquipmentCycleActive(it, now)) continue;
    total += Math.max(0, it.rate || 0);
  }
  return total;
}

/**
 * Helper used by future shop / drop / admin grant flows. Builds a fresh
 * client-side equipment item with a unique id and the canonical rate
 * pulled from EQUIPMENT_RATE so the rate can never drift from the table.
 * New items start with the cycle dormant — the user must press Activate
 * once to begin the 24h window.
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
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isFarmingActive: false,
  };
}

// ─── Pixel-art icons ─────────────────────────────────────────────────
//
// Inline SVG pixel-art replacements for the 🪖🚀🎩📡 category emojis.
// Each icon is drawn on a 16×16 grid using <rect> pixels so it stays
// crisp at any size and tints automatically to the rarity colour (the
// piece body uses `currentColor`, accents use a darker shade for depth).
// No external assets so we can ship without an icon CDN.

interface PixelIconProps {
  size?: number;
  color?: string;
  accent?: string;
  style?: CSSProperties;
  className?: string;
}

function pixel(x: number, y: number, fill: string, key: number) {
  return <rect key={key} x={x} y={y} width={1} height={1} fill={fill} />;
}

function darken(hex: string, factor = 0.55): string {
  // Accepts #rgb / #rrggbb. Returns a darker rgba() so the accent reads
  // on every rarity tint (white-ish basic up to gold/mythic).
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = Math.round(parseInt(h.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * factor);
  return `rgb(${r},${g},${b})`;
}

/**
 * Crisp 16×16 pixel-art icons. We render each category from a literal
 * pixel map so the silhouette is recognisable at small sizes (32–48 px)
 * without falling back to the OS emoji font, which renders differently
 * on iOS/Android/desktop and broke the "space-game" mood.
 */
const HELMET_MAP: ReadonlyArray<readonly [number, number]> = [
  [5,2],[6,2],[7,2],[8,2],[9,2],[10,2],
  [4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],
  [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],
  [3,5],[4,5],[5,5],[12,5],
  [3,6],[4,6],[12,6],
  [3,7],[12,7],
  [3,8],[12,8],
  [3,9],[4,9],[12,9],
  [3,10],[4,10],[5,10],[10,10],[11,10],[12,10],
  [4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],[11,11],
  [5,12],[6,12],[7,12],[8,12],[9,12],[10,12],
];
const HELMET_VISOR: ReadonlyArray<readonly [number, number]> = [
  [5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
  [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
  [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],
  [4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],
  [5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],
];

const JETPACK_MAP: ReadonlyArray<readonly [number, number]> = [
  [4,2],[5,2],[10,2],[11,2],
  [4,3],[5,3],[6,3],[9,3],[10,3],[11,3],
  [4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],
  [4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
  [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
  [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],
  [4,8],[5,8],[6,8],[9,8],[10,8],[11,8],
  [4,9],[5,9],[10,9],[11,9],
];
const JETPACK_FLAME: ReadonlyArray<readonly [number, number]> = [
  [5,10],[10,10],
  [4,11],[5,11],[10,11],[11,11],
  [5,12],[10,12],
  [5,13],[10,13],
];

const HAT_MAP: ReadonlyArray<readonly [number, number]> = [
  [5,2],[6,2],[7,2],[8,2],[9,2],[10,2],
  [5,3],[6,3],[7,3],[8,3],[9,3],[10,3],
  [5,4],[6,4],[7,4],[8,4],[9,4],[10,4],
  [5,5],[6,5],[7,5],[8,5],[9,5],[10,5],
  [5,6],[6,6],[7,6],[8,6],[9,6],[10,6],
  [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
  [5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
  [3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],
  [2,10],[3,10],[4,10],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],[13,10],
];
const HAT_BAND: ReadonlyArray<readonly [number, number]> = [
  [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
];

const SCANNER_MAP: ReadonlyArray<readonly [number, number]> = [
  [10,2],
  [9,3],[10,3],[11,3],
  [8,4],[9,4],[10,4],[11,4],[12,4],
  [7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],
  [6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[12,6],
  [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],
  [4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
  [3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],
  [3,10],[4,10],[5,10],[6,10],[7,10],[8,10],
  [4,11],[5,11],[6,11],[7,11],
  [6,12],[7,12],
  [6,13],[7,13],
  [5,14],[6,14],[7,14],[8,14],
];

const ICON_MAP: Record<EquipmentCategory, {
  body: ReadonlyArray<readonly [number, number]>;
  accent: ReadonlyArray<readonly [number, number]>;
}> = {
  HELMET:  { body: HELMET_MAP,  accent: HELMET_VISOR },
  JETPACK: { body: JETPACK_MAP, accent: JETPACK_FLAME },
  HAT:     { body: HAT_MAP,     accent: HAT_BAND },
  SCANNER: { body: SCANNER_MAP, accent: [] },
};

export function PixelEquipmentIcon({
  category,
  size = 24,
  color = "#e6f3ff",
  accent,
  style,
  className,
}: PixelIconProps & { category: EquipmentCategory }) {
  const map = ICON_MAP[category];
  const accentColor = accent ?? (category === "JETPACK"
    ? "#ffb347"
    : category === "HELMET"
      ? "#7fd4ff"
      : darken(color));
  let k = 0;
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      style={{ display: "block", imageRendering: "pixelated", ...style }}
      className={className}
      aria-hidden="true"
    >
      {map.body.map(([x, y]) => pixel(x, y, color, k++))}
      {map.accent.map(([x, y]) => pixel(x, y, accentColor, k++))}
    </svg>
  );
}
