/**
 * Lab FUSE / EVO — local helpers only.
 * Do not add named exports to forge-lab-economy / game-models (Vite 404).
 */

export const FUSE_INPUT_COUNT = 3;
export const FUSE_EVO_ZMC = 9000;
export const FUSE_EVO_II_ZMC = 37000;
export const EVO_TIER_MAX = 2;

export type EvoTier = 0 | 1 | 2;

export function readEvoTier(planet: { evoTier?: unknown } | null | undefined): EvoTier {
  const n = typeof planet?.evoTier === "number" ? planet.evoTier : Number(planet?.evoTier);
  if (n === 1 || n === 2) return n;
  return 0;
}

export function readEvoFusedIds(planet: { evoFusedIds?: unknown } | null | undefined): string[] {
  const raw = planet?.evoFusedIds;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string" || !v || v.length > 128 || seen.has(v)) continue;
    seen.add(v);
    ids.push(v);
  }
  return ids;
}

export function fusePriceZmc(fromTier: EvoTier): number | null {
  if (fromTier === 0) return FUSE_EVO_ZMC;
  if (fromTier === 1) return FUSE_EVO_II_ZMC;
  return null;
}

export function evoBadgeLabel(tier: number): "EVO" | "II" | null {
  if (tier === 1) return "EVO";
  if (tier === 2) return "II";
  return null;
}

export function applyLabEvoFuseTombstones<T extends { id: string; evoFusedIds?: unknown }>(
  planets: T[],
): T[] {
  const fused = new Set<string>();
  for (const p of planets) {
    for (const id of readEvoFusedIds(p)) fused.add(id);
  }
  if (fused.size === 0) return planets;
  return planets.filter((p) => !fused.has(p.id));
}

export function findFuseTrio<T extends {
  id: string;
  isListedInMarket?: boolean;
  evoTier?: unknown;
}>(
  planets: T[],
  selectedId: string,
  resolveShape: (planet: T) => string | null | undefined,
): T[] | null {
  const selected = planets.find((p) => p.id === selectedId);
  if (!selected || selected.isListedInMarket) return null;
  const shape = resolveShape(selected);
  if (!shape) return null;
  const tier = readEvoTier(selected);
  if (tier >= EVO_TIER_MAX) return null;
  const matches = planets.filter((p) => {
    if (p.isListedInMarket) return false;
    if (readEvoTier(p) !== tier) return false;
    return resolveShape(p) === shape;
  });
  if (!matches.some((p) => p.id === selectedId)) return null;
  if (matches.length < FUSE_INPUT_COUNT) return null;
  const others = matches.filter((p) => p.id !== selectedId);
  return [selected, others[0]!, others[1]!];
}
