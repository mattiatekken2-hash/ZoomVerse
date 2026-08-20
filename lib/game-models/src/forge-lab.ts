/**
 * Lab forge public module.
 * Explicit named re-exports (not `export *`) so Vite always sees
 * pickRandomLabZoomShapeId on this module graph node.
 */
export {
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_ONIGIRI_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_ZOOM_SHAPE_IDS,
  LAB_STARDUST_SHAPE_IDS,
  LAB_ZOOM_FARM_RATE,
  LAB_STARDUST_FARM_RATE,
  LAB_ZOOM_DISPLAY_NAME,
  LAB_STARDUST_DISPLAY_NAME,
  LAB_ZOOM_COLORS,
  LAB_STARDUST_COLORS,
  LAB_MODEL_FORGE_GOAL,
  LAB_STARDUST_FORGE_ZOOM_COST,
  LAB_ZOOM_FORGE_STARDUST_COST,
  LAB_PIZZA_FORGE_GOAL,
  isLabZoomShapeId,
  isLabStardustShapeId,
  resolveLabStardustShapeId,
  labMarketPathForShapeId,
  isLabForgeGeneratorPlanet,
  LAB_FORGE_TEST_PIZZA_KEY,
  readLabForgeTestPizzaFlag,
  clearLabForgeTestPizzaFlag,
  enableNextLabForgePizza,
  LAB_DEV_WIPE_STATE_KEY,
  isLabDevWipeActive,
  LAB_DEV_FARM_RESET_KEY,
  consumeLabDevFarmResetOnce,
  pickRandomLabZoomShapeId,
  pickRandomLabStardustShapeId,
  labForgeShapeForPath,
} from "./forge-lab-economy.js";
export type { LabZoomShapeId, LabStardustShapeId, LabForgePath, LabMarketPath } from "./forge-lab-economy.js";

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
  isLabStardustShapeId,
  isLabZoomShapeId,
} from "./forge-lab-economy.js";

export function resolveLabForgeShapeId(override: string | null | undefined): string {
  if (override && override.length > 0) return override;
  return FORGE_SPHERE_SHAPE_ID;
}

function isLabModelShape(shapeId: string): boolean {
  return isLabZoomShapeId(shapeId) || isLabStardustShapeId(shapeId);
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
