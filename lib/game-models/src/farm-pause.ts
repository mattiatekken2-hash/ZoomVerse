/**
 * Market list pauses a model's farm cycle. Delist must resume that same
 * cycle: shift farmStartedAt / lastCollectedAt by the pause duration so
 * remaining time is preserved and the Farm card does not show REACTIVATE.
 */

/** Lab GLB farm models — fixed 24h cycle, no duration upgrades. */
export const LAB_GLB_FARM_HOURS = 24;

export type FarmCyclePauseFields = {
  farmStartedAt?: number | null;
  lastCollectedAt?: number | null;
  isFarmingActive?: boolean | null;
  isListedInMarket?: boolean | null;
  pausedAt?: number | null;
  marketListedAt?: number | null;
  farmDurationHours?: number | null;
  serverListingId?: number | null;
  marketPrice?: number | null;
  marketCurrency?: string | null;
};

function n(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function farmDurationMsForPlanet(_planet: FarmCyclePauseFields): number {
  return LAB_GLB_FARM_HOURS * 60 * 60 * 1000;
}

/**
 * Resume a planet that was paused by a market listing.
 *
 * `listingPauseStartMs` is a fallback from the listing row (createdAt /
 * lastActivatedAt) when planets_json lost pausedAt / marketListedAt.
 */
export function resumePlanetFarmAfterMarketPause<T extends FarmCyclePauseFields>(
  planet: T,
  nowMs: number,
  listingPauseStartMs = 0,
): T {
  const pausedAt = n(planet.pausedAt);
  const marketListedAt = n(planet.marketListedAt);
  const pauseStart =
    pausedAt > 0
      ? pausedAt
      : marketListedAt > 0
        ? marketListedAt
        : listingPauseStartMs > 0
          ? listingPauseStartMs
          : 0;

  const listed = planet.isListedInMarket === true;
  const farming = planet.isFarmingActive === true;

  // Already running off-market — do not shift timestamps again.
  if (!listed && farming && pausedAt <= 0) {
    return planet;
  }
  // Never listed / never paused: leave the row alone.
  if (!listed && pauseStart <= 0) {
    return planet;
  }

  const origFarm = n(planet.farmStartedAt);
  const origLast = n(planet.lastCollectedAt);
  const hadCycle = origFarm > 0 || origLast > 0;
  const pauseShift = hadCycle && pauseStart > 0 ? Math.max(0, nowMs - pauseStart) : 0;
  const newFarmStartedAt = hadCycle ? origFarm + pauseShift : origFarm;
  const newLastCollectedAt = origLast > 0 ? origLast + pauseShift : origLast;
  const durationMs = farmDurationMsForPlanet(planet);
  const start = Math.max(newFarmStartedAt, newLastCollectedAt);
  const remaining = start > 0 ? start + durationMs - nowMs : 0;
  const resumeFarm = hadCycle && remaining > 0;

  const next: T = {
    ...planet,
    isListedInMarket: false,
    isFarmingActive: resumeFarm,
    farmStartedAt: newFarmStartedAt,
    lastCollectedAt: newLastCollectedAt,
    pausedAt: 0,
    marketListedAt: undefined,
    serverListingId: undefined,
    marketPrice: null,
    marketCurrency: undefined,
  };
  return next;
}

export function listingPauseStartMs(
  listing: { lastActivatedAt?: Date | string | null; createdAt?: Date | string | null } | null | undefined,
): number {
  if (!listing) return 0;
  const raw = listing.lastActivatedAt ?? listing.createdAt;
  if (!raw) return 0;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : 0;
}
