import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMerchantState,
  merchantFuse,
  type MerchantState,
  type MerchantFuseResult,
} from "../utils/api";

const EMPTY: MerchantState = {
  active: false,
  expiresAt: null,
  fusionsUsed: 0,
  maxFusions: 3,
};

export interface UseMerchant {
  active: boolean;
  expiresAt: string | null;
  fusionsUsed: number;
  maxFusions: number;
  fusionsRemaining: number;
  ready: boolean;
  refresh: () => Promise<void>;
  fuse: (level: 1 | 2 | 3) => Promise<MerchantFuseResult>;
  /** Local override fired after the visit ends so the UI hides instantly. */
  dismissLocally: () => void;
}

/**
 * Space Merchant state. Backend is authoritative for spawn cadence (20–50 min)
 * and the 3-fusion-per-visit cap. We poll every 10s — enough granularity for
 * the 90s visit window without hammering the server. The 90s countdown itself
 * is derived locally from `expiresAt`.
 *
 * On the rising edge of `active=true` we trigger a vibration + Telegram haptic
 * notification so the user never misses an appearance, even if the LAB tab is
 * not focused (the popup itself is gated to LAB by the caller).
 */
export function useMerchant(telegramId: string | null): UseMerchant {
  const [state, setState] = useState<MerchantState>(EMPTY);
  const [ready, setReady] = useState(false);
  const wasActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  // Unmount guard — protects against late-arriving fetch responses calling
  // setState on a torn-down component (React 18 already swallows the warning,
  // but skipping the work is still cheaper than re-rendering ghosts).
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
      // Rising edge: fire haptic + vibration once per visit. We treat both
      // `justSpawned` (server-confirmed first poll) and any active=true
      // transition (in case justSpawned was lost on a poll race) as triggers.
      const becameActive = next.active && !wasActiveRef.current;
      if (becameActive) {
        try {
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([200, 80, 200]);
          }
        } catch { /* ignored — some embedded browsers reject vibrate calls */ }
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
    const id = setInterval(refresh, 10 * 1000);
    return () => clearInterval(id);
  }, [telegramId, refresh]);

  const fuse = useCallback(async (level: 1 | 2 | 3): Promise<MerchantFuseResult> => {
    if (!telegramId) {
      return { ok: false, reason: "BAD_REQUEST", fusionsUsed: state.fusionsUsed, fusionsRemaining: 0, maxFusions: state.maxFusions };
    }
    const res = await merchantFuse(telegramId, level);
    if (res.ok || res.reason === "EXPIRED_OR_MAX") {
      // Always reflect the server-authoritative counter, even on rejection.
      setState((prev) => ({
        ...prev,
        fusionsUsed: res.fusionsUsed,
        // If the server hit the cap, also clear local active state so the
        // popup's auto-close logic kicks in once the result is dismissed.
        active: res.fusionsRemaining > 0 ? prev.active : prev.active,
      }));
    }
    return res;
  }, [telegramId, state.fusionsUsed, state.maxFusions]);

  const dismissLocally = useCallback(() => {
    setState((prev) => ({ ...prev, active: false, expiresAt: null, fusionsUsed: 0 }));
    wasActiveRef.current = false;
  }, []);

  return {
    active: state.active,
    expiresAt: state.expiresAt,
    fusionsUsed: state.fusionsUsed,
    maxFusions: state.maxFusions,
    fusionsRemaining: Math.max(0, state.maxFusions - state.fusionsUsed),
    ready,
    refresh,
    fuse,
    dismissLocally,
  };
}
