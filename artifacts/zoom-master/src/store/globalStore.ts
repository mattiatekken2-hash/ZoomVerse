import { useEffect, useSyncExternalStore } from "react";
import {
  fetchLeaderboard,
  fetchGlobalPool,
  fetchProfile,
  fetchSeasonEpoch,
  fetchDailyStatus,
  fetchMarketListings,
  fetchMarketSales,
  type LeaderboardEntry,
  type UserProfile,
  type DailyStatus,
  type ServerMarketListing,
  type MarketSale,
} from "../utils/api";

export interface GlobalCache {
  seasonEpoch: number | null;
  globalPool: number;
  leaderboard: LeaderboardEntry[];
  profile: UserProfile | null;
  daily: DailyStatus | null;
  marketListings: ServerMarketListing[];
  marketSales: MarketSale[];
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

async function refreshAll(telegramId: string | null) {
  if (inflight) return;
  inflight = true;
  try {
    const tasks: Promise<void>[] = [
      fetchSeasonEpoch().then((e) => { if (e && e > 0) set({ seasonEpoch: e }); }).catch(() => {}),
      fetchLeaderboard().then((lb) => set({ leaderboard: lb })).catch(() => {}),
      fetchGlobalPool().then((p) => set({ globalPool: p })).catch(() => {}),
      fetchMarketListings().then((m) => set({ marketListings: m })).catch(() => {}),
    ];
    if (telegramId) {
      tasks.push(fetchProfile(telegramId).then((p) => set({ profile: p })).catch(() => {}));
      tasks.push(fetchDailyStatus(telegramId).then((d) => { if (d) set({ daily: d }); }).catch(() => {}));
    }
    await Promise.all(tasks);
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

  // Kick off initial fetch immediately
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

/** Force a market listings refresh (used after a buy/sell). */
export async function refreshMarketListings() {
  try {
    const m = await fetchMarketListings();
    set({ marketListings: m });
  } catch { /**/ }
}
