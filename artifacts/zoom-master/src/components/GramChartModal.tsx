import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GramWalletIcon } from "./TonWalletWidget";
import { useT } from "../i18n/LanguageContext";
import { fetchTonPrice, readCachedTonPriceAllowStale } from "../utils/tonPrice";
import { chartIconScale } from "../utils/wallet24hChange";

const REFRESH_MS = 15_000;
const CACHE_TTL_MS = 60_000;

interface ChartPoint {
  t: number;
  price: number;
  label: string;
}

/** Shared cache survives modal unmount so reopening shows the chart instantly. */
const gramMarketCache: {
  price: number | null;
  points: ChartPoint[];
  fetchedAt: number;
} = {
  price: null,
  points: [],
  fetchedAt: 0,
};

function readCache(): { price: number | null; points: ChartPoint[] } {
  if (Date.now() - gramMarketCache.fetchedAt > CACHE_TTL_MS) {
    return { price: null, points: [] };
  }
  return { price: gramMarketCache.price, points: gramMarketCache.points };
}

function writeCache(price: number | null, points: ChartPoint[]) {
  if (price != null && Number.isFinite(price)) gramMarketCache.price = price;
  if (points.length) gramMarketCache.points = points;
  if (price != null || points.length) gramMarketCache.fetchedAt = Date.now();
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Binance klines — CORS-friendly, works inside Telegram WebView. */
async function fetchBinanceHistory(): Promise<ChartPoint[]> {
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

async function fetchCoinGeckoHistory(): Promise<ChartPoint[]> {
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

/** Downsample so the chart stays smooth on mobile. */
function downsample(points: ChartPoint[], maxPoints = 64): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: ChartPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1]?.t !== last.t) out.push(last);
  return out;
}

interface Props {
  gramBalance: number;
  depositBalance: number;
  initialPrice?: number | null;
  onClose: () => void;
  onPriceUpdate?: (price: number) => void;
}

export function GramChartModal({
  gramBalance,
  depositBalance,
  initialPrice = null,
  onClose,
  onPriceUpdate,
}: Props) {
  const { t } = useT();
  const cached = readCache();
  const [price, setPrice] = useState<number | null>(
    initialPrice ?? cached.price ?? readCachedTonPriceAllowStale(),
  );
  const [points, setPoints] = useState<ChartPoint[]>(cached.points);
  const [loading, setLoading] = useState(
    () => (initialPrice ?? cached.price) == null || cached.points.length < 2,
  );
  const [chartReady, setChartReady] = useState(false);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;
  const gradientId = useId().replace(/:/g, "");

  useLayoutEffect(() => {
    setChartReady(false);
    const id = window.requestAnimationFrame(() => setChartReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const refresh = useCallback(async () => {
    let nextPrice: number | null = null;
    let nextPoints: ChartPoint[] = [];

    // Prefer Binance (reliable in Telegram WebView); CoinGecko / wallet cache as fallback.
    const [binancePrice, binanceHist] = await Promise.all([
      fetchBinancePrice(),
      fetchBinanceHistory(),
    ]);

    if (binanceHist.length >= 2) {
      nextPoints = downsample(binanceHist);
      setPoints(nextPoints);
    } else {
      const cgHist = await fetchCoinGeckoHistory();
      if (cgHist.length >= 2) {
        nextPoints = downsample(cgHist);
        setPoints(nextPoints);
      }
    }

    nextPrice = binancePrice ?? (await fetchTonPrice());
    if (nextPrice != null && Number.isFinite(nextPrice)) {
      setPrice(nextPrice);
      onPriceUpdateRef.current?.(nextPrice);
    }

    if (nextPoints.length >= 2 || nextPrice != null) {
      writeCache(
        nextPrice ?? readCache().price,
        nextPoints.length >= 2 ? nextPoints : readCache().points,
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  const totalGram = gramBalance + depositBalance;
  const usdtValue = price != null ? totalGram * price : null;
  const chartData = useMemo(() => {
    if (points.length >= 2) return points;
    if (points.length === 1 && price != null) {
      return [
        { ...points[0], t: points[0].t - 3_600_000, label: formatTime(points[0].t - 3_600_000) },
        { ...points[0], price, label: t("gramChart.now") },
      ];
    }
    // Avoid a fake flat line when history is missing — show empty instead.
    return [];
  }, [points, price, t]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartData.length < 2) return ["auto", "auto"];
    const vals = chartData.map((d) => d.price);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (!(max > min)) {
      const pad = Math.max(min * 0.01, 0.01);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad];
  }, [chartData]);

  const pctChange = useMemo(() => {
    if (chartData.length < 2) return 0;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    if (!first) return 0;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const showChart = chartReady && chartData.length >= 2;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.92)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(0,242,180,0.10) 0%, rgba(8,10,18,0.98) 28%)",
          border: "1px solid rgba(0,242,180,0.22)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", color: "rgba(0,242,180,0.55)" }}>
              {t("gramChart.title")}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                style={{
                  display: "inline-flex",
                  transform: `scale(${chartIconScale(pctChange)})`,
                  transformOrigin: "center bottom",
                  transition: "transform 0.45s ease",
                }}
              >
                <GramWalletIcon size={28} />
              </span>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#00f2b4" }}>
                {price != null ? `$${price.toFixed(4)}` : "…"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: pctChange >= 0 ? "#69f0ae" : "#ff8a80" }}>
              {t("gramChart.change24h", { pct: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}` })}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              {t("gramChart.liveTonUsd")}
            </div>
          </div>
        </div>

        <div className="px-3 pb-2 mx-2 rounded-xl" style={{ background: "rgba(0,242,180,0.06)", border: "1px solid rgba(0,242,180,0.12)" }}>
          <div className="flex justify-between py-2 px-2 text-xs">
            <span style={{ color: "rgba(255,255,255,0.45)" }}>{t("gramChart.yourGram")}</span>
            <span style={{ color: "#00f2b4", fontWeight: 800 }}>{totalGram.toFixed(4)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 text-xs border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>{t("gramChart.usdtValue")}</span>
            <span style={{ color: "#fff", fontWeight: 800 }}>
              {usdtValue != null ? `$${usdtValue.toFixed(2)}` : "…"}
            </span>
          </div>
        </div>

        <div className="px-3 pb-4" style={{ height: 200, minHeight: 200 }}>
          {showChart ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f2b4" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00f2b4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickCount={5}
                  tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(0,242,180,0.25)", borderRadius: 8 }}
                  formatter={(v: number) => [`$${v.toFixed(4)}`, t("gramChart.seriesGram")]}
                />
                <Area type="monotone" dataKey="price" stroke="#00f2b4" strokeWidth={2} fill={`url(#${gradientId})`} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              {loading ? t("gramChart.loading") : t("gramChart.unavailable")}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-xs font-black"
          style={{ color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {t("common.close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
