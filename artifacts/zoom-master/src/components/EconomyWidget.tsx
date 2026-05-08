/**
 * EconomyWidget — clickable pill at the top of the FARM page that shows
 * the live global $ZOOM price plus a tiny inline sparkline. Tapping it
 * opens the full ECONOMY panel (modal) with the larger chart and the
 * user's portfolio value.
 *
 * Polls /economy/price every 12s for a fresh value (chart is loaded on
 * demand inside the modal). All in-app text English. Dark/neon styling
 * to match the existing FARM page chips (glass-neon class).
 */
import { memo, useEffect, useState, useCallback } from "react";
import { fetchEconomyPrice, type EconomyChartPoint, fetchEconomyHistory } from "../utils/api";
import { EconomyModal } from "./EconomyModal";

// Slow poll: the price is event-driven server-side (no per-second tick),
// capped at +1% per UTC day. Polling more often than this just burns
// bandwidth without showing any new movement.
const POLL_MS = 60_000;

interface EconomyWidgetProps {
  balance: number;
}

function formatPrice(p: number): string {
  // After the May 2026 rebalance the genesis is $0.0001 and prices grow
  // very slowly, so sub-cent values need 6 decimals to show meaningful
  // movement. Larger values fall back to fewer decimals to stay readable.
  if (!Number.isFinite(p) || p <= 0) return "0.000000";
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function MiniSpark({ points }: { points: EconomyChartPoint[] }) {
  if (!points || points.length < 2) {
    return (
      <svg width={48} height={16} viewBox="0 0 48 16" aria-hidden="true">
        <line x1={0} y1={8} x2={48} y2={8} stroke="rgba(0,242,254,0.4)" strokeWidth={1} />
      </svg>
    );
  }
  const ps = points.map((pt) => pt.p);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const range = Math.max(1, max - min);
  const w = 48;
  const h = 16;
  const step = w / (ps.length - 1);
  const path = ps
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={path} fill="none" stroke="#00f2fe" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EconomyWidgetBase({ balance }: EconomyWidgetProps) {
  const [price, setPrice] = useState<number | null>(null);
  const [genesis, setGenesis] = useState<number>(0.01);
  const [dailyHigh, setDailyHigh] = useState<number | null>(null);
  const [spark, setSpark] = useState<EconomyChartPoint[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([fetchEconomyPrice(), fetchEconomyHistory()]);
    if (p && Number.isFinite(p.price)) {
      setPrice(p.price);
      if (Number.isFinite(p.genesisPrice)) setGenesis(p.genesisPrice);
      if (p.dailyHighPrice != null && Number.isFinite(p.dailyHighPrice)) {
        setDailyHigh(p.dailyHighPrice);
      }
    }
    if (h?.points && h.points.length > 0) {
      // Keep last ~24 points for the inline spark.
      setSpark(h.points.slice(-24));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const portfolio = price != null && Number.isFinite(balance) ? balance * price : null;
  const displayPrice = price ?? genesis;
  // Price change vs genesis — shown as a +X% pill in the modal header. We
  // also use it locally to color the inline price text (positive = neon
  // cyan, neutral = soft white).
  const change = price != null && genesis > 0 ? (price - genesis) / genesis : 0;
  const positive = change > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open ECONOMY panel"
        data-testid="btn-economy-widget"
        className="w-full rounded-2xl px-4 py-3 mt-3 flex items-center justify-between gap-3"
        style={{
          background: "linear-gradient(135deg, rgba(0,40,60,0.55) 0%, rgba(0,16,32,0.85) 100%)",
          border: "1px solid rgba(0,242,254,0.35)",
          boxShadow: "0 0 18px rgba(0,242,254,0.18), inset 0 0 12px rgba(0,242,254,0.08)",
          cursor: "pointer",
        }}
      >
        <div className="flex flex-col items-start min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-black tracking-widest"
              style={{ color: "rgba(0,242,254,0.85)", letterSpacing: 1.2 }}
            >
              ECONOMY
            </span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: positive ? "rgba(0,255,140,0.12)" : "rgba(180,200,230,0.10)",
                color: positive ? "#00ff88" : "rgba(220,235,255,0.7)",
                border: positive ? "1px solid rgba(0,255,140,0.35)" : "1px solid rgba(180,200,230,0.18)",
              }}
            >
              {positive ? "+" : ""}{(change * 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-[11px]" style={{ color: "rgba(220,235,255,0.55)" }}>1 $ZOOM =</span>
            <span
              className="text-base font-black"
              style={{
                color: "#00f2fe",
                textShadow: "0 0 10px rgba(0,242,254,0.65)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatPrice(displayPrice)} TON
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <MiniSpark points={spark} />
          {portfolio != null && (
            <span
              className="text-[10px] font-bold"
              style={{ color: "rgba(220,235,255,0.7)", fontVariantNumeric: "tabular-nums" }}
            >
              Portfolio {formatPrice(portfolio)} TON
            </span>
          )}
        </div>
      </button>
      {open && (
        <EconomyModal
          onClose={() => setOpen(false)}
          balance={balance}
          initialPrice={price}
          initialGenesis={genesis}
          initialDailyHigh={dailyHigh}
        />
      )}
    </>
  );
}

export const EconomyWidget = memo(EconomyWidgetBase);
