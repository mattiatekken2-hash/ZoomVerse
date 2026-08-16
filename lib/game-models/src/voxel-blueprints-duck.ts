import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";
import { DUCK_VOXEL_BLOCKS } from "./duck-voxel-data.js";

const STEP = FORGE_VOXEL_SIZE * 0.5;

/** Voxel duck imported from voxel_duck.glb (273 blocks). */
export function duckBp(_primary: string, _accent: string): VoxelCell[] {
  return DUCK_VOXEL_BLOCKS.map((b, i) => ({
    id: `v${i}`,
    x: b[0] * STEP,
    y: b[1] * STEP,
    z: b[2] * STEP,
    color: b[3],
  }));
}
