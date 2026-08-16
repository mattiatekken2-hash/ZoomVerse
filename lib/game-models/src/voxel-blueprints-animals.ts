import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";
import { accentTone, primaryTone } from "./voxel-paint.js";

type BlockMap = Map<string, { x: number; y: number; z: number; c: string }>;
type BlueprintFn = (primary: string, accent: string) => VoxelCell[];

const STEP = FORGE_VOXEL_SIZE * 0.5;

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

/** Koala-template 2×2 eyes + white highlight. */
function animalEyes(m: BlockMap, y: number, z: number, span = 5) {
  box(m, -span, y, z, -span + 1, y + 1, z + 1, "k");
  box(m, span - 1, y, z, span, y + 1, z + 1, "k");
  set(m, -span + 1, y + 1, z + 1, "w");
  set(m, span - 1, y + 1, z + 1, "w");
}

function animalCheeks(m: BlockMap, y: number, z: number) {
  set(m, -6, y, z, "pl");
  set(m, 6, y, z, "pl");
  set(m, -6, y + 1, z - 1, "pd");
  set(m, 6, y + 1, z - 1, "pd");
}

/** Blocky head with rounded crown layers (koala template). */
function blockyHead(m: BlockMap, y0: number, y1: number, halfX: number, zBack: number, zFront: number) {
  boxTone(m, -halfX, y0, zBack, halfX, y1, zFront);
  for (let y = y1 + 1; y <= y1 + 2; y++) {
    const shrink = y1 + 3 - y;
    boxTone(m, -halfX + shrink, y, zBack + shrink, halfX - shrink, y, zFront - shrink);
  }
}

function dogBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();

  // Quadruped body — horizontal chest (not koala sit)
  boxTone(m, -5, 3, -3, 5, 7, 3);
  box(m, -3, 4, 3, 3, 6, 4, "w");

  // Head on shoulders
  boxTone(m, -5, 7, -2, 5, 12, 4);
  for (let y = 13; y <= 14; y++) {
    const s = 15 - y;
    boxTone(m, -5 + s, y, -2 + s, 5 - s, y, 4 - s);
  }

  // Snout sticks forward — dog signature (horizontal, not koala vertical nose)
  boxTone(m, -2, 8, 5, 2, 10, 9);
  box(m, -2, 8, 5, 2, 9, 6, "w");
  box(m, -1, 9, 9, 1, 10, 10, "k");

  // Pointy ears on top of head
  boxTone(m, -6, 12, -1, -4, 15, 1);
  boxTone(m, 4, 12, -1, 6, 15, 1);
  set(m, -5, 15, 0, "pd");
  set(m, 5, 15, 0, "pd");

  animalEyes(m, 10, 4);
  set(m, -6, 10, 3, "pl");
  set(m, 6, 10, 3, "pl");

  // Four legs
  boxTone(m, -5, 0, -2, -3, 3, 0);
  boxTone(m, 3, 0, -2, 5, 3, 0);
  boxTone(m, -5, 0, 1, -3, 3, 3);
  boxTone(m, 3, 0, 1, 5, 3, 3);
  box(m, -4, 0, -1, -3, 1, 0, "w");
  box(m, 3, 0, -1, 4, 1, 0, "w");
  box(m, -4, 0, 2, -3, 1, 3, "w");
  box(m, 3, 0, 2, 4, 1, 3, "w");

  // Wagging tail behind
  boxTone(m, 4, 5, -4, 6, 6, -3);
  boxTone(m, 5, 7, -5, 7, 11, -4, accentTone);
  set(m, 7, 11, -4, "a");

  return compile(m);
}

function catBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -3, 4, 6, 3);
  box(m, -3, 1, 2, 3, 5, 4, "w");
  blockyHead(m, 6, 12, 5, -3, 5);
  boxTone(m, -6, 12, -1, -4, 15, 1);
  boxTone(m, 4, 12, -1, 6, 15, 1);
  set(m, -5, 15, 0, "pl");
  set(m, 5, 15, 0, "pl");
  box(m, -1, 8, 6, 1, 9, 7, "a");
  set(m, 0, 9, 7, "k");
  animalEyes(m, 10, 5);
  animalCheeks(m, 9, 4);
  set(m, -4, 9, 6, "a");
  set(m, 4, 9, 6, "a");
  boxTone(m, -5, 0, -2, -4, 2, 1);
  boxTone(m, 4, 0, -2, 5, 2, 1);
  box(m, -4, 0, 2, -3, 1, 3, "w");
  box(m, 3, 0, 2, 4, 1, 3, "w");
  boxTone(m, 0, 5, -4, 1, 7, -3, accentTone);
  return compile(m);
}

function pigBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -6, 0, -5, 6, 8, 5);
  box(m, -4, 1, 3, 4, 6, 5, "w");
  blockyHead(m, 8, 13, 5, -2, 6);
  boxTone(m, -7, 11, -1, -5, 13, 2);
  boxTone(m, 5, 11, -1, 7, 13, 2);
  boxTone(m, -2, 9, 7, 2, 11, 10, accentTone);
  set(m, -1, 10, 11, "k");
  set(m, 1, 10, 11, "k");
  animalEyes(m, 11, 5);
  animalCheeks(m, 10, 4);
  for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]] as const) {
    boxTone(m, lx, 0, lz, lx + 1, 3, lz + 1);
    box(m, lx, 0, lz, lx + 1, 1, lz + 1, "w");
  }
  set(m, 0, 5, -6, "pd");
  set(m, 1, 6, -7, "pd");
  set(m, 2, 6, -6, "pd");
  return compile(m);
}

function dragonBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -5, 0, -3, 5, 7, 3);
  blockyHead(m, 7, 14, 5, -2, 6);
  boxTone(m, -2, 13, 7, 2, 15, 9, accentTone);
  set(m, -1, 14, 10, "k");
  set(m, 1, 14, 10, "k");
  animalEyes(m, 11, 5);
  animalCheeks(m, 10, 4);
  set(m, -2, 15, 7, "a");
  set(m, 2, 15, 7, "a");
  for (let i = 0; i < 4; i++) {
    boxTone(m, -7 - i, 8 + i, -1, -5 - i, 9 + i, 2, accentTone);
    boxTone(m, 5 + i, 8 + i, -1, 7 + i, 9 + i, 2, accentTone);
  }
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    boxTone(m, lx, 0, lz, lx + 1, 4, lz + 1);
    box(m, lx, 0, lz, lx + 1, 1, lz + 1, "w");
  }
  boxTone(m, -1, 5, -5, 1, 6, -4);
  return compile(m);
}

function lionBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -5, 0, -3, 5, 7, 3);
  blockyHead(m, 7, 13, 5, -2, 5);
  for (let y = 10; y <= 14; y++) {
    for (let x = -7; x <= 7; x++) {
      for (let z = -2; z <= 4; z++) {
        if (Math.abs(x) + Math.abs(z - 1) === 7 - (y - 10)) {
          set(m, x, y, z, accentTone(x, y, z));
        }
      }
    }
  }
  box(m, -2, 9, 6, 2, 11, 8, "w");
  set(m, 0, 10, 8, "k");
  animalEyes(m, 11, 5);
  animalCheeks(m, 10, 4);
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    boxTone(m, lx, 0, lz, lx + 1, 4, lz + 1);
  }
  boxTone(m, 3, 4, -4, 5, 5, -3, accentTone);
  return compile(m);
}

function ponyBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -2, 4, 7, 2);
  blockyHead(m, 7, 13, 4, 0, 5);
  box(m, -1, 13, 6, 1, 16, 6, "w");
  set(m, 0, 16, 6, "w");
  animalEyes(m, 10, 4);
  animalCheeks(m, 9, 3);
  boxTone(m, -2, 12, 5, 2, 14, 7, accentTone);
  for (let i = 0; i < 3; i++) {
    boxTone(m, -6 - i, 7 + i, 0, -4 - i, 8 + i, 2, accentTone);
    boxTone(m, 4 + i, 7 + i, 0, 6 + i, 8 + i, 2, accentTone);
  }
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    boxTone(m, lx, 0, lz, lx + 1, 4, lz + 1);
    box(m, lx, 0, lz, lx + 1, 1, lz + 1, "w");
  }
  return compile(m);
}

function bearBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -6, 0, -4, 6, 9, 4);
  box(m, -4, 1, 3, 4, 8, 5, "w");
  blockyHead(m, 9, 15, 6, -3, 5);
  boxTone(m, -8, 13, -1, -6, 16, 2);
  boxTone(m, 6, 13, -1, 8, 16, 2);
  box(m, -7, 14, 0, -6, 15, 2, "w");
  box(m, 6, 14, 0, 7, 15, 2, "w");
  box(m, -2, 10, 6, 2, 13, 8, "k");
  set(m, 0, 9, 7, "k");
  animalEyes(m, 12, 5);
  animalCheeks(m, 11, 4);
  boxTone(m, -8, 2, 0, -6, 7, 3);
  boxTone(m, 6, 2, 0, 8, 7, 3);
  box(m, -8, 1, 2, -6, 3, 5, "w");
  box(m, 6, 1, 2, 8, 3, 5, "w");
  box(m, -4, 0, 2, -2, 1, 5, "w");
  box(m, 2, 0, 2, 4, 1, 5, "w");
  return compile(m);
}

function penguinBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -3, 0, -2, 3, 7, 2, "k");
  box(m, -2, 1, 2, 2, 6, 4, "w");
  blockyHead(m, 7, 11, 4, -2, 4);
  box(m, -5, 8, -1, -3, 10, 1, "k");
  box(m, 3, 8, -1, 5, 10, 1, "k");
  box(m, -1, 8, 4, 1, 10, 5, "w");
  set(m, 0, 9, 5, "k");
  animalEyes(m, 9, 4);
  box(m, -1, 7, 5, 1, 9, 6, "#ff9800");
  box(m, -4, 1, 0, -3, 4, 1, "k");
  box(m, 3, 1, 0, 4, 4, 1, "k");
  box(m, -2, 0, 3, -1, 1, 5, "k");
  box(m, 1, 0, 3, 2, 1, 5, "k");
  return compile(m);
}

function rabbitBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -3, 4, 6, 3);
  box(m, -3, 1, 2, 3, 5, 4, "w");
  blockyHead(m, 6, 11, 4, -2, 4);
  boxTone(m, -3, 12, -1, -2, 19, 1);
  boxTone(m, 2, 12, -1, 3, 19, 1);
  box(m, -2, 13, 0, -1, 18, 1, "w");
  box(m, 2, 13, 0, 3, 18, 1, "w");
  box(m, -1, 8, 5, 1, 9, 6, "w");
  set(m, 0, 9, 6, "k");
  animalEyes(m, 9, 4);
  animalCheeks(m, 8, 3);
  box(m, -3, 0, 2, -2, 1, 4, "w");
  box(m, 2, 0, 2, 3, 1, 4, "w");
  boxTone(m, 0, 4, -4, 1, 5, -3, accentTone);
  return compile(m);
}

function foxBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -4, 4, 7, 3);
  box(m, -3, 1, 3, 3, 6, 4, "w");
  blockyHead(m, 7, 13, 5, -3, 5);
  boxTone(m, -6, 11, -1, -4, 14, 2);
  boxTone(m, 4, 11, -1, 6, 14, 2);
  set(m, -5, 14, 1, "pl");
  set(m, 5, 14, 1, "pl");
  box(m, -2, 8, 6, 2, 10, 8, "w");
  set(m, 0, 9, 8, "k");
  animalEyes(m, 11, 5);
  animalCheeks(m, 10, 4);
  box(m, -3, 0, 2, -2, 1, 4, "w");
  box(m, 2, 0, 2, 3, 1, 4, "w");
  for (let i = 0; i < 4; i++) {
    boxTone(m, 3 + i, 4 + i, -4 - i, 4 + i, 5 + i, -3 - i, accentTone);
  }
  set(m, 7, 8, -7, "a");
  return compile(m);
}

function tigerBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -5, 0, -3, 5, 7, 3);
  for (let y = 2; y <= 6; y++) {
    if (y % 2 === 0) box(m, -4, y, 3, 4, y, 3, "a");
  }
  box(m, -3, 1, 3, 3, 6, 4, "w");
  blockyHead(m, 7, 13, 5, -3, 5);
  boxTone(m, -6, 12, -1, -4, 15, 1);
  boxTone(m, 4, 12, -1, 6, 15, 1);
  box(m, -1, 8, 6, 1, 9, 7, "a");
  set(m, 0, 9, 7, "k");
  animalEyes(m, 11, 5);
  animalCheeks(m, 10, 4);
  box(m, -4, 0, 2, -3, 1, 3, "w");
  box(m, 3, 0, 2, 4, 1, 3, "w");
  boxTone(m, 0, 5, -4, 1, 7, -3, accentTone);
  return compile(m);
}

function eagleBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -3, 0, -2, 3, 5, 2);
  box(m, -2, 1, 2, 2, 4, 3, "w");
  blockyHead(m, 5, 9, 4, 0, 4);
  box(m, -1, 6, 4, 1, 7, 5, "#ff9800");
  set(m, 0, 7, 5, "k");
  animalEyes(m, 7, 3, 3);
  for (let i = 0; i < 5; i++) {
    boxTone(m, -8 - i, 3 + i, -1, -4 - i, 4 + i, 1, accentTone);
    boxTone(m, 4 + i, 3 + i, -1, 8 + i, 4 + i, 1, accentTone);
  }
  box(m, -2, 0, 3, -1, 2, 4, "k");
  box(m, 1, 0, 3, 2, 2, 4, "k");
  boxTone(m, 0, 4, -3, 1, 5, -2, accentTone);
  return compile(m);
}

function monkeyBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -3, 4, 7, 3);
  box(m, -3, 1, 2, 3, 6, 4, "w");
  blockyHead(m, 7, 12, 5, -2, 5);
  boxTone(m, -6, 11, -1, -4, 13, 2);
  boxTone(m, 4, 11, -1, 6, 13, 2);
  box(m, -5, 11, 0, -4, 12, 2, "w");
  box(m, 4, 11, 0, 5, 12, 2, "w");
  box(m, -2, 8, 6, 2, 11, 8, "k");
  set(m, 0, 8, 7, "k");
  animalEyes(m, 10, 5);
  animalCheeks(m, 9, 4);
  boxTone(m, -9, 3, 0, -7, 8, 3);
  boxTone(m, 7, 3, 0, 9, 8, 3);
  box(m, -9, 2, 2, -7, 4, 4, "w");
  box(m, 7, 2, 2, 9, 4, 4, "w");
  box(m, -3, 0, 2, -2, 1, 4, "w");
  box(m, 2, 0, 2, 3, 1, 4, "w");
  boxTone(m, 0, 5, -4, 1, 7, -3);
  return compile(m);
}

function pandaBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -5, 0, -4, 5, 8, 3, "w");
  box(m, -4, 1, 3, 4, 7, 5, "w");
  box(m, -6, 8, -4, 6, 15, 5, "w");
  for (let y = 16; y <= 17; y++) {
    const shrink = 18 - y;
    box(m, -6 + shrink, y, -4 + shrink, 6 - shrink, y, 5 - shrink, "w");
  }
  box(m, -9, 14, -2, -5, 19, 2, "k");
  box(m, 5, 14, -2, 9, 19, 2, "k");
  box(m, -2, 10, 6, 2, 14, 8, "k");
  set(m, -1, 14, 8, "k");
  set(m, 1, 14, 8, "k");
  set(m, 0, 9, 7, "k");
  box(m, -5, 12, 5, -4, 13, 6, "k");
  box(m, 4, 12, 5, 5, 13, 6, "k");
  set(m, -4, 13, 6, "w");
  set(m, 4, 13, 6, "w");
  box(m, -8, 2, -1, -6, 7, 3, "k");
  box(m, 6, 2, -1, 8, 7, 3, "k");
  box(m, -8, 1, 2, -6, 3, 5, "k");
  box(m, 6, 1, 2, 8, 3, 5, "k");
  box(m, -4, 0, 2, -2, 1, 5, "k");
  box(m, 2, 0, 2, 4, 1, 5, "k");
  box(m, -2, 0, -3, 2, 1, 1, "k");
  return compile(m);
}

function giraffeBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -2, 4, 6, 2);
  box(m, -3, 1, 2, 3, 5, 3, "w");
  boxTone(m, -2, 7, -1, 2, 17, 1);
  set(m, -1, 8, 2, "#795548");
  set(m, 1, 10, 2, "#795548");
  set(m, 0, 14, 2, "#795548");
  blockyHead(m, 18, 21, 4, 0, 4);
  boxTone(m, -1, 20, 5, 1, 22, 6, accentTone);
  set(m, -1, 22, 5, "a");
  set(m, 1, 22, 5, "a");
  animalEyes(m, 19, 4, 3);
  box(m, -1, 18, 5, 1, 19, 6, "w");
  set(m, 0, 18, 6, "k");
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    box(m, lx, 0, lz, lx + 1, 5, lz + 1, "k");
    box(m, lx, 0, lz, lx + 1, 1, lz + 1, "w");
  }
  return compile(m);
}

function zebraBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -5, 0, -3, 5, 7, 3, "w");
  for (let y = 1; y <= 7; y++) {
    if (y % 2 === 0) box(m, -5, y, -3, 5, y, 3, "k");
  }
  blockyHead(m, 7, 12, 5, -2, 5);
  box(m, -6, 10, -1, -4, 12, 2, "k");
  box(m, 4, 10, -1, 6, 12, 2, "k");
  for (let y = 8; y <= 12; y++) {
    if (y % 2 === 0) box(m, -5, y, 3, 5, y, 4, "k");
  }
  animalEyes(m, 10, 5);
  animalCheeks(m, 9, 4);
  box(m, -1, 8, 6, 1, 9, 7, "k");
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    box(m, lx, 0, lz, lx + 1, 4, lz + 1, "w");
    set(m, lx, 2, lz, "k");
  }
  box(m, -5, 9, -2, -4, 11, 2, "k");
  return compile(m);
}

function elephantBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -6, 0, -4, 6, 8, 4);
  box(m, -4, 1, 3, 4, 7, 5, "w");
  blockyHead(m, 8, 12, 6, -2, 5);
  boxTone(m, -8, 9, -2, -5, 12, 3);
  boxTone(m, 5, 9, -2, 8, 12, 3);
  animalEyes(m, 10, 5);
  animalCheeks(m, 9, 4);
  for (let i = 0; i < 5; i++) {
    boxTone(m, 7 + i, 4 - i, 2 + i, 9 + i, 6 - i, 4 + i);
  }
  set(m, 10, 3, 5, "k");
  set(m, 10, 4, 6, "k");
  boxTone(m, 2, 6, -5, 6, 10, -3, accentTone);
  set(m, 7, 8, -4, "w");
  set(m, 7, 8, 4, "w");
  for (const [lx, lz] of [[-4, -2], [4, -2], [-4, 2], [4, 2]] as const) {
    boxTone(m, lx, 0, lz, lx + 1, 4, lz + 1);
    box(m, lx, 0, lz, lx + 1, 1, lz + 1, "w");
  }
  return compile(m);
}

/** Animal blueprints following the koala collectible template. */
export const ANIMAL_BLUEPRINTS: Record<string, BlueprintFn> = {
  dog: dogBp,
  cat: catBp,
  pig: pigBp,
  dragon: dragonBp,
  lion: lionBp,
  pony: ponyBp,
  bear: bearBp,
  penguin: penguinBp,
  rabbit: rabbitBp,
  fox: foxBp,
  tiger: tigerBp,
  eagle: eagleBp,
  monkey: monkeyBp,
  panda: pandaBp,
  giraffe: giraffeBp,
  zebra: zebraBp,
  elephant: elephantBp,
};
