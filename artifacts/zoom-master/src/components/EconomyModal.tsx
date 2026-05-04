/**
 * EconomyModal — full-screen ECONOMY panel that opens when the user taps
 * the small EconomyWidget pill on the FARM page.
 *
 * Renders a dark/neon AreaChart of the global $ZOOM price history along
 * with the current price, % change vs genesis, and the user's live
 * "portfolio value" (balance × price). Polls every 8s while open so the
 * chart and portfolio reflect activity in near-real-time without
 * hammering the server.
 *
 * No mutations — read-only view. All in-app text English to match brand
 * invariants. Recharts is already a dep of this artifact.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fetchEconomyPrice, fetchEconomyHistory, type EconomyChartPoint } from "../utils/api";

const REFRESH_MS = 8_000;

interface EconomyModalProps {
  onClose: () => void;
  balance: number;
  initialPrice: number | null;
  initialGenesis: number;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0.0000";
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function EconomyModal({ onClose, balance, initialPrice, initialGenesis }: EconomyModalProps) {
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [genesis, setGenesis] = useState<number>(initialGenesis);
  const [points, setPoints] = useState<EconomyChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([fetchEconomyPrice(), fetchEconomyHistory()]);
    if (p && Number.isFinite(p.price)) {
      setPrice(p.price);
      if (Number.isFinite(p.genesisPrice)) setGenesis(p.genesisPrice);
    }
    if (h?.points) setPoints(h.points);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on ESC for desktop / external keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentPrice = price ?? genesis;
  const change = currentPrice > 0 && genesis > 0 ? (currentPrice - genesis) / genesis : 0;
  const positive = change >= 0;
  const portfolio = Number.isFinite(balance) ? balance * currentPrice : 0;

  // Chart-friendly data. We render `price` as the Y axis (in dollars) and
  // an integer index on the X axis for monotonic spacing. Tooltip shows
  // wall-clock time.
  const chartData = useMemo(() => {
    return points.map((pt, i) => ({ i, t: pt.t, price: pt.price }));
  }, [points]);

  const yMin = useMemo(() => {
    if (chartData.length === 0) return 0;
    const min = Math.min(...chartData.map((d) => d.price));
    return Math.max(0, min * 0.995);
  }, [chartData]);
  const yMax = useMemo(() => {
    if (chartData.length === 0) return genesis * 1.5;
    const max = Math.max(...chartData.map((d) => d.price));
    return max * 1.005;
  }, [chartData, genesis]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,4,12,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      data-testid="economy-modal"
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(4,18,32,0.98) 0%, rgba(0,8,18,0.98) 100%)",
          border: "1px solid rgba(0,242,254,0.35)",
          boxShadow: "0 -8px 40px rgba(0,242,254,0.18), 0 0 60px rgba(0,242,254,0.10)",
          maxHeight: "92vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b" style={{ borderColor: "rgba(0,242,254,0.14)" }}>
          <div>
            <div
              className="text-[10px] font-black tracking-widest"
              style={{ color: "rgba(0,242,254,0.85)", letterSpacing: 1.4 }}
            >
              ECONOMY
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[11px]" style={{ color: "rgba(220,235,255,0.55)" }}>1 $ZOOM</span>
              <span
                className="text-2xl font-black"
                style={{
                  color: "#00f2fe",
                  textShadow: "0 0 14px rgba(0,242,254,0.7)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ${formatPrice(currentPrice)}
              </span>
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: positive ? "rgba(0,255,140,0.12)" : "rgba(255,80,80,0.12)",
                  color: positive ? "#00ff88" : "#ff7676",
                  border: positive
                    ? "1px solid rgba(0,255,140,0.35)"
                    : "1px solid rgba(255,80,80,0.35)",
                }}
              >
                {positive ? "+" : ""}{(change * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-base font-black"
            style={{
              background: "rgba(0,242,254,0.10)",
              border: "1px solid rgba(0,242,254,0.30)",
              color: "rgba(220,235,255,0.85)",
            }}
            data-testid="btn-economy-close"
          >
            ×
          </button>
        </div>

        {/* Chart */}
        <div className="px-2 pt-3 pb-1" style={{ minHeight: 220 }}>
          {loading && chartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs" style={{ color: "rgba(220,235,255,0.4)" }}>
              Loading chart…
            </div>
          ) : chartData.length < 2 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-center px-6" style={{ color: "rgba(220,235,255,0.5)" }}>
              Chart starts moving as soon as players trade and farm.<br />Come back in a few minutes.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="zoomPriceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f2fe" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#00f2fe" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(0,242,254,0.08)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="i"
                  hide
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: "rgba(220,235,255,0.45)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => `$${formatPrice(v)}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(0,12,24,0.95)",
                    border: "1px solid rgba(0,242,254,0.35)",
                    borderRadius: 10,
                    color: "#e6f6ff",
                    fontSize: 11,
                  }}
                  labelFormatter={(_label: number, payload) => {
                    const d = payload?.[0]?.payload as { t?: number } | undefined;
                    return d?.t ? formatTime(d.t) : "";
                  }}
                  formatter={(v: number) => [`$${formatPrice(v)}`, "1 $ZOOM"]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#00f2fe"
                  strokeWidth={2}
                  fill="url(#zoomPriceFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats grid */}
        <div className="px-5 pt-2 pb-4 grid grid-cols-2 gap-2.5">
          <Stat label="Your $ZOOM" value={formatNumber(balance)} accent="cyan" />
          <Stat label="Portfolio Value" value={`$${formatPrice(portfolio)}`} accent="green" />
          <Stat label="Genesis Price" value={`$${formatPrice(genesis)}`} accent="dim" />
          <Stat label="History Points" value={String(chartData.length)} accent="dim" />
        </div>

        {/* Explainer */}
        <div
          className="mx-5 mb-4 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed"
          style={{
            background: "rgba(0,28,48,0.45)",
            border: "1px solid rgba(0,242,254,0.18)",
            color: "rgba(220,235,255,0.7)",
          }}
        >
          <span style={{ color: "#00f2fe", fontWeight: 800 }}>♪ How it works.</span>{" "}
          The $ZOOM price reflects player activity. Every market trade, every
          new farming cycle and every craft nudges it up. Your Portfolio Value
          updates live as the price moves.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: "cyan" | "green" | "dim" }) {
  const color =
    accent === "cyan" ? "#00f2fe" :
    accent === "green" ? "#00ff88" :
    "rgba(220,235,255,0.85)";
  const glow =
    accent === "cyan" ? "0 0 8px rgba(0,242,254,0.45)" :
    accent === "green" ? "0 0 8px rgba(0,255,140,0.45)" :
    "none";
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: "linear-gradient(135deg, rgba(0,28,48,0.55) 0%, rgba(0,12,24,0.85) 100%)",
        border: "1px solid rgba(0,242,254,0.20)",
      }}
    >
      <div className="text-[10px] font-bold tracking-wide" style={{ color: "rgba(220,235,255,0.45)" }}>
        {label}
      </div>
      <div
        className="text-sm font-black mt-0.5"
        style={{ color, textShadow: glow, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
