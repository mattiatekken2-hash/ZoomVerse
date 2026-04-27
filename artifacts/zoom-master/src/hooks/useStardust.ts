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
    setReady(true);
  }, [telegramId]);

  useEffect(() => {
    if (!telegramId) return;
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
