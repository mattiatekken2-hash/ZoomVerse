import { useEffect, useRef, useState } from "react";
import { NEW_PLAYER_ZOOM_GRANT } from "@workspace/game-models";
import { finiteNumber } from "../utils/formatNumber";

/**
 * Last-good wallet amounts, keyed by Telegram id so PC and Mini App
 * cannot paint another account's snapshot. Survives Wallet remounts.
 *
 * Rules:
 *  - Raise instantly (farm, grants, hydrate).
 *  - Never auto-commit a downward flash (0, starter grant, in-flight sync).
 *  - Downward only when live is a real spend / server value (not a ghost).
 */
const STORAGE_KEY = "zoom-wallet-last-good-v2";

export type StickyWalletKey = "zoom" | "gram" | "stardust" | "redStar" | "nftStar";

type AccountSnap = Partial<Record<StickyWalletKey, number>>;
type Store = Record<string, AccountSnap>;

const ACCOUNT_FALLBACK = "_";

let store: Store = {};
let loaded = false;
let activeAccount = ACCOUNT_FALLBACK;

function loadStore() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Store;
    if (parsed && typeof parsed === "object") store = parsed;
  } catch { /**/ }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /**/ }
}

function bucket(accountId?: string | null): AccountSnap {
  loadStore();
  const id = accountId && /^\d{5,12}$/.test(accountId) ? accountId : activeAccount;
  if (!store[id]) store[id] = {};
  return store[id];
}

export function setStickyWalletAccount(telegramId: string | null | undefined) {
  loadStore();
  if (telegramId && /^\d{5,12}$/.test(telegramId)) activeAccount = telegramId;
}

function isGhostZoom(value: number, shown: number): boolean {
  if (value <= 0 && shown > 0) return true;
  if (value === NEW_PLAYER_ZOOM_GRANT && shown > value + 1) return true;
  return false;
}

function isGhostAmount(key: StickyWalletKey, value: number, shown: number): boolean {
  if (value <= 0 && shown > 0) return true;
  if (key === "zoom" && isGhostZoom(value, shown)) return true;
  return false;
}

export function peekStickyWalletBalance(key: StickyWalletKey, accountId?: string | null): number | null {
  const v = bucket(accountId)[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Raise the last-good watermark. Never used to flash a lower value. */
export function rememberStickyWalletBalance(key: StickyWalletKey, value: number, accountId?: string | null) {
  const v = finiteNumber(value, -1);
  if (v <= 0) return;
  const snap = bucket(accountId);
  const prev = snap[key];
  if (key === "zoom" && isGhostZoom(v, prev ?? 0) && prev != null && prev > v) return;
  if (prev == null || v > prev + 1e-12) {
    snap[key] = v;
    persist();
  }
}

/** Accept a real spend / server snap (downward allowed). */
export function commitStickyWalletBalance(key: StickyWalletKey, value: number, accountId?: string | null) {
  const v = finiteNumber(value, -1);
  if (v < 0) return;
  bucket(accountId)[key] = v;
  persist();
}

/**
 * Paint the last confirmed balance immediately. Ignore ghost dips
 * (0, starter grant, tab switch). Raise instantly. Never timeout-commit down.
 */
export function useStickyWalletBalance(
  live: number,
  key: StickyWalletKey,
  _holdMs?: number,
): number {
  loadStore();
  const [shown, setShown] = useState(() => {
    const v = finiteNumber(live, 0);
    const last = peekStickyWalletBalance(key);
    if (last != null && last > v) return last;
    if (v > 0 && !isGhostAmount(key, v, last ?? 0)) rememberStickyWalletBalance(key, v);
    return last != null && last > v ? last : Math.max(0, v);
  });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const v = finiteNumber(live, NaN);
    if (!Number.isFinite(v) || v < 0) return;

    if (v + 1e-12 >= shownRef.current) {
      rememberStickyWalletBalance(key, v);
      if (v !== shownRef.current) setShown(v);
      return;
    }

    if (isGhostAmount(key, v, shownRef.current)) return;

    commitStickyWalletBalance(key, v);
    setShown(v);
  }, [live, key]);

  return shown;
}
