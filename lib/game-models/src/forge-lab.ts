/**
 * Lab forge public module.
 * Re-exports zero-dep economy first, then mesh/GLB helpers.
 * Single entry so Vite named imports always resolve on this file.
 */
export * from "./forge-lab-economy.js";

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
  LAB_STARDUST_POT_SHAPE_ID,
  isLabZoomShapeId,
} from "./forge-lab-economy.js";

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
