import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";

/** Lab forge + Farm 3D thumb shape id for Minecraft-style planet spheres. */
export const FORGE_SPHERE_SHAPE_ID = "forge-sphere";

/** Lab tap forge — one tap places one voxel (~250 cubes at r=4). */
export const FORGE_SPHERE_RADIUS = 4;

/** Farm/Market/Lab reveal — dense collectible sphere (~1400 cubes at r=7). */
export const FORGE_SPHERE_DISPLAY_RADIUS = 7;

/** RARE Farm thumb — ultra grid (~5700 cubes, mockup SERAPH density). */
export const FORGE_SPHERE_RARE_DISPLAY_RADIUS = 11;

const STEP = FORGE_VOXEL_SIZE;
const DISPLAY_STEP = FORGE_VOXEL_SIZE * 0.78;
const RARE_DISPLAY_STEP = FORGE_VOXEL_SIZE * 0.58;

/** Key light direction for fake face shading on unlit thumbs. */
const LIGHT_X = 0.42;
const LIGHT_Y = 0.62;
const LIGHT_Z = 0.58;
const LIGHT_LEN = Math.sqrt(LIGHT_X * LIGHT_X + LIGHT_Y * LIGHT_Y + LIGHT_Z * LIGHT_Z);

export type ForgeSphereBand = "p" | "a" | "h";

function sphereBandColor(x: number, y: number, z: number, radius: number, rich: boolean): ForgeSphereBand {
  const dist = Math.sqrt(x * x + y * y + z * z);
  const ny = (y / radius + 1) * 0.5;
  const nxz = Math.sqrt(x * x + z * z) / Math.max(radius, 1);

  if (rich && dist > radius * 0.86 && ny > 0.32) return "h";
  if (ny > 0.78) return nxz > 0.48 ? "h" : "a";
  if (ny > 0.56) return "p";
  if (ny > 0.34) return "a";
  if (ny > 0.14) return "p";
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
  /** RARE Farm/Market — ~2× voxel count, smaller cubes (mockup density). */
  rarePremium?: boolean;
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
  const rarePremium = display && options?.rarePremium === true;
  const voxels = rarePremium
    ? buildSphereCells(FORGE_SPHERE_RARE_DISPLAY_RADIUS, RARE_DISPLAY_STEP, true)
    : display
      ? buildForgeSphereDisplayVoxels(primary, accent)
      : buildForgeSphereVoxels(primary, accent);
  const step = rarePremium ? RARE_DISPLAY_STEP : display ? DISPLAY_STEP : STEP;
  const radius = rarePremium
    ? FORGE_SPHERE_RARE_DISPLAY_RADIUS
    : display
      ? FORGE_SPHERE_DISPLAY_RADIUS
      : FORGE_SPHERE_RADIUS;
  return { voxels, step, goal: Math.max(1, buildForgeSphereVoxels(primary, accent).length), radius };
}

export function forgeSphereTapGoal(): number {
  return getForgeSphereBlueprint("#888888", "#666666").goal;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function faceLightFactor(ix: number, iy: number, iz: number, radius: number): number {
  const len = Math.sqrt(ix * ix + iy * iy + iz * iz) || 1;
  const nx = ix / len;
  const ny = iy / len;
  const nz = iz / len;
  const ndotl = (nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z) / LIGHT_LEN;
  return 0.42 + Math.max(0, ndotl) * 0.58;
}

/** Per-voxel color for Farm/Market/Lab reveal — rarity primary/accent + fake lighting + shell glow. */
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
  const baseHex = band === "p" ? primary : band === "a" ? accent : accent;
  const rgb = hexToRgb(baseHex);
  if (!rgb) return primary;

  let r = rgb.r;
  let g = rgb.g;
  let b = rgb.b;

  const accentRgb = hexToRgb(accent);
  if (accentRgb && band === "a") {
    r = r * 0.55 + accentRgb.r * 0.45;
    g = g * 0.55 + accentRgb.g * 0.45;
    b = b * 0.55 + accentRgb.b * 0.45;
  }

  if (accentRgb && (band === "h" || dist > 0.84)) {
    const t = band === "h" ? 0.52 : 0.34;
    r = r + (accentRgb.r - r) * t;
    g = g + (accentRgb.g - g) * t;
    b = b + (accentRgb.b - b) * t;
  }

  if (band === "h" || ny > 0.7) {
    r = r * 0.82 + 255 * 0.18;
    g = g * 0.82 + 255 * 0.18;
    b = b * 0.82 + 255 * 0.18;
  }

  if (dist > 0.8) {
    const shell = 1 + (dist - 0.8) * 1.05;
    r = Math.min(255, r * shell);
    g = Math.min(255, g * shell);
    b = Math.min(255, b * shell);
  }

  if (dist < 0.55) {
    const ao = 0.78 + dist * 0.4;
    r *= ao;
    g *= ao;
    b *= ao;
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  r *= light;
  g *= light;
  b *= light;

  const flick = 0.93 + ((ix * 3 + iy * 5 + iz * 7) & 7) * 0.011;
  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** RARE Farm/Market showcase — holographic cyan/blue energy (mockup-aligned). */
export function showcaseRareVoxelHex(
  band: MeshPartColor,
  primary: string,
  ix: number,
  iy: number,
  iz: number,
  radius: number,
): string {
  const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(radius, 1);
  const ny = (iy / radius + 1) * 0.5;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const flick = 0.86 + (hash % 29) * 0.008;

  const primaryRgb = hexToRgb(primary);
  if (!primaryRgb) return primary;

  // Mockup: deep blue body + electric cyan shell + rare white-hot sparks.
  let r: number;
  let g: number;
  let b: number;

  if (hash % 31 === 0 && dist > 0.88) {
    r = 130; g = 200; b = 255;
  } else if (hash % 5 === 0 || band === "h" || (ny > 0.7 && dist > 0.82)) {
    r = 88; g = 178; b = 255;
  } else if (hash % 3 === 0 || band === "a" || dist > 0.86) {
    r = primaryRgb.r;
    g = primaryRgb.g;
    b = primaryRgb.b;
  } else if (dist < 0.52) {
    r = 6; g = 38; b = 132;
  } else if (dist < 0.68 || hash < 130) {
    r = 12; g = 58; b = 158;
  } else {
    r = 28; g = 102; b = 198;
  }

  if (dist > 0.8) {
    const shell = 1.04 + (dist - 0.8) * 0.55;
    r = Math.min(255, r * shell);
    g = Math.min(255, g * shell);
    b = Math.min(255, b * shell);
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  const lit = 0.82 + Math.max(0, light - 0.42) * 0.38;
  r *= lit;
  g *= lit;
  b *= lit;

  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Fixed palette for mobile-safe InstancedMesh buckets (no instanceColor). */
export const RARE_SHOWCASE_PALETTE = [
  "#062868",
  "#0a4898",
  "#1868c8",
  "#3a9ef0",
  "#4facfe",
  "#64b8ff",
  "#7ec8ff",
  "#98d8ff",
] as const;

export function quantizeRareShowcaseHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return RARE_SHOWCASE_PALETTE[2];
  let best = RARE_SHOWCASE_PALETTE[2];
  let bestDist = Infinity;
  for (const candidate of RARE_SHOWCASE_PALETTE) {
    const c = hexToRgb(candidate);
    if (!c) continue;
    const d = (rgb.r - c.r) ** 2 + (rgb.g - c.g) ** 2 + (rgb.b - c.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}
