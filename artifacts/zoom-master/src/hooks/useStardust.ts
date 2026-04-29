import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStardustState,
  collectStardustOnServer,
  type StardustState,
  type StardustCollectResult,
} from "../utils/api";

const EMPTY: StardustState = {
  balance: 0,
  today: 0,
  dayKey: "",
  dailyCap: 25,
  globalTotal: 0,
  hasSun: false,
};

const CACHE_PREFIX = "zoom_stardust_cache_v1_";

/**
 * Read the last-known stardust balance for a given Telegram user from
 * localStorage. We cache so the HUD can show the user's *previous* balance
 * the instant the app opens — no "0 → real number" flash while the first
 * network round-trip resolves. The server is still the authority and the
 * cache is overwritten as soon as the fetch lands.
 */
function readCache(telegramId: string | null): StardustState | null {
  if (!telegramId) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + telegramId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.balance === "number") {
      return {
        balance: Number(parsed.balance) || 0,
        today: Number(parsed.today) || 0,
        dayKey: typeof parsed.dayKey === "string" ? parsed.dayKey : "",
        dailyCap: Number(parsed.dailyCap) || 25,
        globalTotal: Number(parsed.globalTotal) || 0,
        hasSun: Boolean(parsed.hasSun),
      };
    }
  } catch { /* corrupted cache → ignore */ }
  return null;
}

function writeCache(telegramId: string | null, state: StardustState): void {
  if (!telegramId) return;
  try {
    localStorage.setItem(CACHE_PREFIX + telegramId, JSON.stringify(state));
  } catch { /* quota / privacy mode → silently skip */ }
}

export interface UseStardust {
  balance: number;
  today: number;
  dayKey: string;
  dailyCap: number;
  globalTotal: number;
  hasSun: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  collect: () => Promise<StardustCollectResult>;
}

/**
 * Stardust state hook. Backend is source of truth (so the daily cap and the
 * SUN-ownership gate cannot be bypassed by editing localStorage). We hydrate
 * once when telegramId becomes available, then re-hydrate every 5 min in
 * case other tabs/sessions also collected.
 */
export function useStardust(telegramId: string | null): UseStardust {
  const [state, setState] = useState<StardustState>(EMPTY);
  const [ready, setReady] = useState(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    const next = await fetchStardustState(telegramId);
    setState(next);
    writeCache(telegramId, next);
    setReady(true);
  }, [telegramId]);

  useEffect(() => {
    if (!telegramId) return;
    // Hydrate the HUD synchronously from the last-known balance so the
    // user sees their real number the instant the app paints — instead
    // of "0" while the first /stardust/state round-trip resolves.
    const cached = readCache(telegramId);
    if (cached) {
      setState(cached);
      setReady(true);
    }
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [telegramId, refresh]);

  const collect = useCallback(async (): Promise<StardustCollectResult> => {
    if (!telegramId) {
      return { ok: false, reason: "BAD_REQUEST", balance: state.balance, today: state.today, dailyCap: state.dailyCap, globalTotal: state.globalTotal };
    }
    if (inFlightRef.current) {
      return { ok: false, reason: "NETWORK", balance: state.balance, today: state.today, dailyCap: state.dailyCap, globalTotal: state.globalTotal };
    }
    inFlightRef.current = true;
    try {
      const res = await collectStardustOnServer(telegramId);
      // Always reflect the server-returned counters, even on failure — they
      // tell us the authoritative balance/today/global at the moment the
      // request was processed.
      setState((prev) => ({
        ...prev,
        balance: res.balance,
        today: res.today,
        dailyCap: res.dailyCap,
        globalTotal: res.globalTotal,
        // Server only updates hasSun via the state endpoint, so leave it.
      }));
      return res;
    } finally {
      inFlightRef.current = false;
    }
  }, [telegramId, state.balance, state.today, state.dailyCap, state.globalTotal]);

  return {
    balance: state.balance,
    today: state.today,
    dayKey: state.dayKey,
    dailyCap: state.dailyCap,
    globalTotal: state.globalTotal,
    hasSun: state.hasSun,
    ready,
    refresh,
    collect,
  };
}
