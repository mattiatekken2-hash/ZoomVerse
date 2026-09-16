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

export function labMarketEvoClass(tier: number): string {
  if (tier === 2) return " lab-market-card--evo lab-market-card--evo2";
  if (tier === 1) return " lab-market-card--evo";
  return "";
}

/** Keep every farm model except the 2 FUSE inputs. Never replace the whole inventory. */
export function mergeLabFuseIntoPlanets<T extends { id: string; evoTier?: unknown; evoFusedIds?: unknown }>(
  prev: T[],
  nextPlanets: T[],
  burnedIds: string[],
): T[] {
  const burned = new Set(burnedIds.filter(Boolean));
  const keeper = nextPlanets.find((p) => readEvoFusedIds(p).some((id) => burned.has(id)))
    ?? nextPlanets.find((p) => !burned.has(p.id) && readEvoTier(p) >= 1);
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const p of prev) {
    if (burned.has(p.id)) continue;
    if (keeper && p.id === keeper.id) {
      merged.push({
        ...p,
        ...keeper,
        id: p.id,
      });
    } else {
      merged.push(p);
    }
    seen.add(p.id);
  }
  if (keeper && !seen.has(keeper.id) && !burned.has(keeper.id)) {
    merged.push(keeper);
    seen.add(keeper.id);
  }
  // Do not append other nextPlanets rows. Those can be another device's
  // inventory (PC localStorage / stale server snapshot) and would flash
  // extra models the moment Evo arrives.
  return applyLabEvoFuseTombstones(merged);
}

/** Keep the higher Lab Evo tier when a stale server row races a local FUSE. */
export function pinClientLabEvo<T extends { evoTier?: unknown; evoFusedIds?: unknown }>(
  merged: T,
  clientP: T | undefined,
): T {
  if (!clientP) return merged;
  const clientEvo = readEvoTier(clientP);
  const serverEvo = readEvoTier(merged);
  const evo = clientEvo > serverEvo ? clientEvo : serverEvo;
  if (evo !== 1 && evo !== 2) return merged;
  const fused = [...new Set([...readEvoFusedIds(merged), ...readEvoFusedIds(clientP)])];
  return {
    ...merged,
    evoTier: evo,
    ...(fused.length > 0 ? { evoFusedIds: fused } : {}),
  };
}

export function findCompletedLabFuse<T extends {
  id: string;
  evoTier?: unknown;
  evoFusedIds?: unknown;
}>(
  planets: T[],
  planetIds: string[],
): { keeperId: string; toTier: 1 | 2; planets: T[] } | null {
  const ids = [...new Set(planetIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length !== FUSE_INPUT_COUNT) return null;
  const idSet = new Set(ids);
  const present = ids.filter((id) => planets.some((p) => p.id === id));
  if (present.length === 1) {
    const keeperId = present[0]!;
    const keeper = planets.find((p) => p.id === keeperId);
    if (keeper) {
      const tier = readEvoTier(keeper);
      if (tier === 1 || tier === 2) return { keeperId, toTier: tier, planets };
    }
  }
  for (const p of planets) {
    const tier = readEvoTier(p);
    if (tier !== 1 && tier !== 2) continue;
    const fused = new Set(readEvoFusedIds(p));
    if (fused.size === 0) continue;
    const hits = ids.filter((id) => fused.has(id) || id === p.id);
    if (hits.length >= 2) return { keeperId: p.id, toTier: tier, planets };
    const burnedHits = ids.filter((id) => fused.has(id));
    if (burnedHits.length >= 2 && idSet.has(p.id)) {
      return { keeperId: p.id, toTier: tier, planets };
    }
  }
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
