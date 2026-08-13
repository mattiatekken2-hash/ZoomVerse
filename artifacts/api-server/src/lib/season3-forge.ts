/**
 * Season 3 — unified forge loot tables (server-authoritative).
 * 1★ attempt → planet OR item roll.
 */

export const UNIFIED_FORGE_COST = 1;

/** Share of attempts that roll the planet pool vs item pool. */
export const PLANET_POOL_WEIGHT = 0.55;

/** Planet rarities obtainable from unified forge (Lab craft pool). */
export const FORGE_PLANET_WEIGHTS: Array<{ type: string; chance: number }> = [
  { type: "BASIC", chance: 0.75 },
  { type: "RARE", chance: 0.18 },
  { type: "EPIC", chance: 0.035 },
  { type: "MYTHIC", chance: 0.018 },
  { type: "NOVA", chance: 0.012 },
  { type: "PLASMA", chance: 0.008 },
  { type: "MUSHROOM", chance: 0.004 },
  { type: "GOLD", chance: 0.002 },
  { type: "V1", chance: 0.001 },
];

export function rollForgePlanetType(): string {
  const r = Math.random();
  let cumulative = 0;
  for (const entry of FORGE_PLANET_WEIGHTS) {
    cumulative += entry.chance;
    if (r <= cumulative) return entry.type;
  }
  return "BASIC";
}
