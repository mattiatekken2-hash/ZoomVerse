import type { MeshPart } from "./meshes.js";
import type { VoxelCell } from "./voxelize.js";
import { FORGE_VOXEL_SIZE, meshPartsToVoxels } from "./voxelize.js";

type Color = MeshPart["color"];
type BlockMap = Map<string, { x: number; y: number; z: number; c: Color }>;
type BlueprintFn = (primary: string, accent: string) => VoxelCell[];

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

function disc(m: BlockMap, y: number, cx: number, cz: number, r: number, c: Color) {
  for (let x = -r; x <= r; x++) {
    for (let z = -r; z <= r; z++) {
      if (x * x + z * z <= r * r + 0.35) set(m, cx + x, y, cz + z, c);
    }
  }
}

function dome(m: BlockMap, y0: number, cx: number, cz: number, maxR: number, layers: number, c: Color) {
  for (let i = 0; i < layers; i++) {
    const r = Math.max(1, Math.round(maxR * (1 - i / Math.max(1, layers))));
    disc(m, y0 + i, cx, cz, r, c);
  }
}

/** Finer cubes for hand-tuned blueprints — more collectible detail per model. */
export const BLUEPRINT_VOXEL_STEP = FORGE_VOXEL_SIZE * 0.5;

function compile(m: BlockMap): VoxelCell[] {
  const step = BLUEPRINT_VOXEL_STEP;
  const raw = Array.from(m.values()).sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  return raw.map((b, i) => ({
    id: `v${i}`,
    x: b.x * step,
    y: b.y * step,
    z: b.z * step,
    color: b.c,
  }));
}

function legoFig(m: BlockMap, torso: Color, legs: Color, head: Color = "#f5d031") {
  box(m, -1, 0, -1, 0, 0, 1, "#1e1e1e");
  box(m, 1, 0, -1, 2, 0, 1, "#1e1e1e");
  box(m, -1, 1, -1, 0, 3, 0, legs);
  box(m, 1, 1, -1, 2, 3, 0, legs);
  box(m, -1, 4, -1, 2, 6, 1, torso);
  box(m, -3, 4, 0, -2, 6, 0, head);
  box(m, 3, 4, 0, 4, 6, 0, head);
  box(m, -1, 7, -1, 1, 9, 1, head);
  set(m, 0, 10, 0, head);
  set(m, -1, 8, 2, "#1a1a1a");
  set(m, 1, 8, 2, "#1a1a1a");
  set(m, 0, 7, 2, "#1a1a1a");
}

function burgerBp(_p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const bread = "#e8b050";
  const patty = "#5a3820";
  const lettuce = "#5cb85c";
  const cheese = "#ffd54f";
  const seed = a || "#fafafa";
  disc(m, 0, 0, 0, 4, bread);
  disc(m, 1, 0, 0, 4, bread);
  disc(m, 2, 0, 0, 4, patty);
  disc(m, 3, 0, 0, 3, cheese);
  set(m, -5, 3, 0, cheese);
  set(m, 5, 3, 0, cheese);
  disc(m, 4, 0, 0, 4, lettuce);
  set(m, -4, 4, 1, lettuce);
  set(m, 4, 4, -1, lettuce);
  disc(m, 5, 0, 0, 4, bread);
  dome(m, 6, 0, 0, 4, 3, bread);
  set(m, -1, 8, 2, seed);
  set(m, 1, 8, -1, seed);
  set(m, 0, 8, 3, seed);
  return compile(m);
}

function hotdogBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const bun = "#e8b050";
  const sausage = p || "#c45a28";
  box(m, -5, 0, -1, 5, 1, 1, bun);
  box(m, -4, 2, -1, 4, 2, 1, sausage);
  set(m, -6, 2, 0, sausage);
  set(m, 6, 2, 0, sausage);
  box(m, -5, 3, -1, 5, 4, 1, bun);
  dome(m, 5, 0, 0, 2, 2, bun);
  set(m, 0, 3, 2, a || "#ffeb3b");
  return compile(m);
}

function pizzaBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const crust = "#d4a056";
  const cheese = p || "#ffd54f";
  const pepper = a || "#e53935";
  for (let x = 0; x <= 6; x++) {
    for (let z = -3; z <= 3; z++) {
      if (z <= x - 1 && z >= -x + 4) {
        set(m, x, 0, z, crust);
        set(m, x, 1, z, cheese);
      }
    }
  }
  set(m, 3, 2, 0, pepper);
  set(m, 5, 2, -1, pepper);
  set(m, 4, 2, 2, pepper);
  set(m, 2, 2, 1, "#4caf50");
  return compile(m);
}

function carBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const body = p || "#e53935";
  const glass = "#263238";
  const chrome = "#f5f5f5";
  const tire = "#1a1a1a";
  const hub = "#bdbdbd";
  const taxiSign = a || "#ffd600";

  // Chassis
  box(m, -14, 2, -5, 14, 5, 5, body);
  // Hood (stepped)
  for (let i = 0; i < 4; i++) {
    box(m, 10 + i, 4 + i, -4, 12 + i, 5 + i, 4, body);
  }
  // Cabin + trunk
  box(m, -10, 6, -4, 6, 10, 4, body);
  box(m, -14, 5, -4, -10, 7, 4, body);
  // Glass
  box(m, -9, 7, -3, 5, 9, 3, glass);
  box(m, 6, 7, -3, 8, 9, 3, glass);
  // Headlights
  set(m, 15, 5, -2, chrome);
  set(m, 15, 5, 2, chrome);
  set(m, 14, 4, -3, "#fff9c4");
  set(m, 14, 4, 3, "#fff9c4");
  // Taillights + plate
  set(m, -15, 5, -2, "#d32f2f");
  set(m, -15, 5, 2, "#d32f2f");
  box(m, -15, 3, -1, -15, 4, 1, "#fafafa");
  // Side mirrors
  set(m, 7, 8, -6, body);
  set(m, 7, 8, 6, body);
  set(m, 7, 8, -7, "#1a1a1a");
  set(m, 7, 8, 7, "#1a1a1a");
  // Taxi sign on roof
  box(m, -2, 11, -2, 2, 12, 2, taxiSign);
  box(m, -1, 12, -1, 1, 13, 1, "#1a1a1a");
  // Wheels + hubs
  for (const [wx, wz] of [[10, -6], [10, 6], [-10, -6], [-10, 6]] as const) {
    box(m, wx, 0, wz - 2, wx + 1, 1, wz + 2, tire);
    set(m, wx, 1, wz, hub);
  }
  return compile(m);
}

function koalaBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const grey = p || "#78909c";
  const dark = a || "#546e7a";
  const belly = "#eceff1";
  box(m, -5, 0, -4, 5, 8, 4, grey);
  box(m, -3, 1, 2, 3, 6, 5, belly);
  box(m, -5, 8, -3, 5, 14, 5, grey);
  box(m, -8, 12, -1, -5, 16, 3, dark);
  box(m, 5, 12, -1, 8, 16, 3, dark);
  set(m, -2, 11, 6, "#1a1a1a");
  set(m, 2, 11, 6, "#1a1a1a");
  box(m, -2, 9, 6, 2, 11, 7, "#1a1a1a");
  box(m, -8, 2, 0, -6, 6, 2, grey);
  box(m, 6, 2, 0, 8, 6, 2, grey);
  return compile(m);
}

function pigBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const pink = p || "#f48fb1";
  const snout = a || "#f06292";
  box(m, -6, 0, -5, 6, 8, 5, pink);
  box(m, -3, 9, 2, 3, 12, 7, pink);
  box(m, -2, 9, 8, 2, 11, 10, snout);
  set(m, -1, 10, 11, "#1a1a1a");
  set(m, 1, 10, 11, "#1a1a1a");
  set(m, -3, 11, 7, "#1a1a1a");
  set(m, 3, 11, 7, "#1a1a1a");
  for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]] as const) {
    box(m, lx, 0, lz, lx + 1, 3, lz + 1, pink);
  }
  set(m, 0, 5, -6, pink);
  set(m, 1, 6, -7, pink);
  set(m, 2, 6, -6, pink);
  set(m, 4, 4, 0, "#8d6e63");
  return compile(m);
}

function dragonBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const purple = p || "#7b1fa2";
  const wing = a || "#ffd54f";
  const horn = "#ffeb3b";
  box(m, -5, 4, -3, 5, 8, 3, purple);
  box(m, -3, 9, 2, 3, 13, 6, purple);
  box(m, -4, 12, 5, 4, 15, 9, purple);
  set(m, -2, 16, 7, horn);
  set(m, 2, 16, 7, horn);
  set(m, -2, 13, 10, "#1a1a1a");
  set(m, 2, 13, 10, "#1a1a1a");
  for (let i = 0; i < 5; i++) {
    box(m, -8 - i, 8 + i, -2, -6 - i, 9 + i, 2, wing);
    box(m, 6 + i, 8 + i, -2, 8 + i, 9 + i, 2, wing);
  }
  box(m, -4, 0, -2, -2, 4, 0, purple);
  box(m, 2, 0, -2, 4, 4, 0, purple);
  box(m, -4, 0, 2, -2, 4, 4, purple);
  box(m, 2, 0, 2, 4, 4, 4, purple);
  set(m, -3, 0, 0, "#e1bee7");
  set(m, 3, 0, 0, "#e1bee7");
  box(m, -2, 5, -6, 2, 6, -4, purple);
  set(m, -1, 6, -8, purple);
  return compile(m);
}

function ponyBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const body = p || "#7b1fa2";
  const wing = a || "#b3e5fc";
  const mane = "#e1bee7";
  box(m, -4, 4, -2, 4, 8, 2, body);
  box(m, -3, 9, 1, 3, 13, 4, body);
  box(m, -2, 13, 3, 2, 15, 5, body);
  set(m, 0, 16, 4, mane);
  set(m, -2, 14, 6, "#1a1a1a");
  set(m, 2, 14, 6, "#1a1a1a");
  for (let i = 0; i < 4; i++) {
    box(m, -7 - i, 7 + i, 0, -5 - i, 8 + i, 2, wing);
    box(m, 5 + i, 7 + i, 0, 7 + i, 8 + i, 2, wing);
  }
  box(m, -3, 0, -1, -2, 4, 0, body);
  box(m, 2, 0, -1, 3, 4, 0, body);
  box(m, -3, 0, 2, -2, 4, 3, body);
  box(m, 2, 0, 2, 3, 4, 3, body);
  set(m, 0, 15, 5, "#ffffff");
  return compile(m);
}

function dogBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const fur = p || "#c68642";
  const dark = a || "#5a3820";
  box(m, -2, 1, -1, 2, 3, 2, fur);
  box(m, -1, 4, 2, 1, 6, 4, fur);
  set(m, 0, 5, 5, dark);
  set(m, -1, 6, 4, "#1a1a1a");
  set(m, 1, 6, 4, "#1a1a1a");
  box(m, -2, 0, -1, -2, 2, 0, fur);
  box(m, 2, 0, -1, 2, 2, 0, fur);
  box(m, -2, 0, 2, -2, 2, 3, fur);
  box(m, 2, 0, 2, 2, 2, 3, fur);
  set(m, 3, 2, 0, fur);
  set(m, 4, 2, 0, dark);
  return compile(m);
}

function catBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const fur = p || "#9e9e9e";
  const stripe = a || "#616161";
  box(m, -2, 1, -1, 2, 3, 2, fur);
  box(m, -1, 4, 1, 1, 6, 3, fur);
  set(m, -2, 7, 2, fur);
  set(m, 2, 7, 2, fur);
  set(m, -1, 6, 4, "#1a1a1a");
  set(m, 1, 6, 4, "#1a1a1a");
  set(m, 0, 5, 4, stripe);
  box(m, -2, 0, 0, -2, 2, 1, fur);
  box(m, 2, 0, 0, 2, 2, 1, fur);
  box(m, -2, 0, 2, -2, 2, 3, fur);
  box(m, 2, 0, 2, 2, 2, 3, fur);
  set(m, -3, 3, 3, fur);
  set(m, 3, 3, 3, fur);
  return compile(m);
}

function sodaCanBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const can = p || "#c62828";
  for (let y = 0; y <= 7; y++) disc(m, y, 0, 0, 2, can);
  box(m, -2, 2, 2, 2, 5, 2, a || "#ffffff");
  disc(m, 8, 0, 0, 2, "#c8d4e8");
  set(m, 0, 9, 1, "#888");
  return compile(m);
}

function houseBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  box(m, -3, 0, -3, 3, 4, 3, p || "#d7ccc8");
  box(m, -1, 1, 4, 1, 3, 4, a || "#5d4037");
  for (let i = 0; i <= 4; i++) {
    const w = 4 - i;
    box(m, -w, 5 + i, -w, w, 5 + i, w, a || "#b71c1c");
  }
  box(m, -2, 1, 4, 2, 2, 4, "#87ceeb");
  return compile(m);
}

function rocketBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  const body = p || "#eceff1";
  const fin = a || "#e53935";
  for (let y = 0; y <= 8; y++) disc(m, y, 0, 0, 2, body);
  dome(m, 9, 0, 0, 2, 3, a || "#e53935");
  box(m, -3, 1, 0, -2, 3, 0, fin);
  box(m, 2, 1, 0, 3, 3, 0, fin);
  box(m, 0, 1, -3, 0, 3, -2, fin);
  set(m, 0, 4, 2, "#87ceeb");
  disc(m, -1, 0, 0, 2, "#ff9800");
  set(m, 0, -2, 0, "#ffeb3b");
  return compile(m);
}

function minifigBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m, p || "#2b6cff", a || "#2b6cff");
  return compile(m);
}

function plumberBp(p: string, a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  legoFig(m, p || "#e23b3b", "#2b6cff");
  box(m, -1, 7, 2, 1, 7, 3, "#1a1a1a");
  set(m, 0, 10, 0, p || "#e23b3b");
  return compile(m);
}

function pokeballBp(_p: string, _a: string): VoxelCell[] {
  const m: BlockMap = new Map();
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        if (x * x + y * y + z * z <= 12) {
          const c = y > 0 ? "#f44336" : "#fafafa";
          set(m, x, y + 3, z, c);
        }
      }
    }
  }
  box(m, -3, 3, -3, 3, 3, 3, "#1a1a1a");
  disc(m, 4, 0, 0, 1, "#fafafa");
  return compile(m);
}

function fruitSphereBp(color: string, stem: string): BlueprintFn {
  return (_p, _a) => {
    const m: BlockMap = new Map();
    for (let y = 0; y <= 5; y++) {
      const r = Math.round(3 * Math.sin((y / 5) * Math.PI));
      if (r > 0) disc(m, y, 0, 0, r, color);
    }
    set(m, 0, 6, 0, stem);
    return compile(m);
  };
}

function legoWithHat(torso: Color, legs: Color, hatFn: (m: BlockMap) => void): BlueprintFn {
  return (p, a) => {
    const m: BlockMap = new Map();
    legoFig(m, p || torso, a || legs);
    hatFn(m);
    return compile(m);
  };
}

const BLUEPRINTS: Record<string, BlueprintFn> = {
  burger: burgerBp,
  hotdog: hotdogBp,
  pizza: pizzaBp,
  supercar: carBp,
  dog: dogBp,
  cat: catBp,
  minifig: minifigBp,
  plumber: plumberBp,
  house: houseBp,
  rocket: rocketBp,
  pokeball: pokeballBp,
  cola: sodaCanBp,
  fanta: (p, a) => sodaCanBp(p || "#ff9800", a),
  sprite: (p, a) => sodaCanBp(p || "#4caf50", a),
  energy_drink: (p, a) => sodaCanBp(p || "#212121", a || "#ffeb3b"),
  apple: fruitSphereBp("#e53935", "#5d4037"),
  orange: fruitSphereBp("#ff9800", "#33691e"),
  banana: (_p, _a) => {
    const m: BlockMap = new Map();
    for (let i = 0; i <= 7; i++) {
      box(m, i - 3, i, -1, i - 2, i + 1, 1, "#ffeb3b");
    }
    set(m, 4, 8, 0, "#5d4037");
    return compile(m);
  },
  donut: (p, a) => {
    const m: BlockMap = new Map();
    for (let y = 0; y <= 2; y++) {
      for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
          const d = x * x + z * z;
          if (d <= 12 && d >= 3) set(m, x, y, z, y === 2 ? (p || "#e91e63") : "#d4a056");
        }
      }
    }
    set(m, 0, 3, 2, a || "#ffffff");
    return compile(m);
  },
  mug: (p, a) => {
    const m: BlockMap = new Map();
    for (let y = 0; y <= 5; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          if (Math.abs(x) === 2 || Math.abs(z) === 2) set(m, x, y, z, p || "#795548");
        }
      }
    }
    box(m, 3, 2, -1, 4, 4, 1, p || "#795548");
    disc(m, 6, 0, 0, 2, a || "#4e342e");
    return compile(m);
  },
  lego_astronaut: legoWithHat("#f5f5f5", "#f5f5f5", (m) => {
    box(m, -2, 10, -2, 2, 11, 2, "#eceff1");
    set(m, 0, 10, 3, "#87ceeb");
  }),
  lego_pirate: legoWithHat("#5d4037", "#1a1a1a", (m) => {
    box(m, -2, 10, -1, 2, 10, 2, "#1a1a1a");
    set(m, -2, 11, 0, "#1a1a1a");
  }),
  lego_chef: legoWithHat("#ffffff", "#1a1a1a", (m) => {
    box(m, -2, 10, -2, 2, 12, 2, "#ffffff");
  }),
  lego_police: legoWithHat("#2b6cff", "#1a1a1a", (m) => {
    box(m, -2, 10, -2, 2, 10, 2, "#1a1a1a");
    set(m, 0, 11, 0, "#ffd700");
  }),
  lego_firefighter: legoWithHat("#e53935", "#1a1a1a", (m) => {
    box(m, -2, 10, -2, 2, 11, 2, "#e53935");
  }),
  lego_wizard: legoWithHat("#6a1b9a", "#4a148c", (m) => {
    box(m, -1, 10, -1, 1, 13, 1, "#6a1b9a");
    set(m, 0, 14, 0, "#ffd700");
  }),
  lego_builder: legoWithHat("#ff9800", "#5d4037", (m) => {
    box(m, -2, 10, -2, 2, 10, 2, "#ff9800");
  }),
  koala: koalaBp,
  pig: pigBp,
  dragon: dragonBp,
  pony: ponyBp,
  lion: dragonBp,
  panda: koalaBp,
  fox: dogBp,
  rabbit: dogBp,
  monkey: koalaBp,
  giraffe: ponyBp,
  zebra: ponyBp,
  tiger: catBp,
  eagle: dragonBp,
  penguin: (_p, _a) => {
    const m: BlockMap = new Map();
    box(m, -2, 0, -1, 2, 4, 2, "#1a1a1a");
    box(m, -1, 1, 1, 1, 3, 3, "#ffffff");
    box(m, -1, 5, -1, 1, 7, 2, "#1a1a1a");
    set(m, -1, 6, 3, "#ffffff");
    set(m, 1, 6, 3, "#ffffff");
    set(m, 0, 5, 3, "#ff9800");
    box(m, -3, 1, 0, -3, 2, 1, "#1a1a1a");
    box(m, 3, 1, 0, 3, 2, 1, "#1a1a1a");
    return compile(m);
  },
  tank: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -5, 1, -2, 5, 2, 2, p || "#558b2f");
    box(m, -2, 3, -1, 2, 4, 1, p || "#558b2f");
    box(m, 3, 3, 0, 7, 3, 0, a || "#33691e");
    for (const x of [-4, -2, 0, 2, 4]) box(m, x, 0, -2, x, 1, 2, "#1a1a1a");
    return compile(m);
  },
  guitar: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -1, 0, -3, 1, 1, 3, p || "#8d6e63");
    box(m, -2, 2, -2, 2, 5, 2, a || "#e53935");
    box(m, -1, 6, -1, 1, 10, 0, p || "#8d6e63");
    return compile(m);
  },
  crown: (_p, a) => {
    const m: BlockMap = new Map();
    disc(m, 0, 0, 0, 3, a || "#ffd700");
    for (const x of [-3, -1, 1, 3]) {
      box(m, x, 1, -1, x, 3, 1, a || "#ffd700");
      set(m, x, 4, 0, "#e53935");
    }
    return compile(m);
  },
  ninja: (p, a) => {
    const m: BlockMap = new Map();
    legoFig(m, p || "#1a1a1a", p || "#1a1a1a");
    box(m, -1, 7, 2, 1, 8, 3, a || "#1a1a1a");
    box(m, 4, 4, 0, 7, 4, 0, a || "#c8d4e8");
    return compile(m);
  },
  robot: (p, a) => {
    const m: BlockMap = new Map();
    legoFig(m, p || "#78909c", p || "#546e7a");
    box(m, -1, 7, 2, 1, 8, 3, a || "#37474f");
    set(m, -1, 8, 3, "#00ff88");
    set(m, 1, 8, 3, "#00ff88");
    set(m, 3, 9, 0, a || "#ffeb3b");
    return compile(m);
  },
  knight: (p, a) => {
    const m: BlockMap = new Map();
    legoFig(m, p || "#90a4ae", p || "#607d8b");
    box(m, -1, 7, 2, 1, 8, 3, "#1a1a1a");
    box(m, -4, 4, 1, -3, 7, 2, a || "#ffd700");
    box(m, 4, 4, 0, 6, 7, 0, a || "#c8d4e8");
    return compile(m);
  },
  motorcycle: (p, a) => {
    const m: BlockMap = new Map();
    for (const [x, z] of [[3, 0], [-3, 0]] as const) {
      box(m, x, 0, z - 1, x, 2, z + 1, "#1a1a1a");
    }
    box(m, -2, 2, -1, 2, 3, 1, p || "#37474f");
    box(m, 0, 4, 0, 1, 5, 0, a || "#e53935");
    box(m, 2, 5, 0, 4, 5, 0, "#888");
    set(m, 4, 4, 0, "#ffeb3b");
    return compile(m);
  },
  helicopter: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -2, 2, -1, 2, 4, 1, p || "#43a047");
    box(m, -6, 3, 0, 6, 3, 0, p || "#43a047");
    box(m, -7, 4, -1, 7, 4, 1, a || "#1a1a1a");
    box(m, -8, 3, 0, -8, 5, 0, p || "#43a047");
    set(m, 0, 5, 0, "#1a1a1a");
    return compile(m);
  },
  castle: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -4, 0, -4, 4, 5, 4, p || "#9e9e9e");
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
      box(m, x, 6, z, x, 8, z, a || "#616161");
    }
    box(m, -1, 1, 5, 1, 3, 5, "#5d4037");
    return compile(m);
  },
  skyscraper: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -2, 0, -2, 2, 10, 2, p || "#607d8b");
    box(m, -1, 2, 3, 1, 3, 3, "#87ceeb");
    box(m, -1, 5, 3, 1, 6, 3, "#87ceeb");
    set(m, 0, 11, 0, a || "#e53935");
    return compile(m);
  },
  taco: (p, a) => {
    const m: BlockMap = new Map();
    const shell = p || "#ffd54f";
    for (let x = -3; x <= 3; x++) {
      box(m, x, 0, -2, x, 1, 2, shell);
      box(m, x, 2, -1, x, 3, 1, a || "#5d4037");
    }
    set(m, 0, 4, 0, "#4caf50");
    return compile(m);
  },
  fries: (_p, _a) => {
    const m: BlockMap = new Map();
    box(m, -2, 0, -2, 2, 3, 2, "#e53935");
    for (const [x, z] of [[-1, -1], [0, 0], [1, 1], [-1, 1], [1, -1]] as const) {
      box(m, x, 4, z, x, 8, z, "#ffd54f");
    }
    return compile(m);
  },
  elephant: (p, _a) => {
    const m: BlockMap = new Map();
    box(m, -3, 2, -2, 3, 5, 3, p || "#9e9e9e");
    box(m, 4, 3, 0, 7, 4, 1, p || "#9e9e9e");
    box(m, -2, 0, -1, -2, 2, 0, p || "#9e9e9e");
    box(m, 2, 0, -1, 2, 2, 0, p || "#9e9e9e");
    box(m, -2, 0, 2, -2, 2, 3, p || "#9e9e9e");
    box(m, 2, 0, 2, 2, 2, 3, p || "#9e9e9e");
    return compile(m);
  },
  bear: (p, a) => {
    const m: BlockMap = new Map();
    box(m, -2, 1, -1, 2, 4, 2, p || "#6d4c41");
    box(m, -1, 5, 1, 1, 7, 3, p || "#6d4c41");
    set(m, -2, 7, 3, p || "#6d4c41");
    set(m, 2, 7, 3, p || "#6d4c41");
    set(m, 0, 6, 4, a || "#3e2723");
    box(m, -2, 0, 0, -2, 2, 1, p || "#6d4c41");
    box(m, 2, 0, 0, 2, 2, 1, p || "#6d4c41");
    return compile(m);
  },
  soccer_ball: (_p, _a) => {
    const m: BlockMap = new Map();
    for (let y = 0; y <= 5; y++) {
      const r = Math.round(3 * Math.sin((y / 5) * Math.PI));
      if (r > 0) disc(m, y, 0, 0, r, y % 2 === 0 ? "#fafafa" : "#1a1a1a");
    }
    return compile(m);
  },
};

/** Hand-tuned block blueprints for readable Lego-style models; falls back to auto-voxelize. */
export function resolveForgeVoxels(
  shapeId: string,
  parts: MeshPart[],
  primary: string,
  accent: string,
): { voxels: VoxelCell[]; step: number } {
  const bp = BLUEPRINTS[shapeId];
  if (bp) {
    return { voxels: bp(primary, accent), step: BLUEPRINT_VOXEL_STEP };
  }
  return meshPartsToVoxels(parts);
}

export function hasVoxelBlueprint(shapeId: string): boolean {
  return shapeId in BLUEPRINTS;
}

/** Tap goal from the same blueprint used by the forge renderer. */
export function getForgeTapGoalForShape(
  shapeId: string,
  parts: MeshPart[],
  primary: string,
  accent: string,
): number {
  const { voxels } = resolveForgeVoxels(shapeId, parts, primary, accent);
  return Math.max(1, voxels.length);
}
