export interface SphereVoxel {
  x: number;
  y: number;
  z: number;
  key: string;
  color: string;
}

const DUG_COLOR = "#141414";

function planetColor(x: number, y: number, z: number, radius: number): string {
  const ny = (y / radius + 1) * 0.5;
  const nxz = Math.sqrt(x * x + z * z) / radius;
  if (ny > 0.78) return nxz > 0.55 ? "#eef6ff" : "#dceeff";
  if (ny > 0.58) return "#5cb85c";
  if (ny > 0.38) return "#3a7d44";
  if (ny > 0.18) return "#6b8e23";
  if (ny > 0.02) return "#5c4033";
  return "#3d2b1f";
}

/** Integer grid voxels inside a sphere — dig removes surface blocks. */
export function buildSphereVoxels(radius = 7): SphereVoxel[] {
  const r2 = radius * radius;
  const out: SphereVoxel[] = [];
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        if (x * x + y * y + z * z > r2) continue;
        out.push({
          x,
          y,
          z,
          key: `${x},${y},${z}`,
          color: planetColor(x, y, z, radius),
        });
      }
    }
  }
  return out;
}

export function dugVoxelColor(): string {
  return DUG_COLOR;
}

export const VOXEL_CUBE_SIZE = 0.42;
export const SPHERE_RADIUS = 10;
