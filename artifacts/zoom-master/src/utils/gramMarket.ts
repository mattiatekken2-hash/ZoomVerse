/**
 * Live GRAM (= TON) USD market — shared by Wallet card + GramChartModal
 * so the % under the emoji matches the real chart (first→last of ~24h history).
 */
import { fetchTonPrice, readCachedTonPriceAllowStale } from "./tonPrice";

export interface GramChartPoint {
  t: number;
  price: number;
  label: string;
}

export interface GramMarketSnapshot {
  priceUsd: number | null;
  /** Real ~24h change from chart first→last (Binance TONUSDT / CoinGecko). */
  change24hPct: number | null;
  points: GramChartPoint[];
}

const CACHE_TTL_MS = 60_000;
const EVENT = "zoom-gram-market-update";

const cache: {
  priceUsd: number | null;
  change24hPct: number | null;
  points: GramChartPoint[];
  fetchedAt: number;
} = {
  priceUsd: null,
  change24hPct: null,
  points: [],
  fetchedAt: 0,
};

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** % from chart open → close (same math as the GRAM modal header). */
export function gramChartChangePct(points: Array<{ price: number }>): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first || first <= 0) return null;
  return ((last! - first!) / first!) * 100;
}

function downsample(points: GramChartPoint[], maxPoints = 64): GramChartPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: GramChartPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

async function fetchBinanceHistory(): Promise<GramChartPoint[]> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/klines?symbol=TONUSDT&interval=15m&limit=96",
      { signal: AbortSignal.timeout(10000), cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows = await res.json() as Array<[number, string, string, string, string]>;
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.map((row) => {
      const t = Number(row[0]);
      const price = parseFloat(row[4]);
      return { t, price, label: formatTime(t) };
    }).filter((p) => Number.isFinite(p.price) && p.price > 0);
  } catch {
    return [];
  }
}

async function fetchBinancePrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT",
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json() as { price?: string };
    const p = parseFloat(data.price ?? "");
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoHistory(): Promise<GramChartPoint[]> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/the-open-network/market_chart?vs_currency=usd&days=1",
      { signal: AbortSignal.timeout(10000), cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json() as { prices?: [number, number][] };
    return (data.prices ?? []).map(([t, price]) => ({
      t,
      price,
      label: formatTime(t),
    })).filter((p) => Number.isFinite(p.price) && p.price > 0);
  } catch {
    return [];
  }
}

function writeCache(snap: Omit<GramMarketSnapshot, never>) {
  cache.priceUsd = snap.priceUsd;
  cache.change24hPct = snap.change24hPct;
  if (snap.points.length >= 2) cache.points = snap.points;
  cache.fetchedAt = Date.now();
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch { /**/ }
}

/** Instant paint from last fetch (may be stale within TTL). */
export function readGramMarketCache(): GramMarketSnapshot {
  const fresh = Date.now() - cache.fetchedAt <= CACHE_TTL_MS;
  return {
    priceUsd: cache.priceUsd ?? readCachedTonPriceAllowStale(),
    change24hPct: fresh || cache.change24hPct != null ? cache.change24hPct : null,
    points: cache.points,
  };
}

export function subscribeGramMarket(onUpdate: () => void): () => void {
  window.addEventListener(EVENT, onUpdate);
  return () => window.removeEventListener(EVENT, onUpdate);
}

let inFlight: Promise<GramMarketSnapshot> | null = null;

/** Fetch live TON/USD + ~24h chart; % = chart first→last (real market move). */
export async function fetchGramMarketSnapshot(): Promise<GramMarketSnapshot> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      let points: GramChartPoint[] = [];
      const [binancePrice, binanceHist] = await Promise.all([
        fetchBinancePrice(),
        fetchBinanceHistory(),
      ]);

      if (binanceHist.length >= 2) {
        points = downsample(binanceHist);
      } else {
        const cg = await fetchCoinGeckoHistory();
        if (cg.length >= 2) points = downsample(cg);
      }

      const priceUsd =
        binancePrice
        ?? (await fetchTonPrice())
        ?? readCachedTonPriceAllowStale();

      // Prefer chart last close for %; if we have a fresher spot, append it so
      // the % tracks the live tip of the real GRAM chart.
      let pctPoints = points;
      if (
        points.length >= 2
        && priceUsd != null
        && Number.isFinite(priceUsd)
        && Math.abs(priceUsd - points[points.length - 1]!.price) / points[points.length - 1]!.price > 0.00005
      ) {
        pctPoints = [
          ...points,
          { t: Date.now(), price: priceUsd, label: formatTime(Date.now()) },
        ];
      }

      const change24hPct = gramChartChangePct(pctPoints);
      const snap: GramMarketSnapshot = {
        priceUsd,
        change24hPct,
        points: pctPoints.length >= 2 ? pctPoints : points,
      };
      writeCache(snap);
      return snap;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
