/** Lab ZOOM forge economy — zero-deps module (safe Vite named exports). */

export const LAB_PIZZA_SHAPE_ID = "pizza";
export const LAB_FLOWER_SHAPE_ID = "flower";
export const LAB_DOLLAR_SHAPE_ID = "dollar";
export const LAB_STARDUST_POT_SHAPE_ID = "stardust_pot";

export const LAB_ZOOM_SHAPE_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
] as const;

export type LabZoomShapeId = (typeof LAB_ZOOM_SHAPE_IDS)[number];
export type LabForgePath = "zoom" | "stardust";
export type LabMarketPath = "zoom" | "stardust";

export const LAB_ZOOM_FARM_RATE: Record<LabZoomShapeId, number> = {
  [LAB_PIZZA_SHAPE_ID]: 3.5,
  [LAB_FLOWER_SHAPE_ID]: 2.6,
  [LAB_DOLLAR_SHAPE_ID]: 4.2,
};

export const LAB_ZOOM_DISPLAY_NAME: Record<LabZoomShapeId, string> = {
  [LAB_PIZZA_SHAPE_ID]: "Pizza",
  [LAB_FLOWER_SHAPE_ID]: "Flower",
  [LAB_DOLLAR_SHAPE_ID]: "Dollar",
};

export const LAB_ZOOM_COLORS: Record<LabZoomShapeId, { color: string; glowColor: string }> = {
  [LAB_PIZZA_SHAPE_ID]: { color: "#7bed9f", glowColor: "#2ed573" },
  [LAB_FLOWER_SHAPE_ID]: { color: "#ff8fab", glowColor: "#ff5c8a" },
  [LAB_DOLLAR_SHAPE_ID]: { color: "#ffe066", glowColor: "#ffd43b" },
};

export const LAB_MODEL_FORGE_GOAL = 257;
export const LAB_STARDUST_FORGE_ZOOM_COST = 500;
export const LAB_ZOOM_FORGE_STARDUST_COST = 3;
/** @deprecated Use LAB_MODEL_FORGE_GOAL */
export const LAB_PIZZA_FORGE_GOAL = LAB_MODEL_FORGE_GOAL;

export function isLabZoomShapeId(shapeId: string | null | undefined): shapeId is LabZoomShapeId {
  return !!shapeId && (LAB_ZOOM_SHAPE_IDS as readonly string[]).includes(shapeId);
}

export function labMarketPathForShapeId(shapeId: string | null | undefined): LabMarketPath | null {
  if (isLabZoomShapeId(shapeId)) return "zoom";
  if (shapeId === LAB_STARDUST_POT_SHAPE_ID) return "stardust";
  return null;
}

export function isLabForgeGeneratorPlanet(planet: { shapeId?: string | null }): boolean {
  return !!planet.shapeId && (
    isLabZoomShapeId(planet.shapeId) || planet.shapeId === LAB_STARDUST_POT_SHAPE_ID
  );
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

/** Dev wipe — strip legacy farm inventory unless explicitly set to "off". */
export const LAB_DEV_WIPE_STATE_KEY = "zoom-lab-dev-wipe-active";

export function isLabDevWipeActive(): boolean {
  try {
    return localStorage.getItem(LAB_DEV_WIPE_STATE_KEY) !== "off";
  } catch {
    return true;
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

/** Pick a random ZOOM-path model (pizza / flower / dollar). Equal weight. */
export function pickRandomLabZoomShapeId(): LabZoomShapeId {
  if (readLabForgeTestPizzaFlag()) return LAB_PIZZA_SHAPE_ID;
  const i = Math.floor(Math.random() * LAB_ZOOM_SHAPE_IDS.length);
  return LAB_ZOOM_SHAPE_IDS[Math.max(0, Math.min(LAB_ZOOM_SHAPE_IDS.length - 1, i))]!;
}

export function labForgeShapeForPath(path: LabForgePath): string {
  return path === "zoom" ? pickRandomLabZoomShapeId() : LAB_STARDUST_POT_SHAPE_ID;
}
