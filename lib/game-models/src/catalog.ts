import type { ModelCategory, ModelDefinition, ModelRarity, ModelVoxel } from "./types.js";

/** Deterministic PRNG — same seed ⇒ same catalog on client & server. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: readonly (readonly [string, string])[] = [
  ["#e8e8e8", "#2a2a2a"],
  ["#f5c842", "#8b6914"],
  ["#4facfe", "#1a5a9e"],
  ["#e8734a", "#8b3a1f"],
  ["#7bed9f", "#2d6a4f"],
  ["#c471ed", "#5a2d82"],
  ["#ff6b6b", "#8b2020"],
  ["#ffd700", "#8b7500"],
  ["#00d2ff", "#006680"],
  ["#a29bfe", "#4a3f8b"],
];

const RARITY_WEIGHT: Record<ModelRarity, number> = {
  BASIC: 42,
  RARE: 26,
  EPIC: 16,
  MYTHIC: 9,
  GOLD: 5,
  LEGEND: 2,
};

const RATE_RANGE: Record<ModelRarity, readonly [number, number]> = {
  BASIC: [1, 4],
  RARE: [5, 14],
  EPIC: [18, 45],
  MYTHIC: [55, 95],
  GOLD: [110, 175],
  LEGEND: [200, 320],
};

const NAME_PARTS: Record<ModelCategory, readonly string[]> = {
  vehicle: ["Turbo", "Pixel", "Neo", "Retro", "Cosmic", "Shadow", "Blitz", "Nova"],
  animal: ["Cub", "Fox", "Panda", "Owl", "Wolf", "Frog", "Bear", "Cat"],
  food: ["Burger", "Taco", "Sushi", "Donut", "Pizza", "Cookie", "Mochi", "Ramen"],
  daily: ["Mug", "Lamp", "Chair", "Phone", "Key", "Clock", "Plant", "Bag"],
  character: ["Knight", "Pilot", "Bot", "Ninja", "Alien", "Hero", "Ghost", "Mage"],
  military: ["Tank", "Jet", "Rocket", "Drone", "Cannon", "Sub", "Missile", "Fort"],
  block: ["Brick", "Cube", "Stack", "Tower", "Gate", "Wall", "Pillar", "Arch"],
  gadget: ["Cam", "Radio", "Chip", "Lens", "Drive", "Pod", "Core", "Link"],
  planet: ["Orbit", "Nebula", "Comet", "Luna", "Terra", "Astra", "Void", "Sol"],
};

const NAME_SUFFIX: Record<ModelCategory, readonly string[]> = {
  vehicle: ["Rider", "GT", "X", "Mk2", "Pro", "Lite", "Max", "One"],
  animal: ["Pal", "Mini", "Prime", "Wild", "Zen", "Pop", "Byte", "Star"],
  food: ["Bite", "Pop", "Deluxe", "Fresh", "Plus", "Box", "Roll", "Bar"],
  daily: ["Home", "Desk", "Day", "Set", "Kit", "Pro", "Mini", "One"],
  character: ["Unit", "X", "Prime", "Ace", "Zero", "One", "Max", "Go"],
  military: ["Force", "Alpha", "Strike", "Guard", "Ops", "Core", "Max", "One"],
  block: ["Set", "Build", "Pack", "Core", "Max", "One", "Pro", "X"],
  gadget: ["Tech", "Link", "Hub", "Node", "Sync", "Wave", "Bit", "Go"],
  planet: ["Sphere", "World", "Core", "Ring", "Drift", "Glow", "Prime", "One"],
};

function pickRarity(rng: () => number): ModelRarity {
  const entries = Object.entries(RARITY_WEIGHT) as [ModelRarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return "BASIC";
}

function addBox(
  out: ModelVoxel[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
): void {
  for (let ix = 0; ix < w; ix++) {
    for (let iy = 0; iy < h; iy++) {
      for (let iz = 0; iz < d; iz++) {
        out.push({ x: x + ix, y: y + iy, z: z + iz, color });
      }
    }
  }
}

function buildVoxels(
  category: ModelCategory,
  variant: number,
  primary: string,
  accent: string,
): ModelVoxel[] {
  const v: ModelVoxel[] = [];
  const vmod = variant % 8;

  switch (category) {
    case "vehicle": {
      addBox(v, -2, 0, -1, 4, 1, 2, primary);
      addBox(v, -1, 1, -1, 2, 1, 2, accent);
      if (vmod % 2 === 0) addBox(v, -2, 0, -2, 1, 1, 1, accent);
      if (vmod % 2 === 0) addBox(v, 1, 0, -2, 1, 1, 1, accent);
      if (vmod % 2 === 1) addBox(v, -2, 0, 1, 1, 1, 1, accent);
      if (vmod % 2 === 1) addBox(v, 1, 0, 1, 1, 1, 1, accent);
      if (vmod >= 4) addBox(v, 2, 1, 0, 1, 1, 1, accent);
      break;
    }
    case "animal": {
      addBox(v, -1, 0, -1, 2, 1, 2, primary);
      addBox(v, -1, 1, -2, 2, 1, 1, accent);
      if (vmod % 2 === 0) addBox(v, -2, 0, 0, 1, 1, 1, primary);
      if (vmod % 2 === 1) addBox(v, 1, 0, 0, 1, 1, 1, primary);
      addBox(v, 0, 1, -2, 1, 1, 1, accent);
      if (vmod >= 3) addBox(v, -2, 1, -1, 1, 1, 1, accent);
      if (vmod >= 3) addBox(v, 1, 1, -1, 1, 1, 1, accent);
      break;
    }
    case "food": {
      addBox(v, -1, 0, -1, 2, 1, 2, primary);
      addBox(v, -1, 1, -1, 2, 1, 2, accent);
      if (vmod >= 2) addBox(v, 0, 2, 0, 1, 1, 1, accent);
      if (vmod >= 4) addBox(v, -1, 2, -1, 2, 1, 1, primary);
      break;
    }
    case "daily": {
      addBox(v, -1, 0, -1, 2, 2, 2, primary);
      addBox(v, 0, 2, 0, 1, 1, 1, accent);
      if (vmod % 2 === 0) addBox(v, -2, 1, 0, 1, 2, 1, accent);
      if (vmod % 2 === 1) addBox(v, 1, 1, 0, 1, 2, 1, accent);
      break;
    }
    case "character": {
      addBox(v, -1, 0, -1, 2, 2, 1, primary);
      addBox(v, -1, 2, -1, 2, 1, 1, accent);
      addBox(v, -1, 3, -1, 2, 1, 1, primary);
      if (vmod >= 3) addBox(v, -2, 1, 0, 1, 1, 1, accent);
      if (vmod >= 3) addBox(v, 1, 1, 0, 1, 1, 1, accent);
      break;
    }
    case "military": {
      addBox(v, -2, 0, -1, 4, 1, 2, primary);
      addBox(v, -1, 1, -1, 2, 1, 2, accent);
      addBox(v, 0, 2, 0, 1, 2, 1, accent);
      if (vmod >= 2) addBox(v, -2, 1, 1, 1, 1, 1, accent);
      if (vmod >= 4) addBox(v, 1, 1, 1, 1, 1, 1, accent);
      break;
    }
    case "block": {
      const h = 2 + (vmod % 3);
      addBox(v, -1, 0, -1, 2, h, 2, primary);
      addBox(v, -1, h, -1, 2, 1, 2, accent);
      if (vmod >= 5) addBox(v, 0, h + 1, 0, 1, 1, 1, accent);
      break;
    }
    case "gadget": {
      addBox(v, -1, 0, -1, 2, 1, 2, primary);
      addBox(v, -1, 1, 0, 2, 1, 1, accent);
      addBox(v, 0, 2, 0, 1, 1, 1, primary);
      if (vmod >= 3) addBox(v, -2, 0, 0, 1, 1, 1, accent);
      if (vmod >= 3) addBox(v, 1, 0, 0, 1, 1, 1, accent);
      break;
    }
    case "planet": {
      addBox(v, -2, -1, -2, 4, 4, 4, primary);
      addBox(v, -1, 1, -3, 2, 1, 1, accent);
      if (vmod >= 2) addBox(v, 2, 0, 0, 1, 1, 1, accent);
      if (vmod >= 4) addBox(v, -3, 0, 0, 1, 1, 1, accent);
      if (vmod >= 6) addBox(v, 0, 2, 2, 1, 1, 1, accent);
      break;
    }
  }

  return v;
}

function categoryForIndex(i: number): ModelCategory {
  const order: ModelCategory[] = [
    "vehicle", "animal", "food", "daily", "character",
    "military", "block", "gadget", "planet",
  ];
  return order[i % order.length]!;
}

function generateModel(index: number): ModelDefinition {
  const rng = mulberry32(0x7a00_0000 + index * 9973);
  const category = categoryForIndex(index);
  const rarity = category === "planet" && index % 20 !== 0
    ? pickRarity(() => Math.max(rng(), 0.55))
    : pickRarity(rng);

  const parts = NAME_PARTS[category];
  const suffixes = NAME_SUFFIX[category];
  const name = `${parts[index % parts.length]} ${suffixes[(index * 3) % suffixes.length]}`;

  const palette = PALETTES[index % PALETTES.length]!;
  const [primaryColor, accentColor] = palette;

  const [rateMin, rateMax] = RATE_RANGE[rarity];
  const rate = Math.round(rateMin + rng() * (rateMax - rateMin));

  const poolWeight = category === "planet"
    ? RARITY_WEIGHT[rarity] * 0.35
    : RARITY_WEIGHT[rarity];

  const voxels = buildVoxels(category, index, primaryColor, accentColor);

  return {
    id: `MODEL_${String(index + 1).padStart(3, "0")}`,
    name,
    category,
    rarity,
    rate,
    poolWeight,
    hintPercent: 0,
    primaryColor,
    accentColor,
    voxels,
  };
}

export function generateCatalog(count = 100): ModelDefinition[] {
  const models = Array.from({ length: count }, (_, i) => generateModel(i));
  const totalWeight = models.reduce((s, m) => s + m.poolWeight, 0);
  for (const m of models) {
    m.hintPercent = Math.round((m.poolWeight / totalWeight) * 10000) / 100;
  }
  return models;
}

export const MODEL_CATALOG: ModelDefinition[] = generateCatalog(100);

export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

export function rollModelDefinition(rng: () => number = Math.random): ModelDefinition {
  const total = MODEL_CATALOG.reduce((s, m) => s + m.poolWeight, 0);
  let roll = rng() * total;
  for (const model of MODEL_CATALOG) {
    roll -= model.poolWeight;
    if (roll <= 0) return model;
  }
  return MODEL_CATALOG[MODEL_CATALOG.length - 1]!;
}

export function makeModelInstance(
  def: ModelDefinition,
  rng: () => number = Math.random,
): {
  id: string;
  modelId: string;
  name: string;
  category: ModelCategory;
  rarity: ModelRarity;
  rate: number;
  float: number;
  primaryColor: string;
  accentColor: string;
  createdAt: number;
  isListedInMarket: boolean;
} {
  const stamp = Date.now();
  const rand = Math.floor(rng() * 1_000_000);
  return {
    id: `mdl_${stamp}_${rand}`,
    modelId: def.id,
    name: def.name,
    category: def.category,
    rarity: def.rarity,
    rate: def.rate,
    float: Math.round(rng() * 10000) / 100,
    primaryColor: def.primaryColor,
    accentColor: def.accentColor,
    createdAt: stamp,
    isListedInMarket: false,
  };
}
