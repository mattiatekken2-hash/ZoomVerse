import { getShapeGlbUrl } from "./glb-assets.js";
import { getMeshParts } from "./meshes.js";
import {
  FORGE_CLAY_HEX,
  getForgeBlueprint,
  meshPartsToGoalVoxels,
  type VoxelCell,
} from "./voxelize.js";
import {
  FORGE_SPHERE_SHAPE_ID,
  forgeSphereTapGoal,
  getForgeSphereBlueprint,
} from "./voxel-sphere-blueprint.js";

/** Lab forge path — ZOOM models vs Stardust generators. */
export type LabForgePath = "zoom" | "stardust";

/** Catalog shape id for the pizza GLB (produces $ZOOM). */
export const LAB_PIZZA_SHAPE_ID = "pizza";

/** Flower GLB — ZOOM Farm generator (random ZOOM forge outcome). */
export const LAB_FLOWER_SHAPE_ID = "flower";

/** Dollar GLB — ZOOM Farm generator (random ZOOM forge outcome). */
export const LAB_DOLLAR_SHAPE_ID = "dollar";

/** Watering pot GLB — produces ★ Stardust (Farm generator, test). */
export const LAB_STARDUST_POT_SHAPE_ID = "stardust_pot";

/** ZOOM-path forge pool — one is picked at random when starting a ZOOM forge. */
export const LAB_ZOOM_SHAPE_IDS = [
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
] as const;

export type LabZoomShapeId = (typeof LAB_ZOOM_SHAPE_IDS)[number];

/** Farm $ZOOM/h by ZOOM-path model. Pizza = baseline; flower softer; dollar stronger. */
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

/** Match the grey sphere forge tap count — one tap = one voxel. */
export const LAB_MODEL_FORGE_GOAL = 257;

/** $ZOOM cost to start a Stardust-path forge (test balance). */
export const LAB_STARDUST_FORGE_ZOOM_COST = 500;

/** ★ Stardust cost to start a ZOOM-path pizza forge (test balance). */
export const LAB_ZOOM_FORGE_STARDUST_COST = 3;

/** @deprecated Use LAB_MODEL_FORGE_GOAL */
export const LAB_PIZZA_FORGE_GOAL = LAB_MODEL_FORGE_GOAL;

/** localStorage key — set to "1" before the next Lab forge to test pizza. */
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

/** Dev lab forge — on reload, strip legacy farm inventory but keep lab models (remove when shipping). */
export const LAB_DEV_WIPE_STATE_KEY = "zoom-lab-dev-wipe-active";

export function isLabDevWipeActive(): boolean {
  try {
    return localStorage.getItem(LAB_DEV_WIPE_STATE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** One-time farm reset — clears rarity spheres once after Lab market cutover. */
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

export function enableNextLabForgePizza(): void {
  try {
    localStorage.setItem(LAB_FORGE_TEST_PIZZA_KEY, "1");
  } catch { /**/ }
}

export function isLabZoomShapeId(shapeId: string | null | undefined): shapeId is LabZoomShapeId {
  return !!shapeId && (LAB_ZOOM_SHAPE_IDS as readonly string[]).includes(shapeId);
}

/** Market / Farm path for a listing — null if not a Lab generator. */
export type LabMarketPath = "zoom" | "stardust";

export function labMarketPathForShapeId(shapeId: string | null | undefined): LabMarketPath | null {
  if (isLabZoomShapeId(shapeId)) return "zoom";
  if (shapeId === LAB_STARDUST_POT_SHAPE_ID) return "stardust";
  return null;
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

export function resolveLabForgeShapeId(override: string | null | undefined): string {
  if (override && override.length > 0) return override;
  return FORGE_SPHERE_SHAPE_ID;
}

function isLabModelShape(shapeId: string): boolean {
  return isLabZoomShapeId(shapeId) || shapeId === LAB_STARDUST_POT_SHAPE_ID;
}

/** Lab forge generators currently claimable to Farm (ZOOM models / stardust pot). */
export function isLabForgeGeneratorPlanet(planet: { shapeId?: string | null }): boolean {
  return !!planet.shapeId && isLabModelShape(planet.shapeId);
}

export function getLabForgeShapeTapGoal(
  shapeId: string,
  primary = FORGE_CLAY_HEX,
  accent = "#888888",
): number {
  if (shapeId === FORGE_SPHERE_SHAPE_ID) return forgeSphereTapGoal();
  const parts = getMeshParts(shapeId, primary, accent);
  if (isLabModelShape(shapeId)) {
    return meshPartsToGoalVoxels(parts, LAB_MODEL_FORGE_GOAL).goal;
  }
  return getForgeBlueprint(parts).goal;
}

export function getLabForgeShapeVoxels(
  shapeId: string,
  primary = FORGE_CLAY_HEX,
  accent = "#888888",
): { voxels: VoxelCell[]; step: number; goal: number; radius: number } {
  if (shapeId === FORGE_SPHERE_SHAPE_ID) {
    const bp = getForgeSphereBlueprint(primary, accent, { labMorph: true });
    return { voxels: bp.voxels, step: bp.step, goal: bp.goal, radius: bp.radius };
  }
  const parts = getMeshParts(shapeId, primary, accent);
  if (isLabModelShape(shapeId)) {
    const packed = meshPartsToGoalVoxels(parts, LAB_MODEL_FORGE_GOAL);
    return { ...packed, radius: 4 };
  }
  const bp = getForgeBlueprint(parts);
  return { voxels: bp.voxels, step: bp.step, goal: bp.goal, radius: 4 };
}

export function labForgeShapeHasGlbReveal(shapeId: string | null | undefined): boolean {
  if (!shapeId || shapeId === FORGE_SPHERE_SHAPE_ID) return false;
  return !!getShapeGlbUrl(shapeId);
}
