/**
 * ZoomMarketModal — compact $ZOOM price chart (Wallet → ZOOM S2 row).
 * Opens from Wallet when tapping the ZOOM S2 balance row.
 * Layout mirrors StardustMarketModal; price data from the Economy APIs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchEconomyHistory,
  fetchEconomyPrice,
  type EconomyChartPoint,
} from "../utils/api";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { useT } from "../i18n/LanguageContext";
import { formatZoomChartPrice } from "../utils/wallet24hChange";
import { publishWalletZoomPrice } from "../utils/walletMarketCache";

const REFRESH_MS = 5_000;
const CYAN = "#9EC5E8";
const GOLD = "#ffd740";

interface Props {
  balance: number;
  onClose: () => void;
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  // Portfolio can be larger than micro unit prices.
  if (p >= 0.0001) {
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 10) return p.toFixed(3);
    return p.toFixed(2);
  }
  return formatZoomChartPrice(p);
}

/** Compact Y-axis ticks — avoid "0001" clutter on micro prices. */
function formatAxisPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p < 1e-5) return formatZoomChartPrice(p);
  if (p < 0.01) return p.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (p < 1) return p.toFixed(4);
  return p.toFixed(3);
}

function fmtGram(p: number): string {
  return `${formatPrice(p)} GRAM`;
}

function formatZoom(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ZoomMarketModal({ balance, onClose }: Props) {
  const { t } = useT();
  const [price, setPrice] = useState(0);
  const [genesis, setGenesis] = useState(0);
  const [points, setPoints] = useState<EconomyChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([fetchEconomyPrice(), fetchEconomyHistory()]);
    if (p && Number.isFinite(p.price)) {
      setPrice(p.price);
      if (Number.isFinite(p.genesisPrice)) setGenesis(p.genesisPrice);
      const hist = (h?.points ?? [])
        .map((pt) => pt.price)
        .filter((v): v is number => Number.isFinite(v) && v > 0);
      publishWalletZoomPrice(p.price, hist);
    }
    if (h?.points?.length) setPoints(h.points);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const chartData = useMemo(() => {
    const mapped = points
      .map((pt) => {
        const price = Number.isFinite(pt.price) && pt.price > 0
          ? pt.price
          : (Number.isFinite(pt.p) && pt.p > 0 ? (pt.p > 10 ? pt.p / 1e9 : pt.p) : 0);
        return { t: pt.t, price, label: formatTime(pt.t) };
      })
      .filter((pt) => Number.isFinite(pt.price) && pt.price > 0);
    const live = price > 0 ? price : genesis;
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
  }, [points, price, genesis]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartData.length < 2) return ["auto", "auto"];
    const vals = chartData.map((d) => d.price).filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length < 2) return ["auto", "auto"];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max <= min) {
      const pad = Math.max(min * 0.002, 1e-9);
      return [Math.max(0, min - pad), max + pad];
    }
    const pad = (max - min) * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData]);

  const currentPrice = price > 0 ? price : genesis;
  const pctChange = genesis > 0 ? ((currentPrice - genesis) / genesis) * 100 : 0;
  const portfolio = Number.isFinite(balance) ? balance * currentPrice : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="zoom-market-modal"
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(158,197,232,0.55)" }}>
              {t("zoomMarket.title")}
            </div>
            <div
              className="flex items-center gap-2"
              style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 2 }}
            >
              <ZoomCubeIcon size={22} />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtGram(currentPrice)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeAria")}
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

        {/* Compact stats row */}
        <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold flex-shrink-0">
          <span style={{ color: pctChange >= 0 ? "#69f0ae" : "#ff8a80" }}>
            {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
          </span>
          <span style={{ color: GOLD }}>{t("zoomMarket.wallet", { n: formatZoom(balance) })}</span>
          <span style={{ color: CYAN }}>{t("zoomMarket.portfolio", { n: formatPrice(portfolio) })}</span>
        </div>

        {/* Chart — compact (Stardust-style) */}
        <div className="px-3 flex-shrink-0" style={{ height: 110 }}>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="zoomMarketChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickCount={4}
                  tickFormatter={(v) => formatAxisPrice(Number(v))}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(255,215,64,0.25)", borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [fmtGram(v), t("zoomMarket.priceLabel")]}
                />
                <Area type="monotone" dataKey="price" stroke={GOLD} strokeWidth={1.5} fill="url(#zoomMarketChartFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[10px] text-center px-2" style={{ color: "rgba(255,255,255,0.32)" }}>
              {loading ? t("zoomMarket.loadingChart") : t("zoomMarket.emptyChart")}
            </div>
          )}
        </div>

        {/* How the live price works — no fake stake form */}
        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
          <div
            className="rounded-xl p-3 text-[11px] leading-relaxed"
            style={{
              background: "rgba(158,197,232,0.06)",
              border: "1px solid rgba(158,197,232,0.15)",
              color: "rgba(220,235,255,0.7)",
            }}
          >
            <span style={{ color: CYAN, fontWeight: 800 }}>{t("zoomMarket.howTitle")}</span>{" "}
            {t("zoomMarket.howBody")}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
