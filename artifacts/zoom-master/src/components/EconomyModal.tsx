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

// One synthetic mid-point per real segment so the line gently undulates
// up/down instead of being perfectly straight. Lower than before (was 6)
// to avoid the dense "noise spike" look the user disliked.
const JAGGED_SUBSTEPS = 1;
// Very small amplitude (fraction of the global price range). At 0.04 the
// wiggle is just enough to feel "alive" without looking like static.
const JAGGED_AMPLITUDE = 0.04;

// Cheap deterministic PRNG so the same history always renders the same
// shape (no flicker on poll refresh). Seed is derived from the real
// point's timestamp so each segment has its own stable wiggle direction.
function seededNoise(seed: number, i: number): number {
  let x = (seed ^ (i * 0x9E3779B1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const r = ((x ^ (x >>> 14)) >>> 0) / 0xFFFFFFFF;
  return r * 2 - 1;
}

const REFRESH_MS = 8_000;

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

  // Chart-friendly data. We render `price` as the Y axis (in TON) and
  // an integer index on the X axis for monotonic spacing. Between every
  // pair of REAL history points we inject `JAGGED_SUBSTEPS` synthetic
  // sub-points whose Y value follows the linear interpolation plus a
  // deterministic seeded noise term scaled by the local price range.
  // This makes the line look volatile (micro-peaks/troughs) without
  // touching server data — the real points are always preserved as the
  // anchors, and tooltip/axis values still come from real prices.
  const chartData = useMemo(() => {
    if (points.length === 0) return [] as Array<{ i: number; t: number; price: number; real: boolean }>;
    if (points.length === 1) {
      return [{ i: 0, t: points[0]!.t, price: points[0]!.price, real: true }];
    }
    const out: Array<{ i: number; t: number; price: number; real: boolean }> = [];
    let idx = 0;
    // Local volatility amplitude is computed from the global series range,
    // not per-segment, so quiet stretches still get a visible wiggle.
    const allPrices = points.map((pt) => pt.price);
    const globalMin = Math.min(...allPrices);
    const globalMax = Math.max(...allPrices);
    const globalRange = Math.max(globalMax - globalMin, globalMax * 0.005, 1e-9);
    for (let k = 0; k < points.length - 1; k += 1) {
      const a = points[k]!;
      const b = points[k + 1]!;
      out.push({ i: idx++, t: a.t, price: a.price, real: true });
      const seed = Math.floor(a.t / 1000) >>> 0;
      for (let s = 1; s <= JAGGED_SUBSTEPS; s += 1) {
        const f = s / (JAGGED_SUBSTEPS + 1);
        const lin = a.price + (b.price - a.price) * f;
        // Triangular envelope: zero at endpoints, max in the middle, so
        // the noise never pulls the line away from a real anchor.
        const envelope = 1 - Math.abs(f - 0.5) * 2;
        const noise = seededNoise(seed, s) * JAGGED_AMPLITUDE * globalRange * envelope;
        const t = a.t + (b.t - a.t) * f;
        const price = Math.max(lin + noise, lin * 0.5); // soft floor: never below 50% of the line
        out.push({ i: idx++, t, price, real: false });
      }
    }
    const last = points[points.length - 1]!;
    out.push({ i: idx, t: last.t, price: last.price, real: true });
    return out;
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
          border: "1px solid rgba(0,242,254,0.35)",
          boxShadow: "0 -8px 40px rgba(0,242,254,0.18), 0 0 60px rgba(0,242,254,0.10)",
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
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b" style={{ borderColor: "rgba(0,242,254,0.14)" }}>
          <div>
            <div
              id="economy-modal-title"
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
              background: "rgba(0,242,254,0.14)",
              border: "1px solid rgba(0,242,254,0.45)",
              color: "#00f2fe",
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
                  tickFormatter={(v: number) => `${formatPrice(v)}`}
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
                  stroke="#00f2fe"
                  strokeWidth={2}
                  fill="url(#zoomPriceFill)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 3, fill: "#00f2fe", stroke: "#001a2e", strokeWidth: 1 }}
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

  return createPortal(node, document.body);
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
