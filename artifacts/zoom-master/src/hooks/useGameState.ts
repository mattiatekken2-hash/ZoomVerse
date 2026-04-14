import { useState, useEffect, useRef, useCallback } from "react";

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
  craftsCompleted: number;
  totalTonSpent: number;
  referralCode: string;
  referralCount: number;
  lastDailyClaimAt: number;
  feedEvents: FeedEvent[];
  pendingPlanet: Planet | null;
  currentCraftRarity: PlanetType | null;
  usedRedeemCodes: string[];
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
    rate: 10,
    color: "#8892b0",
    glowColor: "rgba(136,146,176,0.5)",
    chance: 0.55,
    label: "Basic",
    craftCost: 20,
    activationTon: 0.05,
    tapsNeeded: 15,
  },
  RARE: {
    rate: 80,
    color: "#4facfe",
    glowColor: "rgba(79,172,254,0.5)",
    chance: 0.28,
    label: "Rare",
    craftCost: 40,
    activationTon: 0.15,
    tapsNeeded: 25,
  },
  EPIC: {
    rate: 400,
    color: "#c471ed",
    glowColor: "rgba(196,113,237,0.5)",
    chance: 0.13,
    label: "Epic",
    craftCost: 80,
    activationTon: 0.5,
    tapsNeeded: 40,
  },
  GOLD: {
    rate: 2000,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.5)",
    chance: 0.04,
    label: "Gold",
    craftCost: 150,
    activationTon: 1.0,
    tapsNeeded: 60,
  },
};

const REDEEM_CODES: Record<string, number> = {
  "ZOOMSTART": 500,
  "ZOOMLUCKY": 1000,
  "ZOOMBIG": 2500,
  "ZOOMLAUNCH": 750,
};

const STATE_VERSION = 3;
const STORAGE_KEY = "zoom-master-v3";
const FARM_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;

function makeReferralCode(): string {
  return "ZOOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

const INITIAL_STATE: GameState = {
  version: STATE_VERSION,
  balance: 2000,
  taps: 0,
  goal: 15,
  planets: [],
  maxSlots: 2,
  totalEarned: 0,
  craftsCompleted: 0,
  totalTonSpent: 0,
  referralCode: makeReferralCode(),
  referralCount: 0,
  lastDailyClaimAt: 0,
  feedEvents: [],
  pendingPlanet: null,
  currentCraftRarity: null,
  usedRedeemCodes: [],
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === STATE_VERSION) {
        return {
          ...INITIAL_STATE,
          ...parsed,
          planets: (parsed.planets || []).map(migratePlanet),
          pendingPlanet: parsed.pendingPlanet ? migratePlanet(parsed.pendingPlanet) : null,
          usedRedeemCodes: parsed.usedRedeemCodes || [],
        };
      }
    }
  } catch { /**/ }
  return { ...INITIAL_STATE, referralCode: makeReferralCode() };
}

function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /**/ }
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

export function getFarmTimeRemaining(planet: Planet): number {
  const expiry = planet.farmStartedAt + FARM_DURATION_MS;
  return Math.max(0, expiry - Date.now());
}

export function needsCollect(planet: Planet): boolean {
  return Date.now() - planet.lastCollectedAt > DAILY_COLLECT_MS * 0.9 && isFarmActive(planet);
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

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.planets.length === 0) return prev;
        let earned = 0;
        prev.planets.forEach((p) => {
          if (isFarmActive(p)) earned += p.rate / 3600;
        });
        if (earned === 0) return prev;
        return { ...prev, balance: prev.balance + earned, totalEarned: prev.totalEarned + earned };
      });
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
        ...prev,
        balance: newBalance,
        taps: 0,
        goal: 15,
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

  const redeemCode = useCallback((code: string): { success: boolean; amount?: number; error?: string } => {
    const upperCode = code.trim().toUpperCase();
    const amount = REDEEM_CODES[upperCode];
    if (!amount) return { success: false, error: "Invalid code" };
    const current = stateRef.current;
    if (current.usedRedeemCodes.includes(upperCode)) {
      return { success: false, error: "Code already used" };
    }
    setState((prev) => ({
      ...prev,
      balance: prev.balance + amount,
      usedRedeemCodes: [...prev.usedRedeemCodes, upperCode],
    }));
    return { success: true, amount };
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
      return {
        ...prev,
        balance: prev.balance + refund,
        planets: prev.planets.filter((p) => p.id !== id),
      };
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
      return { ...prev, balance: prev.balance + 100, lastDailyClaimAt: now };
    });
  }, []);

  return {
    state, craft, claimCraft, redeemCode,
    collectPlanet, burnPlanet,
    startFarming, stopFarming,
    listPlanet, unlistPlanet, buyPlanet,
    unlockSlot, claimDaily,
  };
}
