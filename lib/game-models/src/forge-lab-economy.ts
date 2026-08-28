/** Lab ZOOM forge economy — zero-deps module (safe Vite named exports). */

export const LAB_PIZZA_SHAPE_ID = "pizza";
export const LAB_FLOWER_SHAPE_ID = "flower";
export const LAB_DOLLAR_SHAPE_ID = "dollar";
export const LAB_CREEPER_SHAPE_ID = "creeper";
export const LAB_CHEST_SHAPE_ID = "chest";
export const LAB_HONEY_SHAPE_ID = "honey";
export const LAB_HORSEA_SHAPE_ID = "horsea";
export const LAB_SUSHI_SHAPE_ID = "sushi";
export const LAB_HOUSE_SHAPE_ID = "lab_house";
export const LAB_STARDUST_POT_SHAPE_ID = "stardust_pot";
export const LAB_ONIGIRI_SHAPE_ID = "onigiri";
export const LAB_ISLAND_HOME_SHAPE_ID = "island_home";
export const LAB_STEVE_SHAPE_ID = "steve";
export const LAB_CHICKEN_SHAPE_ID = "chicken";
export const LAB_SLIME_SHAPE_ID = "slime";
export const LAB_POKEBALL_SHAPE_ID = "lab_pokeball";
export const LAB_DODGE_SHAPE_ID = "dodge";
export const LAB_AK47_SHAPE_ID = "ak47";

export const LAB_ZOOM_SHAPE_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
  LAB_CREEPER_SHAPE_ID,
  LAB_CHEST_SHAPE_ID,
  LAB_HONEY_SHAPE_ID,
  LAB_HORSEA_SHAPE_ID,
  LAB_SUSHI_SHAPE_ID,
  LAB_HOUSE_SHAPE_ID,
] as const;

export const LAB_STARDUST_SHAPE_IDS = [
  LAB_ONIGIRI_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_STEVE_SHAPE_ID,
  LAB_CHICKEN_SHAPE_ID,
  LAB_SLIME_SHAPE_ID,
  LAB_POKEBALL_SHAPE_ID,
  LAB_DODGE_SHAPE_ID,
  LAB_AK47_SHAPE_ID,
] as const;

export type LabZoomShapeId = (typeof LAB_ZOOM_SHAPE_IDS)[number];
export type LabStardustShapeId = (typeof LAB_STARDUST_SHAPE_IDS)[number];
export type LabForgePath = "zoom" | "stardust";
export type LabMarketPath = "zoom" | "stardust";

export const LAB_ZOOM_FARM_RATE: Record<LabZoomShapeId, number> = {
  [LAB_PIZZA_SHAPE_ID]: 3.5,
  [LAB_FLOWER_SHAPE_ID]: 2.6,
  [LAB_DOLLAR_SHAPE_ID]: 4.2,
  [LAB_CREEPER_SHAPE_ID]: 4.8,
  [LAB_CHEST_SHAPE_ID]: 5.0,
  [LAB_HONEY_SHAPE_ID]: 5.2,
  [LAB_HORSEA_SHAPE_ID]: 5.3,
  [LAB_SUSHI_SHAPE_ID]: 5.4,
  [LAB_HOUSE_SHAPE_ID]: 5.6,
};

export const LAB_STARDUST_FARM_RATE: Record<LabStardustShapeId, number> = {
  [LAB_ONIGIRI_SHAPE_ID]: 0.22,
  [LAB_ISLAND_HOME_SHAPE_ID]: 0.28,
  [LAB_STARDUST_POT_SHAPE_ID]: 0.20,
  [LAB_STEVE_SHAPE_ID]: 0.34,
  [LAB_CHICKEN_SHAPE_ID]: 0.36,
  [LAB_SLIME_SHAPE_ID]: 0.38,
  [LAB_POKEBALL_SHAPE_ID]: 0.39,
  [LAB_DODGE_SHAPE_ID]: 0.40,
  [LAB_AK47_SHAPE_ID]: 0.42,
};

export const LAB_ZOOM_DISPLAY_NAME: Record<LabZoomShapeId, string> = {
  [LAB_PIZZA_SHAPE_ID]: "Pizza",
  [LAB_FLOWER_SHAPE_ID]: "Flower",
  [LAB_DOLLAR_SHAPE_ID]: "Dollar",
  [LAB_CREEPER_SHAPE_ID]: "Creeper",
  [LAB_CHEST_SHAPE_ID]: "Chest",
  [LAB_HONEY_SHAPE_ID]: "Honey",
  [LAB_HORSEA_SHAPE_ID]: "Horsea",
  [LAB_SUSHI_SHAPE_ID]: "Sushi",
  [LAB_HOUSE_SHAPE_ID]: "House",
};

export const LAB_STARDUST_DISPLAY_NAME: Record<LabStardustShapeId, string> = {
  [LAB_ONIGIRI_SHAPE_ID]: "Onigiri",
  [LAB_ISLAND_HOME_SHAPE_ID]: "Island Home",
  [LAB_STARDUST_POT_SHAPE_ID]: "Stardust Pot",
  [LAB_STEVE_SHAPE_ID]: "Steve",
  [LAB_CHICKEN_SHAPE_ID]: "Chicken",
  [LAB_SLIME_SHAPE_ID]: "Slime",
  [LAB_POKEBALL_SHAPE_ID]: "Pokeball",
  [LAB_DODGE_SHAPE_ID]: "Dodge",
  [LAB_AK47_SHAPE_ID]: "AK-47 Asimov",
};

export const LAB_ZOOM_COLORS: Record<LabZoomShapeId, { color: string; glowColor: string }> = {
  [LAB_PIZZA_SHAPE_ID]: { color: "#7bed9f", glowColor: "#2ed573" },
  [LAB_FLOWER_SHAPE_ID]: { color: "#ff8fab", glowColor: "#ff5c8a" },
  [LAB_DOLLAR_SHAPE_ID]: { color: "#ffe066", glowColor: "#ffd43b" },
  [LAB_CREEPER_SHAPE_ID]: { color: "#5dbe2f", glowColor: "#3d8c1a" },
  [LAB_CHEST_SHAPE_ID]: { color: "#c48a3a", glowColor: "#8d5a20" },
  [LAB_HONEY_SHAPE_ID]: { color: "#e8b84a", glowColor: "#c9922a" },
  [LAB_HORSEA_SHAPE_ID]: { color: "#4fc3f7", glowColor: "#0288d1" },
  [LAB_SUSHI_SHAPE_ID]: { color: "#ff8a80", glowColor: "#ffab91" },
  [LAB_HOUSE_SHAPE_ID]: { color: "#ef9a58", glowColor: "#5b8def" },
};

export const LAB_STARDUST_COLORS: Record<LabStardustShapeId, { color: string; glowColor: string }> = {
  [LAB_ONIGIRI_SHAPE_ID]: { color: "#ffd740", glowColor: "#ffc107" },
  [LAB_ISLAND_HOME_SHAPE_ID]: { color: "#ffab40", glowColor: "#ff9100" },
  [LAB_STARDUST_POT_SHAPE_ID]: { color: "#ffd740", glowColor: "#ffc107" },
  [LAB_STEVE_SHAPE_ID]: { color: "#5b8def", glowColor: "#3d6bc4" },
  [LAB_CHICKEN_SHAPE_ID]: { color: "#f0e6c8", glowColor: "#e8c547" },
  [LAB_SLIME_SHAPE_ID]: { color: "#76ff03", glowColor: "#64dd17" },
  [LAB_POKEBALL_SHAPE_ID]: { color: "#e53935", glowColor: "#ff5252" },
  [LAB_DODGE_SHAPE_ID]: { color: "#37474f", glowColor: "#ff6f00" },
  [LAB_AK47_SHAPE_ID]: { color: "#c9a227", glowColor: "#212121" },
};

/** Fallback tap count — live Lab models use voxel length (1 tap = 1 cube). */
export const LAB_MODEL_FORGE_GOAL = 257;
/** @deprecated Lab models no longer pack to a fixed voxel budget. */
export const LAB_MODEL_FORGE_VOXEL_COUNT = 480;
export const LAB_STARDUST_FORGE_ZOOM_COST = 500;
export const LAB_ZOOM_FORGE_STARDUST_COST = 3;
/** Brand-new accounts only. Existing rows are never backfilled. */
export const NEW_PLAYER_ZOOM_GRANT = 700;
export const NEW_PLAYER_STARDUST_GRANT = 5;
/** @deprecated Use LAB_MODEL_FORGE_GOAL */
export const LAB_PIZZA_FORGE_GOAL = LAB_MODEL_FORGE_GOAL;

function canonicalShapeKey(shapeId: string | null | undefined): string {
  return (shapeId || "").trim().toLowerCase().replace(/-/g, "_");
}

export function isLabZoomShapeId(shapeId: string | null | undefined): shapeId is LabZoomShapeId {
  return !!shapeId && (LAB_ZOOM_SHAPE_IDS as readonly string[]).includes(shapeId);
}

export function resolveLabZoomShapeId(shapeId: string | null | undefined): LabZoomShapeId | null {
  const k = canonicalShapeKey(shapeId);
  return (LAB_ZOOM_SHAPE_IDS as readonly string[]).includes(k) ? (k as LabZoomShapeId) : null;
}

export function resolveLabStardustShapeId(shapeId: string | null | undefined): LabStardustShapeId | null {
  if (!shapeId) return null;
  const k = canonicalShapeKey(shapeId);
  if (k === "street_scene") return LAB_ONIGIRI_SHAPE_ID;
  return (LAB_STARDUST_SHAPE_IDS as readonly string[]).includes(k)
    ? (k as LabStardustShapeId)
    : null;
}

export function normalizeLabForgeShapeId(shapeId: string | null | undefined): string | null {
  if (!shapeId) return null;
  const stardust = resolveLabStardustShapeId(shapeId);
  if (stardust) return stardust;
  const zoom = resolveLabZoomShapeId(shapeId);
  if (zoom) return zoom;
  if (isLabZoomShapeId(shapeId)) return shapeId;
  return shapeId;
}

export function labStardustDisplayNameFor(shapeId: string | null | undefined): string | null {
  const resolved = resolveLabStardustShapeId(shapeId);
  return resolved ? LAB_STARDUST_DISPLAY_NAME[resolved] : null;
}

export function isLabStardustShapeId(shapeId: string | null | undefined): boolean {
  return resolveLabStardustShapeId(shapeId) !== null;
}

export function labMarketPathForShapeId(shapeId: string | null | undefined): LabMarketPath | null {
  if (resolveLabZoomShapeId(shapeId)) return "zoom";
  if (resolveLabStardustShapeId(shapeId)) return "stardust";
  return null;
}

function labMarketPathFromDisplayName(displayName: string | null | undefined): LabMarketPath | null {
  const n = (displayName || "").trim().toLowerCase();
  if (!n) return null;
  if (
    n === "pizza" || n === "flower" || n === "dollar" || n === "creeper" || n === "chest"
    || n === "honey" || n === "horsea" || n === "sushi" || n === "house" || n === "lab_house"
    || n.includes("pizza") || n.includes("flower") || n.includes("dollar")
    || n.includes("creeper") || n.includes("chest")
    || n.includes("honey") || n.includes("horsea") || n.includes("sushi")
    || n === "house"
  ) {
    return "zoom";
  }
  if (
    n === "onigiri" || n === "island home" || n === "stardust pot" || n === "steve" || n === "chicken"
    || n === "slime" || n === "dodge" || n === "ak-47 asimov" || n === "ak47" || n === "lab_pokeball"
    || n.includes("onigiri") || n.includes("island") || (n.includes("stardust") && n.includes("pot"))
    || n.includes("steve") || n.includes("chicken")
    || n.includes("slime") || n.includes("dodge")
    || n.includes("asimov") || n.includes("ak-47")
  ) {
    return "stardust";
  }
  for (const name of Object.values(LAB_ZOOM_DISPLAY_NAME)) {
    if (n === name.toLowerCase()) return "zoom";
  }
  for (const name of Object.values(LAB_STARDUST_DISPLAY_NAME)) {
    if (n === name.toLowerCase()) return "stardust";
  }
  return null;
}

export function labMarketPathForPlanet(planet: {
  shapeId?: string | null;
  displayName?: string | null;
  rate?: number | string | null;
}): LabMarketPath {
  const fromShape = labMarketPathForShapeId(planet.shapeId);
  if (fromShape) return fromShape;
  const fromName = labMarketPathFromDisplayName(planet.displayName);
  if (fromName) return fromName;
  const rate = Number(planet.rate);
  if (Number.isFinite(rate) && rate > 0) {
    return rate >= 1 ? "zoom" : "stardust";
  }
  return "zoom";
}

export function isLabForgeGeneratorPlanet(planet: { shapeId?: string | null; displayName?: string | null }): boolean {
  return !!resolveLabShapeIdFromPlanet(planet);
}

/** Farm / Market chrome — shape palette, never BASIC grey. */
export function labForgeChromeForPlanet(planet: {
  shapeId?: string | null;
  displayName?: string | null;
}): { color: string; glowColor: string } | null {
  const shapeId = resolveLabShapeIdFromPlanet(planet);
  if (!shapeId) return null;
  if (isLabZoomShapeId(shapeId)) return LAB_ZOOM_COLORS[shapeId];
  const stardustId = resolveLabStardustShapeId(shapeId);
  if (stardustId) return LAB_STARDUST_COLORS[stardustId];
  return null;
}

const DISPLAY_NAME_TO_SHAPE: Record<string, string> = {
  pizza: LAB_PIZZA_SHAPE_ID,
  "pizza slice": LAB_PIZZA_SHAPE_ID,
  flower: LAB_FLOWER_SHAPE_ID,
  dollar: LAB_DOLLAR_SHAPE_ID,
  creeper: LAB_CREEPER_SHAPE_ID,
  chest: LAB_CHEST_SHAPE_ID,
  honey: LAB_HONEY_SHAPE_ID,
  horsea: LAB_HORSEA_SHAPE_ID,
  sushi: LAB_SUSHI_SHAPE_ID,
  house: LAB_HOUSE_SHAPE_ID,
  lab_house: LAB_HOUSE_SHAPE_ID,
  onigiri: LAB_ONIGIRI_SHAPE_ID,
  "island home": LAB_ISLAND_HOME_SHAPE_ID,
  island_home: LAB_ISLAND_HOME_SHAPE_ID,
  "stardust pot": LAB_STARDUST_POT_SHAPE_ID,
  stardust_pot: LAB_STARDUST_POT_SHAPE_ID,
  steve: LAB_STEVE_SHAPE_ID,
  chicken: LAB_CHICKEN_SHAPE_ID,
  slime: LAB_SLIME_SHAPE_ID,
  "slime soup": LAB_SLIME_SHAPE_ID,
  lab_pokeball: LAB_POKEBALL_SHAPE_ID,
  dodge: LAB_DODGE_SHAPE_ID,
  "ak-47 asimov": LAB_AK47_SHAPE_ID,
  ak47: LAB_AK47_SHAPE_ID,
  "ak-47": LAB_AK47_SHAPE_ID,
};

/** Recover Lab shape id from listing/planet even if displayName was renamed later. */
export function resolveLabShapeIdFromPlanet(planet: {
  shapeId?: string | null;
  displayName?: string | null;
}): string | null {
  const zoom = resolveLabZoomShapeId(planet.shapeId);
  if (zoom) return zoom;
  const stardust = resolveLabStardustShapeId(planet.shapeId);
  if (stardust) return stardust;
  const n = (planet.displayName || "").trim().toLowerCase();
  if (DISPLAY_NAME_TO_SHAPE[n]) return DISPLAY_NAME_TO_SHAPE[n];
  if (n.includes("pizza")) return LAB_PIZZA_SHAPE_ID;
  if (n.includes("flower")) return LAB_FLOWER_SHAPE_ID;
  if (n.includes("dollar")) return LAB_DOLLAR_SHAPE_ID;
  if (n.includes("creeper")) return LAB_CREEPER_SHAPE_ID;
  if (n.includes("chest")) return LAB_CHEST_SHAPE_ID;
  if (n.includes("honey")) return LAB_HONEY_SHAPE_ID;
  if (n.includes("horsea")) return LAB_HORSEA_SHAPE_ID;
  if (n.includes("sushi")) return LAB_SUSHI_SHAPE_ID;
  if (n === "house") return LAB_HOUSE_SHAPE_ID;
  if (n.includes("onigiri")) return LAB_ONIGIRI_SHAPE_ID;
  if (n.includes("island")) return LAB_ISLAND_HOME_SHAPE_ID;
  if (n.includes("stardust") && n.includes("pot")) return LAB_STARDUST_POT_SHAPE_ID;
  if (n.includes("steve")) return LAB_STEVE_SHAPE_ID;
  if (n.includes("chicken")) return LAB_CHICKEN_SHAPE_ID;
  if (n.includes("slime")) return LAB_SLIME_SHAPE_ID;
  if (n.includes("dodge")) return LAB_DODGE_SHAPE_ID;
  if (n.includes("asimov") || n.includes("ak-47") || n === "ak47") return LAB_AK47_SHAPE_ID;
  return null;
}

/** localStorage key — set to "1" before the next Lab forge to force pizza. */
export const LAB_FORGE_TEST_PIZZA_KEY = "zoom-test-pizza-forge";

export function readLabForgeTestPizzaFlag(): boolean {
  try {
    return localStorage.getItem(LAB_FORGE_TEST_PIZZA_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearLabForgeTestPizzaFlag(): void {
  try {
    localStorage.removeItem(LAB_FORGE_TEST_PIZZA_KEY);
  } catch { /**/ }
}

export function enableNextLabForgePizza(): void {
  try {
    localStorage.setItem(LAB_FORGE_TEST_PIZZA_KEY, "1");
  } catch { /**/ }
}

/** Dev wipe — only when explicitly set to "1". Default off so models never vanish. */
export const LAB_DEV_WIPE_STATE_KEY = "zoom-lab-dev-wipe-active";

export function isLabDevWipeActive(): boolean {
  try {
    return localStorage.getItem(LAB_DEV_WIPE_STATE_KEY) === "1";
  } catch {
    return false;
  }
}

/** One-time farm reset after Lab market cutover. */
export const LAB_DEV_FARM_RESET_KEY = "zoom-lab-dev-farm-reset-v3";

export function consumeLabDevFarmResetOnce(): boolean {
  try {
    if (localStorage.getItem(LAB_DEV_FARM_RESET_KEY) === "done") return false;
    localStorage.setItem(LAB_DEV_FARM_RESET_KEY, "done");
    return true;
  } catch {
    return false;
  }
}

export function labModelDisplayName(planet: {
  shapeId?: string | null;
  displayName?: string | null;
}): string | null {
  const shape = resolveLabShapeIdFromPlanet(planet);
  if (!shape) return null;
  const zoom = resolveLabZoomShapeId(shape);
  if (zoom) return LAB_ZOOM_DISPLAY_NAME[zoom];
  const stardust = resolveLabStardustShapeId(shape);
  if (stardust) return LAB_STARDUST_DISPLAY_NAME[stardust];
  return null;
}

function weightedPick<T extends string>(entries: readonly { id: T; weight: number }[]): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return entries[entries.length - 1]!.id;
}

/** Pizza is common; higher-rate models drop less often. */
export function pickRandomLabZoomShapeId(): LabZoomShapeId {
  if (readLabForgeTestPizzaFlag()) return LAB_PIZZA_SHAPE_ID;
  return weightedPick([
    { id: LAB_PIZZA_SHAPE_ID, weight: 45 },
    { id: LAB_FLOWER_SHAPE_ID, weight: 16 },
    { id: LAB_DOLLAR_SHAPE_ID, weight: 13 },
    { id: LAB_CREEPER_SHAPE_ID, weight: 13 },
    { id: LAB_CHEST_SHAPE_ID, weight: 13 },
    { id: LAB_HONEY_SHAPE_ID, weight: 10 },
    { id: LAB_HORSEA_SHAPE_ID, weight: 10 },
    { id: LAB_SUSHI_SHAPE_ID, weight: 10 },
    { id: LAB_HOUSE_SHAPE_ID, weight: 10 },
  ] as const);
}

/** Stardust pot is common; higher-rate models drop less often. */
export function pickRandomLabStardustShapeId(): LabStardustShapeId {
  return weightedPick([
    { id: LAB_STARDUST_POT_SHAPE_ID, weight: 45 },
    { id: LAB_ONIGIRI_SHAPE_ID, weight: 16 },
    { id: LAB_ISLAND_HOME_SHAPE_ID, weight: 13 },
    { id: LAB_STEVE_SHAPE_ID, weight: 13 },
    { id: LAB_CHICKEN_SHAPE_ID, weight: 13 },
    { id: LAB_SLIME_SHAPE_ID, weight: 10 },
    { id: LAB_POKEBALL_SHAPE_ID, weight: 10 },
    { id: LAB_DODGE_SHAPE_ID, weight: 10 },
    { id: LAB_AK47_SHAPE_ID, weight: 10 },
  ] as const);
}

export function labForgeShapeForPath(path: LabForgePath): string {
  return path === "zoom" ? pickRandomLabZoomShapeId() : pickRandomLabStardustShapeId();
}
