import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, fetchReferralData, fetchPendingReferral, debugTelegramContext, syncBalance, fetchGrants, fetchBalanceRecord, fetchServerTime, listOnMarket, delistFromMarket, recordCraft, fetchSeasonEpoch, openMarketActivityStream, fetchMarketListings, notifyFarmStart, notifyFarmCollect, notifyFarmStop, type Grants } from "../utils/api";
import { toast } from "./use-toast";

// Server-authoritative clock: every farming/idle-income time check is computed
// against this value, NOT the device clock. Calibrated against /api/server-time
// so a tampered phone clock cannot accelerate ZOOM/TON accrual.
let _serverOffsetMs = 0;
let _serverOffsetReady = false;

export function serverNow(): number {
  return Date.now() + _serverOffsetMs;
}

export function isServerClockReady(): boolean {
  return _serverOffsetReady;
}

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

async function refreshServerOffset(): Promise<void> {
  try {
    const offset = await calibrateServerOffset();
    // Sanity check: if RTT-noise produced something insane, ignore it.
    if (Number.isFinite(offset) && Math.abs(offset) < 365 * 24 * 3_600_000) {
      _serverOffsetMs = offset;
      _serverOffsetReady = true;
    }
  } catch { /* keep last known offset */ }
}

export type PlanetType = "BASIC" | "RARE" | "EPIC" | "GOLD" | "WHITE1" | "WHITE2" | "WHITE3" | "WHITE4";

export const WHITE_PLANET_TYPES: PlanetType[] = ["WHITE1", "WHITE2", "WHITE3", "WHITE4"];

export function isWhitePlanet(name: PlanetType): boolean {
  return name === "WHITE1" || name === "WHITE2" || name === "WHITE3" || name === "WHITE4";
}

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
  // Only used by White Collection planets. null = in inventory, 0..3 = placed in that slot (immutable).
  slotIndex?: number | null;
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
  hasAutoTap: boolean;
  whiteCollectionUnlocked: boolean;
  // Number of White Collection bundles this user owns (each bundle = 4 white
  // planets + 4 slots). Global cap of 10 bundles is enforced server-side.
  whiteCollectionBundles: number;
  // Number of bundles already materialized locally (1 bundle = 4 planets
  // appended to whitePlanets). When grants reports a higher bundle count,
  // we materialize the delta. Per-user via storage.
  claimedWhiteCollectionBundles: number;
  // White planets owned by the user. Each bundle adds 4 fresh planets
  // (WHITE1..WHITE4). They live OUTSIDE the regular `planets` array so they
  // never appear on the FarmPage and can't be burned, sold, or listed.
  // `slotIndex` is null while in inventory and becomes 0..(maxSlots-1)
  // (immutable) once placed in the PixelAvatar slot grid.
  whitePlanets: Planet[];
  // Accumulated TON earnings from White Collection planets (claimed via COLLECT).
  // Reactivation fees for white planets are deducted from this balance.
  tonBalance: number;
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
  // For White Collection planets only: the rate is in TON/hour and the
  // reactivationFee is in TON. For all other planets these fields are ZOOM.
  isTonFarming?: boolean;
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
  // White Collection — only obtainable via the 30 TON shop bundle.
  // chance: 0 ensures rollRarity() in the Lab can never produce them.
  // Each white planet farms TON, not ZOOM. Combined rate of all 4 = 0.00462 TON/h
  // (≈ 0.111 TON/day total). Reactivation fee is paid in TON (deducted from
  // the user's accumulated tonBalance).
  WHITE1: {
    rate: 0.001155,
    color: "#ffffff",
    glowColor: "rgba(255,255,255,0.55)",
    chance: 0,
    label: "White Planet 1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE2: {
    rate: 0.001155,
    color: "#f8faff",
    glowColor: "rgba(248,250,255,0.55)",
    chance: 0,
    label: "White Planet 2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE3: {
    rate: 0.001155,
    color: "#f0f4ff",
    glowColor: "rgba(240,244,255,0.55)",
    chance: 0,
    label: "White Planet 3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
  },
  WHITE4: {
    rate: 0.001155,
    color: "#e8eeff",
    glowColor: "rgba(232,238,255,0.6)",
    chance: 0,
    label: "White Planet 4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.005,
    isTonFarming: true,
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
  hasAutoTap: false,
  whiteCollectionUnlocked: false,
  whiteCollectionBundles: 0,
  claimedWhiteCollectionBundles: 0,
  whitePlanets: [],
  tonBalance: 0,
  lastFarmingSettledAt: serverNow(),
  claimedMilestones: [],
  defectPlanets: [],
  lastBalanceEpoch: 0,
};

function migratePlanet(p: unknown): Planet {
  const raw = p as Partial<Planet>;
  return {
    isFarmingActive: false,
    marketPrice: null,
    slotIndex: null,
    ...raw,
  } as Planet;
}

// True when loadState() did NOT find a matching localStorage entry for the
// current Telegram user — i.e. this device is opening this account for the
// first time (or after clearing storage). The first server sync uses this to
// snap balance/state to the server values instead of merging with the local
// defaults (which would otherwise resurrect the 300-ZOOM starting balance and
// overwrite the real server-side balance via the next /balance/sync call).
let _lastLoadWasFresh = true;
export function consumeWasFreshLoad(): boolean {
  const v = _lastLoadWasFresh;
  _lastLoadWasFresh = false;
  return v;
}

function loadState(): GameState {
  const { telegramId, startParam, firstName: _firstName } = getTelegramContext();

  try {
    const matchingKey = localStorage.getItem(getStorageKey(telegramId));
    const raw = matchingKey ?? localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === STATE_VERSION) {
        if (telegramId && parsed.telegramId !== telegramId) {
          _lastLoadWasFresh = true;
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
          lastFarmingSettledAt: parsed.lastFarmingSettledAt ?? serverNow(),
          claimedMilestones: parsed.claimedMilestones ?? [],
          lastBalanceEpoch: parsed.lastBalanceEpoch ?? 0,
          whiteCollectionBundles: (parsed as unknown as Record<string, unknown>).whiteCollectionBundles as number ?? (parsed.whiteCollectionUnlocked ? 1 : 0),
          claimedWhiteCollectionBundles:
            (parsed as unknown as Record<string, unknown>).claimedWhiteCollectionBundles as number
            ?? ((parsed as unknown as Record<string, unknown>).claimedWhiteCollection ? 1 : 0),
          whitePlanets: (parsed.whitePlanets || []).map(migratePlanet),
          tonBalance: parsed.tonBalance ?? 0,
        };
        const resolvedTelegramId = telegramId || base.telegramId;
        // Only treat as "fresh load" when we did NOT find an entry keyed to the
        // current Telegram user. If matchingKey is null we fell back to a
        // legacy un-keyed entry (or someone else's), so still treat as fresh
        // and let server be authoritative on first sync.
        _lastLoadWasFresh = !matchingKey;
        return {
          ...base,
          telegramId: resolvedTelegramId,
          referralCode: resolvedTelegramId || base.referralCode,
        };
      }
    }
  } catch { /**/ }

  _lastLoadWasFresh = true;
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

// Monotonic write counter — incremented every time saveState writes. Used to
// detect "I queued a stale snapshot, but a fresher write happened before me"
// in scheduled/idle persist callbacks so they don't overwrite newer data.
let _writeSeq = 0;
let _lastSavedAt = 0;
function saveState(state: GameState) {
  // Discard any queued idle write — this snapshot is newer and authoritative.
  // Without this, a stale schedulePersist payload (e.g. from a tap a few ms
  // earlier) could fire AFTER us and resurrect items that were just removed
  // (burned planets, sold items, etc.) on the next reload.
  _pendingPersistState = null;
  _persistScheduled = false;
  _writeSeq++;
  _lastSavedAt = Date.now();
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
  const seqAtSchedule = _writeSeq;
  _scheduleIdle(() => {
    _persistScheduled = false;
    const s = _pendingPersistState;
    _pendingPersistState = null;
    // If anyone wrote authoritatively while we were queued, the snapshot we
    // captured is potentially stale (e.g. user burned/sold/listed an item
    // between schedule and idle). Skip — the authoritative writer already
    // persisted the truth.
    if (_writeSeq !== seqAtSchedule) return;
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
let _lastSyncedTonBalance = -1;
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

// Called after every /balance/sync response. The server is authoritative
// whenever its epoch is higher than the one we sent — that means an
// authoritative balance change happened on the server (admin mutation,
// Stars/TON purchase credit, marketplace buy/sell, wheel/daily/referral
// reward) since our last sync. In that case we MUST snap the local state
// to the server value (regardless of whether it is higher or lower) so the
// next outgoing sync doesn't echo back the stale value and overwrite the
// authoritative change.
function reconcileFromSyncResponse(
  sentBalance: number,
  sentEpoch: number,
  res: { zoomBalance: number; balanceEpoch: number; tonBalance?: number },
  sentTonBalance?: number,
): void {
  setCurrentBalanceEpoch(res.balanceEpoch);
  const serverAdvanced = res.balanceEpoch > sentEpoch;
  const valueDiverged = res.zoomBalance !== sentBalance;
  if (serverAdvanced && valueDiverged) {
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
        detail: { balance: res.zoomBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
    _lastSyncedBalance = res.zoomBalance;
    _pendingSyncBalance = -1;
  }
  // Same epoch-fence check for TON: if the server advanced and its TON value
  // diverges from what we sent, snap local tonBalance to the server's value.
  if (
    serverAdvanced &&
    typeof res.tonBalance === "number" &&
    typeof sentTonBalance === "number" &&
    Math.abs((res.tonBalance ?? 0) - (sentTonBalance ?? 0)) > 1e-9
  ) {
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.tonBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
    // Mirror the ZOOM snap behaviour: record the snapped value as the most
    // recently synced one so the next outgoing sync (triggered by the snap's
    // setState) doesn't re-send the now-stale local value.
    _lastSyncedTonBalance = res.tonBalance;
  }
}

function immediateSyncToServer(state: GameState) {
  const { telegramId } = getTelegramContext();
  if (!telegramId) return;
  const balance = Math.floor(state.balance);
  const tonNow = Math.max(0, state.tonBalance || 0);
  // Sync if EITHER currency changed since the last sync — TON-only changes
  // (collect/reactivate of white planets) must persist promptly too.
  const tonChanged = Math.abs(tonNow - _lastSyncedTonBalance) > 1e-9;
  if (balance === _lastSyncedBalance && !tonChanged) return;

  if (_syncInFlight) {
    _pendingSyncBalance = balance;
    return;
  }

  _lastSyncedBalance = balance;
  _lastSyncedTonBalance = tonNow;
  _syncInFlight = true;
  const ctx_ = getTelegramContext();
  const firstName = ctx_.firstName;
  const username = ctx_.username;
  const sentEpoch = _currentBalanceEpoch;
  const sentTon = Math.max(0, state.tonBalance || 0);
  syncBalance({ telegramId, firstName, username, zoomBalance: balance, tonBalance: sentTon, clientEpoch: sentEpoch })
    .then((res) => {
      reconcileFromSyncResponse(balance, sentEpoch, res, sentTon);
      _syncInFlight = false;
      if (_pendingSyncBalance >= 0 && _pendingSyncBalance !== _lastSyncedBalance) {
        const nextBalance = _pendingSyncBalance;
        _pendingSyncBalance = -1;
        const { telegramId: tid, firstName: fn, username: un } = getTelegramContext();
        if (tid) {
          _lastSyncedBalance = nextBalance;
          _syncInFlight = true;
          const sentEpoch2 = _currentBalanceEpoch;
          // Re-send the same TON value we just sent: this follow-up sync is
          // only chasing the deferred ZOOM update; tonBalance state is owned
          // by setState callbacks and we don't have access to it here.
          const sentTon2 = sentTon;
          syncBalance({ telegramId: tid, firstName: fn, username: un, zoomBalance: nextBalance, tonBalance: sentTon2, clientEpoch: sentEpoch2 })
            .then((r2) => { reconcileFromSyncResponse(nextBalance, sentEpoch2, r2, sentTon2); _syncInFlight = false; })
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

function makeWhiteCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return WHITE_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `white-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
      name: type,
      rate: cfg.rate,
      color: cfg.color,
      glowColor: cfg.glowColor,
      createdAt: now,
      farmStartedAt: 0,
      lastCollectedAt: 0,
      isListedInMarket: false,
      isFarmingActive: false,
      marketPrice: null,
      craftCost: 0,
      slotIndex: null,
    };
  });
}

function makePlanet(rarity: PlanetType): Planet {
  const cfg = PLANET_CONFIG[rarity];
  const now = serverNow();
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
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
  const now = serverNow();
  if (now - planet.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - planet.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function isSunActive(sun: SunState): boolean {
  if (!sun.isActive) return false;
  const now = serverNow();
  if (now - sun.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - sun.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function getFarmTimeRemaining(planet: Planet): number {
  const expiry = planet.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - serverNow());
}

/**
 * Planet's 24h farming cycle has elapsed and the user must pay a reactivation
 * fee to start a new cycle. Excludes never-started planets and listed planets.
 */
export function isFarmExpired(planet: Planet): boolean {
  if (planet.isListedInMarket) return false;
  if (planet.farmStartedAt <= 0) return false;
  return serverNow() - planet.farmStartedAt > FARM_DURATION_MS;
}

export function getReactivationFee(planet: Planet): number {
  return PLANET_CONFIG[planet.name].reactivationFee;
}

/**
 * Real-time TON pending on a single placed white planet (uncollected since
 * lastCollectedAt, capped to the 24h DAILY_COLLECT_MS window). Used by the UI
 * to show a live-ticking TON balance in the Pixel-Avatar modal.
 */
export function getWhitePlanetPendingTon(planet: Planet, now: number = serverNow()): number {
  if (planet.slotIndex == null || !planet.isFarmingActive) return 0;
  const cfg = PLANET_CONFIG[planet.name];
  if (!cfg.isTonFarming) return 0;
  const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
  const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
  if (end <= start) return 0;
  return (cfg.rate / 3_600_000) * (end - start);
}

/**
 * SUN cycle (24h) has elapsed since the last activation and a $ZOOM
 * reactivation fee is required to start a new cycle.
 */
export function isSunExpired(sun: SunState | null): boolean {
  if (!sun?.isOwned) return false;
  if (sun.farmStartedAt <= 0) return false;
  return serverNow() - sun.farmStartedAt > FARM_DURATION_MS;
}

export function getSunReactivationFee(): number {
  return SUN_CONFIG.reactivationFee;
}

export function getSunTimeRemaining(sun: SunState): number {
  if (!sun.isActive) return 0;
  const expiry = sun.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - serverNow());
}

export function needsCollect(planet: Planet): boolean {
  return serverNow() - planet.lastCollectedAt > DAILY_COLLECT_MS * 0.9 && isFarmActive(planet);
}

export function sunNeedsCollect(sun: SunState): boolean {
  return isSunActive(sun) && serverNow() - sun.lastCollectedAt > DAILY_COLLECT_MS * 0.9;
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

  // White Collection planets earn TON (not ZOOM) and accumulate into tonBalance
  // when the user presses COLLECT. Real-time pending TON for display is computed
  // separately via getWhitePlanetPendingTon(); here we only need to update the
  // settle timestamp — actual TON crediting happens on collectWhitePlanet().

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
      // If a destructive op (burn/sell/list/buy) just persisted authoritatively
      // within the last 250ms, stateRef.current may still be the PRE-op value
      // because React hasn't yet committed the new state. Writing it here
      // would resurrect burned/sold items on the next reload. Skip — the
      // destructive op already saved the truth.
      if (Date.now() - _lastSavedAt > 250) {
        saveState(stateRef.current);
      }
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
      // Calibrate server clock BEFORE settling so the first balance
      // computation already uses server-authoritative time.
      await refreshServerOffset();
      const offset = _serverOffsetMs;
      serverOffsetRef.current = offset;

      setState((prev) => settleFarmingState(prev, serverNow()));

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
      const wasFreshLoad = consumeWasFreshLoad();
      // CROSS-DEVICE SYNC: when this device is opening this Telegram account
      // for the first time (no localStorage entry yet), the local balance is
      // just the 300-ZOOM default — never trust it. Snap to the server value
      // so PC/phone always show the same balance.
      // If server epoch advanced, admin/system performed an authoritative
      // change (credit/remove/reset) — server wins, even if client is higher.
      // Otherwise, only credit upwards (protect in-flight purchases).
      const epochAdvanced = serverEpoch > localEpoch;
      const finalBalance = wasFreshLoad && balanceRecord?.exists
        ? serverBalance
        : epochAdvanced
        ? serverBalance
        : stateRef.current.balance + (serverBalance > localBalance ? serverBalance - localBalance : 0);

      setCurrentBalanceEpoch(serverEpoch);
      // Pull authoritative TON balance from /grants and seed local state with
      // it before syncing back, so other devices' TON earnings/spends are
      // reflected immediately on this device.
      const serverTonBalance = Math.max(0, grants.tonBalance ?? 0);
      const sentTon = serverTonBalance;
      const syncRes = await syncBalance({ telegramId, firstName, username, zoomBalance: Math.floor(finalBalance), tonBalance: sentTon, clientEpoch: serverEpoch });
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
          // Server is the source of truth for TON balance on app load (it
          // captures collects/spends from other devices). After this seeding,
          // the local client becomes authoritative under epoch fencing.
          tonBalance: serverTonBalance,
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

        const serverBundles = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles > 0,
          whiteCollectionBundles: serverBundles,
        };

        // White Collection: each owned bundle materializes 4 fresh white
        // planets exactly once. We track how many bundles have already been
        // materialized via claimedWhiteCollectionBundles so re-grants never
        // duplicate. White planets are permanent — we do not auto-revoke
        // even if the server count goes down.
        const claimedBundles = Math.max(0, updated.claimedWhiteCollectionBundles ?? 0);
        if (serverBundles > claimedBundles) {
          const toMaterialize = serverBundles - claimedBundles;
          const newWhitePlanets: Planet[] = [];
          for (let b = 0; b < toMaterialize; b++) {
            newWhitePlanets.push(...makeWhiteCollectionPlanets(claimedBundles + b));
          }
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles,
            whitePlanets: [...(updated.whitePlanets || []), ...newWhitePlanets],
          };
        }

        // Apply pending bonus planets per type (only new ones not yet claimed)
        const bonusTypes: Array<{ key: "bonusBasic" | "bonusRare" | "bonusEpic" | "bonusGold"; claimedKey: "claimedBonusBasic" | "claimedBonusRare" | "claimedBonusEpic" | "claimedBonusGold"; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare", claimedKey: "claimedBonusRare", type: "RARE" },
          { key: "bonusEpic", claimedKey: "claimedBonusEpic", type: "EPIC" },
          { key: "bonusGold", claimedKey: "claimedBonusGold", type: "GOLD" },
        ];
        const now = serverNow();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};
        const blockedByFullSlots: Array<{ type: PlanetType; count: number }> = [];

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants as unknown as Record<string, number>)[key] ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const availableSlots = updated.maxSlots - updated.planets.length - newPlanets.length;
            const actuallyAdd = Math.min(toAdd, Math.max(0, availableSlots));
            const blocked = toAdd - actuallyAdd;
            if (blocked > 0) blockedByFullSlots.push({ type, count: blocked });
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < actuallyAdd; i++) {
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
            // Only mark as claimed what we actually added — the rest stays
            // pending on the server until the user frees a slot.
            if (actuallyAdd > 0) {
              claimedUpdates[claimedKey] = Math.max(claimedCount, existingBonusCount) + actuallyAdd;
            }
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

        if (blockedByFullSlots.length > 0) {
          const parts = blockedByFullSlots.map((b) => `${b.count} ${PLANET_CONFIG[b.type].label}`).join(", ");
          setTimeout(() => {
            toast({
              title: "Slots full",
              description: `Free up a slot to receive your bonus: ${parts}`,
            });
          }, 0);
        }

        {
          const sent = Math.floor(updated.balance);
          const sentTon = Math.max(0, updated.tonBalance || 0);
          {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, zoomBalance: sent, tonBalance: sentTon, clientEpoch: sentEpoch })
            .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon));}
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

        const serverBundles2 = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles2 > 0,
          whiteCollectionBundles: serverBundles2,
        };

        const claimedBundles2 = Math.max(0, updated.claimedWhiteCollectionBundles ?? 0);
        if (serverBundles2 > claimedBundles2) {
          const toMaterialize2 = serverBundles2 - claimedBundles2;
          const newWhitePlanets2: Planet[] = [];
          for (let b = 0; b < toMaterialize2; b++) {
            newWhitePlanets2.push(...makeWhiteCollectionPlanets(claimedBundles2 + b));
          }
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles2,
            whitePlanets: [...(updated.whitePlanets || []), ...newWhitePlanets2],
          };
        }

        const bonusTypes: Array<{ key: keyof Grants; claimedKey: keyof GameState; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare",  claimedKey: "claimedBonusRare",  type: "RARE" },
          { key: "bonusEpic",  claimedKey: "claimedBonusEpic",  type: "EPIC" },
          { key: "bonusGold",  claimedKey: "claimedBonusGold",  type: "GOLD" },
        ];
        const now = serverNow();
        const newPlanets: Planet[] = [];
        const claimedUpdates: Partial<GameState> = {};
        const blockedByFullSlots: Array<{ type: PlanetType; count: number }> = [];

        for (const { key, claimedKey, type } of bonusTypes) {
          const serverCount = (grants[key] as number) ?? 0;
          const claimedCount = (updated[claimedKey] as number) ?? 0;
          const existingBonusCount = updated.planets.filter((planet) => planet.name === type && planet.id.startsWith(`bonus-${type}-`)).length;
          const toAdd = serverCount - Math.max(claimedCount, existingBonusCount);
          if (toAdd > 0) {
            const availableSlots = updated.maxSlots - updated.planets.length - newPlanets.length;
            const actuallyAdd = Math.min(toAdd, Math.max(0, availableSlots));
            const blocked = toAdd - actuallyAdd;
            if (blocked > 0) blockedByFullSlots.push({ type, count: blocked });
            const cfg = PLANET_CONFIG[type];
            for (let i = 0; i < actuallyAdd; i++) {
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
            if (actuallyAdd > 0) {
              claimedUpdates[claimedKey] = (Math.max(claimedCount, existingBonusCount) + actuallyAdd) as never;
            }
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

        if (blockedByFullSlots.length > 0) {
          const parts = blockedByFullSlots.map((b) => `${b.count} ${PLANET_CONFIG[b.type].label}`).join(", ");
          setTimeout(() => {
            toast({
              title: "Slots full",
              description: `Free up a slot to receive your bonus: ${parts}`,
            });
          }, 0);
        }

        return updated;
      });
    };

    const doSync = async () => {
      const { telegramId, firstName, username } = getTelegramContext();
      if (!telegramId) return;
      const localBalance = Math.floor(stateRef.current.balance);

      const sentEpoch = _currentBalanceEpoch;
      const sentTon = Math.max(0, stateRef.current.tonBalance || 0);
      const [syncRes, grants] = await Promise.all([
        syncBalance({ telegramId, firstName, username, zoomBalance: localBalance, tonBalance: sentTon, clientEpoch: sentEpoch }),
        fetchGrants(telegramId),
      ]);
      reconcileFromSyncResponse(localBalance, sentEpoch, syncRes, sentTon);

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
          const sentTon = Math.max(0, prev.tonBalance || 0);
          {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, zoomBalance: sent, tonBalance: sentTon, clientEpoch: sentEpoch })
            .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon));}
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
    const handleServerTonSnap = (e: Event) => {
      const detail = (e as CustomEvent<{ tonBalance: number; epoch: number }>).detail;
      if (!detail || typeof detail.tonBalance !== "number") return;
      setState((prev) => ({
        ...prev,
        tonBalance: Math.max(0, detail.tonBalance),
        lastBalanceEpoch: Math.max(prev.lastBalanceEpoch ?? 0, detail.epoch ?? 0),
      }));
    };
    window.addEventListener("zoom-admin-refresh", handleAdminRefresh);
    window.addEventListener("zoom-data-refresh", doSync);
    window.addEventListener("zoom-credit-local", handleLocalCredit as EventListener);
    window.addEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);
    window.addEventListener("zoom-server-ton-snap", handleServerTonSnap as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener("zoom-admin-refresh", handleAdminRefresh);
      window.removeEventListener("zoom-data-refresh", doSync);
      window.removeEventListener("zoom-credit-local", handleLocalCredit as EventListener);
      window.removeEventListener("zoom-server-balance-snap", handleServerSnap as EventListener);
      window.removeEventListener("zoom-server-ton-snap", handleServerTonSnap as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      const localNow = serverNow();
      setState((prev) => settleFarmingState(prev, localNow));
      stateRef.current = settleFarmingState(stateRef.current, localNow);

      const { telegramId, firstName, username } = getTelegramContext();

      if (telegramId) {
        (async () => {
          setState((prev) => {
            const settled = settleFarmingState(prev, serverNow());
            stateRef.current = settled;
            {
              const sent = Math.floor(settled.balance);
              const sentTon = Math.max(0, settled.tonBalance || 0);
              {const sentEpoch = _currentBalanceEpoch; syncBalance({ telegramId, firstName, username, zoomBalance: sent, tonBalance: sentTon, clientEpoch: sentEpoch })
                .then((r) => reconcileFromSyncResponse(sent, sentEpoch, r, sentTon));}
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
      const settled = settleFarmingState(stateRef.current, serverNow());
      // If a destructive op (burn/sell/list) just persisted authoritatively
      // (within the last 250ms) and React hasn't yet committed the new state
      // to stateRef, writing stateRef here would clobber the authoritative
      // write with the pre-op snapshot. Skip the redundant write — the
      // destructive op already saved the truth.
      if (Date.now() - _lastSavedAt > 250) {
        saveState(settled);
      }
      const { telegramId, firstName, username } = getTelegramContext();
      if (telegramId) {
        const balance = Math.floor(settled.balance);
        const tonBalance = Math.max(0, settled.tonBalance || 0);
        const payload = JSON.stringify({ telegramId, firstName, username, zoomBalance: balance, tonBalance, clientEpoch: _currentBalanceEpoch });
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
      setState((prev) => settleFarmingState(prev, serverNow()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Re-calibrate the server clock periodically and on resume so a phone that
  // sleeps for hours (or a tampered system clock that drifts mid-session)
  // can't accumulate fake earnings against the local Date.now().
  useEffect(() => {
    void refreshServerOffset();
    const interval = setInterval(() => { void refreshServerOffset(); }, 5 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) void refreshServerOffset(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const craft = useCallback((): { completed: boolean; planet?: Planet; tapsLeft?: number; broken?: boolean; brokenRarity?: PlanetType } => {
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

  const claimCraft = useCallback((): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      if (!prev.pendingPlanet) { outcome = { ok: false, reason: "No planet to claim" }; return prev; }
      // Hard slot guard: between the moment the planet finished forging and
      // the moment the user taps "claim", they may have received planets from
      // other sources (mystery box, market buy, bonus). Refuse and keep the
      // pendingPlanet so the user can free a slot and try again.
      if (prev.planets.length >= prev.maxSlots) {
        outcome = { ok: false, reason: "Slots full" };
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: "Slots full", ok: false } })); } catch { /**/ }
        return prev;
      }
      return {
        ...prev,
        planets: [...prev.planets, prev.pendingPlanet],
        pendingPlanet: null,
      };
    });
    return outcome;
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
    const now = serverNow();
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
      const now = serverNow();
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
        sun: { ...prev.sun, lastCollectedAt: serverNow() },
      };
    });
  }, []);

  const collectPlanet = useCallback((id: string): { defect: boolean } => {
    const isDefect = Math.random() < DEFECT_CHANCE;
    setState((prev) => {
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const now = serverNow();
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
      if (prev.telegramId) notifyFarmStop(prev.telegramId, id);
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
      // Sync stateRef synchronously: if the user closes the app within a few
      // ms of pressing burn (before React commits), the visibility/unload
      // flush handler reads stateRef.current. Without this line, that handler
      // would write the PRE-burn snapshot and resurrect the planet on reload.
      stateRef.current = updated;
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
      const now = serverNow();
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
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, false);
      return updated;
    });
    return outcome;
  }, []);

  const stopFarming = useCallback((id: string) => {
    setState((prev) => {
      if (prev.telegramId) notifyFarmStop(prev.telegramId, id);
      return {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, isFarmingActive: false } : p
        ),
      };
    });
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
      const updated = {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id
            ? { ...p, isListedInMarket: true, isFarmingActive: false, marketPrice: price }
            : p
        ),
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
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
      const updated = {
        ...prev,
        planets: prev.planets.map((p) =>
          p.id === id ? { ...p, isListedInMarket: false, marketPrice: null, serverListingId: undefined } : p
        ),
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
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
    const now = serverNow();
    const newPlanet: Planet = {
      id: `bought-${Date.now()}-${Math.random().toString(36).substring(2)}`,
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
    setState((prev) => {
      const updated = {
        ...prev,
        balance: prev.balance - total,
        planets: [...prev.planets, newPlanet],
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return { success: true };
  }, []);

  const serverBuyComplete = useCallback((planetType: PlanetType, planetRate: number, pricePaid: number) => {
    const cfg = PLANET_CONFIG[planetType];
    const now = serverNow();
    const newPlanet: Planet = {
      id: `bought-${Date.now()}-${Math.random().toString(36).substring(2)}`,
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
    setState((prev) => {
      const updated = {
        ...prev,
        balance: prev.balance - pricePaid,
        planets: [...prev.planets, newPlanet],
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
  }, []);

  // ---- ANTI-DUPLICATION RECONCILIATION ----
  // When a planet I listed gets bought (or admin-delisted), the asset must
  // leave my local inventory immediately. The server is already the source of
  // truth (status='sold' on market_listings, balance credited atomically) — we
  // just need to mirror that here so the same logical asset never coexists in
  // both seller and buyer inventories.
  useEffect(() => {
    // 1) Live channel: SSE broadcasts every successful sale. If the listingId
    //    matches one of my listed planets, drop it from my array.
    const close = openMarketActivityStream((sale) => {
      setState((prev) => {
        const idx = prev.planets.findIndex(
          (p) => p.isListedInMarket && p.serverListingId === sale.id,
        );
        if (idx === -1) return prev;
        const next = prev.planets.slice();
        next.splice(idx, 1);
        return { ...prev, planets: next };
      });
    });

    // 2) Reconcile on resume / periodic poll: if any of my listed planets are
    //    no longer present in the active listings on the server (because they
    //    were sold while I was offline, or force-delisted by admin), remove
    //    them locally. This catches anything the SSE missed.
    let cancelled = false;
    const reconcile = async () => {
      const myListed = stateRef.current.planets.filter(
        (p) => p.isListedInMarket && typeof p.serverListingId === "number",
      );
      if (myListed.length === 0) return;
      try {
        const active = await fetchMarketListings();
        if (cancelled) return;
        const activeIds = new Set(active.map((l) => l.id));
        const goneIds = new Set(
          myListed
            .filter((p) => !activeIds.has(p.serverListingId as number))
            .map((p) => p.serverListingId as number),
        );
        if (goneIds.size === 0) return;
        setState((prev) => ({
          ...prev,
          planets: prev.planets.filter(
            (p) =>
              !(
                p.isListedInMarket &&
                typeof p.serverListingId === "number" &&
                goneIds.has(p.serverListingId)
              ),
          ),
        }));
      } catch { /* ignore */ }
    };
    void reconcile();
    const onVisible = () => { if (!document.hidden) void reconcile(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(reconcile, 30_000);

    return () => {
      cancelled = true;
      close();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  const unlockSlot = useCallback(() => {
    setState((prev) => ({ ...prev, maxSlots: prev.maxSlots + 1 }));
  }, []);

  const claimDaily = useCallback(() => {
    const now = serverNow();
    setState((prev) => {
      if (now - prev.lastDailyClaimAt < DAILY_COLLECT_MS) return prev;
      return { ...prev, balance: prev.balance + 50, lastDailyClaimAt: now };
    });
  }, []);

  // ---- WHITE COLLECTION ACTIONS ----
  // Place an unplaced (slotIndex == null) white planet into a specific slot.
  // Once placed, the planet is permanently bound to that slot — there is no
  // unplace, no burn, no sell. Placement also auto-starts its first farming
  // cycle (free, like a freshly-crafted regular planet).
  const placeWhitePlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.whitePlanets.find((p) => p.id === id);
      if (!target) {
        outcome = { ok: false, reason: "Planet not found" };
        return prev;
      }
      if (target.slotIndex != null) {
        outcome = { ok: false, reason: "Already placed" };
        return prev;
      }
      const maxWhiteSlots = (prev.whiteCollectionBundles || (prev.whiteCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxWhiteSlots) {
        outcome = { ok: false, reason: "Invalid slot" };
        return prev;
      }
      const occupied = prev.whitePlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) {
        outcome = { ok: false, reason: "Slot occupied" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) =>
          p.id === id
            ? { ...p, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now }
            : p
        ),
      };
    });
    return outcome;
  }, []);

  // Flip a white planet back to active without touching tonBalance. Used after
  // the user pays the reactivation fee on-chain via TonConnect (same flow as
  // SUN/shop purchases). The fee is collected by the project wallet directly,
  // not deducted from the in-game tonBalance — so this method must NOT debit.
  const markWhitePlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) =>
          p.id === id
            ? { ...p, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now }
            : p
        ),
      };
    });
    return outcome;
  }, []);

  const reactivateWhitePlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const fee = PLANET_CONFIG[planet.name].reactivationFee;
      if ((prev.tonBalance || 0) < fee) {
        outcome = { ok: false, reason: `Need ${fee.toFixed(4)} TON to reactivate` };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) - fee,
        whitePlanets: prev.whitePlanets.map((p) =>
          p.id === id
            ? { ...p, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now }
            : p
        ),
      };
    });
    return outcome;
  }, []);

  // Collect TON earnings from a placed white planet. Computes the pending TON
  // accumulated since lastCollectedAt (capped to 24h) and credits it to
  // tonBalance, then resets the per-planet collect timestamp.
  const collectWhitePlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        whitePlanets: prev.whitePlanets.map((p) =>
          p.id === id ? { ...p, lastCollectedAt: now } : p
        ),
      };
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
    placeWhitePlanet, reactivateWhitePlanet, markWhitePlanetReactivated, collectWhitePlanet,
  };
}
