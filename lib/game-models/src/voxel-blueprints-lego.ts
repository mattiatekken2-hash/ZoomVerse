import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";
import { accentTone, primaryTone } from "./voxel-paint.js";

type BlockMap = Map<string, { x: number; y: number; z: number; c: string }>;
type BlueprintFn = (primary: string, accent: string) => VoxelCell[];

const STEP = FORGE_VOXEL_SIZE * 0.5;
const LEGO_YELLOW = "#f5d031";
const LEGO_BLACK = "#1e1e1e";

function bk(x: number, y: number, z: number) {
  return `${x}|${y}|${z}`;
}

function set(m: BlockMap, x: number, y: number, z: number, c: string) {
  m.set(bk(x, y, z), { x, y, z, c });
}

function box(m: BlockMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) set(m, x, y, z, c);
    }
  }
}

function boxTone(
  m: BlockMap,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  toneFn: (x: number, y: number, z: number) => string = primaryTone,
) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) set(m, x, y, z, toneFn(x, y, z));
    }
  }
}

function compile(m: BlockMap): VoxelCell[] {
  return Array.from(m.values())
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z)
    .map((b, i) => ({
      id: `v${i}`,
      x: b.x * STEP,
      y: b.y * STEP,
      z: b.z * STEP,
      color: b.c,
    }));
}

/** Classic LEGO minifig — yellow head/hands, torso/legs from rarity tokens. */
export function legoFig(m: BlockMap) {
  // Feet
  box(m, -2, 0, 0, -1, 0, 2, LEGO_BLACK);
  box(m, 1, 0, 0, 2, 0, 2, LEGO_BLACK);

  // Legs + hips (accent / rarity)
  boxTone(m, -2, 1, -1, -1, 5, 1, accentTone);
  boxTone(m, 1, 1, -1, 2, 5, 1, accentTone);
  boxTone(m, -2, 5, -1, 2, 5, 1, accentTone);

  // Torso (primary / rarity checkerboard)
  boxTone(m, -3, 6, -1, 3, 10, 2, primaryTone);

  // Clip arms + C-hands (classic LEGO yellow)
  box(m, -6, 7, -1, -3, 9, 1, LEGO_YELLOW);
  box(m, 3, 7, -1, 6, 9, 1, LEGO_YELLOW);
  box(m, -6, 6, 0, -5, 7, 1, LEGO_YELLOW);
  box(m, 5, 6, 0, 6, 7, 1, LEGO_YELLOW);

  // Neck
  box(m, -1, 10, -1, 1, 10, 1, LEGO_YELLOW);

  // Cylindrical head
  for (let y = 11; y <= 14; y++) {
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        if (x * x + z * z <= 5) set(m, x, y, z, LEGO_YELLOW);
      }
    }
  }

  // Top stud
  box(m, -1, 15, -1, 1, 15, 1, LEGO_YELLOW);
  set(m, 0, 16, 0, LEGO_YELLOW);

  // Face (front +z)
  set(m, -1, 13, 3, LEGO_BLACK);
  set(m, 1, 13, 3, LEGO_BLACK);
  box(m, -1, 12, 3, 1, 12, 3, LEGO_BLACK);
}

function minifigBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m);
  return compile(m);
}

function plumberBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m);
  box(m, -2, 15, -2, 2, 15, 2, "p");
  box(m, -3, 15, 1, 3, 15, 4, "p");
  box(m, -2, 12, 4, 2, 12, 4, LEGO_BLACK);
  box(m, -1, 7, 3, 1, 10, 3, "a");
  return compile(m);
}

function legoWithHat(hatFn: (m: BlockMap) => void): BlueprintFn {
  return (_p, _a) => {
    const m: BlockMap = new Map();
    legoFig(m);
    hatFn(m);
    return compile(m);
  };
}

function ninjaBp(_p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m);
  boxTone(m, -3, 6, -1, 3, 10, 2, primaryTone);
  box(m, -2, 11, 2, 2, 14, 4, "p");
  box(m, -1, 12, 4, 1, 13, 4, "w");
  set(m, -1, 13, 4, "w");
  set(m, 1, 13, 4, "w");
  box(m, 5, 7, 0, 8, 7, 0, "a");
  return compile(m);
}

function robotBp(_p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m);
  boxTone(m, -2, 11, -2, 2, 14, 2, accentTone);
  box(m, -2, 11, 2, 2, 14, 3, "a");
  set(m, -1, 13, 3, "#00ff88");
  set(m, 1, 13, 3, "#00ff88");
  set(m, 3, 10, 0, "a");
  set(m, 3, 11, 0, "a");
  set(m, 3, 12, 0, "a");
  return compile(m);
}

function knightBp(_p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m);
  box(m, -2, 11, 2, 2, 14, 4, "a");
  set(m, 0, 15, 0, "p");
  box(m, -5, 7, 1, -4, 10, 2, "a");
  box(m, 5, 7, 0, 7, 10, 0, "a");
  return compile(m);
}

export const LEGO_BLUEPRINTS: Record<string, BlueprintFn> = {
  minifig: minifigBp,
  plumber: plumberBp,
  ninja: ninjaBp,
  robot: robotBp,
  knight: knightBp,
  lego_astronaut: legoWithHat((m) => {
    for (let y = 11; y <= 14; y++) {
      for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
          if (x * x + z * z <= 11 && (Math.abs(x) === 3 || Math.abs(z) === 3 || y === 14)) {
            set(m, x, y, z, "w");
          }
        }
      }
    }
    box(m, -1, 12, 4, 1, 13, 5, "#87ceeb");
  }),
  lego_pirate: legoWithHat((m) => {
    box(m, -3, 15, -2, 3, 15, 2, "p");
    set(m, -2, 15, 3, "p");
    box(m, 1, 13, 3, 2, 13, 3, LEGO_BLACK);
  }),
  lego_chef: legoWithHat((m) => {
    box(m, -3, 15, -3, 3, 17, 3, "w");
    box(m, -2, 18, -2, 2, 18, 2, "w");
  }),
  lego_police: legoWithHat((m) => {
    box(m, -3, 15, -2, 3, 15, 2, LEGO_BLACK);
    box(m, -3, 15, 2, 3, 15, 4, LEGO_BLACK);
    set(m, 0, 16, 0, "#ffd700");
  }),
  lego_firefighter: legoWithHat((m) => {
    box(m, -3, 15, -3, 3, 16, 3, "p");
    box(m, -1, 16, 3, 1, 16, 4, "a");
  }),
  lego_wizard: legoWithHat((m) => {
    box(m, -2, 15, -2, 2, 18, 2, "p");
    set(m, 0, 19, 0, "#ffd700");
  }),
  lego_builder: legoWithHat((m) => {
    box(m, -3, 15, -2, 3, 15, 2, "#ffd700");
    box(m, -3, 15, 2, 3, 15, 4, "#ffd700");
  }),
};
