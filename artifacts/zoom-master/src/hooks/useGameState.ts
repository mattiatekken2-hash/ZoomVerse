import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, fetchReferralData, fetchPendingReferral, debugTelegramContext, syncBalance, fetchGrants, fetchBalanceRecord, fetchServerTime, listOnMarket, delistFromMarket, recordCraft, fetchSeasonEpoch, type Grants } from "../utils/api";

async function calibrateServerOffset(): Promise<number> {
  try {
    const t0 = Date.now();
    const serverTime = await fetchServerTime();
    const t1 = Date.now();
    const rtt = t1 - t0;
    return serverTime - (t0 + rtt / 2);
  } catch {
    return 0;
  }
}

export type PlanetType = "BASIC" | "RARE" | "EPIC" | "GOLD";

export interface Planet {
  id: string;
  name: PlanetType;
  rate: number;
  color: string;
  glowColor: string;
  createdAt: number;
  farmStartedAt: number;
  lastCollectedAt: number;
  isListedInMarket: boolean;
  isFarmingActive: boolean;
  marketPrice: number | null;
  craftCost: number;
  serverListingId?: number;
}

export interface SunState {
  isOwned: boolean;
  isActive: boolean;
  activationCost: number;
  cycleCount: number;
  farmStartedAt: number;
  lastCollectedAt: number;
}

export interface FeedEvent {
  id: string;
  text: string;
  timestamp: number;
}

export interface MarketListing {
  id: string;
  name: PlanetType;
  price: number;
  seller: string;
  rate: number;
}

export interface GameState {
  version: number;
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  totalEarned: number;
  seasonPoolEarned: number;
  craftsCompleted: number;
  totalTonSpent: number;
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  feedEvents: FeedEvent[];
  pendingPlanet: Planet | null;
  currentCraftRarity: PlanetType | null;
  usedRedeemCodes: string[];
  sun: SunState | null;
  telegramId: string | null;
  referredBy: string | null;
  referralSpeedBonus: number;
  claimedBonusBasic: number;
  claimedBonusRare: number;
  claimedBonusEpic: number;
  claimedBonusGold: number;
  claimedBonusSun: boolean;
  sunCount: number;
  lastFarmingSettledAt: number;
  claimedMilestones: number[];
  lastBalanceEpoch: number;
  defectPlanets: string[];
}

export const PLANET_CONFIG: Record<PlanetType, {
  rate: number;
  color: string;
  glowColor: string;
  chance: number;
  label: string;
  craftCost: number;
  activationTon: number;
  tapsNeeded: number;
  reactivationFee: number;
}> = {
  BASIC: {
    rate: 2,
    color: "#8892b0",
    glowColor: "rgba(136,146,176,0.5)",
    chance: 0.7945,
    label: "Basic",
    craftCost: 20,
    activationTon: 0.05,
    tapsNeeded: 50,
    reactivationFee: 25,
  },
  RARE: {
    rate: 15,
    color: "#4facfe",
    glowColor: "rgba(79,172,254,0.5)",
    chance: 0.20,
    label: "Rare",
    craftCost: 40,
    activationTon: 0.15,
    tapsNeeded: 100,
    reactivationFee: 200,
  },
  EPIC: {
    rate: 80,
    color: "#c471ed",
    glowColor: "rgba(196,113,237,0.5)",
    chance: 0.005,
    label: "Epic",
    craftCost: 80,
    activationTon: 0.5,
    tapsNeeded: 250,
    reactivationFee: 1000,
  },
  GOLD: {
    rate: 150,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.5)",
    chance: 0.0005,
    label: "Gold",
    craftCost: 150,
    activationTon: 1.0,
    tapsNeeded: 500,
    reactivationFee: 2000,
  },
};

export const SUN_CONFIG = {
  rate: 1000,
  color: "#ffb347",
  glowColor: "rgba(255,179,71,0.6)",
  // SUN is purchased once for 10 TON. Each new 24h cycle requires a
  // reactivation fee in $ZOOM (same model as planets, scaled to its 24,000/cycle output).
  activationCostBase: 0,
  reactivationFee: 12000,
};

const REDEEM_CODES: Record<string, number> = {
  "ZOOMSTART": 500,
  "ZOOMLUCKY": 1000,
  "ZOOMBIG": 2500,
  "ZOOMLAUNCH": 750,
};

const SUN_CODES = ["SUN-ALPHA", "SUN-OMEGA", "SUN-PRIME", "SUN-NOVA", "SUN-CORE"];

const STATE_VERSION = 4;
const STORAGE_KEY = "zoom-master-v4";
const LIVE_EVENT_KEY = "zoom-master-live-activity-event";
const LIVE_EVENT_CHANNEL = "zoom-master-live-activity";
const MAX_FEED_EVENTS = 50;
const PLAYER_NAME = "Username";
const FARM_DURATION_MS = 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;

function makeReferralCode(): string {
  return "ZOOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getStorageKey(telegramId: string | null): string {
  return telegramId ? `${STORAGE_KEY}:${telegramId}` : STORAGE_KEY;
}

function getTelegramContext(): { telegramId: string | null; startParam: string | null; firstName: string | null; username: string | null } {
  try {
    const webApp = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string }; start_param?: string }; initData?: string } } }).Telegram?.WebApp;
    const unsafe = webApp?.initDataUnsafe;
    const telegramId = unsafe?.user?.id ? String(unsafe.user.id) : null;
    const firstName = unsafe?.user?.first_name ?? null;
    const username = unsafe?.user?.username ?? null;

    let startParam: string | null = unsafe?.start_param || null;

    if (!startParam && webApp?.initData) {
      try {
        const params = new URLSearchParams(webApp.initData);
        startParam = params.get("start_param");
      } catch { /**/ }
    }

    if (!startParam) {
      startParam = localStorage.getItem("zoom-start-param");
    }

    return { telegramId, startParam, firstName, username };
  } catch {
    return { telegramId: null, startParam: null, firstName: null, username: null };
  }
}

const INITIAL_STATE: GameState = {
  version: STATE_VERSION,
  balance: 300,
  taps: 0,
  goal: 50,
  planets: [],
  maxSlots: 2,
  totalEarned: 0,
  seasonPoolEarned: 0,
  craftsCompleted: 0,
  totalTonSpent: 0,
  referralCode: makeReferralCode(),
  referralCount: 0,
  lastDailyClaimAt: 0,
  feedEvents: [],
  pendingPlanet: null,
  currentCraftRarity: null,
  usedRedeemCodes: [],
  sun: null,
  telegramId: null,
  referredBy: null,
  referralSpeedBonus: 0,
  claimedBonusBasic: 0,
  claimedBonusRare: 0,
  claimedBonusEpic: 0,
  claimedBonusGold: 0,
  claimedBonusSun: false,
  sunCount: 0,
  lastFarmingSettledAt: Date.now(),
  claimedMilestones: [],
  defectPlanets: [],
  lastBalanceEpoch: 0,
};

function migratePlanet(p: unknown): Planet {
  const raw = p as Partial<Planet>;
  return {
    isFarmingActive: false,
    marketPrice: null,
    ...raw,
  } as Planet;
}

function loadState(): GameState {
  const { telegramId, startParam, firstName: _firstName } = getTelegramContext();

  try {
    const raw = localStorage.getItem(getStorageKey(telegramId)) ?? localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === STATE_VERSION) {
        if (telegramId && parsed.telegramId !== telegramId) {
          const referredBy = startParam ? startParam : null;
          return {
            ...INITIAL_STATE,
            referralCode: telegramId,
            telegramId,
            referredBy,
            referralSpeedBonus: referredBy ? 0.10 : 0,
          };
        }
        const base: GameState = {
          ...INITIAL_STATE,
          ...parsed,
          planets: (parsed.planets || []).map(migratePlanet),
          pendingPlanet: parsed.pendingPlanet ? migratePlanet(parsed.pendingPlanet) : null,
          usedRedeemCodes: parsed.usedRedeemCodes || [],
          sun: parsed.sun || null,
          referralSpeedBonus: parsed.referralSpeedBonus ?? 0,
          referredBy: parsed.referredBy ?? null,
          telegramId: parsed.telegramId ?? null,
          claimedBonusSun: parsed.claimedBonusSun ?? false,
          lastFarmingSettledAt: parsed.lastFarmingSettledAt ?? Date.now(),
          claimedMilestones: parsed.claimedMilestones ?? [],
          lastBalanceEpoch: parsed.lastBalanceEpoch ?? 0,
        };
        const resolvedTelegramId = telegramId || base.telegramId;
        return {
          ...base,
          telegramId: resolvedTelegramId,
          referralCode: resolvedTelegramId || base.referralCode,
        };
      }
    }
  } catch { /**/ }

  const isNewUser = true;
  const referredBy = (startParam && isNewUser) ? startParam : null;
  const referralSpeedBonus = referredBy ? 0.10 : 0;
  const referralCode = telegramId || makeReferralCode();

  return {
    ...INITIAL_STATE,
    referralCode,
    telegramId,
    referredBy,
    referralSpeedBonus,
  };
}

function saveState(state: GameState) {
  try {
    localStorage.setItem(getStorageKey(state.telegramId), JSON.stringify(state));
  } catch { /**/ }
}

// Non-blocking persistence scheduler. Each call replaces the pending state and
// the actual JSON.stringify + localStorage write happens during the browser's
// idle time (or next animation frame as fallback). This keeps the tap thread
// at 60fps even when state grows large (many planets, feed events, etc).
let _pendingPersistState: GameState | null = null;
let _persistScheduled = false;
type IdleCallback = (cb: () => void, opts?: { timeout?: number }) => number;
const _scheduleIdle: IdleCallback =
  typeof window !== "undefined" && typeof (window as unknown as { requestIdleCallback?: IdleCallback }).requestIdleCallback === "function"
    ? (window as unknown as { requestIdleCallback: IdleCallback }).requestIdleCallback.bind(window)
    : ((cb: () => void) => window.setTimeout(cb, 0)) as IdleCallback;

function schedulePersist(state: GameState) {
  _pendingPersistState = state;
  if (_persistScheduled) return;
  _persistScheduled = true;
  _scheduleIdle(() => {
    _persistScheduled = false;
    const s = _pendingPersistState;
    _pendingPersistState = null;
    if (s) saveState(s);
  }, { timeout: 200 });
}

// Force-flush pending persist (used on page hide / unload to guarantee writes).
function flushPersist() {
  if (_pendingPersistState) {
    const s = _pendingPersistState;
    _pendingPersistState = null;
    _persistScheduled = false;
    saveState(s);
  }
}

let _lastSyncedBalance = -1;
let _syncInFlight = false;
let _pendingSyncBalance = -1;
// Tracks the most recent server balanceEpoch we've observed. Sent on every
// /balance/sync so the server can detect stale clients (e.g. after admin
// mutations) and overwrite their balance instead of merging.
let _currentBalanceEpoch = 0;
export function getCurrentBalanceEpoch(): number { return _currentBalanceEpoch; }
export function setCurrentBalanceEpoch(epoch: number): void {
  if (typeof epoch === "number" && epoch > _currentBalanceEpoch) _currentBalanceEpoch = epoch;
}

// Called after every /balance/sync response. If the server returned a value
// lower than what we sent (admin mutation rejected our merge), reconcile the
// local game state down to the server value — otherwise the next sync will
// re-send the stale higher value with the now-current epoch and win via
// GREATEST, undoing the admin action.
function reconcileFromSyncResponse(sentBalance: number, res: { zoomBalance: number; balanceEpoch: number }): void {
  setCurrentBalanceEpoch(res.balanceEpoch);
  if (res.zoomBalance < sentBalance) {
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
        detail: { balance: res.zoomBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
    _lastSyncedBalance = res.zoomBalance;
    _pendingSyncBalance = -1;
  }
}

function immediateSyncToServer(state: GameState) {
  const { telegramId } = getTelegramContext();
  if (!telegramId) return;
  const balance = Math.floor(state.balance);
  if (balance === _lastSyncedBalance) return;

  if (_syncInFlight) {
    _pendingSyncBalance = balance;
    return;
  }

  _lastSyncedBalance = balance;
  _syncInFlight = true;
  const ctx_ = getTelegramContext();
  const firstName = ctx_.firstName;
  const username = ctx_.username;
  syncBalance({ telegramId, firstName, username, zoomBalance: balance, clientEpoch: _currentBalanceEpoch })
    .then((res) => {
      reconcileFromSyncResponse(balance, res);
      _syncInFlight = false;
      if (_pendingSyncBalance >= 0 && _pendingSyncBalance !== _lastSyncedBalance) {
        const nextBalance = _pendingSyncBalance;
        _pendingSyncBalance = -1;
        const { telegramId: tid, firstName: fn, username: un } = getTelegramContext();
        if (tid) {
          _lastSyncedBalance = nextBalance;
          _syncInFlight = true;
          syncBalance({ telegramId: tid, firstName: fn, username: un, zoomBalance: nextBalance, clientEpoch: _currentBalanceEpoch })
            .then((r2) => { reconcileFromSyncResponse(nextBalance, r2); _syncInFlight = false; })
            .catch(() => { _syncInFlight = false; });
        }
      }
    })
    .catch(() => { _syncInFlight = false; });
}

function publishFeedEvent(event: FeedEvent) {
  try {
    localStorage.setItem(LIVE_EVENT_KEY, JSON.stringify(event));
  } catch { /**/ }
  try {
    const channel = new BroadcastChannel(LIVE_EVENT_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch { /**/ }
}

function withFeedEvent(state: GameState, text: string): GameState {
  const event: FeedEvent = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    text,
    timestamp: Date.now(),
  };
  publishFeedEvent(event);
  return {
    ...state,
    feedEvents: [event, ...state.feedEvents].slice(0, MAX_FEED_EVENTS),
  };
}

function rollRarity(): PlanetType {
  const r = Math.random();
  let cumulative = 0;
  for (const [type, cfg] of Object.entries(PLANET_CONFIG) as [PlanetType, typeof PLANET_CONFIG[PlanetType]][]) {
    cumulative += cfg.chance;
    if (r <= cumulative) return type;
  }
  return "BASIC";
}

function makePlanet(rarity: PlanetType): Planet {
  const cfg = PLANET_CONFIG[rarity];
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).substring(2)}`,
    name: rarity,
    rate: cfg.rate,
    color: cfg.color,
    glowColor: cfg.glowColor,
    createdAt: now,
    farmStartedAt: now,
    lastCollectedAt: now,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
    craftCost: cfg.craftCost,
  };
}

export function isFarmActive(planet: Planet): boolean {
  if (!planet.isFarmingActive) return false;
  if (planet.isListedInMarket) return false;
  const now = Date.now();
  if (now - planet.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - planet.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function isSunActive(sun: SunState): boolean {
  if (!sun.isActive) return false;
  const now = Date.now();
  if (now - sun.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - sun.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function getFarmTimeRemaining(planet: Planet): number {
  const expiry = planet.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - Date.now());
}

/**
 * Planet's 24h farming cycle has elapsed and the user must pay a reactivation
 * fee to start a new cycle. Excludes never-started planets and listed planets.
 */
export function isFarmExpired(planet: Planet): boolean {
  if (planet.isListedInMarket) return false;
  if (planet.farmStartedAt <= 0) return false;
  return Date.now() - planet.farmStartedAt > FARM_DURATION_MS;
}

export function getReactivationFee(planet: Planet): number {
  return PLANET_CONFIG[planet.name].reactivationFee;
}

/**
 * SUN cycle (24h) has elapsed since the last activation and a $ZOOM
 * reactivation fee is required to start a new cycle.
 */
export function isSunExpired(sun: SunState | null): boolean {
  if (!sun?.isOwned) return false;
  if (sun.farmStartedAt <= 0) return false;
  return Date.now() - sun.farmStartedAt > FARM_DURATION_MS;
}

export function getSunReactivationFee(): number {
  return SUN_CONFIG.reactivationFee;
}

export function getSunTimeRemaining(sun: SunState): number {
  if (!sun.isActive) return 0;
  const expiry = sun.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - Date.now());
}

export function needsCollect(planet: Planet): boolean {
  return Date.now() - planet.lastCollectedAt > DAILY_COLLECT_MS * 0.9 && isFarmActive(planet);
}

export function sunNeedsCollect(sun: SunState): boolean {
  return isSunActive(sun) && Date.now() - sun.lastCollectedAt > DAILY_COLLECT_MS * 0.9;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const DEFECT_CHANCE = 0.04;
const DYNAMIC_BONUS_MAX = 10;

function settleFarmingState(state: GameState, now: number): GameState {
  const from = state.lastFarmingSettledAt || now;
  if (now <= from) return state;

  const speedMultiplier = 1 + (state.referralSpeedBonus || 0);
  let earned = 0;

  for (const planet of state.planets) {
    if (!planet.isFarmingActive || planet.isListedInMarket) continue;
    const start = Math.max(from, planet.farmStartedAt, planet.lastCollectedAt);
    const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
    if (end > start) {
      const dynamicRate = planet.rate + Math.random() * DYNAMIC_BONUS_MAX;
      earned += (dynamicRate / 3_600_000) * (end - start) * speedMultiplier;
    }
  }

  if (state.sun?.isActive) {
    const start = Math.max(from, state.sun.farmStartedAt, state.sun.lastCollectedAt);
    const end = Math.min(now, state.sun.farmStartedAt + FARM_DURATION_MS, state.sun.lastCollectedAt + DAILY_COLLECT_MS);
    if (end > start) {
      const sunMultiplier = Math.max(1, state.sunCount || 1);
      earned += (SUN_CONFIG.rate * sunMultiplier / 3_600_000) * (end - start) * speedMultiplier;
    }
  }

  if (earned <= 0) return { ...state, lastFarmingSettledAt: now };

  return {
    ...state,
    balance: state.balance + earned,
    totalEarned: state.totalEarned + earned,
    seasonPoolEarned: state.seasonPoolEarned + earned,
    lastFarmingSettledAt: now,
  };
}

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);
  const stateRef = useRef(state);
  const serverOffsetRef = useRef(0);
  stateRef.current = state;

  // Throttle save+sync: writes & network traffic are expensive on every state change.
  // Debounce 400ms so rapid taps coalesce into one save+sync. Always flush on hide/unload.
  useEffect(() => {
    const t = setTimeout(() => {
      saveState(stateRef.current);
      immediateSyncToServer(stateRef.current);
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const flush = () => {
      flushPersist();
      saveState(stateRef.current);
      immediateSyncToServer(stateRef.current);
    };
    const onVisibility = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // Season-epoch sync: if admin reset the season, wipe client-side counters
  useEffect(() => {
    let cancelled = false;
    const SEASON_EPOCH_KEY = "zoom-season-epoch";
    const check = async () => {
      const serverEpoch = await fetchSeasonEpoch();
      if (cancelled || !serverEpoch) return;
      let localEpoch = 0;
      try { localEpoch = Number(localStorage.getItem(SEASON_EPOCH_KEY) || "0"); } catch { /**/ }
      if (serverEpoch > localEpoch) {
        try { localStorage.setItem(SEASON_EPOCH_KEY, String(serverEpoch)); } catch { /**/ }
        setState((prev) => ({
          ...prev,
          balance: 0,
          totalEarned: 0,
          seasonPoolEarned: 0,
          totalTonSpent: 0,
          claimedMilestones: [],
        }));
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const { telegramId, startParam, firstName, username } = getTelegramContext();

    const webApp = (window as unknown as { Telegram?: { WebApp?: { initData?: string; initDataUnsafe?: unknown } } }).Telegram?.WebApp;
    const rawInitData = webApp?.initData ?? "";
    const rawUnsafe = webApp?.initDataUnsafe ? JSON.stringify(webApp.initDataUnsafe) : "";
    const lsParam = (() => { try { return localStorage.getItem("zoom-start-param"); } catch { return null; } })();

    debugTelegramContext({
      telegramId,
      initData: rawInitData,
      initDataUnsafe: rawUnsafe,
      startParam,
      localStorageParam: lsParam,
      href: window.location.href,
      hash: window.location.hash,
      search: window.location.search,
    });

    if (!telegramId) return;

    (async () => {
      const offset = await calibrateServerOffset();
      serverOffsetRef.current = offset;

      setState((prev) => settleFarmingState(prev, Date.now()));

      let referrer = startParam;
      if (!referrer) {
        const pending = await fetchPendingReferral(telegramId);
        if (pending) {
          referrer = pending;
        }
      }

      const result = await registerUser(telegramId, referrer ?? undefined, firstName, username);

      if (result.isNew && referrer) {
        try { localStorage.removeItem("zoom-start-param"); } catch { /**/ }
      }

      const [refData, grants, balanceRecord] = await Promise.all([
        fetchReferralData(telegramId),
        fetchGrants(telegramId),
        fetchBalanceRecord(telegramId),
      ]);

      const serverBalance = balanceRecord?.exists ? balanceRecord.zoomBalance : 0;
      const serverEpoch = balanceRecord?.balanceEpoch ?? 0;
      const localEpoch = stateRef.current.lastBalanceEpoch ?? 0;
      const localBalance = Math.floor(stateRef.current.balance);
      // If server epoch advanced, admin/system performed an authoritative
      // change (credit/remove/reset) — server wins, even if client is higher.
      // Otherwise, only credit upwards (protect in-flight purchases).
      const epochAdvanced = serverEpoch > localEpoch;
      const finalBalance = epochAdvanced
        ? serverBalance
        : stateRef.current.balance + (serverBalance > localBalance ? serverBalance - localBalance : 0);

      setCurrentBalanceEpoch(serverEpoch);
      const syncRes = await syncBalance({ telegramId, firstName, username, zoomBalance: Math.floor(finalBalance), clientEpoch: serverEpoch });
      setCurrentBalanceEpoch(syncRes.balanceEpoch);

      setState((prev) => {
        const epochAdvancedNow = serverEpoch > (prev.lastBalanceEpoch ?? 0);
        const newBalance = epochAdvancedNow
          ? serverBalance
          : prev.balance + (serverBalance > Math.floor(prev.balance) ? serverBalance - Math.floor(prev.balance) : 0);
        let updated = {
          ...prev,
          referralCount: refData.referralCount,
          claimedMilestones: refData.claimedMilestones,
          balance: newBalance,
          lastBalanceEpoch: syncRes.balanceEpoch,
        };

        // Apply bonus sun from server (grant sun if not already owned)
        if (grants.bonusSun) {
          updated = {
            ...updated,
            claimedBonusSun: true,
            sunCount: Math.max(1, grants.sunCount || 1),
            sun: updated.sun?.isOwned ? updated.sun : {
              isOwned: true,
              isActive: false,
              activationCost: SUN_CONFIG.activationCostBase,
              cycleCount: 0,
              farmStartedAt: 0,
              lastCollectedAt: 0,
            },
          };
        } else if (updated.claimedBonusSun) {
          updated = { ...updated, sun: null, claimedBonusSun: false, sunCount: 0 };
        }

        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
        };

        // Apply pending bonus planets per type (only new ones not yet claimed)
        const bonusTypes: Array<{ key: "bonusBasic" | "bonusRare" | "bonusEpic" | "bonusGold"; claimedKey: "claimedBonusBasic" | "claimedBonusRare" | "claimedBonusEpic" | "claimedBonusGold"; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare", claimedKey: "claimedBonusRare", type: "RARE" },
          { key: "bonusEpic", claimedKey: "claimedBonusEpic", type: "EPIC" },
          { key: "bonusGold", claimedKey: "claimedBonusGold", type: "GOLD" },
        ];
        const now = Date.now();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants as unknown as Record<string, number>)[key] ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < toAdd; i++) {
              newPlanets.push({
                id: `bonus-${type}-${now}-${i}`,
                name: type,
                rate: cfg.rate,
                color: cfg.color,
                glowColor: cfg.glowColor,
                createdAt: now,
                farmStartedAt: now,
                lastCollectedAt: now,
                isListedInMarket: false,
                isFarmingActive: false,
                marketPrice: null,
                craftCost: cfg.craftCost,
              });
            }
            claimedUpdates[claimedKey] = serverCount;
          } else if (toAdd < 0) {
            let toRemove = Math.abs(toAdd);
            updated = {
              ...updated,
              planets: updated.planets.filter((planet) => {
                if (toRemove <= 0 || planet.name !== type || !planet.id.startsWith(`bonus-${type}-`)) return true;
                toRemove -= 1;
                return false;
              }),
            };
            claimedUpdates[claimedKey] = serverCount;
          }
        }

        if (newPlanets.length > 0 || Object.keys(claimedUpdates).length > 0) {
          updated = {
            ...updated,
            ...claimedUpdates,
            planets: [...updated.planets, ...newPlanets],
          };
        }

        {
          const sent = Math.floor(updated.balance);
          syncBalance({ telegramId, firstName, username, zoomBalance: sent, clientEpoch: _currentBalanceEpoch })
            .then((r) => reconcileFromSyncResponse(sent, r));
        }
        return updated;
      });
    })();
  }, []);

  useEffect(() => {
    const applyGrants = (grants: Grants) => {
      setState((prev) => {
        let updated = { ...prev };

        if (grants.bonusSun) {
          updated = {
            ...updated,
            claimedBonusSun: true,
            sunCount: Math.max(1, grants.sunCount || 1),
            sun: updated.sun?.isOwned ? updated.sun : {
              isOwned: true,
              isActive: false,
              activationCost: SUN_CONFIG.activationCostBase,
              cycleCount: 0,
              farmStartedAt: 0,
              lastCollectedAt: 0,
            },
          };
        } else if (updated.claimedBonusSun) {
          updated = { ...updated, sun: null, claimedBonusSun: false, sunCount: 0 };
        }

        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
        };

        const bonusTypes: Array<{ key: keyof Grants; claimedKey: keyof GameState; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare",  claimedKey: "claimedBonusRare",  type: "RARE" },
          { key: "bonusEpic",  claimedKey: "claimedBonusEpic",  type: "EPIC" },
          { key: "bonusGold",  claimedKey: "claimedBonusGold",  type: "GOLD" },
        ];
        const now = Date.now();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants[key] as number) ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < toAdd; i++) {
              newPlanets.push({
                id: `bonus-${type}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
                name: type,
                rate: cfg.rate,
                color: cfg.color,
                glowColor: cfg.glowColor,
                createdAt: now,
                farmStartedAt: now,
                lastCollectedAt: now,
                isListedInMarket: false,
                isFarmingActive: false,
                marketPrice: null,
                craftCost: cfg.craftCost,
              });
            }
            claimedUpdates[claimedKey] = serverCount as never;
          } else if (toAdd < 0) {
            let toRemove = Math.abs(toAdd);
            updated = {
              ...updated,
              planets: updated.planets.filter((planet) => {
                if (toRemove <= 0 || planet.name !== type || !planet.id.startsWith(`bonus-${type}-`)) return true;
                toRemove -= 1;
                return false;
              }),
            };
            claimedUpdates[claimedKey] = serverCount as never;
          }
        }

        if (newPlanets.length > 0 || Object.keys(claimedUpdates).length > 0) {
          updated = { ...updated, ...claimedUpdates, planets: [...updated.planets, ...newPlanets] };
        }

        return updated;
      });
    };

    const doSync = async () => {
      const { telegramId, firstName, username } = getTelegramContext();
      if (!telegramId) return;
      const localBalance = Math.floor(stateRef.current.balance);

      const [syncRes, grants] = await Promise.all([
        syncBalance({ telegramId, firstName, username, zoomBalance: localBalance, clientEpoch: _currentBalanceEpoch }),
        fetchGrants(telegramId),
      ]);
      reconcileFromSyncResponse(localBalance, syncRes);

      applyGrants(grants);
    };

    const interval = setInterval(doSync, 30_000);

    const handleAdminRefresh = async () => {
      const { telegramId } = getTelegramContext();
      if (!telegramId) return;

      const balanceRecord = await fetchBalanceRecord(telegramId);
      if (balanceRecord?.exists) {
        const serverBal = Math.floor(balanceRecord.zoomBalance);
        const localBal = Math.floor(stateRef.current.balance);
        // Adopt the server's epoch so subsequent syncs are not rejected.
        setCurrentBalanceEpoch(balanceRecord.balanceEpoch);
        if (serverBal !== localBal) {
          // Snap local to server in BOTH directions: credits AND removals.
          _lastSyncedBalance = serverBal;
          _pendingSyncBalance = -1;
          setState((prev) => ({ ...prev, balance: serverBal, lastBalanceEpoch: balanceRecord.balanceEpoch }));
        } else {
          setState((prev) => ({ ...prev, lastBalanceEpoch: balanceRecord.balanceEpoch }));
        }
      }

      const grants = await fetchGrants(telegramId);
      if (grants) applyGrants(grants);
    };
    const handleLocalCredit = (e: Event) => {
      const detail = (e as CustomEvent<{ amount: number }>).detail;
      const amount = detail?.amount;
      if (!amount || amount <= 0) return;
      const { telegramId, firstName, username } = getTelegramContext();
      setState((prev) => {
        const newBal = prev.balance + amount;
        if (telegramId) {
          const sent = Math.floor(newBal);
          syncBalance({ telegramId, firstName, username, zoomBalance: sent, clientEpoch: _currentBalanceEpoch })
            .then((r) => reconcileFromSyncResponse(sent, r));
        }
        return { ...prev, balance: newBal, totalEarned: prev.totalEarned + amount };
      });
    };
    const handleServerSnap = (e: Event) => {
      const detail = (e as CustomEvent<{ balance: number; epoch: number }>).detail;
      if (!detail || typeof detail.balance !== "number") return;
      // Server rejected our merge (admin mutation in progress) — snap local
      // state down to the authoritative server value so the next sync doesn't
      // re-send the stale higher value.
      setState((prev) => ({
        ...prev,
        balance: detail.balance,
        lastBalanceEpoch: Math.max(prev.lastBalanceEpoch ?? 0, detail.epoch ?? 0),
      }));
    };
    window.addEventListener("zoom-admin-refresh", handleAdminRefresh);
    window.addEventListener("zoom-data-refresh", doSync);
    window.addEventListener("zoom-credit-local", handleLocalCredit as EventListener);
    window.addEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener("zoom-admin-refresh", handleAdminRefresh);
      window.removeEventListener("zoom-data-refresh", doSync);
      window.removeEventListener("zoom-credit-local", handleLocalCredit as EventListener);
      window.removeEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      const localNow = Date.now();
      setState((prev) => settleFarmingState(prev, localNow));
      stateRef.current = settleFarmingState(stateRef.current, localNow);

      const { telegramId, firstName, username } = getTelegramContext();

      if (telegramId) {
        (async () => {
          setState((prev) => {
            const settled = settleFarmingState(prev, Date.now());
            stateRef.current = settled;
            {
              const sent = Math.floor(settled.balance);
              syncBalance({ telegramId, firstName, username, zoomBalance: sent, clientEpoch: _currentBalanceEpoch })
                .then((r) => reconcileFromSyncResponse(sent, r));
            }
            return settled;
          });

          window.dispatchEvent(new Event("zoom-data-refresh"));
        })();

        fetchReferralData(telegramId).then((refData) => {
          setState((prev) => ({
            ...prev,
            referralCount: refData.referralCount,
            claimedMilestones: refData.claimedMilestones,
          }));
        });
      }
    };

    const handleBeforeUnload = () => {
      const settled = settleFarmingState(stateRef.current, Date.now());
      saveState(settled);
      const { telegramId, firstName, username } = getTelegramContext();
      if (telegramId) {
        const balance = Math.floor(settled.balance);
        const payload = JSON.stringify({ telegramId, firstName, zoomBalance: balance });
        const url = `${window.location.origin}/api/balance/sync`;
        const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }));
        if (!sent) {
          fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const addIncomingEvent = (event: FeedEvent) => {
      setState((prev) => {
        if (!event?.id || prev.feedEvents.some((item) => item.id === event.id)) return prev;
        return {
          ...prev,
          feedEvents: [event, ...prev.feedEvents].slice(0, MAX_FEED_EVENTS),
        };
      });
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LIVE_EVENT_CHANNEL) : null;
    if (channel) {
      channel.onmessage = (message) => addIncomingEvent(message.data as FeedEvent);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LIVE_EVENT_KEY || !event.newValue) return;
      try {
        addIncomingEvent(JSON.parse(event.newValue) as FeedEvent);
      } catch { /**/ }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => settleFarmingState(prev, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const craft = useCallback((): { completed: boolean; planet?: Planet; tapsLeft?: number; broken?: boolean; brokenRarity?: "BASIC" | "RARE" | "EPIC" | "GOLD" } => {
    const current = stateRef.current;
    if (current.pendingPlanet) return { completed: false };
    if (current.planets.length >= current.maxSlots) return { completed: false };
    if (current.balance < 1) return { completed: false };

    let rarity = current.currentCraftRarity;
    let goal = current.goal;

    if (rarity === null) {
      rarity = rollRarity();
      const baseTaps = PLANET_CONFIG[rarity].tapsNeeded;
      goal = baseTaps + Math.floor(Math.random() * 11);
    }

    const newTaps = current.taps + 1;
    const newBalance = current.balance - 1;

    if (newTaps >= goal) {
      // 4% chance the planet shatters during construction. The player loses
      // the ZOOM and taps spent, but no planet is added to the inventory.
      const BREAK_CHANCE = 0.04;
      const isBroken = Math.random() < BREAK_CHANCE;

      if (isBroken) {
        const brokenRarity = rarity;
        setState((prev) => {
          const next: GameState = {
            ...prev,
            balance: newBalance,
            taps: 0,
            goal: 50,
            currentCraftRarity: null,
            pendingPlanet: null,
          };
          schedulePersist(next);
          return next;
        });
        return { completed: true, broken: true, brokenRarity };
      }

      const planet = makePlanet(rarity);
      const { telegramId: tid } = getTelegramContext();
      // Fire-and-forget — never await on the tap critical path.
      if (tid) { void recordCraft(tid, planet.name); }
      setState((prev) => {
        const next: GameState = {
          ...(planet.name === "GOLD"
            ? withFeedEvent(prev, `${PLAYER_NAME} ha appena forgiato un pianeta GOLD!`)
            : prev),
          balance: newBalance,
          taps: 0,
          goal: 50,
          currentCraftRarity: null,
          pendingPlanet: planet,
          craftsCompleted: prev.craftsCompleted + 1,
        };
        // Persist in idle time so the tap stays at 60fps. Page-hide and unload
        // listeners flush this synchronously to guarantee durability.
        schedulePersist(next);
        return next;
      });
      return { completed: true, planet };
    } else {
      setState((prev) => {
        const next: GameState = {
          ...prev,
          balance: newBalance,
          taps: newTaps,
          goal,
          currentCraftRarity: rarity,
        };
        schedulePersist(next);
        return next;
      });
      return { completed: false, tapsLeft: goal - newTaps };
    }
  }, []);

  const claimCraft = useCallback(() => {
    setState((prev) => {
      if (!prev.pendingPlanet) return prev;
      return {
        ...prev,
        planets: [...prev.planets, prev.pendingPlanet],
        pendingPlanet: null,
      };
    });
  }, []);

  const redeemCode = useCallback((code: string): { success: boolean; amount?: number; isSun?: boolean; error?: string } => {
    const upperCode = code.trim().toUpperCase();
    const current = stateRef.current;
    if (current.usedRedeemCodes.includes(upperCode)) {
      return { success: false, error: "Code already used" };
    }
    if (SUN_CODES.includes(upperCode)) {
      if (current.sun?.isOwned) {
        return { success: false, error: "You already own THE SUN" };
      }
      setState((prev) => ({
        ...prev,
        usedRedeemCodes: [...prev.usedRedeemCodes, upperCode],
        sun: {
          isOwned: true,
          isActive: false,
          activationCost: SUN_CONFIG.activationCostBase,
          cycleCount: 0,
          farmStartedAt: 0,
          lastCollectedAt: 0,
        },
      }));
      return { success: true, isSun: true };
    }
    const amount = REDEEM_CODES[upperCode];
    if (!amount) return { success: false, error: "Invalid code" };
    setState((prev) => ({
      ...prev,
      balance: prev.balance + amount,
      usedRedeemCodes: [...prev.usedRedeemCodes, upperCode],
    }));
    return { success: true, amount };
  }, []);

  const activateSun = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (!prev.sun?.isOwned) return prev;
      // No activation cost — SUN was paid for once at purchase (10 TON).
      // Each new cycle simply resets the timer for free.
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: true,
          cycleCount: (prev.sun.cycleCount || 0) + 1,
          activationCost: 0,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
    });
  }, []);

  const startSunFarming = useCallback((): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      if (!prev.sun?.isOwned) {
        outcome = { ok: false, reason: "SUN not owned" };
        return prev;
      }
      const now = Date.now();
      // First start (right after purchase) is free; subsequent reactivations
      // after the 24h cycle elapsed cost a $ZOOM fee.
      const wasStarted = prev.sun.farmStartedAt > 0;
      const expired = wasStarted && now - prev.sun.farmStartedAt > FARM_DURATION_MS;
      const fee = expired ? SUN_CONFIG.reactivationFee : 0;
      if (fee > 0 && prev.balance < fee) {
        outcome = { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate SUN` };
        return prev;
      }
      const updated: GameState = {
        ...prev,
        balance: prev.balance - fee,
        sun: {
          ...prev.sun,
          isActive: true,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
      saveState(updated);
      return updated;
    });
    return outcome;
  }, []);

  const stopSunFarming = useCallback(() => {
    setState((prev) => {
      if (!prev.sun) return prev;
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: false,
        },
      };
    });
  }, []);

  const burnSun = useCallback(() => {
    setState((prev) => {
      if (!prev.sun) return prev;
      return {
        ...prev,
        sun: null,
      };
    });
  }, []);

  const acquireSun = useCallback(() => {
    setState((prev) => {
      if (prev.sun?.isOwned) return prev;
      return withFeedEvent({
        ...prev,
        sun: {
          isOwned: true,
          isActive: false,
          activationCost: SUN_CONFIG.activationCostBase,
          cycleCount: 0,
          farmStartedAt: 0,
          lastCollectedAt: 0,
        },
      }, `${PLAYER_NAME} ha acquisito il SOLE!`);
    });
  }, []);

  const collectSun = useCallback(() => {
    setState((prev) => {
      if (!prev.sun) return prev;
      return {
        ...prev,
        sun: { ...prev.sun, lastCollectedAt: Date.now() },
      };
    });
  }, []);

  const collectPlanet = useCallback((id: string): { defect: boolean } => {
    const isDefect = Math.random() < DEFECT_CHANCE;
    setState((prev) => {
      const now = Date.now();
      if (isDefect) {
        const planet = prev.planets.find((p) => p.id === id);
        if (planet && planet.isFarmingActive) {
          const speedMultiplier = 1 + (prev.referralSpeedBonus || 0);
          const start = Math.max(planet.lastCollectedAt, planet.farmStartedAt);
          const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
          const elapsed = Math.max(0, end - start);
          const lost = (planet.rate / 3_600_000) * elapsed * speedMultiplier;
          return {
            ...prev,
            balance: Math.max(0, prev.balance - lost),
            planets: prev.planets.map((p) =>
              p.id === id ? { ...p, lastCollectedAt: now } : p
            ),
          };
        }
      }
      return {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, lastCollectedAt: now } : p
        ),
      };
    });
    return { defect: isDefect };
  }, []);

  const burnPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) return prev;
      const refund = Math.floor(planet.craftCost * 0.15);
      const bonusPlanetCount = prev.planets.filter((p) => p.name === planet.name && p.id.startsWith(`bonus-${planet.name}-`)).length;
      const updated = {
        ...prev,
        balance: prev.balance + refund,
        planets: prev.planets.filter((p) => p.id !== id),
        claimedBonusBasic: planet.name === "BASIC" ? Math.max(prev.claimedBonusBasic, bonusPlanetCount) : prev.claimedBonusBasic,
        claimedBonusRare: planet.name === "RARE" ? Math.max(prev.claimedBonusRare, bonusPlanetCount) : prev.claimedBonusRare,
        claimedBonusEpic: planet.name === "EPIC" ? Math.max(prev.claimedBonusEpic, bonusPlanetCount) : prev.claimedBonusEpic,
        claimedBonusGold: planet.name === "GOLD" ? Math.max(prev.claimedBonusGold, bonusPlanetCount) : prev.claimedBonusGold,
      };
      saveState(updated);
      return updated;
    });
  }, []);

  const startFarming = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet || planet.isListedInMarket) {
        outcome = { ok: false, reason: "Planet unavailable" };
        return prev;
      }
      const now = Date.now();
      // A planet is "expired" if its 24h cycle elapsed AND it had been started before.
      // First-time start (right after craft) is free; subsequent reactivations cost
      // a rarity-based $ZOOM fee.
      const wasStarted = planet.farmStartedAt > 0;
      const expired = wasStarted && now - planet.farmStartedAt > FARM_DURATION_MS;
      const fee = expired ? PLANET_CONFIG[planet.name].reactivationFee : 0;
      if (fee > 0 && prev.balance < fee) {
        outcome = { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate` };
        return prev;
      }
      const updated: GameState = {
        ...prev,
        balance: prev.balance - fee,
        planets: prev.planets.map((p) =>
          p.id === id
            ? { ...p, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now }
            : p
        ),
      };
      saveState(updated);
      return updated;
    });
    return outcome;
  }, []);

  const stopFarming = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id ? { ...p, isFarmingActive: false } : p
      ),
    }));
  }, []);

  const listPlanet = useCallback((id: string, price: number) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) return prev;
      const { telegramId, firstName, username } = getTelegramContext();
      if (telegramId) {
        listOnMarket({
          sellerTelegramId: telegramId,
          sellerName: firstName ?? undefined,
          planetType: planet.name,
          planetRate: planet.rate,
          price,
        }).then((result) => {
          if (result.ok && result.listing) {
            setState((s) => ({
              ...s,
              planets: s.planets.map((p) =>
                p.id === id ? { ...p, serverListingId: result.listing!.id } : p
              ),
            }));
          }
        });
      }
      return {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id
            ? { ...p, isListedInMarket: true, isFarmingActive: false, marketPrice: price }
            : p
        ),
      };
    });
  }, []);

  const unlistPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (planet?.serverListingId) {
        const { telegramId } = getTelegramContext();
        if (telegramId) {
          delistFromMarket(telegramId, planet.serverListingId);
        }
      }
      return {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, isListedInMarket: false, marketPrice: null, serverListingId: undefined } : p
        ),
      };
    });
  }, []);

  const buyPlanet = useCallback((listing: MarketListing): { success: boolean; reason?: string } => {
    const current = stateRef.current;
    if (current.planets.length >= current.maxSlots) {
      return { success: false, reason: "No free slots available" };
    }
    const fee = Math.floor(listing.price * 0.25);
    const total = listing.price + fee;
    if (current.balance < total) {
      return { success: false, reason: "Insufficient $ZOOM balance" };
    }
    const isOwnListing = current.planets.some(p => p.id === listing.id && p.isListedInMarket);
    if (isOwnListing) {
      return { success: false, reason: "Cannot buy your own listing" };
    }
    const cfg = PLANET_CONFIG[listing.name];
    const now = Date.now();
    const newPlanet: Planet = {
      id: `bought-${now}-${Math.random().toString(36).substring(2)}`,
      name: listing.name,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: now,
      lastCollectedAt: now,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: listing.price,
    };
    setState((prev) => ({
      ...prev,
      balance: prev.balance - total,
      planets: [...prev.planets, newPlanet],
    }));
    return { success: true };
  }, []);

  const serverBuyComplete = useCallback((planetType: PlanetType, planetRate: number, pricePaid: number) => {
    const cfg = PLANET_CONFIG[planetType];
    const now = Date.now();
    const newPlanet: Planet = {
      id: `bought-${now}-${Math.random().toString(36).substring(2)}`,
      name: planetType,
      rate: planetRate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: now,
      lastCollectedAt: now,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: pricePaid,
    };
    setState((prev) => ({
      ...prev,
      balance: prev.balance - pricePaid,
      planets: [...prev.planets, newPlanet],
    }));
  }, []);

  const unlockSlot = useCallback(() => {
    setState((prev) => ({ ...prev, maxSlots: prev.maxSlots + 1 }));
  }, []);

  const claimDaily = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (now - prev.lastDailyClaimAt < DAILY_COLLECT_MS) return prev;
      return { ...prev, balance: prev.balance + 50, lastDailyClaimAt: now };
    });
  }, []);

  return {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet, serverBuyComplete,
    unlockSlot, claimDaily,
    activateSun, acquireSun, collectSun,
    startSunFarming, stopSunFarming, burnSun,
  };
}
