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

/** Watering pot GLB — produces ★ Stardust (Farm generator, test). */
export const LAB_STARDUST_POT_SHAPE_ID = "stardust_pot";

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

/** One-time dev reset — clears farm planets on next load (remove key to revert behaviour). */
export const LAB_DEV_FARM_RESET_KEY = "zoom-lab-dev-farm-reset-v2";

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

export function labForgeShapeForPath(path: LabForgePath): string {
  return path === "zoom" ? LAB_PIZZA_SHAPE_ID : LAB_STARDUST_POT_SHAPE_ID;
}

export function resolveLabForgeShapeId(override: string | null | undefined): string {
  if (override && override.length > 0) return override;
  return FORGE_SPHERE_SHAPE_ID;
}

function isLabModelShape(shapeId: string): boolean {
  return shapeId === LAB_PIZZA_SHAPE_ID || shapeId === LAB_STARDUST_POT_SHAPE_ID;
}

/** Lab forge generators currently claimable to Farm (pizza / stardust pot). */
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
