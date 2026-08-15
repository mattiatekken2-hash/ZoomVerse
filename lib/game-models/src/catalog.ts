import type { ModelCategory, ModelDefinition, ModelRarity } from "./types.js";
import { modelDisplayName, shapeForIndex } from "./meshes.js";

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

function generateModel(index: number): ModelDefinition {
  const rng = mulberry32(0x7a00_0000 + index * 9973);
  const shape = shapeForIndex(index);
  const category = shape.category;
  const rarity = category === "planet"
    ? pickRarity(() => Math.max(rng(), 0.55))
    : pickRarity(rng);

  const palette = PALETTES[index % PALETTES.length]!;
  const [primaryColor, accentColor] = palette;
  const [rateMin, rateMax] = RATE_RANGE[rarity];
  const rate = Math.round(rateMin + rng() * (rateMax - rateMin));
  const poolWeight = category === "planet"
    ? RARITY_WEIGHT[rarity] * 0.35
    : RARITY_WEIGHT[rarity];

  return {
    id: `MODEL_${String(index + 1).padStart(3, "0")}`,
    name: modelDisplayName(index),
    category,
    rarity,
    rate,
    poolWeight,
    hintPercent: 0,
    primaryColor,
    accentColor,
    shapeId: shape.id,
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
  shapeId: string;
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
    shapeId: def.shapeId,
    createdAt: stamp,
    isListedInMarket: false,
  };
}
