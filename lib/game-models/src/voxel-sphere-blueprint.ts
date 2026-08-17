import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";

/** Lab forge + Farm 3D thumb shape id for Minecraft-style planet spheres. */
export const FORGE_SPHERE_SHAPE_ID = "forge-sphere";

/** Lab tap forge — one tap places one voxel (~250 cubes at r=4). */
export const FORGE_SPHERE_RADIUS = 4;

/** Farm/Market/Lab reveal — denser collectible sphere (~900 cubes at r=6). */
export const FORGE_SPHERE_DISPLAY_RADIUS = 6;

const STEP = FORGE_VOXEL_SIZE;
const DISPLAY_STEP = FORGE_VOXEL_SIZE * 0.82;

export type ForgeSphereBand = "p" | "a" | "h";

function sphereBandColor(x: number, y: number, z: number, radius: number, rich: boolean): ForgeSphereBand {
  const dist = Math.sqrt(x * x + y * y + z * z);
  const ny = (y / radius + 1) * 0.5;
  const nxz = Math.sqrt(x * x + z * z) / Math.max(radius, 1);

  if (rich && dist > radius * 0.84 && ny > 0.38) return "h";
  if (ny > 0.78) return nxz > 0.5 ? "h" : "a";
  if (ny > 0.55) return "p";
  if (ny > 0.35) return "a";
  if (ny > 0.15) return "p";
  return "a";
}

type MeshPartColor = VoxelCell["color"];

function buildSphereCells(radius: number, step: number, richBands: boolean): VoxelCell[] {
  const r2 = radius * radius;
  const cells: Array<{ x: number; y: number; z: number; dist: number }> = [];
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const d2 = x * x + y * y + z * z;
        if (d2 > r2) continue;
        cells.push({ x, y, z, dist: d2 });
      }
    }
  }
  cells.sort((a, b) => a.dist - b.dist);
  return cells.map((c, i) => ({
    id: `fs-${i}`,
    x: c.x * step,
    y: c.y * step,
    z: c.z * step,
    color: sphereBandColor(c.x, c.y, c.z, radius, richBands) as MeshPartColor,
  }));
}

/** Integer grid voxels inside a sphere — sorted core→surface so the last taps close the shell. */
export function buildForgeSphereVoxels(_primary: string, _accent: string): VoxelCell[] {
  void _primary;
  void _accent;
  return buildSphereCells(FORGE_SPHERE_RADIUS, STEP, false);
}

/** Denser painted sphere for Farm/Market/Lab reveal cards. */
export function buildForgeSphereDisplayVoxels(_primary: string, _accent: string): VoxelCell[] {
  void _primary;
  void _accent;
  return buildSphereCells(FORGE_SPHERE_DISPLAY_RADIUS, DISPLAY_STEP, true);
}

export interface ForgeSphereBlueprintOptions {
  /** Use the high-density collectible mesh (cards + reveal). */
  display?: boolean;
}

export function getForgeSphereBlueprint(
  primary: string,
  accent: string,
  options?: ForgeSphereBlueprintOptions,
): {
  voxels: VoxelCell[];
  step: number;
  goal: number;
  radius: number;
} {
  const display = options?.display === true;
  const voxels = display
    ? buildForgeSphereDisplayVoxels(primary, accent)
    : buildForgeSphereVoxels(primary, accent);
  const step = display ? DISPLAY_STEP : STEP;
  const radius = display ? FORGE_SPHERE_DISPLAY_RADIUS : FORGE_SPHERE_RADIUS;
  return { voxels, step, goal: Math.max(1, buildForgeSphereVoxels(primary, accent).length), radius };
}

export function forgeSphereTapGoal(): number {
  return getForgeSphereBlueprint("#888888", "#666666").goal;
}

/** Bright emissive-style hex for showcase InstancedMesh colors. */
export function showcaseVoxelHex(
  band: MeshPartColor,
  primary: string,
  accent: string,
  ix: number,
  iy: number,
  iz: number,
  radius: number,
): string {
  const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(radius, 1);
  const ny = (iy / radius + 1) * 0.5;
  const base = band === "p" ? primary : band === "a" ? accent : accent;
  const rgb = hexToRgb(base);
  if (!rgb) return primary;

  let r = rgb.r;
  let g = rgb.g;
  let b = rgb.b;

  const accentRgb = hexToRgb(accent);
  if (accentRgb && (band === "h" || dist > 0.82)) {
    const t = band === "h" ? 0.42 : 0.28;
    r = r + (accentRgb.r - r) * t;
    g = g + (accentRgb.g - g) * t;
    b = b + (accentRgb.b - b) * t;
  }

  if (band === "h" || ny > 0.72) {
    r = r * 0.88 + 255 * 0.12;
    g = g * 0.88 + 255 * 0.12;
    b = b * 0.88 + 255 * 0.12;
  }

  if (dist > 0.78) {
    const boost = 1 + (dist - 0.78) * 0.85;
    r = Math.min(255, r * boost);
    g = Math.min(255, g * boost);
    b = Math.min(255, b * boost);
  }

  // Unlit thumb path — push saturation/brightness so cubes read on mobile.
  r = Math.min(255, r * 1.12);
  g = Math.min(255, g * 1.12);
  b = Math.min(255, b * 1.12);

  const flick = 0.92 + ((ix * 3 + iy * 5 + iz * 7) & 7) * 0.012;
  r = Math.min(255, r * flick);
  g = Math.min(255, g * flick);
  b = Math.min(255, b * flick);

  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
