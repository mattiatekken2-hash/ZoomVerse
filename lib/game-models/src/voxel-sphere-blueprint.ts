import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";

/** Lab forge + Farm 3D thumb shape id for Minecraft-style planet spheres. */
export const FORGE_SPHERE_SHAPE_ID = "forge-sphere";

/** Lab tap forge — one tap places one voxel (~250 cubes at r=4). */
export const FORGE_SPHERE_RADIUS = 4;

/** Farm/Market/Lab reveal — dense collectible sphere (~1400 cubes at r=7). */
export const FORGE_SPHERE_DISPLAY_RADIUS = 7;

/** Premium Farm/Market thumb — ultra grid (~9200 cubes). */
export const FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS = 13;

/** @deprecated Use FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS */
export const FORGE_SPHERE_RARE_DISPLAY_RADIUS = FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS;

/** @deprecated Use FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS */
export const FORGE_SPHERE_BASIC_DISPLAY_RADIUS = FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS;

const STEP = FORGE_VOXEL_SIZE;
const DISPLAY_STEP = FORGE_VOXEL_SIZE * 0.78;
const PREMIUM_DISPLAY_STEP = FORGE_VOXEL_SIZE * 0.54;

/** @deprecated Use PREMIUM_DISPLAY_STEP */
const RARE_DISPLAY_STEP = PREMIUM_DISPLAY_STEP;

/** @deprecated Use PREMIUM_DISPLAY_STEP */
const BASIC_DISPLAY_STEP = PREMIUM_DISPLAY_STEP;

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
  /** Farm/Market premium thumb — dense sphere for all floatable rarities. */
  premiumDisplay?: boolean;
  /** @deprecated Use premiumDisplay */
  rarePremium?: boolean;
  /** @deprecated Use premiumDisplay */
  basicPremium?: boolean;
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
  const premiumDisplay = display && (
    options?.premiumDisplay === true
    || options?.rarePremium === true
    || options?.basicPremium === true
  );
  const voxels = premiumDisplay
    ? buildSphereCells(FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS, PREMIUM_DISPLAY_STEP, true)
    : display
      ? buildForgeSphereDisplayVoxels(primary, accent)
      : buildForgeSphereVoxels(primary, accent);
  const step = premiumDisplay ? PREMIUM_DISPLAY_STEP : display ? DISPLAY_STEP : STEP;
  const radius = premiumDisplay
    ? FORGE_SPHERE_PREMIUM_DISPLAY_RADIUS
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

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

/** CS:GO-style cosmetic float grading for voxel thumbs (matches PlanetOrb curves). */
export function applyVoxelFloatGrading(
  r: number,
  g: number,
  b: number,
  floatValue: number,
): { r: number; g: number; b: number } {
  const f = Math.max(0, Math.min(1, floatValue));
  const sat = 0.55 + 0.65 * f;
  const bright = 0.70 + 0.45 * f;
  const contrast = 0.88 + 0.22 * f;
  const grey = (r + g + b) / 3;
  let nr = grey + (r - grey) * sat;
  let ng = grey + (g - grey) * sat;
  let nb = grey + (b - grey) * sat;
  nr = (nr - 128) * contrast + 128;
  ng = (ng - 128) * contrast + 128;
  nb = (nb - 128) * contrast + 128;
  nr *= bright;
  ng *= bright;
  nb *= bright;
  if (f >= 1) {
    nr = nr * 0.92 + 255 * 0.08;
    ng = ng * 0.92 + 255 * 0.08;
    nb = nb * 0.92 + 255 * 0.08;
  }
  return { r: clampByte(nr), g: clampByte(ng), b: clampByte(nb) };
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Low-float battle scars — deterministic per planet + voxel grid cell. */
export function isBattleScarVoxel(
  planetId: string,
  ix: number,
  iy: number,
  iz: number,
  floatValue: number,
): boolean {
  if (floatValue >= 0.25) return false;
  const strength = (0.25 - floatValue) / 0.25;
  const hash = fnv1a(`${planetId}:${ix},${iy},${iz}`) & 255;
  return hash < strength * 90;
}

function mixToHex(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): string {
  const m = mixRgb(a, b, t);
  return rgbToHex(m.r, m.g, m.b);
}

export function buildShowcasePalette(primary: string, accent: string): string[] {
  const p = hexToRgb(primary);
  const a = hexToRgb(accent);
  if (!p || !a) return [...BASIC_SHOWCASE_PALETTE];
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  return [
    mixToHex(a, black, 0.62),
    mixToHex(a, black, 0.28),
    rgbToHex(a.r, a.g, a.b),
    mixToHex(a, p, 0.35),
    mixToHex(a, p, 0.65),
    rgbToHex(p.r, p.g, p.b),
    mixToHex(p, white, 0.14),
    mixToHex(p, white, 0.3),
  ];
}

export function quantizeToShowcasePalette(hex: string, palette: readonly string[]): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return palette[Math.floor(palette.length / 2)] ?? "#888888";
  let best: string = palette[Math.floor(palette.length / 2)] ?? "#888888";
  let bestDist = Infinity;
  for (const candidate of palette) {
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
  floatValue = 1,
): string {
  const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(radius, 1);
  const ny = (iy / radius + 1) * 0.5;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const flick = 0.86 + (hash % 29) * 0.008;
  const f = Math.max(0, Math.min(1, floatValue));
  const hotChance = f >= 1 ? 37 : f >= 0.8 ? 41 : f >= 0.5 ? 47 : 999;

  const primaryRgb = hexToRgb(primary);
  if (!primaryRgb) return primary;

  // Mockup: deep blue body + electric cyan shell + rare white-hot sparks.
  let r: number;
  let g: number;
  let b: number;

  if (hash % hotChance === 0 && dist > 0.86) {
    r = 90; g = 215; b = 255;
  } else if (hash % 5 === 0 || band === "h" || (ny > 0.72 && dist > 0.84)) {
    r = 64; g = 168; b = 255;
  } else if (hash % 3 === 0 || band === "a" || dist > 0.88) {
    r = primaryRgb.r;
    g = primaryRgb.g;
    b = primaryRgb.b;
  } else if (dist < 0.52) {
    r = 3; g = 24; b = 102;
  } else if (dist < 0.68 || hash < 130) {
    r = 8; g = 48; b = 138;
  } else {
    r = 22; g = 92; b = 190;
  }

  if (dist > 0.8) {
    const shell = 1.06 + (dist - 0.8) * 0.62;
    r = Math.min(255, r * shell);
    g = Math.min(255, g * shell);
    b = Math.min(255, b * shell);
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  const lit = 0.78 + Math.max(0, light - 0.42) * 0.48;
  r *= lit;
  g *= lit;
  b *= lit;

  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  const graded = applyVoxelFloatGrading(r, g, b, f);
  return rgbToHex(graded.r, graded.g, graded.b);
}

/** Fixed palette for mobile-safe InstancedMesh buckets (no instanceColor). */
export const RARE_SHOWCASE_PALETTE = [
  "#041e50",
  "#083878",
  "#1458b0",
  "#2d90e8",
  "#4facfe",
  "#50c0ff",
  "#70d0ff",
  "#90e0ff",
] as const;

export function quantizeRareShowcaseHex(hex: string): string {
  return quantizeToShowcasePalette(hex, RARE_SHOWCASE_PALETTE);
}

/** BASIC Farm/Market showcase — matte grey/metallic greeble (SOLIS mockup). */
export function showcaseBasicVoxelHex(
  band: MeshPartColor,
  primary: string,
  accent: string,
  ix: number,
  iy: number,
  iz: number,
  radius: number,
  floatValue = 1,
): string {
  const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(radius, 1);
  const ny = (iy / radius + 1) * 0.5;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const panelHash = (Math.floor(ix / 2) * 7 + Math.floor(iy / 2) * 13 + Math.floor(iz / 2) * 11) & 255;
  const flick = 0.9 + (hash % 23) * 0.007;

  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  if (!primaryRgb) return primary;

  let r: number;
  let g: number;
  let b: number;

  const recessed = dist > 0.78 && panelHash % 5 === 0;
  const protruding = dist > 0.78 && hash % 9 === 0;

  if (recessed) {
    r = accentRgb ? accentRgb.r * 0.72 : 58;
    g = accentRgb ? accentRgb.g * 0.72 : 72;
    b = accentRgb ? accentRgb.b * 0.72 : 88;
  } else if (protruding) {
    r = primaryRgb.r * 1.08 + 18;
    g = primaryRgb.g * 1.08 + 18;
    b = primaryRgb.b * 1.08 + 22;
  } else if (hash % 7 === 0 || band === "a") {
    r = accentRgb ? accentRgb.r : primaryRgb.r * 0.82;
    g = accentRgb ? accentRgb.g : primaryRgb.g * 0.82;
    b = accentRgb ? accentRgb.b : primaryRgb.b * 0.82;
  } else if (band === "h" || (ny > 0.68 && dist > 0.82)) {
    r = primaryRgb.r * 1.04 + 12;
    g = primaryRgb.g * 1.04 + 12;
    b = primaryRgb.b * 1.04 + 14;
  } else if (dist < 0.55) {
    r = primaryRgb.r * 0.48;
    g = primaryRgb.g * 0.48;
    b = primaryRgb.b * 0.48;
  } else if (dist < 0.72) {
    r = primaryRgb.r * 0.72;
    g = primaryRgb.g * 0.72;
    b = primaryRgb.b * 0.72;
  } else {
    r = primaryRgb.r;
    g = primaryRgb.g;
    b = primaryRgb.b;
  }

  if (dist > 0.84 && !recessed) {
    const shell = 0.96 + (dist - 0.84) * 0.35;
    r *= shell;
    g *= shell;
    b *= shell;
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  r *= light;
  g *= light;
  b *= light;

  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  const f = Math.max(0, Math.min(1, floatValue));
  const graded = applyVoxelFloatGrading(r, g, b, f);
  return rgbToHex(graded.r, graded.g, graded.b);
}

/** EPIC+ Farm/Market — rarity-tinted dense sphere with shell depth. */
export function showcasePremiumVoxelHex(
  band: MeshPartColor,
  primary: string,
  accent: string,
  ix: number,
  iy: number,
  iz: number,
  radius: number,
  floatValue = 1,
): string {
  const dist = Math.sqrt(ix * ix + iy * iy + iz * iz) / Math.max(radius, 1);
  const ny = (iy / radius + 1) * 0.5;
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const flick = 0.88 + (hash % 31) * 0.007;
  const f = Math.max(0, Math.min(1, floatValue));

  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  if (!primaryRgb) return primary;

  let r: number;
  let g: number;
  let b: number;

  if (f >= 1 && hash % 43 === 0 && dist > 0.86) {
    r = 255; g = 255; b = 255;
  } else if (band === "h" || (ny > 0.7 && dist > 0.84)) {
    r = primaryRgb.r * 1.06 + 16;
    g = primaryRgb.g * 1.06 + 16;
    b = primaryRgb.b * 1.06 + 16;
  } else if (hash % 4 === 0 || band === "a" || dist > 0.88) {
    r = accentRgb ? accentRgb.r : primaryRgb.r * 0.85;
    g = accentRgb ? accentRgb.g : primaryRgb.g * 0.85;
    b = accentRgb ? accentRgb.b : primaryRgb.b * 0.85;
  } else if (dist < 0.52) {
    r = (accentRgb?.r ?? primaryRgb.r) * 0.38;
    g = (accentRgb?.g ?? primaryRgb.g) * 0.38;
    b = (accentRgb?.b ?? primaryRgb.b) * 0.38;
  } else if (dist < 0.72) {
    r = primaryRgb.r * 0.68;
    g = primaryRgb.g * 0.68;
    b = primaryRgb.b * 0.68;
  } else {
    r = primaryRgb.r;
    g = primaryRgb.g;
    b = primaryRgb.b;
  }

  if (dist > 0.82) {
    const shell = 1 + (dist - 0.82) * (0.45 + f * 0.35);
    r = Math.min(255, r * shell);
    g = Math.min(255, g * shell);
    b = Math.min(255, b * shell);
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  r *= light;
  g *= light;
  b *= light;

  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  const graded = applyVoxelFloatGrading(r, g, b, f);
  return rgbToHex(graded.r, graded.g, graded.b);
}

export type ShowcaseRarityStyle = "BASIC" | "RARE" | "SUN" | "STANDARD";

export function getShowcaseRarityStyle(rarity: string): ShowcaseRarityStyle {
  const r = rarity.toUpperCase();
  if (r === "BASIC") return "BASIC";
  if (r === "RARE") return "RARE";
  if (r === "SUN") return "SUN";
  return "STANDARD";
}

export function getShowcaseVoxelHex(
  rarity: string,
  band: MeshPartColor,
  primary: string,
  accent: string,
  ix: number,
  iy: number,
  iz: number,
  radius: number,
  floatValue = 1,
): string {
  const style = getShowcaseRarityStyle(rarity);
  if (style === "BASIC") {
    return showcaseBasicVoxelHex(band, primary, accent, ix, iy, iz, radius, floatValue);
  }
  if (style === "RARE") {
    return showcaseRareVoxelHex(band, primary, ix, iy, iz, radius, floatValue);
  }
  if (style === "SUN") {
    return showcaseSunVoxelHex(band, primary, accent, ix, iy, iz, radius);
  }
  return showcasePremiumVoxelHex(band, primary, accent, ix, iy, iz, radius, floatValue);
}

/** THE SUN — emissive yellow/orange corona (exclusive, always pristine). */
export function showcaseSunVoxelHex(
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
  const hash = (ix * 17 + iy * 31 + iz * 13) & 255;
  const flick = 0.88 + (hash % 27) * 0.008;

  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  if (!primaryRgb) return primary;

  let r: number;
  let g: number;
  let b: number;

  if (hash % 31 === 0 && dist > 0.86) {
    r = 255; g = 250; b = 210;
  } else if (hash % 5 === 0 || band === "h" || (ny > 0.72 && dist > 0.84)) {
    r = 255; g = 238; b = 88;
  } else if (hash % 3 === 0 || band === "a" || dist > 0.88) {
    r = primaryRgb.r;
    g = primaryRgb.g;
    b = primaryRgb.b;
  } else if (dist < 0.52) {
    r = accentRgb ? accentRgb.r * 0.82 : 180;
    g = accentRgb ? accentRgb.g * 0.82 : 50;
    b = accentRgb ? accentRgb.b * 0.82 : 0;
  } else if (dist < 0.68 || hash < 120) {
    r = accentRgb ? accentRgb.r : 239;
    g = accentRgb ? accentRgb.g : 108;
    b = accentRgb ? accentRgb.b : 0;
  } else {
    r = 251; g = 140; b = 0;
  }

  if (dist > 0.8) {
    const shell = 1.08 + (dist - 0.8) * 0.55;
    r = Math.min(255, r * shell);
    g = Math.min(255, g * shell);
    b = Math.min(255, b * shell);
  }

  const light = faceLightFactor(ix, iy, iz, radius);
  const lit = 0.82 + Math.max(0, light - 0.42) * 0.42;
  r *= lit;
  g *= lit;
  b *= lit;

  r = clampByte(r * flick);
  g = clampByte(g * flick);
  b = clampByte(b * flick);

  return rgbToHex(r, g, b);
}

/** Fixed palette for THE SUN InstancedMesh buckets. */
export const SUN_SHOWCASE_PALETTE = [
  "#8b2500",
  "#bf360c",
  "#e65100",
  "#ef6c00",
  "#fb8c00",
  "#ffa726",
  "#ffca28",
  "#fff176",
] as const;

export function quantizeSunShowcaseHex(hex: string): string {
  return quantizeToShowcasePalette(hex, SUN_SHOWCASE_PALETTE);
}

export function getShowcasePaletteForRarity(
  rarity: string,
  primary: string,
  accent: string,
): readonly string[] {
  const style = getShowcaseRarityStyle(rarity);
  if (style === "BASIC") return BASIC_SHOWCASE_PALETTE;
  if (style === "RARE") return RARE_SHOWCASE_PALETTE;
  if (style === "SUN") return SUN_SHOWCASE_PALETTE;
  return buildShowcasePalette(primary, accent);
}

/** Fixed palette for mobile-safe InstancedMesh buckets (no instanceColor). */
export const BASIC_SHOWCASE_PALETTE = [
  "#323840",
  "#424850",
  "#525860",
  "#5c6478",
  "#6a7288",
  "#788098",
  "#8892b0",
  "#98a4bc",
] as const;

export function quantizeBasicShowcaseHex(hex: string): string {
  return quantizeToShowcasePalette(hex, BASIC_SHOWCASE_PALETTE);
}
