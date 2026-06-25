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
import { createPortal } from "react-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { fetchEconomyPrice, fetchEconomyHistory, type EconomyChartPoint } from "../utils/api";

// Real micro-volatility now lives on the SERVER (zoomPrice.ts:
// randomDeltaBp signed delta around each action's base bp). The chart
// shows ONLY the actual server-recorded points — no synthetic wiggle,
// no per-segment noise. This is what the user asked for: an organic
// curve driven entirely by real player activity.
//
// Refresh cadence: 30s while the modal is open. The price is event-
// driven server-side (no per-second tick), so polling more often just
// burns bandwidth without showing anything new.
const REFRESH_MS = 30_000;

interface EconomyModalProps {
  onClose: () => void;
  balance: number;
  initialPrice: number | null;
  initialGenesis: number;
  initialDailyHigh?: number | null;
}

function formatPrice(p: number): string {
  // Prices are denominated in TON (decorative). The genesis is 0.0001 TON
  // and values grow slowly, so we need 6 decimals to show meaningful
  // movement at sub-unit scale. Larger values fall back to fewer decimals.
  if (!Number.isFinite(p) || p <= 0) return "0.000000";
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function fmtTon(p: number): string {
  return `${formatPrice(p)} TON`;
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

export function EconomyModal({ onClose, balance, initialPrice, initialGenesis, initialDailyHigh }: EconomyModalProps) {
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [genesis, setGenesis] = useState<number>(initialGenesis);
  const [dailyHigh, setDailyHigh] = useState<number | null>(initialDailyHigh ?? null);
  const [points, setPoints] = useState<EconomyChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([fetchEconomyPrice(), fetchEconomyHistory()]);
    if (p && Number.isFinite(p.price)) {
      setPrice(p.price);
      if (Number.isFinite(p.genesisPrice)) setGenesis(p.genesisPrice);
      if (p.dailyHighPrice != null && Number.isFinite(p.dailyHighPrice)) {
        setDailyHigh(p.dailyHighPrice);
      }
    }
    if (h?.points) setPoints(h.points);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Lock background scroll AND touch panning while the modal is open. We
  // need both `overflow:hidden` (desktop / wheel) and an explicit
  // `touch-action: none` lock (mobile / Telegram WebView) — without the
  // latter, iOS still pans the underlying page through the overlay even
  // though body overflow is hidden. Restored exactly on close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
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

  // Chart-friendly data: just the REAL server points, indexed for
  // monotonic X spacing. Volatility (the up/down wiggle) is produced on
  // the server by the signed-random delta in zoomPrice.bumpZoomPrice —
  // we render exactly what was recorded, no synthetic interpolation.
  const chartData = useMemo(
    () => points.map((pt, i) => ({ i, t: pt.t, price: pt.price, real: true })),
    [points],
  );

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

  // We render via `createPortal` straight to `document.body` so the modal
  // escapes ancestor stacking/containing blocks (the FARM page scroll
  // container uses `transform: translateZ(0)` + `contain: layout paint`,
  // which would otherwise turn `position: fixed` into "fixed relative to
  // that ancestor" — clipping the header and the × button off-screen).
  // Touch-panning and wheel scrolling are blocked at the overlay level so
  // the page underneath cannot move at all while the modal is open.
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const blockTouch = (e: React.TouchEvent) => {
    // Allow scrolling INSIDE the modal card, block everything else (the
    // black overlay area surrounding the card). Cancellable to make iOS
    // momentum-scroll respect the lock too. We compare against the
    // overlay node so any descendant (the card or its inner elements)
    // keeps its native scroll behaviour while the surrounding backdrop
    // can never pan the page underneath.
    if (e.target === e.currentTarget) e.preventDefault();
  };

  const node = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{
        background: "rgba(0,4,12,0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        // Belt-and-braces: prevent the overlay itself from being scrolled
        // by the user's panning gesture.
        overscrollBehavior: "contain",
        touchAction: "none",
        padding: "16px",
      }}
      onClick={onClose}
      onTouchMove={blockTouch}
      onWheel={blockTouch as unknown as (e: React.WheelEvent) => void}
      data-testid="economy-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="economy-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-3xl flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(4,18,32,0.98) 0%, rgba(0,8,18,0.98) 100%)",
          border: "1px solid rgba(255,51,85,0.35)",
          boxShadow: "0 -8px 40px rgba(255,51,85,0.18), 0 0 60px rgba(255,51,85,0.10)",
          maxHeight: "min(92vh, 720px)",
          // Card allows internal vertical scroll so the content remains
          // reachable on very small screens (iPhone SE etc.). The overlay
          // around the card is still locked, so the page underneath cannot
          // pan — only the card scrolls when needed. `overscroll-behavior:
          // contain` prevents the scroll chain from bubbling to the body.
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
        onClick={stop}
        onWheel={stop}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b" style={{ borderColor: "rgba(255,51,85,0.14)" }}>
          <div>
            <div
              id="economy-modal-title"
              className="text-[10px] font-black tracking-widest"
              style={{ color: "rgba(255,51,85,0.85)", letterSpacing: 1.4 }}
            >
              ECONOMY
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[11px]" style={{ color: "rgba(220,235,255,0.55)" }}>1 $ZOOM</span>
              <span
                className="text-2xl font-black"
                style={{
                  color: "#ff3355",
                  textShadow: "0 0 14px rgba(255,51,85,0.7)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTon(currentPrice)}
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
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            aria-label="Close"
            className="rounded-full flex items-center justify-center font-black flex-shrink-0"
            style={{
              width: 36,
              height: 36,
              background: "rgba(255,51,85,0.14)",
              border: "1px solid rgba(255,51,85,0.45)",
              color: "#ff3355",
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              // Bigger hit target on mobile + force foreground so the touch
              // is never swallowed by overlapping decorative pseudo-elements.
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
              zIndex: 2,
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
                    <stop offset="0%" stopColor="#ff3355" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#ff3355" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,51,85,0.08)" strokeDasharray="2 4" vertical={false} />
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
                  tickFormatter={(v: number) => `${formatPrice(v)}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(0,12,24,0.95)",
                    border: "1px solid rgba(255,51,85,0.35)",
                    borderRadius: 10,
                    color: "#e6f6ff",
                    fontSize: 11,
                  }}
                  labelFormatter={(_label: number, payload) => {
                    const d = payload?.[0]?.payload as { t?: number } | undefined;
                    return d?.t ? formatTime(d.t) : "";
                  }}
                  formatter={(v: number) => [fmtTon(v), "1 $ZOOM"]}
                />
                {dailyHigh != null && Number.isFinite(dailyHigh) && dailyHigh > 0 && (
                  <ReferenceLine
                    y={dailyHigh}
                    stroke="rgba(0,255,140,0.45)"
                    strokeDasharray="3 3"
                    label={{
                      value: `Daily High ${fmtTon(dailyHigh)}`,
                      position: "insideTopRight",
                      fill: "rgba(0,255,140,0.85)",
                      fontSize: 9,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#ff3355"
                  strokeWidth={2}
                  fill="url(#zoomPriceFill)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 3, fill: "#ff3355", stroke: "#001a2e", strokeWidth: 1 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats grid */}
        <div className="px-5 pt-2 pb-4 grid grid-cols-2 gap-2.5">
          <Stat label="Your $ZOOM" value={formatNumber(balance)} accent="cyan" />
          <Stat label="Portfolio Value" value={fmtTon(portfolio)} accent="green" />
          <Stat label="Genesis Price" value={fmtTon(genesis)} accent="dim" />
          <Stat label="Daily High" value={dailyHigh != null ? fmtTon(dailyHigh) : "—"} accent="dim" />
        </div>

        {/* Explainer */}
        <div
          className="mx-5 mb-4 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed"
          style={{
            background: "rgba(0,28,48,0.45)",
            border: "1px solid rgba(255,51,85,0.18)",
            color: "rgba(220,235,255,0.7)",
          }}
        >
          <span style={{ color: "#ff3355", fontWeight: 800 }}>♪ How it works.</span>{" "}
          The $ZOOM price moves only on real player actions — market trades,
          farming cycles and crafts. Each tick is a small organic shift, with
          a +1% daily growth cap so the curve climbs slowly and steadily.
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function Stat({ label, value, accent }: { label: string; value: string; accent: "cyan" | "green" | "dim" }) {
  const color =
    accent === "cyan" ? "#ff3355" :
    accent === "green" ? "#00ff88" :
    "rgba(220,235,255,0.85)";
  const glow =
    accent === "cyan" ? "0 0 8px rgba(255,51,85,0.45)" :
    accent === "green" ? "0 0 8px rgba(0,255,140,0.45)" :
    "none";
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: "linear-gradient(135deg, rgba(0,28,48,0.55) 0%, rgba(0,12,24,0.85) 100%)",
        border: "1px solid rgba(255,51,85,0.20)",
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
