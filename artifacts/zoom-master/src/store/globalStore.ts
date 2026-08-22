import { useEffect, useSyncExternalStore } from "react";
import {
  fetchLeaderboard,
  fetchGlobalPool,
  fetchProfile,
  fetchSeasonEpoch,
  fetchDailyStatus,
  fetchMarketListings,
  fetchMyMarketListings,
  fetchMarketSales,
  fetchTotalPool,
  type LeaderboardEntry,
  type UserProfile,
  type DailyStatus,
  type ServerMarketListing,
  type MarketSale,
  type TotalPool,
} from "../utils/api";

export interface GlobalCache {
  seasonEpoch: number | null;
  globalPool: number;
  leaderboard: LeaderboardEntry[];
  profile: UserProfile | null;
  daily: DailyStatus | null;
  marketListings: ServerMarketListing[];
  marketSales: MarketSale[];
  totalPool: TotalPool;
  initialized: boolean;
  lastFetch: number;
}

const initial: GlobalCache = {
  seasonEpoch: null,
  globalPool: 0,
  leaderboard: [],
  profile: null,
  daily: null,
  marketListings: [],
  marketSales: [],
  totalPool: { ton: 0, stars: 0, count: 0 },
  initialized: false,
  lastFetch: 0,
};

let state: GlobalCache = initial;
const listeners = new Set<() => void>();

function set(partial: Partial<GlobalCache>) {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function getSnapshot(): GlobalCache {
  return state;
}

export function useGlobalStore<T>(selector: (s: GlobalCache) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(initial));
}

let initStarted = false;
let currentTelegramId: string | null = null;
let intervals: ReturnType<typeof setInterval>[] = [];
let inflight = false;

const GLOBAL_INIT_TIMEOUT_MS = 8000;

async function refreshAll(telegramId: string | null) {
  if (inflight) return;
  inflight = true;
  try {
    const tasks: Promise<void>[] = [
      fetchSeasonEpoch().then((e) => {
        const fallback = new Date("2026-08-15T00:00:00.000Z").getTime();
        set({ seasonEpoch: e && e > 0 ? e : fallback });
      }).catch(() => {}),
      fetchLeaderboard().then((lb) => set({ leaderboard: lb })).catch(() => {}),
      fetchGlobalPool().then((p) => set({ globalPool: p })).catch(() => {}),
      fetchMarketListings().then((m) => {
        const mineIds = new Set(m.map((l) => l.id));
        const minePlanets = new Set(m.map((l) => l.planetId).filter(Boolean));
        const pending = state.marketListings.filter((l) => {
          if (mineIds.has(l.id)) return false;
          if (l.planetId && minePlanets.has(l.planetId)) return false;
          const t = l.lastActivatedAt ? new Date(l.lastActivatedAt).getTime() : 0;
          return Number.isFinite(t) && Date.now() - t < 180_000;
        });
        set({ marketListings: [...pending, ...m] });
      }).catch(() => {}),
      fetchTotalPool().then((tp) => set({ totalPool: tp })).catch(() => {}),
    ];
    if (telegramId) {
      tasks.push(fetchProfile(telegramId).then((p) => set({ profile: p })).catch(() => {}));
      tasks.push(fetchDailyStatus(telegramId).then((d) => { if (d) set({ daily: d }); }).catch(() => {}));
    }
    await Promise.race([
      Promise.all(tasks),
      new Promise<void>((resolve) => window.setTimeout(resolve, GLOBAL_INIT_TIMEOUT_MS)),
    ]);
    set({ initialized: true, lastFetch: Date.now() });
  } finally {
    inflight = false;
  }
}

async function refreshMarketSales() {
  try {
    const s = await fetchMarketSales();
    set({ marketSales: s });
  } catch { /**/ }
}

export function initGlobalStore(telegramId: string | null) {
  if (initStarted && currentTelegramId === telegramId) return;
  // If telegramId changed (e.g. login), tear down and re-init
  if (initStarted) {
    intervals.forEach(clearInterval);
    intervals = [];
  }
  initStarted = true;
  currentTelegramId = telegramId;

  // App can boot immediately; data hydrates in the background.
  set({ initialized: true, lastFetch: Date.now() });

  void refreshAll(telegramId);
  void refreshMarketSales();

  // Periodic refresh — gated on document visibility
  intervals.push(setInterval(() => {
    if (!document.hidden) void refreshAll(currentTelegramId);
  }, 15_000));

  intervals.push(setInterval(() => {
    if (!document.hidden) void refreshMarketSales();
  }, 20_000));

  // Listen for global refresh / admin events to re-fetch on demand
  const onRefresh = () => { void refreshAll(currentTelegramId); };
  window.addEventListener("zoom-data-refresh", onRefresh);
  window.addEventListener("zoom-admin-refresh", onRefresh);
  // Refresh when tab becomes visible if it's been a while
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - state.lastFetch > 5_000) {
      void refreshAll(currentTelegramId);
    }
  });
}

/** Hook — initializes the global store and re-runs init when telegramId changes. */
export function useGlobalInit(telegramId: string | null) {
  useEffect(() => {
    initGlobalStore(telegramId);
  }, [telegramId]);
}

/** Append a new market sale optimistically (used by live SSE stream). */
export function pushMarketSale(sale: MarketSale) {
  if (state.marketSales.some((p) => p.id === sale.id)) return;
  set({ marketSales: [sale, ...state.marketSales].slice(0, 20) });
}

/** Force a daily status refresh (used after a successful claim). */
export async function refreshDailyStatus() {
  if (!currentTelegramId) return;
  try {
    const d = await fetchDailyStatus(currentTelegramId);
    if (d) set({ daily: d });
  } catch { /**/ }
}

/** Apply claim response immediately so UI can't flash stale streak state. */
export function applyDailyClaimResult(payload: DailyStatus & { ok?: boolean }) {
  const {
    streakDay,
    streakCycle,
    lastClaimAt,
    nextAvailableAt,
    hardResetAt,
    canClaim,
    willHardReset,
    upcomingDay,
    upcomingReward,
    cycleMultiplier,
    rewardsPreview,
  } = payload;
  if (streakDay == null || upcomingDay == null) return;
  set({
    daily: {
      streakDay,
      streakCycle: streakCycle ?? 0,
      lastClaimAt: lastClaimAt ?? Date.now(),
      nextAvailableAt: nextAvailableAt ?? Date.now() + 86_400_000,
      hardResetAt: hardResetAt ?? 0,
      canClaim: !!canClaim,
      willHardReset: !!willHardReset,
      upcomingDay,
      upcomingReward: upcomingReward ?? 1,
      cycleMultiplier: cycleMultiplier ?? 1,
      rewardsPreview: rewardsPreview ?? [],
    },
  });
}

/** Merge a listing so ALL / ZOOM / STARDUST / My List update immediately after sell. */
export function upsertMarketListing(listing: ServerMarketListing) {
  const id = listing.id;
  const planetId = listing.planetId ?? null;
  const rest = state.marketListings.filter((l) => l.id !== id && !(planetId && l.planetId === planetId));
  set({ marketListings: [listing, ...rest] });
}

export function removeMarketListingByPlanetId(planetId: string) {
  if (!planetId) return;
  set({ marketListings: state.marketListings.filter((l) => l.planetId !== planetId) });
}

/** Force a market listings refresh (used after a buy/sell). */
export async function refreshMarketListings(telegramId?: string | null) {
  const tid = (telegramId ?? currentTelegramId)?.trim() || null;
  try {
    const [publicRes, mine] = await Promise.all([
      fetchMarketListings().catch(() => [] as ServerMarketListing[]),
      tid ? fetchMyMarketListings(tid) : Promise.resolve([] as ServerMarketListing[]),
    ]);
    const byId = new Map<number, ServerMarketListing>();
    for (const row of [...publicRes, ...mine]) {
      const id = Number(row?.id);
      if (!Number.isFinite(id)) continue;
      byId.set(id, { ...row, id });
    }
    const merged = [...byId.values()];
    const serverIds = new Set(merged.map((l) => l.id));
    const serverPlanetIds = new Set(merged.map((l) => l.planetId).filter(Boolean));
    const pending = state.marketListings.filter((l) => {
      if (serverIds.has(Number(l.id))) return false;
      if (l.planetId && serverPlanetIds.has(l.planetId)) return false;
      const t = l.lastActivatedAt ? new Date(l.lastActivatedAt).getTime() : 0;
      return Number.isFinite(t) && Date.now() - t < 180_000;
    });
    set({ marketListings: [...pending, ...merged] });
  } catch { /**/ }
}
