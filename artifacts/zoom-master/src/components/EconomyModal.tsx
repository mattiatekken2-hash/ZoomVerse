/**
 * EconomyModal — off-chain ZOOM Points chart.
 * Wallet + Farm share this panel. Layout matches StardustMarketModal:
 * compact sheet, gold index, 110px area chart, no convert/stake tabs.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fetchEconomyPrice,
  fetchEconomyHistory,
  peekEconomyHistory,
  peekEconomyPrice,
  type EconomyChartPoint,
} from "../utils/api";
import { formatZoomChartPrice } from "../utils/wallet24hChange";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { useT } from "../i18n/LanguageContext";

const REFRESH_MS = 30_000;
const GOLD = "#ffd740";

interface EconomyModalProps {
  onClose: () => void;
  balance: number;
  initialPrice: number | null;
  initialGenesis: number;
  initialDailyHigh?: number | null;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p < 0.0001) return formatZoomChartPrice(p);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  return p.toFixed(2);
}

function formatAxis(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p < 0.0001) return p.toExponential(1);
  if (p < 0.01) return p.toFixed(4);
  if (p < 1) return p.toFixed(3);
  return p.toFixed(2);
}

function formatZoomAmt(n: number): string {
  const v = Math.floor(Number.isFinite(n) ? n : 0);
  if (v < 0) return "0";
  return v.toLocaleString();
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function EconomyModal({ onClose, balance, initialPrice, initialGenesis, initialDailyHigh }: EconomyModalProps) {
  const { t } = useT();
  const cachedPrice = peekEconomyPrice();
  const cachedHistory = peekEconomyHistory();
  const [price, setPrice] = useState<number | null>(initialPrice ?? cachedPrice?.price ?? null);
  const [genesis, setGenesis] = useState<number>(initialGenesis || cachedPrice?.genesisPrice || 0);
  const [points, setPoints] = useState<EconomyChartPoint[]>(cachedHistory?.points ?? []);
  const [loading, setLoading] = useState(!(cachedHistory?.points?.length));
  const [chartReady, setChartReady] = useState(false);
  void initialDailyHigh;

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

  useEffect(() => {
    setChartReady(false);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setChartReady(true);
        });
      });
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, points.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentPrice = price ?? genesis;
  const chartData = useMemo(() => {
    const mapped = points
      .map((pt) => {
        const v = Number.isFinite(pt.price) && pt.price > 0 ? pt.price : 0;
        return { t: pt.t, price: v, label: formatTime(pt.t) };
      })
      .filter((pt) => Number.isFinite(pt.price) && pt.price > 0);
    const live = currentPrice > 0 ? currentPrice : genesis;
    if (live > 0) {
      const now = Date.now();
      const last = mapped[mapped.length - 1];
      if (!last || now - last.t > 2_000) {
        mapped.push({ t: now, price: live, label: formatTime(now) });
      } else {
        mapped[mapped.length - 1] = { t: now, price: live, label: formatTime(now) };
      }
    }
    if (mapped.length === 0 && live > 0) {
      const now = Date.now();
      return [
        { t: now - 3_600_000, price: live, label: formatTime(now - 3_600_000) },
        { t: now, price: live, label: formatTime(now) },
      ];
    }
    if (mapped.length === 1) {
      const only = mapped[0]!;
      return [
        { ...only, t: only.t - 3_600_000, label: formatTime(only.t - 3_600_000) },
        only,
      ];
    }
    return mapped;
  }, [points, currentPrice, genesis]);

  const pctChange = genesis > 0 && currentPrice > 0 ? ((currentPrice - genesis) / genesis) * 100 : 0;
  const portfolio = Number.isFinite(balance) ? balance * currentPrice : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="economy-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="economy-modal-title"
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, rgba(14,18,32,0.98), rgba(8,10,22,0.99))",
          border: "1px solid rgba(158,197,232,0.28)",
          boxShadow: "0 -8px 40px rgba(158,197,232,0.10)",
          maxHeight: "88vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div>
            <div
              id="economy-modal-title"
              style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(158,197,232,0.55)" }}
            >
              {t("zoomPoints.title")}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 2 }}>
              <span style={{ marginRight: 6, display: "inline-flex", verticalAlign: "middle" }}>
                <ZoomCubeIcon size={18} />
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPrice(currentPrice)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeAria")}
            data-testid="btn-economy-close"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold flex-shrink-0">
          <span style={{ color: pctChange >= 0 ? "#69f0ae" : "#ff8a80" }}>
            {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
          </span>
          <span style={{ color: GOLD }}>{t("zoomPoints.wallet", { n: formatZoomAmt(balance) })}</span>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>{t("zoomPoints.portfolio", { n: formatPrice(portfolio) })}</span>
        </div>

        <div className="px-3 flex-shrink-0" style={{ height: 110, width: "100%", minWidth: 0 }}>
          {chartReady && chartData.length >= 2 ? (
            <ResponsiveContainer key={`zoom-chart-${chartData.length}`} width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="zoomPointsChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tickFormatter={(v) => formatAxis(Number(v))}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(255,215,64,0.25)", borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [formatPrice(v), t("zoomPoints.priceLabel")]}
                />
                <Area type="monotone" dataKey="price" stroke={GOLD} strokeWidth={1.5} fill="url(#zoomPointsChartFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[10px] text-center px-2" style={{ color: "rgba(255,255,255,0.32)" }}>
              {loading ? t("zoomPoints.loadingChart") : t("zoomPoints.emptyChart")}
            </div>
          )}
        </div>

        <div className="px-4 pt-2 pb-4 flex-shrink-0">
          <div className="rounded-xl p-3" style={{ background: "rgba(255,215,64,0.05)", border: "1px solid rgba(255,215,64,0.15)" }}>
            <div className="flex justify-between text-[10px] mb-1">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{t("zoomPoints.yourZoom")}</span>
              <span style={{ color: GOLD, fontWeight: 800 }}>{formatZoomAmt(balance)}</span>
            </div>
            <div className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("zoomPoints.note")}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
