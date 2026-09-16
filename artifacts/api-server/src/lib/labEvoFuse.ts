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
