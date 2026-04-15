import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, fetchReferralCount, debugTelegramContext, syncBalance, fetchGrants, fetchBalanceRecord, fetchServerTime, type Grants } from "../utils/api";

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
  lastFarmingSettledAt: number;
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
}> = {
  BASIC: {
    rate: 2,
    color: "#8892b0",
    glowColor: "rgba(136,146,176,0.5)",
    chance: 0.74,
    label: "Basic",
    craftCost: 20,
    activationTon: 0.05,
    tapsNeeded: 50,
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
  },
  EPIC: {
    rate: 80,
    color: "#c471ed",
    glowColor: "rgba(196,113,237,0.5)",
    chance: 0.05,
    label: "Epic",
    craftCost: 80,
    activationTon: 0.5,
    tapsNeeded: 250,
  },
  GOLD: {
    rate: 500,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.5)",
    chance: 0.005,
    label: "Gold",
    craftCost: 150,
    activationTon: 1.0,
    tapsNeeded: 500,
  },
};

export const SUN_CONFIG = {
  rate: 2500,
  color: "#ffb347",
  glowColor: "rgba(255,179,71,0.6)",
  activationCostBase: 0.5,
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
const FARM_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;

function makeReferralCode(): string {
  return "ZOOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getStorageKey(telegramId: string | null): string {
  return telegramId ? `${STORAGE_KEY}:${telegramId}` : STORAGE_KEY;
}

function getTelegramContext(): { telegramId: string | null; startParam: string | null; firstName: string | null } {
  try {
    const webApp = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string }; start_param?: string }; initData?: string } } }).Telegram?.WebApp;
    const unsafe = webApp?.initDataUnsafe;
    const telegramId = unsafe?.user?.id ? String(unsafe.user.id) : null;
    const firstName = unsafe?.user?.first_name ?? null;

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

    return { telegramId, startParam, firstName };
  } catch {
    return { telegramId: null, startParam: null, firstName: null };
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
  lastFarmingSettledAt: Date.now(),
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

function settleFarmingState(state: GameState, now: number): GameState {
  const from = state.lastFarmingSettledAt || now;
  if (now <= from) return state;

  const speedMultiplier = 1 + (state.referralSpeedBonus || 0);
  let earned = 0;

  for (const planet of state.planets) {
    if (!planet.isFarmingActive || planet.isListedInMarket) continue;
    const start = Math.max(from, planet.farmStartedAt, planet.lastCollectedAt);
    const end = Math.min(now, planet.farmStartedAt + FARM_DURATION_MS, planet.lastCollectedAt + DAILY_COLLECT_MS);
    if (end > start) earned += (planet.rate / 3_600_000) * (end - start) * speedMultiplier;
  }

  if (state.sun?.isActive) {
    const start = Math.max(from, state.sun.farmStartedAt, state.sun.lastCollectedAt);
    const end = Math.min(now, state.sun.farmStartedAt + FARM_DURATION_MS, state.sun.lastCollectedAt + DAILY_COLLECT_MS);
    if (end > start) earned += (SUN_CONFIG.rate / 3_600_000) * (end - start) * speedMultiplier;
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

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    const { telegramId, startParam, firstName } = getTelegramContext();

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

      const result = await registerUser(telegramId, startParam ?? undefined);

      if (result.isNew && startParam) {
        try { localStorage.removeItem("zoom-start-param"); } catch { /**/ }
      }

      const localBalance = Math.floor(stateRef.current.balance);
      const [count, grants, serverBalance] = await Promise.all([
        fetchReferralCount(telegramId),
        fetchGrants(telegramId),
        syncBalance({ telegramId, firstName, zoomBalance: localBalance }),
      ]);

      setState((prev) => {
        let updated = {
          ...prev,
          referralCount: count,
          balance: serverBalance,
        };

        // Apply bonus sun from server (grant sun if not already owned)
        if (grants.bonusSun) {
          updated = {
            ...updated,
            claimedBonusSun: true,
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
          updated = { ...updated, sun: null, claimedBonusSun: false };
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

        syncBalance({ telegramId, firstName, zoomBalance: Math.floor(updated.balance) });
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
          updated = { ...updated, sun: null, claimedBonusSun: false };
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
      const { telegramId, firstName } = getTelegramContext();
      if (!telegramId) return;
      const localBalance = Math.floor(stateRef.current.balance);

      const [serverBalance, grants] = await Promise.all([
        syncBalance({ telegramId, firstName, zoomBalance: localBalance }),
        fetchGrants(telegramId),
      ]);

      applyGrants(grants);

      if (serverBalance !== stateRef.current.balance) {
        setState((prev) => ({ ...prev, balance: serverBalance }));
      }
    };

    const interval = setInterval(doSync, 30_000);

    const handleAdminRefresh = async () => {
      const { telegramId, firstName } = getTelegramContext();
      if (!telegramId) return;

      const balanceRecord = await fetchBalanceRecord(telegramId);
      if (balanceRecord?.exists) {
        setState((prev) => ({ ...prev, balance: balanceRecord.zoomBalance }));
        stateRef.current = { ...stateRef.current, balance: balanceRecord.zoomBalance };
      }

      const grants = await fetchGrants(telegramId);
      if (grants) applyGrants(grants);
    };
    window.addEventListener("zoom-admin-refresh", handleAdminRefresh);
    window.addEventListener("zoom-data-refresh", doSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener("zoom-admin-refresh", handleAdminRefresh);
      window.removeEventListener("zoom-data-refresh", doSync);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      const localNow = Date.now();
      setState((prev) => settleFarmingState(prev, localNow));
      stateRef.current = settleFarmingState(stateRef.current, localNow);

      const { telegramId, firstName } = getTelegramContext();

      if (telegramId) {
        (async () => {
          setState((prev) => {
            const settled = settleFarmingState(prev, Date.now());
            stateRef.current = settled;
            syncBalance({ telegramId, firstName, zoomBalance: Math.floor(settled.balance) });
            return settled;
          });

          window.dispatchEvent(new Event("zoom-data-refresh"));
        })();

        fetchReferralCount(telegramId).then((count) => {
          setState((prev) => ({ ...prev, referralCount: count }));
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
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

  const craft = useCallback((): { completed: boolean; planet?: Planet; tapsLeft?: number } => {
    const current = stateRef.current;
    if (current.pendingPlanet) return { completed: false };
    if (current.planets.length >= current.maxSlots) return { completed: false };
    if (current.balance < 1) return { completed: false };

    let rarity = current.currentCraftRarity;
    let goal = current.goal;

    if (rarity === null) {
      rarity = rollRarity();
      goal = PLANET_CONFIG[rarity].tapsNeeded;
    }

    const newTaps = current.taps + 1;
    const newBalance = current.balance - 1;

    if (newTaps >= goal) {
      const planet = makePlanet(rarity);
      setState((prev) => ({
        ...(planet.name === "GOLD"
          ? withFeedEvent(prev, `${PLAYER_NAME} ha appena forgiato un pianeta GOLD!`)
          : prev),
        balance: newBalance,
        taps: 0,
        goal: 50,
        currentCraftRarity: null,
        pendingPlanet: planet,
        craftsCompleted: prev.craftsCompleted + 1,
      }));
      return { completed: true, planet };
    } else {
      setState((prev) => ({
        ...prev,
        balance: newBalance,
        taps: newTaps,
        goal,
        currentCraftRarity: rarity,
      }));
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
      const newCycleCount = (prev.sun.cycleCount || 0) + 1;
      const nextCost = SUN_CONFIG.activationCostBase * Math.pow(2, newCycleCount);
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: true,
          cycleCount: newCycleCount,
          activationCost: nextCost,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
    });
  }, []);

  const startSunFarming = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (!prev.sun?.isOwned) return prev;
      return {
        ...prev,
        sun: {
          ...prev.sun,
          isActive: true,
          farmStartedAt: now,
          lastCollectedAt: now,
        },
      };
    });
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

  const collectPlanet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id ? { ...p, lastCollectedAt: Date.now() } : p
      ),
    }));
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

  const startFarming = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id && !p.isListedInMarket
          ? { ...p, isFarmingActive: true, farmStartedAt: Date.now(), lastCollectedAt: Date.now() }
          : p
      ),
    }));
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
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id
          ? { ...p, isListedInMarket: true, isFarmingActive: false, marketPrice: price }
          : p
      ),
    }));
  }, []);

  const unlistPlanet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id ? { ...p, isListedInMarket: false, marketPrice: null } : p
      ),
    }));
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
    listPlanet, unlistPlanet, buyPlanet,
    unlockSlot, claimDaily,
    activateSun, acquireSun, collectSun,
    startSunFarming, stopSunFarming, burnSun,
  };
}
