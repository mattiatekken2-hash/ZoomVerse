import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMerchantState,
  type MerchantState,
} from "../utils/api";

const EMPTY: MerchantState = {
  active: false,
  expiresAt: null,
  fusionsUsed: 0,
  maxFusions: 0,
};

export interface UseMerchant {
  active: boolean;
  expiresAt: string | null;
  ready: boolean;
  refresh: () => Promise<void>;
  /** Local override fired after the visit ends so the UI hides instantly. */
  dismissLocally: () => void;
}

/**
 * Stardust Scrapper state. Backend is authoritative for spawn cadence (4–6h)
 * and the 15-minute visit window. We poll every 30s — enough granularity for
 * the long window without hammering the server.
 *
 * On the rising edge of active=true we trigger a vibration + Telegram haptic
 * notification so the user never misses an appearance.
 */
export function useMerchant(telegramId: string | null): UseMerchant {
  const [state, setState] = useState<MerchantState>(EMPTY);
  const [ready, setReady] = useState(false);
  const wasActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await fetchMerchantState(telegramId);
      if (!aliveRef.current) return;
      setState(next);
      setReady(true);
      const becameActive = next.active && !wasActiveRef.current;
      if (becameActive) {
        try {
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([200, 80, 200]);
          }
        } catch { /* ignored */ }
        try {
          const tg = (window as unknown as {
            Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (s: string) => void } } };
          }).Telegram?.WebApp;
          tg?.HapticFeedback?.notificationOccurred?.("warning");
        } catch { /* ignored */ }
      }
      wasActiveRef.current = next.active;
    } finally {
      inFlightRef.current = false;
    }
  }, [telegramId]);

  useEffect(() => {
    if (!telegramId) return;
    refresh();
    const id = setInterval(refresh, 30 * 1000);
    return () => clearInterval(id);
  }, [telegramId, refresh]);

  const dismissLocally = useCallback(() => {
    setState((prev) => ({ ...prev, active: false, expiresAt: null }));
    wasActiveRef.current = false;
  }, []);

  return {
    active: state.active,
    expiresAt: state.expiresAt,
    ready,
    refresh,
    dismissLocally,
  };
}
