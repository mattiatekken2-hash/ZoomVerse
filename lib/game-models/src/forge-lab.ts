/**
 * Lab forge public module.
 * Explicit named re-exports (not `export *`) so Vite always sees
 * pickRandomLabZoomShapeId on this module graph node.
 */
export {
  LAB_PIZZA_SHAPE_ID,
  LAB_FLOWER_SHAPE_ID,
  LAB_DOLLAR_SHAPE_ID,
  LAB_CREEPER_SHAPE_ID,
  LAB_CHEST_SHAPE_ID,
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_ONIGIRI_SHAPE_ID,
  LAB_ISLAND_HOME_SHAPE_ID,
  LAB_STEVE_SHAPE_ID,
  LAB_CHICKEN_SHAPE_ID,
  LAB_ZOOM_SHAPE_IDS,
  LAB_STARDUST_SHAPE_IDS,
  LAB_ZOOM_FARM_RATE,
  LAB_STARDUST_FARM_RATE,
  LAB_ZOOM_DISPLAY_NAME,
  LAB_STARDUST_DISPLAY_NAME,
  LAB_ZOOM_COLORS,
  LAB_STARDUST_COLORS,
  LAB_MODEL_FORGE_GOAL,
  LAB_MODEL_FORGE_VOXEL_COUNT,
  LAB_STARDUST_FORGE_ZOOM_COST,
  LAB_ZOOM_FORGE_STARDUST_COST,
  NEW_PLAYER_ZOOM_GRANT,
  NEW_PLAYER_STARDUST_GRANT,
  LAB_PIZZA_FORGE_GOAL,
  isLabZoomShapeId,
  isLabStardustShapeId,
  resolveLabZoomShapeId,
  resolveLabStardustShapeId,
  normalizeLabForgeShapeId,
  labStardustDisplayNameFor,
  labMarketPathForShapeId,
  labMarketPathForPlanet,
  isLabForgeGeneratorPlanet,
  resolveLabShapeIdFromPlanet,
  labModelDisplayName,
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
  meshPartsToFullShapeVoxels,
  type VoxelCell,
} from "./voxelize.js";
import {
  FORGE_SPHERE_SHAPE_ID,
  getForgeSphereBlueprint,
} from "./voxel-sphere-blueprint.js";
import {
  isLabStardustShapeId,
  isLabZoomShapeId,
  resolveLabStardustShapeId,
} from "./forge-lab-economy.js";

export function resolveLabForgeShapeId(override: string | null | undefined): string {
  if (!override || override.length === 0) return FORGE_SPHERE_SHAPE_ID;
  const stardust = resolveLabStardustShapeId(override);
  if (stardust) return stardust;
  if (isLabZoomShapeId(override)) return override;
  return override;
}

function isLabModelShape(shapeId: string): boolean {
  return isLabZoomShapeId(shapeId) || isLabStardustShapeId(shapeId);
}

function voxelCloudRadius(voxels: VoxelCell[], step: number): number {
  let max = 4;
  const s = Math.max(step, 0.01);
  for (const v of voxels) {
    const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) / s;
    if (r > max) max = r;
  }
  return Math.max(3, Math.ceil(max));
}

export function getLabForgeShapeTapGoal(
  shapeId: string,
  primary = FORGE_CLAY_HEX,
  accent = "#888888",
): number {
  return getLabForgeShapeVoxels(shapeId, primary, accent).goal;
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
    const packed = meshPartsToFullShapeVoxels(parts);
    const goal = Math.max(1, packed.voxels.length);
    return {
      voxels: packed.voxels,
      step: packed.step,
      goal,
      radius: voxelCloudRadius(packed.voxels, packed.step),
    };
  }
  const bp = getForgeBlueprint(parts);
  return { voxels: bp.voxels, step: bp.step, goal: bp.goal, radius: voxelCloudRadius(bp.voxels, bp.step) };
}

export function labForgeShapeHasGlbReveal(shapeId: string | null | undefined): boolean {
  if (!shapeId || shapeId === FORGE_SPHERE_SHAPE_ID) return false;
  return !!getShapeGlbUrl(shapeId);
}
