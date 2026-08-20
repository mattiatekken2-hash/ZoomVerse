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
import {
  LAB_MODEL_FORGE_GOAL,
  LAB_PIZZA_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_ZOOM_SHAPE_IDS,
  isLabZoomShapeId,
  type LabForgePath,
  type LabZoomShapeId,
} from "./forge-lab-economy.js";

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
