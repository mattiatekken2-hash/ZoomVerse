/**
 * StardustMarketModal — compact STARDUST index, chart, convert & stake.
 * Opens from Wallet when tapping the STARDUST balance row.
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
  convertDepositToStardust,
  fetchStardustMarketHistory,
  fetchStardustMarketPrice,
  fetchStardustStakeState,
  stakeStardust,
  unstakeStardust,
  type StardustChartPoint,
} from "../utils/api";
import { gramToStardustPreview } from "../utils/stardustMarket";
import { GramDiamondIcon } from "./GramDiamondIcon";
import { useT } from "../i18n/LanguageContext";
import { chartIconScale } from "../utils/wallet24hChange";

const REFRESH_MS = 12_000;
const CYAN = "#9EC5E8";

interface Props {
  telegramId: string | null;
  walletBalance: number;
  depositBalance: number;
  earnedGramBalance: number;
  onClose: () => void;
  onBalanceChange?: (balance: number) => void;
}

function formatIndex(n: number): string {
  if (!Number.isFinite(n)) return "1.000000";
  return n.toFixed(6);
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function StardustMarketModal({
  telegramId,
  walletBalance,
  depositBalance,
  earnedGramBalance,
  onClose,
  onBalanceChange,
}: Props) {
  const { t } = useT();
  const [index, setIndex] = useState(1);
  const [genesis, setGenesis] = useState(1);
  const [totalStaked, setTotalStaked] = useState(0);
  const [points, setPoints] = useState<StardustChartPoint[]>([]);
  const [staked, setStaked] = useState(0);
  const [stakedValue, setStakedValue] = useState(0);
  const [pnl, setPnl] = useState(0);
  const [balance, setBalance] = useState(walletBalance);
  const [liveDeposit, setLiveDeposit] = useState(depositBalance);
  const [liveEarned, setLiveEarned] = useState(earnedGramBalance);
  const [amount, setAmount] = useState("");
  const [convertGram, setConvertGram] = useState("");
  const [busy, setBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canWithdraw, setCanWithdraw] = useState(false);
  const [lockDaysRemaining, setLockDaysRemaining] = useState(0);
  const [tab, setTab] = useState<"convert" | "stake">("convert");

  useEffect(() => {
    setLiveDeposit(depositBalance);
  }, [depositBalance]);

  useEffect(() => {
    setLiveEarned(earnedGramBalance);
  }, [earnedGramBalance]);

  const convertibleGram = liveDeposit + liveEarned;

  const refresh = useCallback(async () => {
    const [price, history, stake] = await Promise.all([
      fetchStardustMarketPrice(),
      fetchStardustMarketHistory(),
      telegramId ? fetchStardustStakeState(telegramId) : Promise.resolve(null),
    ]);
    if (price) {
      setIndex(price.index);
      setGenesis(price.genesisIndex);
      setTotalStaked(price.totalStaked);
    }
    if (history?.points?.length) setPoints(history.points);
    if (stake) {
      setBalance(stake.balance);
      setStaked(stake.staked);
      setStakedValue(stake.stakedValue);
      setPnl(stake.pnl);
      setCanWithdraw(!!stake.canWithdraw);
      setLockDaysRemaining(stake.lockDaysRemaining ?? 0);
      onBalanceChange?.(stake.balance);
    }
    setLoading(false);
  }, [telegramId, onBalanceChange]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const chartData = useMemo(() => {
    const mapped = points.map((pt) => ({ t: pt.t, index: pt.index, label: formatTime(pt.t) }));
    if (mapped.length === 1) {
      const only = mapped[0];
      return [
        { ...only, t: only.t - 3_600_000, label: formatTime(only.t - 3_600_000) },
        only,
      ];
    }
    return mapped;
  }, [points]);

  const handleStake = async () => {
    if (!telegramId || busy) return;
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg(t("stardustMarket.invalidAmount"));
      return;
    }
    if (n > balance) {
      setMsg(t("stardustMarket.notEnough"));
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await stakeStardust(telegramId, n);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error?.includes("migrated")
        ? t("stardustMarket.stakeDbMigration")
        : (res.error ?? t("stardustMarket.stakeFailed")));
      return;
    }
    const newBalance = res.balance ?? Math.max(0, balance - n);
    setBalance(newBalance);
    onBalanceChange?.(newBalance);
    setAmount("");
    setMsg(t("stardustMarket.stakedSuccess", { n: n.toLocaleString() }));
    window.dispatchEvent(new CustomEvent("stardust-refresh"));
    window.dispatchEvent(new Event("zoom-data-refresh"));
    void refresh();
  };

  const handleUnstakeAll = async () => {
    if (!telegramId || busy || staked <= 0) return;
    setBusy(true);
    setMsg(null);
    const res = await unstakeStardust(telegramId);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? t("stardustMarket.unstakeFailed"));
      return;
    }
    setMsg(t("stardustMarket.unstakedSuccess", { n: (res.payout ?? 0).toLocaleString() }));
    window.dispatchEvent(new CustomEvent("stardust-refresh"));
    window.dispatchEvent(new Event("zoom-data-refresh"));
    void refresh();
  };

  const convertPreview = useMemo(() => {
    const g = parseFloat(convertGram);
    if (!Number.isFinite(g) || g <= 0) return 0;
    return gramToStardustPreview(g, index);
  }, [convertGram, index]);

  const handleConvert = async () => {
    if (!telegramId || convertBusy) return;
    const g = parseFloat(convertGram);
    if (!Number.isFinite(g) || g <= 0) {
      setConvertMsg(t("stardustMarket.invalidGram"));
      return;
    }
    if (g > convertibleGram) {
      setConvertMsg(t("stardustMarket.notEnoughGram", { n: convertibleGram.toFixed(4) }));
      return;
    }
    setConvertBusy(true);
    setConvertMsg(null);
    const res = await convertDepositToStardust(telegramId, g);
    setConvertBusy(false);
    if (!res.ok) {
      setConvertMsg(res.error ?? t("stardustMarket.convertFailed"));
      return;
    }
    setConvertGram("");
    setConvertMsg(t("stardustMarket.convertSuccess", { n: (res.stardustReceived ?? 0).toLocaleString() }));
    if (typeof res.stardustBalance === "number") {
      setBalance(res.stardustBalance);
      onBalanceChange?.(res.stardustBalance);
    }
    if (typeof res.depositBalance === "number") setLiveDeposit(res.depositBalance);
    if (typeof res.tonBalance === "number") setLiveEarned(res.tonBalance);
    window.dispatchEvent(new CustomEvent("zoom-gram-balance-snap", {
      detail: {
        depositBalance: res.depositBalance,
        tonBalance: res.tonBalance,
        balanceEpoch: res.balanceEpoch,
      },
    }));
    window.dispatchEvent(new CustomEvent("stardust-refresh"));
    void refresh();
  };

  const pctChange = genesis > 0 ? ((index - genesis) / genesis) * 100 : 0;
  const iconScale = chartIconScale(pctChange);

  const inputStyle = {
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff8e0",
  } as const;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
              {t("stardustMarket.title")}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffd740", marginTop: 2 }}>
              <span
                style={{
                  display: "inline-block",
                  transform: `scale(${iconScale})`,
                  transformOrigin: "center bottom",
                  transition: "transform 0.45s ease",
                  marginRight: 6,
                }}
              >
                ★
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatIndex(index)}</span>
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
          <span style={{ color: "rgba(255,255,255,0.35)" }}>{t("stardustMarket.pool", { n: totalStaked.toLocaleString() })}</span>
          <span style={{ color: "#ffd740" }}>{t("stardustMarket.wallet", { n: balance.toLocaleString() })}</span>
          <span style={{ color: CYAN }}>{t("stardustMarket.staked", { n: stakedValue.toLocaleString() })}</span>
        </div>

        {/* Chart — compact */}
        <div className="px-3 flex-shrink-0" style={{ height: 110 }}>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="stardustChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffd740" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#ffd740" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.22)", fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tickFormatter={(v) => Number(v).toFixed(3)}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(255,215,64,0.25)", borderRadius: 8, fontSize: 10 }}
                  formatter={(v: number) => [formatIndex(v), t("stardustMarket.indexLabel")]}
                />
                <Area type="monotone" dataKey="index" stroke="#ffd740" strokeWidth={1.5} fill="url(#stardustChartFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[10px] text-center px-2" style={{ color: "rgba(255,255,255,0.32)" }}>
              {loading ? t("stardustMarket.loadingChart") : t("stardustMarket.emptyChart")}
            </div>
          )}
        </div>

        {/* Tab toggle */}
        <div className="px-4 pt-2 pb-2 flex gap-2 flex-shrink-0">
          {(["convert", "stake"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex-1 py-2 rounded-lg text-[10px] font-black tracking-wider uppercase"
              style={{
                background: tab === id ? (id === "convert" ? "rgba(0,136,255,0.15)" : "rgba(255,215,64,0.12)") : "rgba(255,255,255,0.04)",
                border: tab === id ? `1px solid ${id === "convert" ? "rgba(0,136,255,0.35)" : "rgba(255,215,64,0.30)"}` : "1px solid rgba(255,255,255,0.06)",
                color: tab === id ? (id === "convert" ? "#0088ff" : "#ffd740") : "rgba(255,255,255,0.35)",
              }}
            >
              {id === "convert" ? t("stardustMarket.tabConvert") : t("stardustMarket.tabStake")}
            </button>
          ))}
        </div>

        {/* Action panel */}
        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
          {tab === "convert" ? (
            <div className="rounded-xl p-3" style={{ background: "rgba(0,136,255,0.06)", border: "1px solid rgba(0,136,255,0.15)" }}>
              <div className="flex items-center justify-between mb-2 text-[10px]">
                <span className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <GramDiamondIcon size={14} /> {t("stardustMarket.available")}
                </span>
                <span style={{ color: "#0088ff", fontWeight: 800 }}>{convertibleGram.toFixed(4)} GRAM</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder={t("stardustMarket.gramPlaceholder")}
                  value={convertGram}
                  onChange={(e) => setConvertGram(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-bold"
                  style={inputStyle}
                />
                <button
                  type="button"
                  disabled={convertBusy || convertibleGram <= 0}
                  onClick={() => setConvertGram(String(Math.max(0.01, Math.floor(convertibleGram * 100) / 100)))}
                  className="px-3 rounded-lg text-[10px] font-black"
                  style={{ background: "rgba(0,136,255,0.12)", color: "#0088ff", border: "1px solid rgba(0,136,255,0.22)" }}
                >
                  {t("common.max")}
                </button>
              </div>
              {convertPreview > 0 && (
                <div className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,215,64,0.75)" }}>
                  ≈ {convertPreview.toLocaleString()} ★
                </div>
              )}
              <button
                type="button"
                disabled={convertBusy || !telegramId}
                onClick={() => { void handleConvert(); }}
                className="w-full py-2.5 rounded-lg text-xs font-black"
                style={{ background: "linear-gradient(135deg, #0088ff, #0066cc)", color: "#fff" }}
              >
                {t("stardustMarket.convertBtn")}
              </button>
              {convertMsg && (
                <div className="mt-2 text-center text-[10px] font-bold" style={{ color: convertMsg.startsWith("✓") ? "#69f0ae" : "#ff8a80" }}>
                  {convertMsg}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-3" style={{ background: "rgba(255,215,64,0.05)", border: "1px solid rgba(255,215,64,0.15)" }}>
              <div className="flex justify-between mb-2 text-[10px]">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>{t("stardustMarket.walletLabel")}</span>
                <span style={{ color: "#ffd740", fontWeight: 800 }}>{balance.toLocaleString()} ★</span>
              </div>
              <div className="text-[10px] mb-2" style={{ color: pnl >= 0 ? "#69f0ae" : "#ff8a80" }}>
                {t("stardustMarket.pnlLocked", {
                  pnl: `${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}`,
                  n: staked.toLocaleString(),
                })}
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  min={1}
                  placeholder={t("stardustMarket.stakePlaceholder")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-bold"
                  style={{ ...inputStyle, border: "1px solid rgba(255,215,64,0.22)" }}
                />
                <button
                  type="button"
                  disabled={busy || !telegramId}
                  onClick={() => setAmount(String(balance))}
                  className="px-3 rounded-lg text-[10px] font-black"
                  style={{ background: "rgba(255,215,64,0.10)", color: "#ffd740", border: "1px solid rgba(255,215,64,0.22)" }}
                >
                  {t("common.max")}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !telegramId}
                  onClick={() => { void handleStake(); }}
                  className="flex-1 py-2.5 rounded-lg text-xs font-black"
                  style={{ background: "linear-gradient(135deg, #ffd740, #ffb300)", color: "#1a1000" }}
                >
                  {t("stardustMarket.stakeBtn")}
                </button>
                <button
                  type="button"
                  disabled={busy || !telegramId || staked <= 0 || !canWithdraw}
                  onClick={() => { void handleUnstakeAll(); }}
                  className="flex-1 py-2.5 rounded-lg text-xs font-black"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: canWithdraw ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {staked <= 0 ? t("stardustMarket.withdraw") : canWithdraw ? t("stardustMarket.withdrawAll") : t("stardustMarket.lockDays", { n: lockDaysRemaining })}
                </button>
              </div>
              {msg && (
                <div className="mt-2 text-center text-[10px] font-bold" style={{ color: msg.startsWith("✓") ? "#69f0ae" : "#ff8a80" }}>
                  {msg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
