import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE } from "./voxelize.js";
import { accentTone, primaryTone } from "./voxel-paint.js";

type BlockMap = Map<string, { x: number; y: number; z: number; c: string }>;
type Color = string;
type BlueprintFn = (primary: string, accent: string) => VoxelCell[];

const STEP = FORGE_VOXEL_SIZE * 0.5;

function bk(x: number, y: number, z: number) {
  return `${x}|${y}|${z}`;
}

function set(m: BlockMap, x: number, y: number, z: number, c: Color) {
  m.set(bk(x, y, z), { x, y, z, c });
}

function box(m: BlockMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Color) {
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
  toneFn: (x: number, y: number, z: number) => Color = primaryTone,
) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) set(m, x, y, z, toneFn(x, y, z));
    }
  }
}

function disc(m: BlockMap, y: number, cx: number, cz: number, r: number, c: Color) {
  for (let x = -r; x <= r; x++) {
    for (let z = -r; z <= r; z++) {
      if (x * x + z * z <= r * r + 0.35) set(m, cx + x, y, cz + z, c);
    }
  }
}

function sphere(
  m: BlockMap,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  colorFn: (x: number, y: number, z: number) => Color,
) {
  const r2 = r * r + 0.35;
  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        if (x * x + y * y + z * z <= r2) {
          set(m, cx + x, cy + y, cz + z, colorFn(cx + x, cy + y, cz + z));
        }
      }
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

function appleBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const red = "#e53935";
  sphere(m, 0, 0, 0, 7, () => red);
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      if (x * x + z * z <= 5) set(m, x, 6, z, "#c62828");
    }
  }
  box(m, -1, 7, -1, 0, 9, 0, "#5d4037");
  set(m, 2, 8, 1, "#4caf50");
  return compile(m);
}

function orangeBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const orange = "#ff9800";
  sphere(m, 0, 0, 0, 7, (x, y, z) => ((x + y + z) % 3 === 0 ? "#f57c00" : orange));
  box(m, -1, 7, 0, 0, 8, 1, "#33691e");
  return compile(m);
}

function pearBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const green = "#8bc34a";
  sphere(m, 0, -1, 0, 6, () => green);
  sphere(m, 0, 5, 0, 4, () => "#9ccc65");
  box(m, 0, 8, 0, 0, 10, 0, "#5d4037");
  set(m, 1, 9, 1, "#4caf50");
  return compile(m);
}

function watermelonBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const R = 8;
  for (let x = -R; x <= R; x++) {
    for (let y = 0; y <= R; y++) {
      for (let z = -R; z <= R; z++) {
        if (x * x + y * y + z * z > R * R + 0.35) continue;
        if (y <= 1) {
          set(m, x, y, z, "#e53935");
          if ((x + z) % 4 === 0 && y === 1) set(m, x, y, z, "k");
        } else {
          const stripe = (x + z) % 3 === 0 ? "#2e7d32" : "#388e3c";
          set(m, x, y, z, stripe);
        }
      }
    }
  }
  return compile(m);
}

function strawberryBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const red = "#e53935";
  for (let y = 0; y <= 8; y++) {
    const r = Math.max(1, 6 - Math.floor(y / 2));
    disc(m, y, 0, 0, r, red);
    if (y % 2 === 0) {
      set(m, 2, y, 2, "#ffeb3b");
      set(m, -2, y, -1, "#ffeb3b");
    }
  }
  for (let x = -3; x <= 3; x++) {
    set(m, x, 9, 0, "#4caf50");
    if (Math.abs(x) <= 2) set(m, x, 10, 0, "#2e7d32");
  }
  return compile(m);
}

function wineBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -1, 0, -1, 1, 1, 1, "k");
  box(m, 0, 2, 0, 0, 10, 0, "k");
  for (let y = 3; y <= 8; y++) {
    const r = 4 - Math.floor((y - 3) / 2);
    if (r > 0) disc(m, y, 0, 0, r, "#b3e5fc");
  }
  disc(m, 2, 0, 0, 2, "k");
  return compile(m);
}

function lampBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  disc(m, 0, 0, 0, 3, "k");
  box(m, 0, 1, 0, 0, 9, 0, "#78909c");
  for (let i = 0; i <= 4; i++) {
    const r = 4 - i;
    disc(m, 10 + i, 0, 0, r, "#ffeb3b");
  }
  return compile(m);
}

function chairBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 4, -4, 4, 5, 4);
  boxTone(m, -4, 6, -4, 4, 10, -3);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    box(m, x, 0, z, x + 1, 4, z + 1, "k");
  }
  return compile(m);
}

function cameraBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 2, -2, 4, 6, 2);
  for (let x = -2; x <= 2; x++) {
    for (let y = -2; y <= 2; y++) {
      if (x * x + y * y <= 5) set(m, x, 4, 3 + Math.max(0, 2 - Math.abs(x)), "#263238");
    }
  }
  disc(m, 5, 0, 0, 2, "k");
  set(m, -3, 7, 1, "#ffeb3b");
  return compile(m);
}

function globeBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  sphere(m, 0, 6, 0, 7, (x, y, z) => {
    if (y < 0 && x * x + z * z > 16) return "#5d4037";
    return (x + z) % 4 === 0 ? "#42a5f5" : "#66bb6a";
  });
  box(m, -1, 0, -1, 1, 5, 1, "#78909c");
  disc(m, 0, 0, 0, 3, "k");
  return compile(m);
}

function jetBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -8, 3, -2, 10, 5, 2);
  boxTone(m, 8, 4, -1, 14, 5, 1);
  boxTone(m, -2, 6, -8, 2, 7, 8, accentTone);
  box(m, -6, 4, 0, -8, 5, 0, "k");
  set(m, 12, 5, 0, "k");
  box(m, -1, 7, -3, 1, 9, 3, "k");
  return compile(m);
}

function headphonesBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  for (let x = -7; x <= 7; x++) {
    const y = 8 - Math.round(Math.sqrt(Math.max(0, 49 - x * x)));
    set(m, x, y, 0, "k");
  }
  boxTone(m, -8, 2, -2, -5, 7, 2);
  boxTone(m, 5, 2, -2, 8, 7, 2);
  box(m, -7, 3, 0, -6, 6, 1, "w");
  box(m, 6, 3, 0, 7, 6, 1, "w");
  return compile(m);
}

function smartphoneBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -3, 0, -6, 3, 12, 6, "k");
  box(m, -2, 1, -5, 2, 11, 5, "#263238");
  boxTone(m, -2, 2, -4, 2, 9, 4);
  set(m, 0, 10, -5, "k");
  return compile(m);
}

function laptopBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -8, 0, -6, 8, 1, 6, "k");
  boxTone(m, -7, 1, -5, 7, 1, 5);
  for (let y = 2; y <= 10; y++) {
    box(m, -7, y, -6, 7, y, -5, "k");
    if (y <= 9) box(m, -6, y, -4, 6, y, 3, "#263238");
  }
  return compile(m);
}

function keyboardBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -9, 0, -4, 9, 2, 4, "k");
  for (let x = -8; x <= 8; x += 2) {
    for (let z = -3; z <= 3; z += 2) {
      set(m, x, 2, z, (x + z) % 4 === 0 ? "w" : "#bdbdbd");
    }
  }
  return compile(m);
}

function mouseBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  for (let y = 0; y <= 4; y++) {
    const r = 4 - Math.floor(y / 2);
    disc(m, y, 0, 0, r, "k");
  }
  box(m, 0, 3, 2, 0, 5, 3, "k");
  set(m, 0, 4, 3, primaryTone(0, 4, 3));
  return compile(m);
}

function monitorBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -8, 0, -2, 8, 1, 2, "k");
  box(m, -1, 1, -1, 1, 4, 1, "k");
  box(m, -9, 5, -6, 9, 14, 6, "k");
  boxTone(m, -8, 6, -5, 8, 13, 5);
  return compile(m);
}

function desktopPcBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -5, 0, -8, 5, 12, 8, "k");
  boxTone(m, -4, 1, -7, 4, 11, 7);
  set(m, 3, 8, 6, "#4caf50");
  box(m, 6, 2, -4, 8, 10, 4, "k");
  box(m, 7, 3, -3, 7, 9, 3, "#263238");
  return compile(m);
}

function gpuBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -6, 0, -2, 6, 3, 2, "k");
  boxTone(m, -5, 1, -1, 5, 2, 1);
  for (let x = -4; x <= 4; x += 2) set(m, x, 0, -3, "k");
  set(m, 0, 3, 0, accentTone(0, 3, 0));
  return compile(m);
}

function waterBottleBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  for (let y = 0; y <= 10; y++) disc(m, y, 0, 0, 3, "#4fc3f7");
  box(m, -1, 11, -1, 1, 13, 1, "#0288d1");
  box(m, -1, 13, -1, 1, 14, 1, "k");
  return compile(m);
}

function milkCartonBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -4, 0, -3, 4, 10, 3, "w");
  box(m, -3, 11, -2, 3, 12, 2, "w");
  set(m, -4, 11, 0, "w");
  set(m, 4, 11, 0, "w");
  box(m, -2, 4, 4, 2, 7, 4, "#1565c0");
  return compile(m);
}

function diamondBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  for (let y = 0; y <= 6; y++) {
    const r = Math.max(1, 5 - Math.abs(y - 3));
    disc(m, y, 0, 0, r, y >= 4 ? "#b3e5fc" : "#4fc3f7");
  }
  set(m, 0, 7, 0, "w");
  set(m, 0, -1, 0, "#0288d1");
  return compile(m);
}

function treasureChestBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -6, 0, -4, 6, 5, 4, "#6d4c41");
  box(m, -7, 5, -5, 7, 8, 5, "#5d4037");
  box(m, -1, 3, 5, 1, 5, 5, "#ffd700");
  set(m, 0, 6, 6, "#ffd700");
  box(m, -7, 2, 5, 7, 2, 5, "#ffd700");
  return compile(m);
}

function guitarBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -5, 0, -3, 5, 1, 3, "#8d6e63");
  boxTone(m, -4, 2, -4, 4, 7, 4, accentTone);
  box(m, -1, 8, -1, 1, 16, 0, "#6d4c41");
  box(m, -2, 16, -2, 2, 18, 2, "#5d4037");
  for (let y = 9; y <= 15; y++) set(m, 0, y, 1, "#bdbdbd");
  return compile(m);
}

function giraffeBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -4, 0, -2, 4, 6, 2);
  boxTone(m, -2, 7, -1, 2, 18, 1);
  boxTone(m, -3, 18, 0, 3, 21, 3);
  set(m, -1, 22, 2, "k");
  set(m, 1, 22, 2, "k");
  set(m, -2, 14, 2, "#795548");
  set(m, 3, 4, 2, "#795548");
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    box(m, lx, 0, lz, lx + 1, 5, lz + 1, "k");
  }
  return compile(m);
}

function zebraBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -5, 4, -2, 5, 8, 2, "w");
  for (let y = 4; y <= 8; y++) {
    if (y % 2 === 0) box(m, -5, y, 3, 5, y, 3, "k");
  }
  boxTone(m, -3, 9, 1, 3, 13, 4);
  set(m, -2, 13, 5, "k");
  set(m, 2, 13, 5, "k");
  for (const [lx, lz] of [[-3, -1], [3, -1], [-3, 1], [3, 1]] as const) {
    box(m, lx, 0, lz, lx + 1, 4, lz + 1, "w");
    set(m, lx, 2, lz, "k");
  }
  box(m, -4, 10, -2, -4, 12, 2, "k");
  return compile(m);
}

function elephantBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  boxTone(m, -6, 0, -4, 6, 8, 4);
  boxTone(m, 4, 4, -2, 8, 10, 3);
  for (let i = 0; i < 6; i++) {
    const x0 = 8 + i;
    const y0 = 2 - i;
    const z0 = 2 + i;
    for (let x = x0; x <= 9 + i; x++) {
      for (let y = y0; y <= 3 - i; y++) {
        for (let z = z0; z <= 3 + i; z++) {
          set(m, x, y, z, primaryTone(x, y, z));
        }
      }
    }
  }
  boxTone(m, 2, 6, -5, 6, 10, -3, accentTone);
  boxTone(m, 2, 6, 4, 6, 10, 6, accentTone);
  set(m, 7, 8, 4, "w");
  set(m, 7, 8, -3, "w");
  for (const [lx, lz] of [[-4, -2], [4, -2], [-4, 2], [4, 2]] as const) {
    box(m, lx, 0, lz, lx + 1, 4, lz + 1, "k");
  }
  return compile(m);
}

/** Blueprints for catalog shapes that previously fell back to auto-voxelize blobs. */
export const EXTENDED_BLUEPRINTS: Record<string, BlueprintFn> = {
  apple: appleBp,
  orange: orangeBp,
  pear: pearBp,
  watermelon: watermelonBp,
  strawberry: strawberryBp,
  wine: wineBp,
  lamp: lampBp,
  chair: chairBp,
  camera: cameraBp,
  globe: globeBp,
  jet: jetBp,
  headphones: headphonesBp,
  smartphone: smartphoneBp,
  laptop: laptopBp,
  keyboard: keyboardBp,
  mouse: mouseBp,
  monitor: monitorBp,
  desktop_pc: desktopPcBp,
  gpu: gpuBp,
  water_bottle: waterBottleBp,
  milk_carton: milkCartonBp,
  diamond: diamondBp,
  treasure_chest: treasureChestBp,
  guitar: guitarBp,
  giraffe: giraffeBp,
  zebra: zebraBp,
  elephant: elephantBp,
};
