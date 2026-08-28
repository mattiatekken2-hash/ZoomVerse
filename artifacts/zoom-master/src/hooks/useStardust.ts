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
 * Stardust state hook. Backend is source of truth (daily cap). Hydrate when
 * telegramId is available, then poll every 30s and on global refresh events
 * so admin credits show up without waiting 5 minutes.
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
    void refresh();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 30_000);
    const onRefresh = () => { void refresh(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    window.addEventListener("stardust-refresh", onRefresh);
    window.addEventListener("zoom-admin-refresh", onRefresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("zoom-data-refresh", onRefresh);
      window.removeEventListener("stardust-refresh", onRefresh);
      window.removeEventListener("zoom-admin-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
      setState((prev) => ({
        ...prev,
        balance: res.balance,
        today: res.today,
        dailyCap: res.dailyCap,
        globalTotal: res.globalTotal,
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
