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

async function fetchGramPrice(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json() as { "the-open-network"?: { usd?: number } };
    return data["the-open-network"]?.usd ?? null;
  } catch {
    return null;
  }
}

async function fetchGramHistory(): Promise<ChartPoint[]> {
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
      label: new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
  } catch {
    return [];
  }
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
  const cached = readCache();
  const [price, setPrice] = useState<number | null>(
    initialPrice ?? cached.price,
  );
  const [points, setPoints] = useState<ChartPoint[]>(cached.points);
  const [loading, setLoading] = useState(
    () => (initialPrice ?? cached.price) == null || cached.points.length < 2,
  );
  const [chartReady, setChartReady] = useState(false);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;
  const gradientId = useId().replace(/:/g, "");

  // Recharts needs one frame after portal mount before ResponsiveContainer measures.
  useLayoutEffect(() => {
    setChartReady(false);
    const id = window.requestAnimationFrame(() => setChartReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const refresh = useCallback(async () => {
    let nextPrice: number | null = null;
    let nextPoints: ChartPoint[] = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      const [p, hist] = await Promise.all([fetchGramPrice(), fetchGramHistory()]);
      if (p != null && Number.isFinite(p)) {
        nextPrice = p;
        setPrice(p);
        onPriceUpdateRef.current?.(p);
      }
      if (hist.length >= 2) {
        nextPoints = hist;
        setPoints(hist);
        break;
      }
      if (attempt === 0) await new Promise((r) => window.setTimeout(r, 400));
    }

    if (nextPoints.length >= 2 || nextPrice != null) {
      writeCache(nextPrice ?? readCache().price, nextPoints.length >= 2 ? nextPoints : readCache().points);
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
        { ...points[0], t: points[0].t - 3_600_000 },
        points[0],
      ];
    }
    if (price != null) {
      return [
        { t: Date.now() - 3_600_000, price, label: "" },
        { t: Date.now(), price, label: "now" },
      ];
    }
    return [];
  }, [points, price]);

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
              GRAM MARKET
            </div>
            <div className="flex items-center gap-2 mt-1">
              <GramWalletIcon size={28} />
              <div style={{ fontSize: 22, fontWeight: 900, color: "#00f2b4" }}>
                {price != null ? `$${price.toFixed(4)}` : "…"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: pctChange >= 0 ? "#69f0ae" : "#ff8a80" }}>
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}% 24h
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Live TON/USD
            </div>
          </div>
        </div>

        <div className="px-3 pb-2 mx-2 rounded-xl" style={{ background: "rgba(0,242,180,0.06)", border: "1px solid rgba(0,242,180,0.12)" }}>
          <div className="flex justify-between py-2 px-2 text-xs">
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Your GRAM</span>
            <span style={{ color: "#00f2b4", fontWeight: 800 }}>{totalGram.toFixed(4)}</span>
          </div>
          <div className="flex justify-between py-2 px-2 text-xs border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>≈ USDT value</span>
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
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(0,242,180,0.25)", borderRadius: 8 }}
                  formatter={(v: number) => [`$${v.toFixed(4)}`, "GRAM"]}
                />
                <Area type="monotone" dataKey="price" stroke="#00f2b4" strokeWidth={2} fill={`url(#${gradientId})`} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              {loading ? "Loading live GRAM chart…" : "Chart unavailable"}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-xs font-black"
          style={{ color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
