import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, fetchReferralData, fetchPendingReferral, debugTelegramContext, syncBalance, fetchGrants, fetchBalanceRecord, fetchServerTime, listOnMarket, delistFromMarket, recordCraft, fetchSeasonEpoch, openMarketActivityStream, fetchMarketListings, notifyFarmStart, notifyFarmCollect, notifyFarmStop, notifyPlanetBurn, fetchCollectionPlanets, upsertCollectionPlanet, bulkSeedCollectionPlanets, fetchRegularPlanets, saveRegularPlanets, syncSunCycle, settleOfflineFarming, apiHeaders, withInitData, type Grants, type CollectionPlanetState } from "../utils/api";
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

// Returns the calibrated offset, or null if the server time couldn't be
// obtained. Callers must NOT silently treat null as "0 offset" — that would
// flag the clock as ready while it's actually still on the device's local
// clock, defeating any anti-tamper logic that relies on _serverOffsetReady.
async function calibrateServerOffset(): Promise<number | null> {
  try {
    const t0 = Date.now();
    const serverTime = await fetchServerTime();
    if (serverTime == null) return null;
    const t1 = Date.now();
    const rtt = t1 - t0;
    return serverTime - (t0 + rtt / 2);
  } catch {
    return null;
  }
}

async function refreshServerOffset(): Promise<void> {
  try {
    const offset = await calibrateServerOffset();
    if (offset == null) return; // /time unreachable — keep last known state.
    // Sanity check: if RTT-noise produced something insane, ignore it.
    if (Number.isFinite(offset) && Math.abs(offset) < 365 * 24 * 3_600_000) {
      _serverOffsetMs = offset;
      _serverOffsetReady = true;
    }
  } catch { /* keep last known offset */ }
}

export type PlanetType = "BASIC" | "RARE" | "EPIC" | "GOLD" | "V1" | "WHITE1" | "WHITE2" | "WHITE3" | "WHITE4" | "EARTH1" | "EARTH2" | "EARTH3" | "EARTH4";

export const WHITE_PLANET_TYPES: PlanetType[] = ["WHITE1", "WHITE2", "WHITE3", "WHITE4"];

export function isWhitePlanet(name: PlanetType): boolean {
  return name === "WHITE1" || name === "WHITE2" || name === "WHITE3" || name === "WHITE4";
}

export const EARTH_PLANET_TYPES: PlanetType[] = ["EARTH1", "EARTH2", "EARTH3", "EARTH4"];

export function isEarthPlanet(name: PlanetType): boolean {
  return name === "EARTH1" || name === "EARTH2" || name === "EARTH3" || name === "EARTH4";
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
  claimedBonusV1: number;
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
  // Earth Collection — same model as white but with its own bundle counter,
  // claimed counter, and planet inventory (EARTH1..EARTH4).
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  claimedEarthCollectionBundles: number;
  earthPlanets: Planet[];
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
    // Reduced by 0.00005 to make room for V1 (0.005% drop) so the cumulative
    // probability sum across all rollable rarities still equals exactly 1.
    chance: 0.79445,
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
  // V1 — ultra-rare apex planet. ~10× rarer than Gold (1 in 20,000 forge).
  // Bright white "moon-like" appearance with crater spots (rendered in
  // PlanetOrb). Strongest output and highest costs in the game.
  V1: {
    rate: 400,
    color: "#f5fbff",
    glowColor: "rgba(245,251,255,0.7)",
    chance: 0.00005,
    label: "V1",
    craftCost: 250,
    activationTon: 2.0,
    tapsNeeded: 1000,
    reactivationFee: 4000,
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
  // EARTH Collection — 4 earth-themed planets per bundle. Per-planet rate
  // 0.000177 TON/h × 4 planets ≈ 0.017 TON/day combined per bundle.
  // Reactivation fee is 0.001 TON paid on-chain via TonConnect, mirroring
  // the white-planet flow.
  EARTH1: {
    rate: 0.000177,
    color: "#3b82f6",
    glowColor: "rgba(59,130,246,0.55)",
    chance: 0,
    label: "T1",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH2: {
    rate: 0.000177,
    color: "#22c55e",
    glowColor: "rgba(34,197,94,0.55)",
    chance: 0,
    label: "T2",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH3: {
    rate: 0.000177,
    color: "#0ea5e9",
    glowColor: "rgba(14,165,233,0.55)",
    chance: 0,
    label: "T3",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
    isTonFarming: true,
  },
  EARTH4: {
    rate: 0.000177,
    color: "#16a34a",
    glowColor: "rgba(22,163,74,0.55)",
    chance: 0,
    label: "T4",
    craftCost: 0,
    activationTon: 0,
    tapsNeeded: 0,
    reactivationFee: 0.001,
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
  claimedBonusV1: 0,
  claimedBonusSun: false,
  sunCount: 0,
  hasAutoTap: false,
  whiteCollectionUnlocked: false,
  whiteCollectionBundles: 0,
  claimedWhiteCollectionBundles: 0,
  whitePlanets: [],
  earthCollectionUnlocked: false,
  earthCollectionBundles: 0,
  claimedEarthCollectionBundles: 0,
  earthPlanets: [],
  tonBalance: 0,
  // Default to 0 (not serverNow()) so a brand-new device / cleared cache is
  // recognized as "no prior local settle" — the server-side /farm/settle
  // endpoint will then use the per-planet timestamps as the floor and credit
  // the legitimate offline accrual (capped per planet at 24h). The local
  // `settleFarmingState` already handles 0 safely via its `|| now` fallback,
  // so this never causes a spurious instant credit on the client.
  lastFarmingSettledAt: 0,
  claimedMilestones: [],
  defectPlanets: [],
  lastBalanceEpoch: 0,
};

/**
 * Daily-collect removal one-shot migration (May 2026), self-healing & idempotent.
 *
 * Pre-deploy state had a "needs daily collect" punishment: planets stopped
 * accruing if the user didn't press COLLECT within 24h of the previous
 * collect. The user explicitly asked that EXISTING members not lose anything:
 * any planet currently stuck in the old expired-due-to-missed-collect state
 * should auto-reactivate as if the user had just pressed collect, free.
 *
 * Detection criterion: `lastCollectedAt > farmStartedAt`. This is true ONLY
 * for planets that received at least one MANUAL collect after their last
 * start — possible only with a pre-deploy build (post-deploy startFarming
 * still sets both timestamps equal, and the COLLECT button no longer exists
 * to drift them). After migration we reset `farmStartedAt = now,
 * lastCollectedAt = 0`, which makes the check naturally false on every
 * subsequent pass — no cross-device free-reactivation loop, no flag needed.
 *
 * Safe to call on every planet load (loadState + server hydration). Brand-new
 * planets and post-migration planets are unchanged; only pre-deploy stuck
 * cycles get the one-time free reactivation.
 */
function applyDailyCollectMigration<T extends Planet>(p: T, nowMs: number): T {
  if (!p.isFarmingActive) return p;
  if (!(p.lastCollectedAt > p.farmStartedAt)) return p;
  if (nowMs - p.lastCollectedAt <= FARM_DURATION_MS) return p;
  return { ...p, farmStartedAt: nowMs, lastCollectedAt: 0 };
}

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
        // Daily-collect removal migration runs on every load via
        // `applyDailyCollectMigration`; it self-skips post-migration planets
        // (lastCollectedAt = 0 < farmStartedAt), so calling it here AND in
        // the server-hydration path is safe and idempotent. See the
        // function's docstring for the invariant.
        const nowMs = serverNow();
        const migratedPlanets = (parsed.planets || [])
          .map(migratePlanet)
          .map((p) => applyDailyCollectMigration(p, nowMs));
        const base: GameState = {
          ...INITIAL_STATE,
          ...parsed,
          planets: migratedPlanets,
          pendingPlanet: parsed.pendingPlanet ? migratePlanet(parsed.pendingPlanet) : null,
          usedRedeemCodes: parsed.usedRedeemCodes || [],
          sun: parsed.sun || null,
          referralSpeedBonus: parsed.referralSpeedBonus ?? 0,
          referredBy: parsed.referredBy ?? null,
          telegramId: parsed.telegramId ?? null,
          claimedBonusSun: parsed.claimedBonusSun ?? false,
          lastFarmingSettledAt: parsed.lastFarmingSettledAt ?? 0,
          claimedMilestones: parsed.claimedMilestones ?? [],
          lastBalanceEpoch: parsed.lastBalanceEpoch ?? 0,
          whiteCollectionBundles: (parsed as unknown as Record<string, unknown>).whiteCollectionBundles as number ?? (parsed.whiteCollectionUnlocked ? 1 : 0),
          claimedWhiteCollectionBundles:
            (parsed as unknown as Record<string, unknown>).claimedWhiteCollectionBundles as number
            ?? ((parsed as unknown as Record<string, unknown>).claimedWhiteCollection ? 1 : 0),
          whitePlanets: (parsed.whitePlanets || []).map(migratePlanet),
          earthCollectionUnlocked: (parsed as unknown as Record<string, unknown>).earthCollectionUnlocked as boolean ?? false,
          earthCollectionBundles: (parsed as unknown as Record<string, unknown>).earthCollectionBundles as number ?? 0,
          claimedEarthCollectionBundles: (parsed as unknown as Record<string, unknown>).claimedEarthCollectionBundles as number ?? 0,
          earthPlanets: ((parsed as unknown as Record<string, unknown>).earthPlanets as Planet[] | undefined ?? []).map(migratePlanet),
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

// Module-level holder for the hook's stateRef so module-scope helpers like
// `reconcileFromSyncResponse` can mutate the same source-of-truth that the
// in-component periodic doSync reads from. Set once when the hook mounts.
// Without this, the wheel/admin race-condition fix that snaps stateRef
// SYNCHRONOUSLY before bumping the epoch wouldn't compile (and at runtime
// would leave the optimistic update unapplied, losing prizes).
type StateRefHolder = { current: GameState };
let _stateRefHolder: StateRefHolder | null = null;
export function _registerStateRef(ref: StateRefHolder): void {
  _stateRefHolder = ref;
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
  // ORDER MATTERS — race fix.
  //
  // The naive ordering (bump _currentBalanceEpoch first, then dispatch the
  // setState-driven balance snap) leaves a window where:
  //   • _currentBalanceEpoch     == new (e.g. 6, just credited by the server)
  //   • stateRef.current.balance == old (still 1000 — React hasn't committed
  //                                       the snap setState yet)
  // Any sync that fires inside that window (periodic doSync, tab-switch
  // throttled doSync, or an immediate sync triggered by a stray tap) reads
  // stateRef.current.balance == 1000 and ce == 6, then sends them to the
  // server. The server's CASE WHEN balance_epoch > clientEpoch THEN keep
  // ELSE GREATEST(0, client) END takes the ELSE branch (epoch == ce, not >),
  // and overwrites the freshly credited 1100 back to 1000 — silently
  // losing the wheel/admin/marketplace prize. Symptom: the YOU WON popup
  // appears but the visible balance never rises.
  //
  // Fix: snap stateRef + _lastSyncedBalance SYNCHRONOUSLY, then bump the
  // epoch. Now any concurrent sync sees the already-snapped (balance, epoch)
  // pair and the server preserves the credit.
  const serverAdvanced = res.balanceEpoch > sentEpoch;
  const valueDiverged = res.zoomBalance !== sentBalance;
  if (serverAdvanced && valueDiverged) {
    if (_stateRefHolder) {
      _stateRefHolder.current = { ..._stateRefHolder.current, balance: res.zoomBalance };
    }
    _lastSyncedBalance = res.zoomBalance;
    _pendingSyncBalance = -1;
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
        detail: { balance: res.zoomBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
  }
  // For TON we use a non-destructive merge on the server (GREATEST), so the
  // server can return a value HIGHER than what we sent even when the epoch
  // didn't advance (e.g. an earlier session credited TON, or an admin grant
  // bumped the stored balance). Whenever the server reports a strictly
  // higher TON than the client sent, snap local up so the user actually
  // sees the credited amount. Same synchronous-stateRef-first ordering as
  // the ZOOM snap above, for the same race-window reason.
  if (
    typeof res.tonBalance === "number" &&
    typeof sentTonBalance === "number" &&
    (res.tonBalance ?? 0) - (sentTonBalance ?? 0) > 1e-9
  ) {
    if (_stateRefHolder) {
      _stateRefHolder.current = { ..._stateRefHolder.current, tonBalance: res.tonBalance };
    }
    _lastSyncedTonBalance = res.tonBalance;
    try {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.tonBalance, epoch: res.balanceEpoch },
      }));
    } catch { /**/ }
  }
  // Bump the epoch LAST so any sync that fires after this point already sees
  // the snapped balance/TON in stateRef + _lastSyncedBalance.
  setCurrentBalanceEpoch(res.balanceEpoch);
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

function makeEarthCollectionPlanets(bundleIndex = 0): Planet[] {
  const now = serverNow();
  return EARTH_PLANET_TYPES.map((type, i) => {
    const cfg = PLANET_CONFIG[type];
    return {
      id: `earth-${type}-b${bundleIndex}-${now}-${i}-${Math.random().toString(36).slice(2)}`,
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

// Parse the (kind, bundleIndex, subIndex) tuple out of a White or Earth
// collection planet id. Returns null for any other planet id (regular,
// bonus, marketplace, etc.). Format produced by makeWhiteCollectionPlanets
// / makeEarthCollectionPlanets:
//   `${kind}-${type}-b${bundleIndex}-${now}-${i}-${random}`
//
// `now` is `serverNow()` which can be a float (server-time offset includes
// half-RTT calibration), so the timestamp segment must allow `.<digits>`.
export function parseCollectionPlanetKey(
  id: string,
): { kind: "white" | "earth"; bundleIndex: number; subIndex: number } | null {
  const m = /^(white|earth)-[A-Z0-9]+-b(\d+)-\d+(?:\.\d+)?-(\d+)-/.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as "white" | "earth",
    bundleIndex: parseInt(m[2]!, 10),
    subIndex: parseInt(m[3]!, 10),
  };
}

// Snapshot the server-persisted state for a collection planet (used by the
// upsert calls below). Returns null when the planet id can't be parsed,
// which means the upsert should be skipped.
function snapshotCollectionPlanet(p: Planet): CollectionPlanetState | null {
  const key = parseCollectionPlanetKey(p.id);
  if (!key) return null;
  return {
    kind: key.kind,
    bundleIndex: key.bundleIndex,
    subIndex: key.subIndex,
    slotIndex: p.slotIndex ?? null,
    isFarmingActive: !!p.isFarmingActive,
    farmStartedAtMs: p.farmStartedAt ?? 0,
    lastCollectedAtMs: p.lastCollectedAt ?? 0,
  };
}

// Merge server-persisted slot/farming state into a freshly materialized (or
// already-loaded) array of collection planets. Planets that have a matching
// server record adopt the server values for slotIndex / isFarmingActive /
// farmStartedAt / lastCollectedAt — every other field stays as-is.
function applyServerOverrides(
  planets: Planet[],
  serverByKey: Map<string, CollectionPlanetState>,
): Planet[] {
  if (planets.length === 0 || serverByKey.size === 0) return planets;
  return planets.map((p) => {
    const key = parseCollectionPlanetKey(p.id);
    if (!key) return p;
    const sp = serverByKey.get(`${key.kind}-${key.bundleIndex}-${key.subIndex}`);
    if (!sp) return p;
    return {
      ...p,
      slotIndex: sp.slotIndex ?? null,
      isFarmingActive: sp.isFarmingActive,
      farmStartedAt: sp.farmStartedAtMs,
      lastCollectedAt: sp.lastCollectedAtMs,
    };
  });
}

function indexServerCollectionPlanets(
  serverPlanets: CollectionPlanetState[],
): Map<string, CollectionPlanetState> {
  const map = new Map<string, CollectionPlanetState>();
  for (const sp of serverPlanets) {
    map.set(`${sp.kind}-${sp.bundleIndex}-${sp.subIndex}`, sp);
  }
  return map;
}

// Fire-and-forget upsert of a single collection planet's server state. All
// collection-planet mutations (place, collect, reactivate, mark-reactivated)
// call this so the server stays in lockstep with the client.
function persistCollectionPlanet(telegramId: string | null | undefined, planet: Planet): void {
  if (!telegramId) return;
  const snap = snapshotCollectionPlanet(planet);
  if (!snap) return;
  void upsertCollectionPlanet(telegramId, snap);
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
    // farmStartedAt and lastCollectedAt remain 0 until the user actually
    // presses START for the first time. This is what lets startFarming
    // distinguish "never been started" from "mid-cycle, just paused" —
    // which in turn closes the marketplace cooldown-reset exploit
    // (list → delist → START would otherwise grant a free fresh cycle).
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
    craftCost: cfg.craftCost,
  };
}

/**
 * Hard cutoff for the legacy never-started migration. Planets created on or
 * after this instant always use the new init scheme (farmStartedAt = 0), so
 * the migration is irrelevant to them and we refuse to touch them. Anything
 * created before this instant predates the fix and is eligible for the
 * migration check below.
 *
 * Set to the deploy moment of this fix (April 27, 2026 UTC). This bound is
 * what eliminates any theoretical risk of misclassifying a planet that was
 * (somehow) started in the same millisecond as its creation under the old
 * code — such a planet, by definition, was created before the cutoff, but
 * also we further require strict timestamp equality below, and the cutoff
 * guarantees the migration cannot run forever / on future planets.
 */
const LEGACY_PLANET_MIGRATION_CUTOFF_MS = Date.UTC(2026, 3, 27, 0, 0, 0);

/**
 * One-time migration for legacy planets stored with farmStartedAt = createdAt.
 *
 * Before the cooldown-reset fix, every newly created planet (craft, bonus
 * grant, buyer copy) was initialized with farmStartedAt = lastCollectedAt =
 * createdAt = now, AND startFarming reset both timestamps to "now" on every
 * call. After the fix, never-started planets must start at 0 so that the
 * very first START opens a fresh 24h cycle. Legacy planets already in the
 * user's local/server snapshot would otherwise be misclassified as
 * "mid-cycle, just paused" and either resume from craft time or, if more
 * than 24h have passed since craft, demand a reactivation fee for a cycle
 * the user never actually got to use.
 *
 * The detection is conservative on multiple axes:
 *   - Active or listed planets are skipped (they are clearly in use).
 *   - farmStartedAt must be > 0 (new planets already use 0).
 *   - farmStartedAt and lastCollectedAt must both exactly equal createdAt
 *     (the unique fingerprint of the legacy "just-crafted-never-started"
 *     state under the old init code).
 *   - createdAt must be strictly before the deploy cutoff. Combined with
 *     the inits-as-zero rule, this guarantees no future planet can ever
 *     match the migration fingerprint, so the migration ages out naturally.
 *
 * After the very first START under the new code, farmStartedAt no longer
 * equals createdAt (start time > craft time), so the migration self-
 * disables for that planet too.
 *
 * Documented residual ambiguity (accepted tradeoff):
 *   The migration cannot mathematically distinguish a true never-started
 *   pre-cutoff planet from one that was started in the same millisecond as
 *   its creation under the old code. A "false positive" here would gift a
 *   single fresh 24h cycle to a single legacy planet. We accept this for
 *   two reasons: (a) sub-millisecond human reaction time is physically
 *   impossible (>16ms render frames, ~100ms minimum human reaction), and
 *   the craft → render → tap pipeline forces multiple ticks between craft
 *   time and any START click, so in practice no real planet ever has
 *   farmStartedAt === createdAt unless it was truly never started; (b) the
 *   alternative (no migration) charges real users a reactivation fee in
 *   TON for cycles they never actually used, which is a far worse
 *   real-money outcome than the theoretical false positive.
 */
function migrateLegacyNeverStartedPlanet<T extends Planet>(p: T): T {
  if (p.isFarmingActive) return p;
  if (p.isListedInMarket) return p;
  if (p.farmStartedAt <= 0) return p;
  if (p.farmStartedAt !== p.createdAt) return p;
  if (p.lastCollectedAt !== p.createdAt) return p;
  if (p.createdAt >= LEGACY_PLANET_MIGRATION_CUTOFF_MS) return p;
  return { ...p, farmStartedAt: 0, lastCollectedAt: 0 };
}

/**
 * "Effective" farm start timestamp.
 *
 * As of the daily-collect removal, the 24h farming cycle is anchored to a
 * single timestamp. For brand-new cycles this is just `farmStartedAt`. For
 * planets that existed BEFORE the daily-collect removal and had already
 * been collected at least once, `lastCollectedAt` may be more recent than
 * `farmStartedAt`. Using the max of the two means those planets get a fresh
 * 24h window starting from the last time the user pressed COLLECT — exactly
 * the "riattiva automaticamente, come se avessi appena cliccato collect"
 * migration the user asked for. Idempotent and zero-cost: for new planets
 * (lastCollectedAt = 0) it collapses to `farmStartedAt`.
 */
export function effectiveFarmStart(planet: Planet): number {
  return Math.max(planet.farmStartedAt || 0, planet.lastCollectedAt || 0);
}

export function isFarmActive(planet: Planet): boolean {
  if (!planet.isFarmingActive) return false;
  if (planet.isListedInMarket) return false;
  const start = effectiveFarmStart(planet);
  if (start <= 0) return false;
  return serverNow() - start <= FARM_DURATION_MS;
}

export function isSunActive(sun: SunState): boolean {
  if (!sun.isActive) return false;
  const now = serverNow();
  if (now - sun.farmStartedAt > FARM_DURATION_MS) return false;
  if (now - sun.lastCollectedAt > DAILY_COLLECT_MS) return false;
  return true;
}

export function getFarmTimeRemaining(planet: Planet): number {
  const start = effectiveFarmStart(planet);
  if (start <= 0) return 0;
  return Math.max(0, start + FARM_DURATION_MS - serverNow());
}

/**
 * Planet's 24h farming cycle has elapsed and the user must pay a reactivation
 * fee to start a new cycle. Excludes never-started planets and listed planets.
 */
export function isFarmExpired(planet: Planet): boolean {
  if (planet.isListedInMarket) return false;
  const start = effectiveFarmStart(planet);
  if (start <= 0) return false;
  return serverNow() - start > FARM_DURATION_MS;
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
  // Defensive: if a TON-farming planet somehow lingers in state after the
  // admin revoked the underlying collection, we still don't credit anything.
  // Callers should also strip the planets from state, but this guard ensures
  // the live balance display can never re-credit a revoked collection.
  if (cfg.isTonFarming && !planet.farmStartedAt) return 0;
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

// Reactivation fee scales with how many SUNs the user owns: each SUN multiplies
// the per-cycle yield (1000/hr * sunCount), so each SUN must also pay its share
// of the fee — otherwise multi-SUN owners would reactivate for a fraction of
// what they earn. With sunCount=1 this is the historical 12,000 ZOOM.
// If the user owns no SUN, the fee is 0 (nothing to reactivate).
export function getSunReactivationFee(sunCount: number = 1): number {
  const n = Math.max(0, sunCount || 0);
  if (n <= 0) return 0;
  return SUN_CONFIG.reactivationFee * n;
}

export function getSunTimeRemaining(sun: SunState): number {
  if (!sun.isActive) return 0;
  const expiry = sun.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - serverNow());
}

/**
 * DEPRECATED — daily collect was removed. Planets now farm autonomously for
 * the full 24h cycle and then need a $ZOOM reactivation, with no manual
 * intermediate step. Kept exported as a no-op so any cached client code or
 * re-export site keeps compiling; always returns false so no UI ever renders
 * the old COLLECT button. Safe to delete in a future cleanup pass.
 */
export function needsCollect(_planet: Planet): boolean {
  return false;
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
    // Daily-collect removed: cycle window is the single 24h block starting at
    // effectiveFarmStart (= max(farmStartedAt, lastCollectedAt) so pre-deploy
    // planets that had already been collected get fresh 24h from the last
    // collect — see effectiveFarmStart() docstring).
    const eff = effectiveFarmStart(planet);
    if (eff <= 0) continue;
    const start = Math.max(from, eff);
    const end = Math.min(now, eff + FARM_DURATION_MS);
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
  // Expose stateRef to module-scope helpers (`reconcileFromSyncResponse`)
  // so they can perform the synchronous wheel/admin race-fix snap into
  // the same source-of-truth that the periodic doSync reads from. The
  // hook's `stateRef.current = state` line below keeps it fresh on every
  // React commit; this single registration only re-points the holder once
  // (on mount) — re-registering on every render would be harmless but is
  // unnecessary, the ref's `.current` updates flow through automatically.
  if (_stateRefHolder !== stateRef) {
    _registerStateRef(stateRef);
  }
  const serverOffsetRef = useRef(0);
  // Becomes true once the initial flow has hydrated state from the server
  // (or confirmed there's nothing to hydrate). Until then we suppress the
  // regular-planets server save effect so we never overwrite the server
  // copy with a stale local snapshot during the brief window between the
  // first React render and the async fetch completing.
  const regularPlanetsHydratedRef = useRef(false);
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

      // Server-authoritative offline accrual. Runs in parallel with the
      // other fetches; uses the local watermark as a floor so legacy
      // devices that have been crediting offline accrual locally are
      // protected from a one-off double-credit on the very first
      // server-side settle. See settleOfflineFarming() doc for details.
      const _initClientFloor = Math.floor(stateRef.current.lastFarmingSettledAt || 0);
      const [refData, grants, balanceRecord, serverCollectionPlanets, serverRegular, settleRes] = await Promise.all([
        fetchReferralData(telegramId),
        fetchGrants(telegramId),
        fetchBalanceRecord(telegramId),
        fetchCollectionPlanets(telegramId),
        fetchRegularPlanets(telegramId),
        settleOfflineFarming({ telegramId, clientLastSettledAtMs: _initClientFloor }),
      ]);
      const serverCollectionByKey = indexServerCollectionPlanets(serverCollectionPlanets);

      // Prefer the post-credit balance returned by /farm/settle when the
      // user row exists; it always supersedes balanceRecord (which was
      // fetched in parallel and may pre-date the credit by a few ms).
      const serverBalance = settleRes.exists
        ? settleRes.balance
        : balanceRecord?.exists ? balanceRecord.zoomBalance : 0;
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
          // Adopt the server's settle watermark so subsequent client-side
          // ticks (and the next /farm/settle call) compute deltas from the
          // exact instant the server just authoritatively credited from.
          // Monotonic max ensures we never roll the watermark backwards if
          // the local one happened to be ahead (clock skew, race).
          lastFarmingSettledAt: settleRes.exists
            ? Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs)
            : (prev.lastFarmingSettledAt || 0),
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

        // ─── SUN CYCLE — server is source of truth when ahead ───
        // The 24h cycle (started/collected timestamps + cycleCount) used to
        // live only in localStorage. Losing localStorage (cache wipe, new
        // device, certain Telegram WebView clears) silently reset the cycle
        // and forced the user to press FARM again. Now the server mirrors
        // these fields and we merge with max() — newer-on-server values win
        // (e.g. cycle started on another device); newer-on-local values are
        // preserved and will be pushed up on the next /sun/cycle write.
        if (updated.sun?.isOwned) {
          const srvStarted = Math.max(0, Number(grants.sunFarmStartedAtMs ?? 0));
          const srvCollected = Math.max(0, Number(grants.sunLastCollectedAtMs ?? 0));
          const srvCycleCount = Math.max(0, Number(grants.sunCycleCount ?? 0));
          const localStarted = updated.sun.farmStartedAt ?? 0;
          const localCollected = updated.sun.lastCollectedAt ?? 0;
          const localCycleCount = updated.sun.cycleCount ?? 0;
          const mergedStarted = Math.max(localStarted, srvStarted);
          const mergedCollected = Math.max(localCollected, srvCollected);
          updated = {
            ...updated,
            sun: {
              ...updated.sun,
              farmStartedAt: mergedStarted,
              lastCollectedAt: mergedCollected,
              cycleCount: Math.max(localCycleCount, srvCycleCount),
              // Treat the cycle as active whenever a non-zero start exists.
              // The is-active gate is enforced separately by isSunActive()
              // (which also checks the 24h window), so this is just the
              // "user has activated at some point" flag.
              isActive: mergedStarted > 0 ? true : updated.sun.isActive,
            },
          };
        }

        // ─── REGULAR PLANETS — server is source of truth ───
        // Only act on a SUCCESSFUL fetch (serverRegular.ok). On a network
        // failure we leave local state alone AND keep the save gate closed
        // (handled below) — otherwise a flaky network would let us push
        // an empty/stale local snapshot over the real server inventory.
        // When the fetch succeeds and the server has a non-empty stored
        // array, we override local planets[] with it. The per-rarity
        // claimed-bonus counters use Math.max(local, server) so a stale
        // server value can never double-count by being smaller than what
        // the local app already materialized.
        if (serverRegular.ok) {
          if (serverRegular.exists && (serverRegular.planets.length > 0 || stateRef.current.planets.length === 0)) {
            // Apply BOTH migrations as we hydrate so server-stored pianeti
            // arrive normalized for the rest of the app:
            //   1) `migrateLegacyNeverStartedPlanet` — fix old never-started
            //      planets that had spurious non-zero timestamps.
            //   2) `applyDailyCollectMigration` — daily-collect removal:
            //      pre-deploy planets stuck "expired due to missed collect"
            //      get a free 24h reactivation exactly once. Self-healing
            //      via the `lastCollectedAt > farmStartedAt` check, so it's
            //      safe to run here even though loadState already ran it on
            //      the local snapshot — server data is authoritative and
            //      may still hold pre-migration timestamps. The 1.2s
            //      debounced `saveRegularPlanets` below will then push the
            //      migrated values back to the server.
            const nowMs = serverNow();
            updated = {
              ...updated,
              planets: (serverRegular.planets as unknown as Planet[])
                .map(migrateLegacyNeverStartedPlanet)
                .map((p) => applyDailyCollectMigration(p, nowMs)),
            };
          }
          updated = {
            ...updated,
            claimedBonusBasic: Math.max(updated.claimedBonusBasic ?? 0, serverRegular.claimedBonusBasic),
            claimedBonusRare:  Math.max(updated.claimedBonusRare  ?? 0, serverRegular.claimedBonusRare),
            claimedBonusEpic:  Math.max(updated.claimedBonusEpic  ?? 0, serverRegular.claimedBonusEpic),
            claimedBonusGold:  Math.max(updated.claimedBonusGold  ?? 0, serverRegular.claimedBonusGold),
            claimedBonusV1:    Math.max(updated.claimedBonusV1    ?? 0, serverRegular.claimedBonusV1),
          };
        }

        const serverBundles = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        const serverEarthBundles = Math.max(0, Number(grants.earthCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles > 0,
          whiteCollectionBundles: serverBundles,
          earthCollectionUnlocked: !!grants.earthCollectionUnlocked || serverEarthBundles > 0,
          earthCollectionBundles: serverEarthBundles,
        };

        // White Collection: each owned bundle materializes 4 fresh white
        // planets exactly once. We track how many bundles have already been
        // materialized via claimedWhiteCollectionBundles so re-grants never
        // duplicate. When the server count drops (admin revoke), we strip
        // any bundles beyond the new server count so generation stops at
        // once and the live TON balance no longer credits revoked planets.
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
        } else if (serverBundles < claimedBundles) {
          // Keep only planets whose bundle index (encoded as `…-b<N>-…` in
          // the planet id by makeWhiteCollectionPlanets) is below the new
          // server count. Anything else is removed instantly.
          const keep = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverBundles;
          };
          updated = {
            ...updated,
            claimedWhiteCollectionBundles: serverBundles,
            whitePlanets: (updated.whitePlanets || []).filter(keep),
          };
        }

        // Earth Collection: same materialization model as white, with the
        // same admin-revoke handling.
        const claimedEarthBundles = Math.max(0, updated.claimedEarthCollectionBundles ?? 0);
        if (serverEarthBundles > claimedEarthBundles) {
          const toMaterializeEarth = serverEarthBundles - claimedEarthBundles;
          const newEarthPlanets: Planet[] = [];
          for (let b = 0; b < toMaterializeEarth; b++) {
            newEarthPlanets.push(...makeEarthCollectionPlanets(claimedEarthBundles + b));
          }
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles,
            earthPlanets: [...(updated.earthPlanets || []), ...newEarthPlanets],
          };
        } else if (serverEarthBundles < claimedEarthBundles) {
          const keepEarth = (p: Planet) => {
            const m = /-b(\d+)-/.exec(p.id);
            const idx = m ? parseInt(m[1]!, 10) : 0;
            return idx < serverEarthBundles;
          };
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles,
            earthPlanets: (updated.earthPlanets || []).filter(keepEarth),
          };
        }

        // ─── SERVER COLLECTION-PLANET STATE — single source of truth ───
        // After (re)materializing white/earth planets, override slot index
        // and farming timers with whatever the server has on file. This is
        // what survives a localStorage wipe: even if every white planet was
        // just freshly minted with `slotIndex=null`, the server still knows
        // which one was in slot #2 and when its farming timer started.
        if (serverCollectionByKey.size > 0) {
          updated = {
            ...updated,
            whitePlanets: applyServerOverrides(updated.whitePlanets || [], serverCollectionByKey),
            earthPlanets: applyServerOverrides(updated.earthPlanets || [], serverCollectionByKey),
          };
        }

        // One-shot migration: if the local state has placed/farming planets
        // but the server doesn't know about them yet (existing users from
        // before this feature shipped), push them up. This runs at most
        // once per session and is a no-op for new users / fresh installs.
        const toSeed: CollectionPlanetState[] = [];
        for (const p of updated.whitePlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          // Only seed planets that actually carry state worth preserving
          // — leaving inventory/inactive planets to be created on first
          // mutation keeps the seed payload tiny.
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        for (const p of updated.earthPlanets || []) {
          const snap = snapshotCollectionPlanet(p);
          if (!snap) continue;
          const k = `${snap.kind}-${snap.bundleIndex}-${snap.subIndex}`;
          if (serverCollectionByKey.has(k)) continue;
          if (snap.slotIndex != null || snap.isFarmingActive || snap.lastCollectedAtMs > 0) {
            toSeed.push(snap);
          }
        }
        if (toSeed.length > 0) {
          void bulkSeedCollectionPlanets(telegramId, toSeed);
        }

        // Apply pending bonus planets per type (only new ones not yet claimed)
        const bonusTypes: Array<{ key: "bonusBasic" | "bonusRare" | "bonusEpic" | "bonusGold" | "bonusV1"; claimedKey: "claimedBonusBasic" | "claimedBonusRare" | "claimedBonusEpic" | "claimedBonusGold" | "claimedBonusV1"; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare", claimedKey: "claimedBonusRare", type: "RARE" },
          { key: "bonusEpic", claimedKey: "claimedBonusEpic", type: "EPIC" },
          { key: "bonusGold", claimedKey: "claimedBonusGold", type: "GOLD" },
          { key: "bonusV1",   claimedKey: "claimedBonusV1",   type: "V1" },
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
                // Never-started until first user-triggered START — see makePlanet.
                farmStartedAt: 0,
                lastCollectedAt: 0,
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
          }
          // NOTE: we intentionally do NOT delete planets when toAdd < 0
          // (server bonus counter is below the local materialized count).
          // Real money is at stake — silently destroying user planets due
          // to a counter desync (admin reset, race with /planets/burn,
          // GREATEST high-water-mark on claimed_bonus_*) caused the
          // "10 RARE planets disappeared" complaint from @lektig.
          // Grow-only reconciliation: bonus planets can only be created
          // here, never removed. Burns/sales are the only legitimate
          // ways for a bonus planet to leave the inventory.
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
      // Server hydration is done ONLY if the fetch actually succeeded.
      // On a transient failure we keep the gate closed so the debounced
      // save effect doesn't push our possibly-stale local snapshot over
      // the (still good) server inventory. The next page load will retry.
      if (serverRegular.ok) {
        regularPlanetsHydratedRef.current = true;
      }
    })();
  }, []);

  // ─── Debounced server save for regular planets ───
  // Watches state.planets and the per-rarity claimed-bonus counters; when
  // any of them change, schedules a single PUT to the server 1.2s later.
  // Coalescing is on purpose: rapid taps (collect/start farm) update
  // farmStartedAt/lastCollectedAt many times per second and we don't want
  // to hammer the API. Save is suppressed until the initial flow has
  // hydrated state from the server (see regularPlanetsHydratedRef).
  useEffect(() => {
    if (!regularPlanetsHydratedRef.current) return;
    const tid = state.telegramId;
    if (!tid) return;
    const t = setTimeout(() => {
      void saveRegularPlanets(
        tid,
        state.planets as unknown as Array<Record<string, unknown>>,
        {
          basic: state.claimedBonusBasic ?? 0,
          rare:  state.claimedBonusRare  ?? 0,
          epic:  state.claimedBonusEpic  ?? 0,
          gold:  state.claimedBonusGold  ?? 0,
          v1:    state.claimedBonusV1    ?? 0,
        },
      );
    }, 1200);
    return () => clearTimeout(t);
  }, [
    state.telegramId,
    state.planets,
    state.claimedBonusBasic,
    state.claimedBonusRare,
    state.claimedBonusEpic,
    state.claimedBonusGold,
    state.claimedBonusV1,
  ]);

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

        // Same SUN-cycle merge as the initial hydration above. See the long
        // comment there for why this exists; this branch covers periodic
        // /grants polls that may pick up cycle changes from another device.
        if (updated.sun?.isOwned) {
          const srvStarted = Math.max(0, Number(grants.sunFarmStartedAtMs ?? 0));
          const srvCollected = Math.max(0, Number(grants.sunLastCollectedAtMs ?? 0));
          const srvCycleCount = Math.max(0, Number(grants.sunCycleCount ?? 0));
          const localStarted = updated.sun.farmStartedAt ?? 0;
          const localCollected = updated.sun.lastCollectedAt ?? 0;
          const localCycleCount = updated.sun.cycleCount ?? 0;
          const mergedStarted = Math.max(localStarted, srvStarted);
          const mergedCollected = Math.max(localCollected, srvCollected);
          updated = {
            ...updated,
            sun: {
              ...updated.sun,
              farmStartedAt: mergedStarted,
              lastCollectedAt: mergedCollected,
              cycleCount: Math.max(localCycleCount, srvCycleCount),
              isActive: mergedStarted > 0 ? true : updated.sun.isActive,
            },
          };
        }

        const serverBundles2 = Math.max(0, Number(grants.whiteCollectionBundles ?? 0));
        const serverEarthBundles2 = Math.max(0, Number(grants.earthCollectionBundles ?? 0));
        updated = {
          ...updated,
          maxSlots: Math.max(INITIAL_STATE.maxSlots, INITIAL_STATE.maxSlots + grants.bonusSlots),
          hasAutoTap: !!grants.hasAutoTap,
          whiteCollectionUnlocked: !!grants.whiteCollectionUnlocked || serverBundles2 > 0,
          whiteCollectionBundles: serverBundles2,
          earthCollectionUnlocked: !!grants.earthCollectionUnlocked || serverEarthBundles2 > 0,
          earthCollectionBundles: serverEarthBundles2,
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
        // Grow-only: never delete white-collection planets when the server
        // bundle counter is below the local claimed count. Same protection
        // as bonus-planet reconciliation — real money is at stake.

        const claimedEarthBundles2 = Math.max(0, updated.claimedEarthCollectionBundles ?? 0);
        if (serverEarthBundles2 > claimedEarthBundles2) {
          const toMaterializeEarth2 = serverEarthBundles2 - claimedEarthBundles2;
          const newEarthPlanets2: Planet[] = [];
          for (let b = 0; b < toMaterializeEarth2; b++) {
            newEarthPlanets2.push(...makeEarthCollectionPlanets(claimedEarthBundles2 + b));
          }
          updated = {
            ...updated,
            claimedEarthCollectionBundles: serverEarthBundles2,
            earthPlanets: [...(updated.earthPlanets || []), ...newEarthPlanets2],
          };
        }
        // Grow-only: never delete earth-collection planets when the server
        // bundle counter is below the local claimed count.

        const bonusTypes: Array<{ key: keyof Grants; claimedKey: keyof GameState; type: PlanetType }> = [
          { key: "bonusBasic", claimedKey: "claimedBonusBasic", type: "BASIC" },
          { key: "bonusRare",  claimedKey: "claimedBonusRare",  type: "RARE" },
          { key: "bonusEpic",  claimedKey: "claimedBonusEpic",  type: "EPIC" },
          { key: "bonusGold",  claimedKey: "claimedBonusGold",  type: "GOLD" },
          { key: "bonusV1",    claimedKey: "claimedBonusV1",    type: "V1" },
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
                // Never-started until first user-triggered START — see makePlanet.
                farmStartedAt: 0,
                lastCollectedAt: 0,
                isListedInMarket: false,
                isFarmingActive: false,
                marketPrice: null,
                craftCost: cfg.craftCost,
              });
            }
            if (actuallyAdd > 0) {
              claimedUpdates[claimedKey] = (Math.max(claimedCount, existingBonusCount) + actuallyAdd) as never;
            }
          }
          // See companion block above: NEVER delete planets via grant
          // reconciliation. Grow-only — protects against counter desync
          // wiping real-money assets.
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

      // SEQUENTIAL ORDERING (race fix, May 2026): /farm/settle runs FIRST,
      // then /balance/sync. If we ran them in parallel, /balance/sync would
      // send the *pre-credit* localBalance and — since /balance/sync writes
      //   CASE WHEN server_epoch > clientEpoch THEN server ELSE client
      // — could overwrite a freshly server-side credited amount the moment
      // the epoch race went the wrong way. /farm/settle now bumps the
      // server's `balance_epoch` whenever it credits, so by the time we
      // call /balance/sync below the local epoch tracker is already
      // advanced and the value we send is the post-credit one.
      const _doSyncClientFloor = Math.floor(stateRef.current.lastFarmingSettledAt || 0);
      const settleRes = await settleOfflineFarming({
        telegramId,
        clientLastSettledAtMs: _doSyncClientFloor,
      });

      if (settleRes.exists && settleRes.credited > 0) {
        // Apply the server credit locally + advance both watermark and
        // epoch trackers BEFORE the syncBalance below, so the sync sends
        // the post-credit balance with the post-credit epoch. The server
        // CASE check then matches (epoch == sent) and falls through to the
        // client value — no overwrite possible.
        setState((prev) => {
          const next = {
            ...prev,
            balance: prev.balance + settleRes.credited,
            totalEarned: prev.totalEarned + settleRes.credited,
            seasonPoolEarned: prev.seasonPoolEarned + settleRes.credited,
            lastFarmingSettledAt: Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs),
            lastBalanceEpoch: Math.max(prev.lastBalanceEpoch || 0, settleRes.balanceEpoch),
          };
          stateRef.current = next;
          return next;
        });
        setCurrentBalanceEpoch(settleRes.balanceEpoch);
      } else if (settleRes.exists && settleRes.settledAtMs > _doSyncClientFloor) {
        // Heartbeat path: no credit but server's watermark advanced. Mirror
        // it locally so the next /farm/settle short-circuits cleanly.
        setState((prev) => {
          const next = {
            ...prev,
            lastFarmingSettledAt: Math.max(prev.lastFarmingSettledAt || 0, settleRes.settledAtMs),
          };
          stateRef.current = next;
          return next;
        });
      }

      // Now sync the (possibly-credited) balance + epoch.
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
        if (serverBal !== localBal) {
          // ORDER MATTERS — see the long comment in reconcileFromSyncResponse.
          // Briefly: we snap stateRef + _lastSyncedBalance SYNCHRONOUSLY
          // BEFORE adopting the server's new epoch, so any concurrent sync
          // (periodic doSync, throttled tab-switch refresh, immediate sync
          // from a tap) sees the new (balance, epoch) pair atomically and
          // can't echo the stale local balance back to the server with the
          // new epoch — which would cause the server's CASE WHEN epoch>ce
          // ELSE GREATEST(0, client) merge to clobber a freshly credited
          // wheel/admin/marketplace prize. Symptom of getting this wrong:
          // YOU WON popup appears but the visible balance never rises.
          stateRef.current = { ...stateRef.current, balance: serverBal, lastBalanceEpoch: balanceRecord.balanceEpoch };
          _lastSyncedBalance = serverBal;
          _pendingSyncBalance = -1;
          setCurrentBalanceEpoch(balanceRecord.balanceEpoch);
          setState((prev) => ({ ...prev, balance: serverBal, lastBalanceEpoch: balanceRecord.balanceEpoch }));
        } else {
          // Even when balances already agree, keep the stateRef + epoch
          // ordering consistent so any concurrent sync sees a coherent pair.
          stateRef.current = { ...stateRef.current, lastBalanceEpoch: balanceRecord.balanceEpoch };
          setCurrentBalanceEpoch(balanceRecord.balanceEpoch);
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

          // Bump the server-side watermark right after a visibility resume
          // (which may have been preceded by hours of throttled / paused
          // background timers in the Telegram WebView). Without this, the
          // server still thinks "lastSettled = before-background" and the
          // next /farm/settle from a different device would recredit a
          // period the client just credited locally above.
          void settleOfflineFarming({
            telegramId,
            clientLastSettledAtMs: Math.floor(stateRef.current.lastFarmingSettledAt || 0),
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
        // Embed initData in the body — sendBeacon can't set custom headers,
        // so the server middleware accepts `_initData` as a fallback. The
        // fallback fetch() also includes the X-Telegram-Init-Data header
        // via apiHeaders() for belt-and-suspenders.
        const beaconBody = withInitData({ telegramId, firstName, username, zoomBalance: balance, tonBalance, clientEpoch: _currentBalanceEpoch });
        const payload = JSON.stringify(beaconBody);
        const url = `${window.location.origin}/api/balance/sync`;
        const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }));
        if (!sent) {
          fetch(url, { method: "POST", headers: apiHeaders(), body: payload, keepalive: true }).catch(() => {});
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
    let newCycleCount = 0;
    let telegramId: string | null = null;
    setState((prev) => {
      if (!prev.sun?.isOwned) return prev;
      // No activation cost — SUN was paid for once at purchase (10 TON).
      // Each new cycle simply resets the timer for free.
      newCycleCount = (prev.sun.cycleCount || 0) + 1;
      telegramId = prev.telegramId;
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: true,
          cycleCount: newCycleCount,
          activationCost: 0,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
    });
    // Persist the new cycle to the server so it survives a localStorage
    // wipe / device switch. Fire-and-forget — local state is already correct;
    // server merges with GREATEST so a slow/failed write can't roll us back.
    if (telegramId) {
      void syncSunCycle({
        telegramId,
        sunFarmStartedAtMs: Math.round(now),
        sunLastCollectedAtMs: Math.round(now),
        sunCycleCount: newCycleCount,
      });
    }
  }, []);

  const startSunFarming = useCallback((): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    let pushTelegramId: string | null = null;
    let pushNow = 0;
    let pushCycleCount = 0;
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
      // Fee scales with how many SUNs are owned (each SUN multiplies the
      // per-cycle yield, so each SUN must also pay its share).
      const fee = expired ? getSunReactivationFee(prev.sunCount) : 0;
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
      pushTelegramId = prev.telegramId;
      pushNow = now;
      // updated.sun is non-null here: we just constructed it above with
      // `sun: { ...prev.sun, ... }` after the prev.sun?.isOwned guard.
      pushCycleCount = updated.sun?.cycleCount ?? 0;
      return updated;
    });
    // Mirror the cycle to the server (see activateSun for rationale).
    if (pushTelegramId) {
      void syncSunCycle({
        telegramId: pushTelegramId,
        sunFarmStartedAtMs: Math.round(pushNow),
        sunLastCollectedAtMs: Math.round(pushNow),
        sunCycleCount: pushCycleCount,
      });
    }
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
    let pushTelegramId: string | null = null;
    let pushNow = 0;
    let pushStarted = 0;
    let pushCycleCount = 0;
    setState((prev) => {
      if (!prev.sun) return prev;
      const now = serverNow();
      pushTelegramId = prev.telegramId;
      pushNow = now;
      pushStarted = prev.sun.farmStartedAt ?? 0;
      pushCycleCount = prev.sun.cycleCount ?? 0;
      return {
        ...prev,
        sun: { ...prev.sun, lastCollectedAt: now },
      };
    });
    if (pushTelegramId) {
      void syncSunCycle({
        telegramId: pushTelegramId,
        sunFarmStartedAtMs: Math.round(pushStarted),
        sunLastCollectedAtMs: Math.round(pushNow),
        sunCycleCount: pushCycleCount,
      });
    }
  }, []);

  /**
   * DEPRECATED — daily collect was removed. The orange COLLECT button no
   * longer exists in the UI; planets farm autonomously for 24h and then
   * require a $ZOOM reactivation. This callback is kept exported only so
   * existing wiring (`App.tsx` passes it as `onCollect={collectPlanet}` to
   * `FarmPage`) continues to typecheck. It is now an inert no-op:
   * no setState, no balance mutation, no `lastCollectedAt` refresh, no
   * server notification. Defect-roll removed too — that punishment was tied
   * to the manual collect step which no longer exists. Safe to remove the
   * entire wiring chain in a future cleanup.
   */
  const collectPlanet = useCallback((_id: string): { defect: boolean } => {
    return { defect: false };
  }, []);

  const burnPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.planets.find((p) => p.id === id);
      if (!planet) return prev;
      if (prev.telegramId) notifyFarmStop(prev.telegramId, id);
      // If this planet was a server-granted bonus (referral milestone, wheel
      // reward, mystery box, starter pack, etc) we MUST permanently consume
      // one entitlement on the server. Otherwise the next /grants poll will
      // see entitlement > claimed and silently re-add the burned planet.
      const isBonusPlanet = planet.id.startsWith(`bonus-${planet.name}-`);
      if (isBonusPlanet && prev.telegramId && (planet.name === "BASIC" || planet.name === "RARE" || planet.name === "EPIC" || planet.name === "GOLD")) {
        notifyPlanetBurn(prev.telegramId, planet.name);
      }
      const refund = Math.floor(planet.craftCost * 0.15);
      // When burning a bonus planet, we MUST decrement the local "claimed"
      // counter by exactly 1 so it stays in lockstep with the server-side
      // entitlement counter (which notifyPlanetBurn just decremented). If we
      // don't, the next /grants poll computes
      //   toAdd = serverCount − max(claimedCount, existingBonusCount)
      // which becomes negative (because claimedCount is still the pre-burn
      // value but serverCount and existingBonusCount have both gone down by 1)
      // and the reconciliation branch removes an EXTRA bonus planet to "fix"
      // the perceived drift — silently deleting a sibling planet the user
      // never asked to burn. Crafted (non-bonus) planets don't touch any
      // counter and only the single matching id is filtered out.
      const updated = {
        ...prev,
        balance: prev.balance + refund,
        planets: prev.planets.filter((p) => p.id !== id),
        claimedBonusBasic: isBonusPlanet && planet.name === "BASIC" ? Math.max(0, prev.claimedBonusBasic - 1) : prev.claimedBonusBasic,
        claimedBonusRare:  isBonusPlanet && planet.name === "RARE"  ? Math.max(0, prev.claimedBonusRare  - 1) : prev.claimedBonusRare,
        claimedBonusEpic:  isBonusPlanet && planet.name === "EPIC"  ? Math.max(0, prev.claimedBonusEpic  - 1) : prev.claimedBonusEpic,
        claimedBonusGold:  isBonusPlanet && planet.name === "GOLD"  ? Math.max(0, prev.claimedBonusGold  - 1) : prev.claimedBonusGold,
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
      // Daily-collect removed: anchor expiry on `effectiveFarmStart` so the
      // fee logic stays in lockstep with `isFarmExpired` / `isFarmActive` /
      // server `farm/settle`. Without this, a pre-deploy planet whose
      // `lastCollectedAt > farmStartedAt` would still be wrongfully charged
      // a reactivation fee even though the rest of the system considers it
      // active for another full window.
      const eff = effectiveFarmStart(planet);
      const wasStarted = eff > 0;
      const expired = wasStarted && now - eff > FARM_DURATION_MS;
      const fee = expired ? PLANET_CONFIG[planet.name].reactivationFee : 0;
      if (fee > 0 && prev.balance < fee) {
        outcome = { ok: false, reason: `Need ${fee.toLocaleString()} $ZOOM to reactivate` };
        return prev;
      }
      // Cooldown-reset exploit guard:
      // We must ONLY reset farmStartedAt / lastCollectedAt when the user is
      // truly starting a fresh 24h cycle. That is:
      //   (a) the planet has never been started (first start after craft), OR
      //   (b) the previous cycle has already expired AND the user paid the
      //       reactivation fee above.
      // In every other case (the planet is mid-cycle but currently paused —
      // e.g. just delisted from the marketplace, or stopped some other way)
      // we MUST keep the original farmStartedAt and lastCollectedAt. Without
      // this guard, listing → delisting → pressing START would silently
      // grant a free fresh 24h cycle, bypassing the reactivation fee and
      // the daily-collect window. Earnings calculations elsewhere in the
      // code rely on these timestamps as the authoritative cycle anchor.
      const startsFreshCycle = !wasStarted || expired;
      const updated: GameState = {
        ...prev,
        balance: prev.balance - fee,
        planets: prev.planets.map((p) =>
          p.id === id
            ? startsFreshCycle
              ? { ...p, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now }
              : { ...p, isFarmingActive: true }
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
      // V1 is soulbound — guard here too in case any caller bypasses the
      // disabled UI button (e.g. an old client cached in Telegram WebView).
      if (planet.name === "V1") return prev;
      const { telegramId, firstName, username } = getTelegramContext();
      if (telegramId) {
        listOnMarket({
          sellerTelegramId: telegramId,
          sellerName: firstName ?? undefined,
          // Pass the local planet id so the server can verify ownership
          // against users.planets_json. Without it the server will reject
          // the listing with 400 "Planet not found in your inventory".
          planetId: planet.id,
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
          } else {
            // Server rejected the listing (e.g. 409 "already listed",
            // 409 "previously sold", 400 "type/rate mismatch"). Revert
            // the optimistic local mark so the planet returns to the
            // inventory and the user can see what's wrong instead of a
            // ghost listing the server doesn't know about.
            setState((s) => ({
              ...s,
              planets: s.planets.map((p) =>
                p.id === id
                  ? { ...p, isListedInMarket: false, marketPrice: null, serverListingId: undefined }
                  : p,
              ),
            }));
            toast({
              title: "Listing rejected",
              description: result.error ?? "The server refused to list this planet.",
              variant: "destructive",
            });
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
      // The buyer just paid — they get a fresh 24h cycle when they press
      // START for the first time. Until then, the planet is in the
      // never-started state (see makePlanet for the rationale).
      farmStartedAt: 0,
      lastCollectedAt: 0,
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
      // Same as buyPlanet — never-started until first user-triggered START.
      farmStartedAt: 0,
      lastCollectedAt: 0,
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
        // Safety guard: if the server returns ZERO active listings while
        // we have ANY locally-listed planet, treat the response as
        // suspicious (transient server issue, query bug, pagination
        // truncation) and skip the reconcile. The probability of every
        // single one of a user's listings being legitimately sold/delisted
        // between two 30s polls — AND no other player having ANY active
        // listing in the entire market — is effectively zero. Real money
        // is at stake; we'd rather miss a sync than destroy a planet.
        if (active.length === 0) return;
        const activeIds = new Set(active.map((l) => l.id));
        const goneIds = new Set(
          myListed
            .filter((p) => !activeIds.has(p.serverListingId as number))
            .map((p) => p.serverListingId as number),
        );
        if (goneIds.size === 0) return;
        // Second safety guard: if more than half of our listings would be
        // wiped in a single reconcile, bail out. A genuine "I sold 5 of my
        // 6 listings while offline" is rare; a buggy/partial response
        // returning a truncated list is more likely. Forces a manual
        // refresh by the user, which is preferable to silent destruction.
        if (myListed.length >= 2 && goneIds.size > myListed.length / 2) {
          // eslint-disable-next-line no-console
          console.warn("[market reconcile] suspicious: would remove", goneIds.size, "of", myListed.length, "— skipping");
          return;
        }
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
      } catch { /* network/parse error — keep planets, retry next poll */ }
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
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
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
      // Auto-collect any pending TON earnings from the just-finished cycle
      // before resetting the timers. This removes the need for a separate
      // COLLECT button — earnings always land in tonBalance the moment the
      // user pays the reactivation fee.
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  // Legacy reactivate path. The reactivation fee is paid on-chain via
  // TonConnect to the project wallet — the in-game tonBalance is reserved
  // for withdrawals and must NEVER be debited here. This function is kept
  // as an alias of markWhitePlanetReactivated to avoid silent regressions
  // if any caller still wires it up.
  const reactivateWhitePlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.whitePlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
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
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        whitePlanets: prev.whitePlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ───── Earth Collection — mirrors the white-planet API exactly. Earth
  // planets occupy their own slot grid (size = bundles × 4) and accumulate TON
  // at 0.000177 TON/h each. Reactivation fee is 0.001 TON paid on-chain.
  const placeEarthPlanet = useCallback((id: string, slotIndex: number): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const target = prev.earthPlanets.find((p) => p.id === id);
      if (!target) {
        outcome = { ok: false, reason: "Planet not found" };
        return prev;
      }
      if (target.slotIndex != null) {
        outcome = { ok: false, reason: "Already placed" };
        return prev;
      }
      const maxEarthSlots = (prev.earthCollectionBundles || (prev.earthCollectionUnlocked ? 1 : 0)) * 4;
      if (slotIndex < 0 || slotIndex >= maxEarthSlots) {
        outcome = { ok: false, reason: "Invalid slot" };
        return prev;
      }
      const occupied = prev.earthPlanets.some((p) => p.slotIndex === slotIndex);
      if (occupied) {
        outcome = { ok: false, reason: "Slot occupied" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, target.name, true);
      const updatedPlanet: Planet = { ...target, slotIndex, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const markEarthPlanetReactivated = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const reactivateEarthPlanet = useCallback((id: string): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null) {
        outcome = { ok: false, reason: "Planet not placed" };
        return prev;
      }
      const now = serverNow();
      if (prev.telegramId) notifyFarmStart(prev.telegramId, id, planet.name, true);
      const updatedPlanet: Planet = { ...planet, isFarmingActive: true, farmStartedAt: now, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
    return outcome;
  }, []);

  const collectEarthPlanet = useCallback((id: string) => {
    setState((prev) => {
      const planet = prev.earthPlanets.find((p) => p.id === id);
      if (!planet || planet.slotIndex == null || !planet.isFarmingActive) return prev;
      const now = serverNow();
      const cfg = PLANET_CONFIG[planet.name];
      const start = Math.max(planet.farmStartedAt, planet.lastCollectedAt);
      const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
      const earnedTon = end > start ? (cfg.rate / 3_600_000) * (end - start) : 0;
      if (earnedTon <= 0) return prev;
      if (prev.telegramId) notifyFarmCollect(prev.telegramId, id);
      const updatedPlanet: Planet = { ...planet, lastCollectedAt: now };
      persistCollectionPlanet(prev.telegramId, updatedPlanet);
      return {
        ...prev,
        tonBalance: (prev.tonBalance || 0) + earnedTon,
        earthPlanets: prev.earthPlanets.map((p) => (p.id === id ? updatedPlanet : p)),
      };
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // SPACE MERCHANT helpers — burn N planets of a given type, mint a
  // freshly-crafted (non-bonus) planet on success. Bonus planets that
  // get burned must call notifyPlanetBurn to keep the server-side
  // entitlement counter in lockstep, exactly like burnPlanet does.
  // ─────────────────────────────────────────────────────────────────
  const burnTwoOfType = useCallback((type: PlanetType): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      // Pick 2 idle, non-listed planets of the requested rarity. Prefer
      // non-bonus first so we don't drain server-granted entitlements
      // when the player has crafted alternatives available.
      const candidates = prev.planets.filter(
        (p) => p.name === type && !p.isFarmingActive && !p.isListedInMarket,
      );
      if (candidates.length < 2) {
        outcome = { ok: false, reason: `Need 2 idle ${PLANET_CONFIG[type].label} planets` };
        return prev;
      }
      const sorted = [...candidates].sort((a, b) => {
        const aBonus = a.id.startsWith(`bonus-${a.name}-`) ? 1 : 0;
        const bBonus = b.id.startsWith(`bonus-${b.name}-`) ? 1 : 0;
        return aBonus - bBonus; // non-bonus (0) first
      });
      const toBurn = sorted.slice(0, 2);
      const burnIds = new Set(toBurn.map((p) => p.id));

      let cBasic = prev.claimedBonusBasic;
      let cRare = prev.claimedBonusRare;
      let cEpic = prev.claimedBonusEpic;
      let cGold = prev.claimedBonusGold;
      for (const p of toBurn) {
        const isBonus = p.id.startsWith(`bonus-${p.name}-`);
        if (isBonus && prev.telegramId && (p.name === "BASIC" || p.name === "RARE" || p.name === "EPIC" || p.name === "GOLD")) {
          notifyPlanetBurn(prev.telegramId, p.name);
          if (p.name === "BASIC") cBasic = Math.max(0, cBasic - 1);
          else if (p.name === "RARE") cRare = Math.max(0, cRare - 1);
          else if (p.name === "EPIC") cEpic = Math.max(0, cEpic - 1);
          else if (p.name === "GOLD") cGold = Math.max(0, cGold - 1);
        }
      }

      const updated: GameState = {
        ...prev,
        planets: prev.planets.filter((p) => !burnIds.has(p.id)),
        claimedBonusBasic: cBasic,
        claimedBonusRare: cRare,
        claimedBonusEpic: cEpic,
        claimedBonusGold: cGold,
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return outcome;
  }, []);

  const addCraftedPlanet = useCallback((type: PlanetType): { ok: boolean; reason?: string } => {
    let outcome: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      if (prev.planets.length >= prev.maxSlots) {
        outcome = { ok: false, reason: "Slots full" };
        return prev;
      }
      const planet = makePlanet(type);
      const updated: GameState = {
        ...prev,
        planets: [...prev.planets, planet],
        craftsCompleted: prev.craftsCompleted + 1,
      };
      stateRef.current = updated;
      saveState(updated);
      return updated;
    });
    return outcome;
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
    placeEarthPlanet, reactivateEarthPlanet, markEarthPlanetReactivated, collectEarthPlanet,
    burnTwoOfType, addCraftedPlanet,
  };
}
