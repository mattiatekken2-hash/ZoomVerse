/**
 * Live GRAM (= TON) USD market — Wallet % uses Binance 24hr ticker, not a
 * frozen first→last candle ratio (that could sit on -0.25% for hours).
 */
import { fetchTonPrice, readCachedTonPriceAllowStale } from "./tonPrice";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  `${typeof window !== "undefined" ? window.location.origin : ""}/api`;

export interface GramChartPoint {
  t: number;
  price: number;
  label: string;
}

export interface GramMarketSnapshot {
  priceUsd: number | null;
  /** Live 24h % from Binance ticker/24hr (TONUSDT), CoinGecko fallback. */
  change24hPct: number | null;
  points: GramChartPoint[];
}

const CACHE_TTL_MS = 15_000;
/** Do not paint a % older than this — avoids a stuck -0.25% after a failed fetch. */
const STALE_PCT_MS = 90_000;
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

/** % from chart open → close (header fallback only). */
export function gramChartChangePct(points: Array<{ price: number }>): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first || first <= 0) return null;
  return ((last! - first!) / first!) * 100;
}

function downsample(points: GramChartPoint[], maxPoints = 90): GramChartPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: GramChartPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

async function fetchBinance24h(): Promise<{ price: number; pct: number } | null> {
  const urls = [
    "https://api.binance.com/api/v3/ticker/24hr?symbol=TONUSDT",
    "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=TONUSDT",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json() as { lastPrice?: string; priceChangePercent?: string };
      const price = parseFloat(data.lastPrice ?? "");
      const pct = parseFloat(data.priceChangePercent ?? "");
      if (!Number.isFinite(price) || price <= 0) continue;
      return { price, pct: Number.isFinite(pct) ? pct : NaN };
    } catch { /* try next */ }
  }
  return null;
}

async function fetchBinanceHistory(): Promise<GramChartPoint[]> {
  const urls = [
    "https://api.binance.com/api/v3/klines?symbol=TONUSDT&interval=1m&limit=120",
    "https://data-api.binance.vision/api/v3/klines?symbol=TONUSDT&interval=1m&limit=120",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) continue;
      const rows = await res.json() as Array<[number, string, string, string, string]>;
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const points = rows.map((row) => {
        const t = Number(row[0]);
        const price = parseFloat(row[4]);
        return { t, price, label: formatTime(t) };
      }).filter((p) => Number.isFinite(p.price) && p.price > 0);
      if (points.length >= 2) return points;
    } catch { /* try next */ }
  }
  return [];
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

const STORAGE_KEY = "zoom-gram-market-v1";

function hydrateCacheFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      priceUsd?: number | null;
      change24hPct?: number | null;
      points?: GramChartPoint[];
      fetchedAt?: number;
    };
    if (Array.isArray(parsed.points) && parsed.points.length >= 2) {
      cache.points = parsed.points;
      if (typeof parsed.priceUsd === "number" && parsed.priceUsd > 0) cache.priceUsd = parsed.priceUsd;
      if (typeof parsed.change24hPct === "number" && Number.isFinite(parsed.change24hPct)) {
        cache.change24hPct = parsed.change24hPct;
      }
      cache.fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 1;
    }
  } catch { /**/ }
}
hydrateCacheFromStorage();

function persistCache() {
  try {
    if (cache.points.length < 2) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      priceUsd: cache.priceUsd,
      change24hPct: cache.change24hPct,
      points: cache.points,
      fetchedAt: cache.fetchedAt,
    }));
  } catch { /**/ }
}

function ensureChartPoints(points: GramChartPoint[], price: number | null): GramChartPoint[] {
  const live = appendLivePoint(points.length >= 2 ? points : cache.points, price);
  if (live.length >= 2) return live;
  if (price != null && price > 0) {
    const now = Date.now();
    return [
      { t: now - 3_600_000, price, label: formatTime(now - 3_600_000) },
      { t: now, price, label: formatTime(now) },
    ];
  }
  return live;
}

function writeCache(snap: GramMarketSnapshot) {
  cache.priceUsd = snap.priceUsd;
  cache.change24hPct = snap.change24hPct;
  if (snap.points.length >= 2) cache.points = snap.points;
  cache.fetchedAt = Date.now();
  persistCache();
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch { /**/ }
}

/** Instant paint from last fetch — % only if still fresh. */
export function readGramMarketCache(): GramMarketSnapshot {
  const age = Date.now() - cache.fetchedAt;
  const pctOk = cache.fetchedAt > 0 && age <= STALE_PCT_MS;
  return {
    priceUsd: cache.priceUsd ?? readCachedTonPriceAllowStale(),
    change24hPct: pctOk ? cache.change24hPct : null,
    points: cache.points,
  };
}

export function subscribeGramMarket(onUpdate: () => void): () => void {
  window.addEventListener(EVENT, onUpdate);
  return () => window.removeEventListener(EVENT, onUpdate);
}

let inFlight: Promise<GramMarketSnapshot> | null = null;

function appendLivePoint(points: GramChartPoint[], livePrice: number | null): GramChartPoint[] {
  if (livePrice == null || !(livePrice > 0)) return points;
  const now = Date.now();
  const next = { t: now, price: livePrice, label: formatTime(now) };
  if (points.length === 0) return [next];
  const last = points[points.length - 1]!;
  if (now - last.t < 8_000) return [...points.slice(0, -1), next];
  return [...points, next];
}

/** Fetch live TON/USD + 24h ticker % (not a stuck candle ratio). */
export async function fetchGramMarketSnapshot(opts?: { force?: boolean }): Promise<GramMarketSnapshot> {
  if (inFlight) return inFlight;
  if (!opts?.force && Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.change24hPct != null && cache.points.length >= 2) {
    return readGramMarketCache();
  }
  inFlight = (async () => {
    try {
      try {
        const proxied = await fetch(`${API_BASE}/economy/gram-market`, {
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        if (proxied.ok) {
          const data = await proxied.json() as {
            priceUsd?: number | null;
            change24hPct?: number | null;
            points?: Array<{ t: number; price: number }>;
          };
          const rawPts = (data.points ?? [])
            .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price) && p.price > 0)
            .map((p) => ({ t: p.t, price: p.price, label: formatTime(p.t) }));
          const priceUsd =
            (typeof data.priceUsd === "number" && data.priceUsd > 0 ? data.priceUsd : null)
            ?? (await fetchTonPrice())
            ?? readCachedTonPriceAllowStale();
          const points = ensureChartPoints(rawPts.length >= 2 ? downsample(rawPts) : [], priceUsd);
          const change24hPct =
            typeof data.change24hPct === "number" && Number.isFinite(data.change24hPct)
              ? data.change24hPct
              : gramChartChangePct(points);
          if (points.length >= 2 || priceUsd != null) {
            const snap: GramMarketSnapshot = { priceUsd, change24hPct, points };
            writeCache(snap);
            if (points.length >= 2) return snap;
          }
        }
      } catch { /* fall through to direct Binance */ }

      const [ticker, binanceHist] = await Promise.all([
        fetchBinance24h(),
        fetchBinanceHistory(),
      ]);

      let points: GramChartPoint[] = [];
      if (binanceHist.length >= 2) {
        points = downsample(binanceHist);
      } else {
        const cg = await fetchCoinGeckoHistory();
        if (cg.length >= 2) points = downsample(cg);
      }

      const priceUsd =
        ticker?.price
        ?? (await fetchTonPrice())
        ?? readCachedTonPriceAllowStale();

      const change24hPct =
        ticker != null && Number.isFinite(ticker.pct)
          ? ticker.pct
          : gramChartChangePct(points);

      const snap: GramMarketSnapshot = {
        priceUsd,
        change24hPct,
        points: ensureChartPoints(points, priceUsd),
      };
      writeCache(snap);
      return snap;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
