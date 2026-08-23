import { useEffect, useRef, useState } from "react";

/**
 * Last-good wallet amounts. Survives Wallet remounts so opening the tab
 * never paints 0 / a stale grant while /grants or /balance/sync is in flight.
 */
const STORAGE_KEY = "zoom-wallet-last-good-v1";
const HOLD_DOWN_MS = 2_000;

export type StickyWalletKey = "zoom" | "gram" | "stardust" | "redStar" | "nftStar";

type Snapshot = Partial<Record<StickyWalletKey, number>>;

let memory: Snapshot = {};
let loaded = false;

function loadMemory() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed && typeof parsed === "object") memory = parsed;
  } catch { /**/ }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch { /**/ }
}

export function peekStickyWalletBalance(key: StickyWalletKey): number | null {
  loadMemory();
  const v = memory[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Raise the last-good watermark. Never used to flash a lower value. */
export function rememberStickyWalletBalance(key: StickyWalletKey, value: number) {
  loadMemory();
  if (!Number.isFinite(value) || value <= 0) return;
  const prev = memory[key];
  if (prev == null || value > prev + 1e-12) {
    memory[key] = value;
    persist();
  }
}

/** Accept a real spend / server snap (downward allowed). */
export function commitStickyWalletBalance(key: StickyWalletKey, value: number) {
  loadMemory();
  if (!Number.isFinite(value) || value < 0) return;
  memory[key] = value;
  persist();
}

/**
 * Paint the last confirmed balance immediately. Ignore short downward
 * flashes (tab switch, grants poll, in-flight sync). Raise instantly.
 */
export function useStickyWalletBalance(
  live: number,
  key: StickyWalletKey,
  holdMs = HOLD_DOWN_MS,
): number {
  loadMemory();
  const [shown, setShown] = useState(() => {
    const v = Number.isFinite(live) && live >= 0 ? live : 0;
    const last = peekStickyWalletBalance(key);
    if (last != null && last > v) return last;
    if (v > 0) rememberStickyWalletBalance(key, v);
    return v;
  });
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const v = Number(live);
    if (!Number.isFinite(v) || v < 0) return;

    if (v + 1e-12 >= shownRef.current) {
      rememberStickyWalletBalance(key, v);
      if (v !== shownRef.current) setShown(v);
      return;
    }

    const t = window.setTimeout(() => {
      const latest = Number(liveRef.current);
      if (!Number.isFinite(latest) || latest < 0) return;
      commitStickyWalletBalance(key, latest);
      setShown(latest);
    }, holdMs);
    return () => window.clearTimeout(t);
  }, [live, key, holdMs]);

  return shown;
}
