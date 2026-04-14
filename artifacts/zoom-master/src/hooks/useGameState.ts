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
  craftCost: number;
}

export interface FeedEvent {
  id: string;
  text: string;
  timestamp: number;
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
}

export const PLANET_CONFIG: Record<PlanetType, {
  rate: number;
  color: string;
  glowColor: string;
  chance: number;
  label: string;
  craftCost: number;
  activationTon: number;
}> = {
  BASIC: {
    rate: 10,
    color: "#8892b0",
    glowColor: "rgba(136,146,176,0.5)",
    chance: 0.55,
    label: "Basic",
    craftCost: 20,
    activationTon: 0.05,
  },
  RARE: {
    rate: 80,
    color: "#4facfe",
    glowColor: "rgba(79,172,254,0.5)",
    chance: 0.28,
    label: "Rare",
    craftCost: 40,
    activationTon: 0.15,
  },
  EPIC: {
    rate: 400,
    color: "#c471ed",
    glowColor: "rgba(196,113,237,0.5)",
    chance: 0.13,
    label: "Epic",
    craftCost: 80,
    activationTon: 0.5,
  },
  GOLD: {
    rate: 2000,
    color: "#ffd700",
    glowColor: "rgba(255,215,0,0.5)",
    chance: 0.04,
    label: "Gold",
    craftCost: 150,
    activationTon: 1.0,
  },
};

const CRAFT_GOAL = 20;
const STATE_VERSION = 2;
const STORAGE_KEY = "zoom-master-v2";
const FARM_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;

function makeReferralCode(): string {
  return "ZOOM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

const INITIAL_STATE: GameState = {
  version: STATE_VERSION,
  balance: 2000,
  taps: 0,
  goal: CRAFT_GOAL,
  planets: [],
  maxSlots: 2,
  totalEarned: 0,
  craftsCompleted: 0,
  totalTonSpent: 0,
  referralCode: makeReferralCode(),
  referralCount: 0,
  lastDailyClaimAt: 0,
  feedEvents: [],
};

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === STATE_VERSION) {
        return { ...INITIAL_STATE, ...parsed };
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

function rollPlanet(): Planet {
  const r = Math.random();
  let cumulative = 0;
  let chosen: PlanetType = "BASIC";
  for (const [type, cfg] of Object.entries(PLANET_CONFIG) as [PlanetType, typeof PLANET_CONFIG[PlanetType]][]) {
    cumulative += cfg.chance;
    if (r <= cumulative) { chosen = type; break; }
  }
  const cfg = PLANET_CONFIG[chosen];
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).substring(2)}`,
    name: chosen,
    rate: cfg.rate,
    color: cfg.color,
    glowColor: cfg.glowColor,
    createdAt: now,
    farmStartedAt: now,
    lastCollectedAt: now,
    isListedInMarket: false,
    craftCost: cfg.craftCost,
  };
}

export function isFarmActive(planet: Planet): boolean {
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

const FEED_TEMPLATES = [
  (name: string) => `${name} crafted a GOLD planet! 🌟`,
  (name: string) => `${name} reached 20 referral milestone!`,
  (name: string) => `${name} purchased THE SUN ☀️`,
  (name: string) => `${name} sold an EPIC planet for 840 $ZOOM`,
  (name: string) => `${name} crafted a RARE planet`,
  (name: string) => `${name} collected 2,400 $ZOOM from farming`,
  (name: string) => `THE SUN minted! (Available: 18/20)`,
  (name: string) => `${name} unlocked a new farm slot`,
];

const FAKE_NAMES = ["cosmicwolf", "stardust99", "voidwalker_", "nebula_k", "deepspace42", "astrox", "solarmind", "darkstar7", "galaxis", "luminos"];

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

  useEffect(() => {
    const interval = setInterval(() => {
      const template = FEED_TEMPLATES[Math.floor(Math.random() * FEED_TEMPLATES.length)];
      const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
      const event: FeedEvent = {
        id: `${Date.now()}-${Math.random()}`,
        text: template(name),
        timestamp: Date.now(),
      };
      setState((prev) => ({
        ...prev,
        feedEvents: [event, ...prev.feedEvents].slice(0, 20),
      }));
    }, 7000 + Math.random() * 8000);
    return () => clearInterval(interval);
  }, []);

  const craft = useCallback((): { completed: boolean; planet?: Planet; tapsLeft?: number } => {
    const current = stateRef.current;
    if (current.planets.length >= current.maxSlots) return { completed: false };
    if (current.balance < 1) return { completed: false };

    const newTaps = current.taps + 1;
    const newBalance = current.balance - 1;

    if (newTaps >= current.goal) {
      const planet = rollPlanet();
      setState((prev) => ({
        ...prev,
        balance: newBalance,
        taps: 0,
        planets: [...prev.planets, planet],
        craftsCompleted: prev.craftsCompleted + 1,
      }));
      return { completed: true, planet };
    } else {
      setState((prev) => ({ ...prev, balance: newBalance, taps: newTaps }));
      return { completed: false, tapsLeft: current.goal - newTaps };
    }
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

  const listPlanet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.map((p) =>
        p.id === id ? { ...p, isListedInMarket: !p.isListedInMarket } : p
      ),
    }));
  }, []);

  const unlockSlot = useCallback(() => {
    setState((prev) => {
      const cost = (prev.maxSlots - 1) * 0.25;
      if (prev.totalTonSpent < cost) return prev;
      return { ...prev, maxSlots: prev.maxSlots + 1 };
    });
  }, []);

  const claimDaily = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (now - prev.lastDailyClaimAt < DAILY_COLLECT_MS) return prev;
      return { ...prev, balance: prev.balance + 100, lastDailyClaimAt: now };
    });
  }, []);

  return { state, craft, collectPlanet, burnPlanet, listPlanet, unlockSlot, claimDaily };
}
