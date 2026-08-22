import { fetchEconomyPrice, fetchEconomyHistory, fetchStardustMarketPrice, fetchStardustMarketHistory } from "./api";
import { fetchTonPrice, readCachedTonPriceAllowStale } from "./tonPrice";

const STORAGE_KEY = "zoom-wallet-market-v1";
export const WALLET_MARKET_UPDATE_EVENT = "zoom-wallet-market-update";

export interface WalletMarketCache {
  zoomPriceGram: number | null;
  stardustIndex: number;
  tonPriceUsd: number | null;
  zoomChange24hPct: number | null;
  stardustChange24hPct: number | null;
  at: number;
}

/** % change from chart first→last (same approach as GRAM wallet). */
export function chartSeriesChangePct(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first || first <= 0) return null;
  return ((last! - first!) / first!) * 100;
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
    zoomChange24hPct: cached?.zoomChange24hPct ?? null,
    stardustChange24hPct: cached?.stardustChange24hPct ?? null,
    at: cached?.at ?? 0,
  };
}

/**
 * Push a live ZOOM quote into the wallet cache so the unit price and
 * holdings value track the chart without waiting for the next prefetch.
 */
export function publishWalletZoomPrice(price: number, chartPrices?: number[]) {
  if (!Number.isFinite(price) || price <= 0) return;
  const series = (chartPrices ?? [])
    .filter((v): v is number => Number.isFinite(v) && v > 0);
  if (series.length >= 1) series.push(price);
  writeWalletMarketCache({
    zoomPriceGram: price,
    zoomChange24hPct: series.length >= 2
      ? chartSeriesChangePct(series)
      : readWalletMarketCacheForDisplay().zoomChange24hPct,
  });
}

function writeWalletMarketCache(partial: Partial<WalletMarketCache>) {
  const prev = readWalletMarketCacheForDisplay();
  const next: WalletMarketCache = {
    zoomPriceGram: partial.zoomPriceGram !== undefined ? partial.zoomPriceGram : prev.zoomPriceGram,
    stardustIndex: partial.stardustIndex !== undefined ? partial.stardustIndex : prev.stardustIndex,
    tonPriceUsd: partial.tonPriceUsd !== undefined ? partial.tonPriceUsd : prev.tonPriceUsd,
    zoomChange24hPct: partial.zoomChange24hPct !== undefined ? partial.zoomChange24hPct : prev.zoomChange24hPct,
    stardustChange24hPct: partial.stardustChange24hPct !== undefined ? partial.stardustChange24hPct : prev.stardustChange24hPct,
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
const PREFETCH_MIN_MS = 1_000;

/** Fetch TON + ZOOM + Stardust indices + chart % in parallel and cache for the wallet. */
export async function prefetchWalletMarket(): Promise<void> {
  const cached = readWalletMarketCache();
  if (cached && Date.now() - cached.at < PREFETCH_MIN_MS && cached.zoomPriceGram != null) {
    return;
  }
  if (prefetchInFlight) return prefetchInFlight;
  prefetchInFlight = (async () => {
    try {
      const [ton, zoom, stardust, zoomHist, stardustHist] = await Promise.all([
        fetchTonPrice(),
        fetchEconomyPrice(),
        fetchStardustMarketPrice(),
        fetchEconomyHistory(),
        fetchStardustMarketHistory(),
      ]);

      const zoomPrices = (zoomHist?.points ?? [])
        .map((pt) => pt.price)
        .filter((v): v is number => Number.isFinite(v) && v > 0);
      const stardustIndexes = (stardustHist?.points ?? [])
        .map((pt) => pt.index)
        .filter((v): v is number => Number.isFinite(v) && v > 0);

      const liveZoom = zoom && Number.isFinite(zoom.price) ? zoom.price : null;
      const liveStardust = stardust && Number.isFinite(stardust.index) ? stardust.index : undefined;

      if (liveZoom != null && zoomPrices.length >= 1) {
        zoomPrices.push(liveZoom);
      }
      if (liveStardust != null && stardustIndexes.length >= 1) {
        stardustIndexes.push(liveStardust);
      }

      writeWalletMarketCache({
        tonPriceUsd: ton,
        zoomPriceGram: liveZoom,
        stardustIndex: liveStardust,
        zoomChange24hPct: chartSeriesChangePct(zoomPrices),
        stardustChange24hPct: chartSeriesChangePct(stardustIndexes),
      });
    } finally {
      prefetchInFlight = null;
    }
  })();
  return prefetchInFlight;
}
