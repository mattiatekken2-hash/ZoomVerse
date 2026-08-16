import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";

/** Lab forge + Farm 3D thumb shape id for Minecraft-style planet spheres. */
export const FORGE_SPHERE_SHAPE_ID = "forge-sphere";

/** Forge sphere — one tap places one voxel (~250 cubes at r=4). */
export const FORGE_SPHERE_RADIUS = 4;

const STEP = FORGE_VOXEL_SIZE;

function sphereBandColor(x: number, y: number, z: number, radius: number): MeshPartColor {
  const ny = (y / radius + 1) * 0.5;
  if (ny > 0.78) return "p";
  if (ny > 0.55) return "a";
  if (ny > 0.35) return "p";
  if (ny > 0.15) return "a";
  return "p";
}

type MeshPartColor = VoxelCell["color"];

/** Integer grid voxels inside a sphere — sorted core→surface so the last taps close the shell. */
export function buildForgeSphereVoxels(_primary: string, _accent: string): VoxelCell[] {
  void _primary;
  void _accent;
  const r = FORGE_SPHERE_RADIUS;
  const r2 = r * r;
  const cells: Array<{ x: number; y: number; z: number; dist: number }> = [];
  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        const d2 = x * x + y * y + z * z;
        if (d2 > r2) continue;
        cells.push({ x, y, z, dist: d2 });
      }
    }
  }
  cells.sort((a, b) => a.dist - b.dist);
  return cells.map((c, i) => ({
    id: `fs-${i}`,
    x: c.x * STEP,
    y: c.y * STEP,
    z: c.z * STEP,
    color: sphereBandColor(c.x, c.y, c.z, r),
  }));
}

export function getForgeSphereBlueprint(primary: string, accent: string): {
  voxels: VoxelCell[];
  step: number;
  goal: number;
} {
  const voxels = buildForgeSphereVoxels(primary, accent);
  return { voxels, step: STEP, goal: Math.max(1, voxels.length) };
}

export function forgeSphereTapGoal(): number {
  return getForgeSphereBlueprint("#888888", "#666666").goal;
}
