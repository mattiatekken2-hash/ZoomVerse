/**
 * Lab FUSE / EVO — local helpers (not game-models barrel).
 * Keep in sync with artifacts/zoom-master/src/utils/labEvoFuse.ts
 */
import {
  isLabForgeGeneratorPlanet,
  resolveLabShapeIdFromPlanet,
} from "@workspace/game-models";

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

export function evoTierFromPlanetRecord(rec: unknown): EvoTier {
  if (!rec || typeof rec !== "object") return 0;
  return readEvoTier(rec as { evoTier?: unknown });
}

function readFloat(planet: Record<string, unknown>): number {
  const n = typeof planet.float === "number" ? planet.float : Number(planet.float);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(1, n);
}

function asPlanetRows(planets: unknown): Record<string, unknown>[] {
  if (!Array.isArray(planets)) return [];
  return planets.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
}

function planetIdOf(planet: Record<string, unknown>): string {
  return String(planet.id ?? "");
}

function labShapeOf(planet: Record<string, unknown>): string | null {
  return resolveLabShapeIdFromPlanet({
    shapeId: typeof planet.shapeId === "string" ? planet.shapeId : null,
    displayName: typeof planet.displayName === "string" ? planet.displayName : null,
  });
}

function normalizeFuseIds(planetIds: string[]): string[] {
  return [...new Set(planetIds.map((id) => String(id || "").trim()).filter(Boolean))];
}

export type FuseApplyOk = {
  ok: true;
  planets: Record<string, unknown>[];
  keeperId: string;
  burnedIds: string[];
  fromTier: EvoTier;
  toTier: 1 | 2;
  shapeId: string;
};

export type FuseApplyFail = { ok: false; error: string };

/** True when a prior confirm/background fuse already burned this trio. */
export function findCompletedLabFuse(
  planets: unknown,
  planetIds: string[],
): { keeperId: string; toTier: 1 | 2; planets: Record<string, unknown>[] } | null {
  const ids = normalizeFuseIds(planetIds);
  if (ids.length !== FUSE_INPUT_COUNT) return null;
  const rows = asPlanetRows(planets);
  const idSet = new Set(ids);
  const present = ids.filter((id) => rows.some((p) => planetIdOf(p) === id));
  if (present.length === 1) {
    const keeperId = present[0]!;
    const keeper = rows.find((p) => planetIdOf(p) === keeperId);
    if (keeper) {
      const tier = readEvoTier(keeper);
      if (tier === 1 || tier === 2) return { keeperId, toTier: tier, planets: rows };
    }
  }
  for (const p of rows) {
    const keeperId = planetIdOf(p);
    if (!keeperId) continue;
    const tier = readEvoTier(p);
    if (tier !== 1 && tier !== 2) continue;
    const fused = new Set(readEvoFusedIds(p));
    if (fused.size === 0) continue;
    const hits = ids.filter((id) => fused.has(id) || id === keeperId);
    if (hits.length >= 2) return { keeperId, toTier: tier, planets: rows };
    const burnedHits = ids.filter((id) => fused.has(id));
    if (burnedHits.length >= 2 && idSet.has(keeperId)) {
      return { keeperId, toTier: tier, planets: rows };
    }
  }
  return null;
}

/**
 * Complete a FUSE trio from Lab models of the same shape + evo tier.
 * Prefers the requested IDs; if they are missing, uses `shapeId` to pick
 * three unlisted matches already on the server.
 */
export function pickLabFuseTrioIds(
  planets: unknown,
  planetIds: string[],
  shapeId?: string | null,
  fromTier?: EvoTier | null,
): string[] | null {
  const ids = normalizeFuseIds(planetIds);
  const rows = asPlanetRows(planets);
  const found = ids
    .map((id) => rows.find((p) => planetIdOf(p) === id))
    .filter((p): p is Record<string, unknown> => !!p);
  if (ids.length === FUSE_INPUT_COUNT && found.length === FUSE_INPUT_COUNT) return ids;
  const seed = found[0];
  const shape = (typeof shapeId === "string" && shapeId ? shapeId : null)
    || (seed ? labShapeOf(seed) : null);
  const tier: EvoTier = fromTier === 0 || fromTier === 1 || fromTier === 2
    ? fromTier
    : seed
      ? readEvoTier(seed)
      : 0;
  if (!shape || tier >= EVO_TIER_MAX) return null;
  const matches = rows.filter((p) => {
    if (p.isListedInMarket === true) return false;
    if (readEvoTier(p) !== tier) return false;
    return labShapeOf(p) === shape && !!planetIdOf(p);
  });
  if (matches.length < FUSE_INPUT_COUNT) return null;
  const preferred = ids.filter((id) => matches.some((p) => planetIdOf(p) === id));
  const rest = matches
    .map((p) => planetIdOf(p))
    .filter((id) => id && !preferred.includes(id));
  const trio = [...preferred, ...rest].slice(0, FUSE_INPUT_COUNT);
  return trio.length === FUSE_INPUT_COUNT ? trio : null;
}

/** Append-only: add the 3 FUSE inputs if those IDs are missing. Never deletes. */
export function mergeFuseInputModels(
  planets: unknown,
  models: unknown,
  shapeId?: string | null,
): Record<string, unknown>[] {
  const rows = asPlanetRows(planets);
  const seen = new Set(rows.map(planetIdOf).filter(Boolean));
  const next = [...rows];
  for (const raw of asPlanetRows(models)) {
    const id = planetIdOf(raw);
    if (!id || id.length > 128 || seen.has(id)) continue;
    if (raw.isListedInMarket === true) continue;
    const shape = labShapeOf(raw);
    if (!shape) continue;
    if (shapeId && shape !== shapeId) continue;
    if (!isLabForgeGeneratorPlanet({
      shapeId: shape,
      displayName: typeof raw.displayName === "string" ? raw.displayName : null,
    })) continue;
    const rate = typeof raw.rate === "number" ? raw.rate : Number(raw.rate);
    if (!Number.isFinite(rate) || rate < 0) continue;
    const name = typeof raw.name === "string" && raw.name.length >= 1 && raw.name.length <= 16
      ? raw.name
      : "BASIC";
    const tier = readEvoTier(raw);
    next.push({
      id,
      name,
      displayName: typeof raw.displayName === "string" ? raw.displayName.slice(0, 64) : undefined,
      shapeId: shape,
      rate,
      color: typeof raw.color === "string" ? raw.color : undefined,
      glowColor: typeof raw.glowColor === "string" ? raw.glowColor : undefined,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      float: readFloat(raw),
      farmDurationHours: typeof raw.farmDurationHours === "number" && raw.farmDurationHours > 0
        ? raw.farmDurationHours
        : 24,
      ...(tier === 1 || tier === 2 ? { evoTier: tier } : {}),
    });
    seen.add(id);
  }
  return next;
}

export function resolveLabFuseApply(
  planets: unknown,
  planetIds: string[],
  opts?: {
    shapeId?: string | null;
    fromTier?: EvoTier | null;
    models?: unknown;
  },
): FuseApplyOk | FuseApplyFail {
  let fused = applyLabFuseToPlanets(planets, planetIds);
  if (fused.ok) return fused;
  const picked = pickLabFuseTrioIds(planets, planetIds, opts?.shapeId, opts?.fromTier);
  if (picked) {
    fused = applyLabFuseToPlanets(planets, picked);
    if (fused.ok) return fused;
  }
  if (opts?.models != null) {
    const merged = mergeFuseInputModels(planets, opts.models, opts.shapeId);
    fused = applyLabFuseToPlanets(merged, planetIds);
    if (fused.ok) return fused;
    const pickedMerged = pickLabFuseTrioIds(merged, planetIds, opts.shapeId, opts.fromTier);
    if (pickedMerged) {
      fused = applyLabFuseToPlanets(merged, pickedMerged);
      if (fused.ok) return fused;
    }
  }
  return fused;
}

export function applyLabFuseToPlanets(
  planets: unknown,
  planetIds: string[],
): FuseApplyOk | FuseApplyFail {
  if (!Array.isArray(planets)) return { ok: false, error: "No models" };
  const unique = [...new Set(planetIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (unique.length !== FUSE_INPUT_COUNT) {
    return { ok: false, error: "FUSE needs 3 models" };
  }

  const rows = planets.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  const inputs = unique.map((id) => rows.find((p) => String(p.id ?? "") === id));
  if (inputs.some((p) => !p)) return { ok: false, error: "Model not found" };
  const trio = inputs as Record<string, unknown>[];

  for (const p of trio) {
    if (p.isListedInMarket === true) return { ok: false, error: "Delist before FUSE" };
    if (!isLabForgeGeneratorPlanet({
      shapeId: typeof p.shapeId === "string" ? p.shapeId : null,
      displayName: typeof p.displayName === "string" ? p.displayName : null,
    })) {
      return { ok: false, error: "FUSE is Lab models only" };
    }
  }

  const shapes = trio.map((p) => resolveLabShapeIdFromPlanet({
    shapeId: typeof p.shapeId === "string" ? p.shapeId : null,
    displayName: typeof p.displayName === "string" ? p.displayName : null,
  }));
  const shapeId = shapes[0];
  if (!shapeId || shapes.some((s) => s !== shapeId)) {
    return { ok: false, error: "Need 3 identical models" };
  }

  const tiers = trio.map((p) => readEvoTier(p));
  const fromTier = tiers[0]!;
  if (fromTier >= EVO_TIER_MAX) return { ok: false, error: "EVO II cannot fuse" };
  if (tiers.some((t) => t !== fromTier)) {
    return { ok: false, error: "Need 3 identical models" };
  }

  const toTier = (fromTier + 1) as 1 | 2;
  let keeper = trio[0]!;
  let bestFloat = readFloat(keeper);
  for (const p of trio) {
    const f = readFloat(p);
    if (f > bestFloat) {
      keeper = p;
      bestFloat = f;
    }
  }
  const keeperId = String(keeper.id ?? "");
  if (!keeperId) return { ok: false, error: "Model not found" };

  const burnedIds = trio
    .map((p) => String(p.id ?? ""))
    .filter((id) => id && id !== keeperId);
  const burnedSet = new Set(burnedIds);
  const prevFused = readEvoFusedIds(keeper);
  const evoFusedIds = [...new Set([...prevFused, ...burnedIds])];

  const next: Record<string, unknown>[] = [];
  for (const p of rows) {
    const id = String(p.id ?? "");
    if (burnedSet.has(id)) continue;
    if (id !== keeperId) {
      next.push(p);
      continue;
    }
    const { serverListingId: _sid, ...rest } = p;
    void _sid;
    next.push({
      ...rest,
      evoTier: toTier,
      evoFusedIds,
      float: bestFloat,
      isFarmingActive: false,
      isListedInMarket: false,
      marketPrice: null,
      pausedAt: 0,
      farmStartedAt: 0,
      lastCollectedAt: 0,
    });
  }

  return {
    ok: true,
    planets: next,
    keeperId,
    burnedIds,
    fromTier,
    toTier,
    shapeId,
  };
}
