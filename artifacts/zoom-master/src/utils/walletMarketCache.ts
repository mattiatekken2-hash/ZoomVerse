import { fetchEconomyPrice, fetchStardustMarketPrice } from "./api";
import { fetchTonPrice, readCachedTonPriceAllowStale } from "./tonPrice";

const STORAGE_KEY = "zoom-wallet-market-v1";
export const WALLET_MARKET_UPDATE_EVENT = "zoom-wallet-market-update";

export interface WalletMarketCache {
  zoomPriceGram: number | null;
  stardustIndex: number;
  tonPriceUsd: number | null;
  at: number;
}

export function readWalletMarketCache(): WalletMarketCache | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletMarketCache;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Instant wallet paint — falls back to stale TON cache when needed. */
export function readWalletMarketCacheForDisplay(): WalletMarketCache {
  const cached = readWalletMarketCache();
  const tonStale = readCachedTonPriceAllowStale();
  return {
    zoomPriceGram: cached?.zoomPriceGram ?? null,
    stardustIndex: cached?.stardustIndex ?? 1,
    tonPriceUsd: cached?.tonPriceUsd ?? tonStale,
    at: cached?.at ?? 0,
  };
}

function writeWalletMarketCache(partial: Partial<WalletMarketCache>) {
  const prev = readWalletMarketCacheForDisplay();
  const next: WalletMarketCache = {
    zoomPriceGram: partial.zoomPriceGram !== undefined ? partial.zoomPriceGram : prev.zoomPriceGram,
    stardustIndex: partial.stardustIndex !== undefined ? partial.stardustIndex : prev.stardustIndex,
    tonPriceUsd: partial.tonPriceUsd !== undefined ? partial.tonPriceUsd : prev.tonPriceUsd,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /**/ }
  window.dispatchEvent(new Event(WALLET_MARKET_UPDATE_EVENT));
}

export function subscribeWalletMarketCache(onUpdate: () => void): () => void {
  window.addEventListener(WALLET_MARKET_UPDATE_EVENT, onUpdate);
  return () => window.removeEventListener(WALLET_MARKET_UPDATE_EVENT, onUpdate);
}

let prefetchInFlight: Promise<void> | null = null;

/** Fetch TON + ZOOM + Stardust indices in parallel and cache for the wallet. */
export async function prefetchWalletMarket(): Promise<void> {
  if (prefetchInFlight) return prefetchInFlight;
  prefetchInFlight = (async () => {
    try {
      const [ton, zoom, stardust] = await Promise.all([
        fetchTonPrice(),
        fetchEconomyPrice(),
        fetchStardustMarketPrice(),
      ]);
      writeWalletMarketCache({
        tonPriceUsd: ton,
        zoomPriceGram: zoom && Number.isFinite(zoom.price) ? zoom.price : null,
        stardustIndex: stardust && Number.isFinite(stardust.index) ? stardust.index : undefined,
      });
    } finally {
      prefetchInFlight = null;
    }
  })();
  return prefetchInFlight;
}
