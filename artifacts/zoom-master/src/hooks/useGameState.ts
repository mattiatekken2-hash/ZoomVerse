import { useState, useEffect, useRef, useCallback } from "react";

export type PlanetType = "BASIC" | "GOLD" | "COSMIC" | "VOID";

export interface Planet {
  id: string;
  name: PlanetType;
  rate: number;
  color: string;
  glowColor: string;
  createdAt: number;
}

export interface GameState {
  balance: number;
  taps: number;
  goal: number;
  planets: Planet[];
  maxSlots: number;
  totalEarned: number;
  craftsCompleted: number;
}

const PLANET_TYPES: Record<PlanetType, { rate: number; color: string; glowColor: string; chance: number }> = {
  BASIC: { rate: 10, color: "#00f2fe", glowColor: "rgba(0,242,254,0.5)", chance: 0.65 },
  GOLD: { rate: 100, color: "#ffd700", glowColor: "rgba(255,215,0,0.5)", chance: 0.25 },
  COSMIC: { rate: 500, color: "#c471ed", glowColor: "rgba(196,113,237,0.5)", chance: 0.08 },
  VOID: { rate: 2000, color: "#ff416c", glowColor: "rgba(255,65,108,0.5)", chance: 0.02 },
};

const INITIAL_STATE: GameState = {
  balance: 1100,
  taps: 0,
  goal: 20,
  planets: [],
  maxSlots: 2,
  totalEarned: 0,
  craftsCompleted: 0,
};

const STORAGE_KEY = "zoom-master-state";

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      return { ...INITIAL_STATE, ...parsed };
    }
  } catch {
    // ignore
  }
  return INITIAL_STATE;
}

function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function rollPlanet(): Planet {
  const r = Math.random();
  let cumulative = 0;
  let chosen: PlanetType = "BASIC";
  for (const [type, cfg] of Object.entries(PLANET_TYPES) as [PlanetType, typeof PLANET_TYPES[PlanetType]][]) {
    cumulative += cfg.chance;
    if (r <= cumulative) {
      chosen = type;
      break;
    }
  }
  const cfg = PLANET_TYPES[chosen];
  return {
    id: `${Date.now()}-${Math.random()}`,
    name: chosen,
    rate: cfg.rate,
    color: cfg.color,
    glowColor: cfg.glowColor,
    createdAt: Date.now(),
  };
}

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.planets.length === 0) return prev;
        const earned = prev.planets.reduce((acc, p) => acc + p.rate / 3600, 0);
        return {
          ...prev,
          balance: prev.balance + earned,
          totalEarned: prev.totalEarned + earned,
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const craft = useCallback((): { completed: boolean; planet?: Planet; tapsLeft?: number } => {
    const current = stateRef.current;
    if (current.planets.length >= current.maxSlots) {
      return { completed: false };
    }
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
      setState((prev) => ({
        ...prev,
        balance: newBalance,
        taps: newTaps,
      }));
      return { completed: false, tapsLeft: current.goal - newTaps };
    }
  }, []);

  const removePlanet = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      planets: prev.planets.filter((p) => p.id !== id),
    }));
  }, []);

  const unlockSlot = useCallback(() => {
    setState((prev) => {
      if (prev.balance < 250 || prev.maxSlots >= 6) return prev;
      return { ...prev, balance: prev.balance - 250, maxSlots: prev.maxSlots + 1 };
    });
  }, []);

  const resetGame = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
  }, []);

  return { state, craft, removePlanet, unlockSlot, resetGame };
}
