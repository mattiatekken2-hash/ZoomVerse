import type { MaterialProfile, MeshPart } from "./meshes.js";

export interface VoxelCell {
  id: string;
  x: number;
  y: number;
  z: number;
  color: MeshPart["color"];
  metal?: number;
  rough?: number;
  profile?: MaterialProfile;
}

const MIN_FORGE_VOXELS = 96;
const MAX_FORGE_VOXELS = 280;
const TARGET_FORGE_VOXELS = 180;

function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function cellKey(x: number, y: number, z: number, step: number): string {
  return `${snap(x, step)}|${snap(y, step)}|${snap(z, step)}`;
}

function rotateLocal(lx: number, ly: number, lz: number, part: MeshPart): [number, number, number] {
  let x = lx;
  let y = ly;
  let z = lz;
  const rx = part.rx ?? 0;
  const ry = part.ry ?? 0;
  const rz = part.rz ?? 0;

  if (rx) {
    const c = Math.cos(-rx);
    const s = Math.sin(-rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }
  if (ry) {
    const c = Math.cos(-ry);
    const s = Math.sin(-ry);
    const nx = x * c - z * s;
    const nz = x * s + z * c;
    x = nx;
    z = nz;
  }
  if (rz) {
    const c = Math.cos(-rz);
    const s = Math.sin(-rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }
  return [x, y, z];
}

function isInsidePart(px: number, py: number, pz: number, part: MeshPart): boolean {
  const [lx, ly, lz] = rotateLocal(px - part.x, py - part.y, pz - part.z, part);

  switch (part.prim) {
    case "box":
      return Math.abs(lx) <= part.sx / 2 + 0.001
        && Math.abs(ly) <= part.sy / 2 + 0.001
        && Math.abs(lz) <= part.sz / 2 + 0.001;
    case "sphere": {
      const r = part.sx;
      return lx * lx + ly * ly + lz * lz <= r * r;
    }
    case "cyl": {
      const r = Math.max(part.sx, part.sz);
      return lx * lx + lz * lz <= r * r && Math.abs(ly) <= part.sy / 2;
    }
    case "cone": {
      const r = part.sx;
      const h = part.sy;
      if (ly < -h / 2 || ly > h / 2) return false;
      const t = (ly + h / 2) / h;
      const maxR = r * (1 - t);
      return lx * lx + lz * lz <= maxR * maxR;
    }
    case "capsule": {
      const r = part.sx;
      const halfLen = Math.max(0, part.sy - 2 * r) / 2;
      const cy = Math.max(-halfLen, Math.min(halfLen, ly));
      const dy = ly - cy;
      return lx * lx + dy * dy + lz * lz <= r * r;
    }
    case "torus": {
      const R = part.sx;
      const tube = part.sy;
      const dist = Math.sqrt(lx * lx + lz * lz);
      const qx = dist - R;
      return qx * qx + ly * ly <= tube * tube;
    }
    default:
      return false;
  }
}

function partBounds(parts: MeshPart[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const part of parts) {
    const pad = Math.max(part.sx, part.sy, part.sz) * 0.65;
    minX = Math.min(minX, part.x - pad);
    minY = Math.min(minY, part.y - pad);
    minZ = Math.min(minZ, part.z - pad);
    maxX = Math.max(maxX, part.x + pad);
    maxY = Math.max(maxY, part.y + pad);
    maxZ = Math.max(maxZ, part.z + pad);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function collectVoxels(parts: MeshPart[], step: number): VoxelCell[] {
  const map = new Map<string, VoxelCell>();
  const { minX, minY, minZ, maxX, maxY, maxZ } = partBounds(parts);

  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        for (const part of parts) {
          if (!isInsidePart(x, y, z, part)) continue;
          const key = cellKey(x, y, z, step);
          if (map.has(key)) break;
          map.set(key, {
            id: `v${map.size}`,
            x: snap(x, step),
            y: snap(y, step),
            z: snap(z, step),
            color: part.color,
            metal: part.metal,
            rough: part.rough,
            profile: part.profile,
          });
          break;
        }
      }
    }
  }

  const cells = Array.from(map.values());
  cells.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  return cells;
}

function trimVoxels(cells: VoxelCell[], max: number): VoxelCell[] {
  if (cells.length <= max) return cells;
  const out: VoxelCell[] = [];
  const stride = cells.length / max;
  for (let i = 0; i < max; i++) {
    out.push(cells[Math.min(cells.length - 1, Math.floor(i * stride))]!);
  }
  return out.map((v, i) => ({ ...v, id: `v${i}` }));
}

/** Procedural mesh → Minecraft-style voxel blueprint for the Lab forge. */
export function meshPartsToVoxels(parts: MeshPart[]): { voxels: VoxelCell[]; step: number } {
  if (parts.length === 0) return { voxels: [], step: FORGE_VOXEL_SIZE };

  let step = 0.11;
  let best = collectVoxels(parts, step);

  for (let i = 0; i < 10; i++) {
    const count = best.length;
    if (count >= MIN_FORGE_VOXELS && count <= MAX_FORGE_VOXELS) break;
    step *= count > MAX_FORGE_VOXELS ? 1.12 : 0.88;
    best = collectVoxels(parts, step);
  }

  if (best.length > MAX_FORGE_VOXELS) {
    best = trimVoxels(best, MAX_FORGE_VOXELS);
  } else if (best.length < MIN_FORGE_VOXELS && best.length > 0) {
    best = collectVoxels(parts, step * 0.82);
    if (best.length > MAX_FORGE_VOXELS) best = trimVoxels(best, MAX_FORGE_VOXELS);
  }

  if (best.length > TARGET_FORGE_VOXELS * 1.35) {
    best = trimVoxels(best, TARGET_FORGE_VOXELS);
  }

  return { voxels: best, step };
}

export const FORGE_VOXEL_SIZE = 0.11;

/** Clay grey used while assembling voxels in the Lab forge. */
export const FORGE_CLAY_HEX = "#b0b0b0";
export const FORGE_CLAY = 0xb0b0b0;

/** Multi-tone clay palette — white / light / mid / dark blocks while forging. */
export const FORGE_CLAY_TONES = [
  "#f4f4f4",
  "#d8d8d8",
  "#b0b0b0",
  "#8a8a8a",
  "#5e5e5e",
] as const;

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") return (seed * 2654435761) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable clay shade for a voxel index/id (Minecraft-style clay mix). */
export function forgeClayToneHex(seed: number | string): string {
  return FORGE_CLAY_TONES[hashSeed(seed) % FORGE_CLAY_TONES.length]!;
}

export function forgeClayToneColor(seed: number | string): number {
  return Number.parseInt(forgeClayToneHex(seed).slice(1), 16);
}

/** One tap = one block — goal always matches voxel blueprint length. */
export function getForgeTapGoal(parts: MeshPart[]): number {
  const { voxels } = meshPartsToVoxels(parts);
  return Math.max(1, voxels.length);
}

/** Single voxelize pass for goal + renderer (same blueprint everywhere). */
export function getForgeBlueprint(parts: MeshPart[]): { voxels: VoxelCell[]; step: number; goal: number } {
  const { voxels, step } = meshPartsToVoxels(parts);
  return { voxels, step, goal: Math.max(1, voxels.length) };
}
