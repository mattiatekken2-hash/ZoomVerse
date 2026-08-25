import { resumePlanetFarmAfterMarketPause } from "@workspace/game-models";

/** Persist burns / delists so a stale server snapshot cannot resurrect them. */

const PREFIX = "zoom-removed-planets-v1:";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface Tombstone {
  burned: Record<string, number>;
  delisted: Record<string, number>;
}

function empty(): Tombstone {
  return { burned: {}, delisted: {} };
}

function prune(map: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(map)) {
    if (now - at < MAX_AGE_MS) out[id] = at;
  }
  return out;
}

function read(telegramId: string): Tombstone {
  try {
    const raw = localStorage.getItem(PREFIX + telegramId);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Tombstone;
    const now = Date.now();
    return {
      burned: prune(parsed.burned || {}, now),
      delisted: prune(parsed.delisted || {}, now),
    };
  } catch {
    return empty();
  }
}

function write(telegramId: string, data: Tombstone) {
  try {
    localStorage.setItem(PREFIX + telegramId, JSON.stringify(data));
  } catch { /**/ }
}

export function markPlanetBurned(telegramId: string | null | undefined, planetId: string) {
  if (!telegramId || !planetId) return;
  const next = read(telegramId);
  next.burned[planetId] = Date.now();
  delete next.delisted[planetId];
  write(telegramId, next);
}

export function clearPlanetDelisted(telegramId: string | null | undefined, planetId: string) {
  if (!telegramId || !planetId) return;
  const next = read(telegramId);
  delete next.delisted[planetId];
  write(telegramId, next);
}

export function markPlanetDelisted(telegramId: string | null | undefined, planetId: string) {
  if (!telegramId || !planetId) return;
  const next = read(telegramId);
  next.delisted[planetId] = Date.now();
  write(telegramId, next);
}

export function isPlanetBurned(telegramId: string | null | undefined, planetId: string): boolean {
  if (!telegramId || !planetId) return false;
  return !!read(telegramId).burned[planetId];
}

export function isPlanetDelisted(telegramId: string | null | undefined, planetId: string): boolean {
  if (!telegramId || !planetId) return false;
  return !!read(telegramId).delisted[planetId];
}

export function applyRemovedPlanetTombstones<T extends {
  id: string;
  isListedInMarket?: boolean;
  serverListingId?: number;
  marketPrice?: number | null;
  farmStartedAt?: number;
  lastCollectedAt?: number;
  isFarmingActive?: boolean;
  pausedAt?: number;
  marketListedAt?: number;
  farmDurationHours?: number;
}>(
  telegramId: string | null | undefined,
  planets: T[],
): T[] {
  if (!telegramId) return planets;
  const stone = read(telegramId);
  return planets
    .filter((p) => !stone.burned[p.id])
    .map((p) => {
      if (!stone.delisted[p.id]) return p;
      const pausedAt = typeof p.pausedAt === "number" ? p.pausedAt : 0;
      const marketListedAt = typeof p.marketListedAt === "number" ? p.marketListedAt : 0;
      if (!p.isListedInMarket && pausedAt <= 0 && marketListedAt <= 0) {
        return {
          ...p,
          isListedInMarket: false,
          serverListingId: undefined,
          marketPrice: null,
        };
      }
      return resumePlanetFarmAfterMarketPause({
        ...p,
        isListedInMarket: true,
      }, Date.now());
    });
}
