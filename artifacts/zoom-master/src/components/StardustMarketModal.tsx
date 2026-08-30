/**
 * StardustMarketModal — compact STARDUST index, chart, and stake.
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
  fetchStardustMarketHistory,
  fetchStardustMarketPrice,
  fetchStardustStakeState,
  peekStardustMarketHistory,
  peekStardustMarketPrice,
  peekStardustStakeState,
  stakeStardust,
  unstakeStardust,
  type StardustChartPoint,
} from "../utils/api";
import { stardustStakePayout } from "../utils/stardustMarket";
import { useT } from "../i18n/LanguageContext";

const REFRESH_MS = 30_000;
const CYAN = "#9EC5E8";

interface Props {
  telegramId: string | null;
  walletBalance: number;
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
  onClose,
  onBalanceChange,
}: Props) {
  const { t } = useT();
  const cachedPrice = peekStardustMarketPrice();
  const cachedHistory = peekStardustMarketHistory();
  const cachedStake = peekStardustStakeState(telegramId);
  const [index, setIndex] = useState(cachedPrice?.index ?? 1);
  const [genesis, setGenesis] = useState(cachedPrice?.genesisIndex ?? 1);
  const [points, setPoints] = useState<StardustChartPoint[]>(cachedHistory?.points ?? []);
  const [staked, setStaked] = useState(cachedStake?.staked ?? 0);
  const [maturityPayout, setMaturityPayout] = useState(
    cachedStake?.maturityPayout ?? stardustStakePayout(cachedStake?.staked ?? 0),
  );
  const [banked, setBanked] = useState(cachedStake?.balance ?? walletBalance);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [canWithdraw, setCanWithdraw] = useState(!!cachedStake?.canWithdraw);
  const [lockDaysRemaining, setLockDaysRemaining] = useState(cachedStake?.lockDaysRemaining ?? 0);
  const shownWallet = Math.max(0, Number.isFinite(walletBalance) ? walletBalance : banked);

  const applyStake = useCallback((stake: NonNullable<ReturnType<typeof peekStardustStakeState>>) => {
    setBanked(stake.balance);
    setStaked(stake.staked);
    setMaturityPayout(stake.maturityPayout ?? stardustStakePayout(stake.staked));
    setCanWithdraw(!!stake.canWithdraw);
    setLockDaysRemaining(stake.lockDaysRemaining ?? 0);
    // Never push chart/server banked into the wallet HUD. The ★ label
    // always follows `walletBalance` from the wallet row.
  }, []);

  const refresh = useCallback(async () => {
    const [price, history, stake] = await Promise.all([
      fetchStardustMarketPrice(),
      fetchStardustMarketHistory(),
      telegramId ? fetchStardustStakeState(telegramId) : Promise.resolve(null),
    ]);
    if (price) {
      setIndex(price.index);
      setGenesis(price.genesisIndex);
    }
    if (history?.points?.length) setPoints(history.points);
    if (stake) applyStake(stake);
  }, [telegramId, applyStake]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const chartData = useMemo(() => {
    const mapped = points
      .map((pt) => {
        const idx = Number.isFinite(pt.index) && pt.index > 0
          ? pt.index
          : (Number.isFinite(pt.p) && pt.p > 0 ? pt.p / 1e6 : 0);
        return { t: pt.t, index: idx, label: formatTime(pt.t) };
      })
      .filter((pt) => Number.isFinite(pt.index) && pt.index > 0);
    const live = index > 0 ? index : genesis;
    if (live > 0) {
      const now = Date.now();
      const last = mapped[mapped.length - 1];
      if (!last || now - last.t > 2_000) {
        mapped.push({ t: now, index: live, label: formatTime(now) });
      } else {
        mapped[mapped.length - 1] = { t: now, index: live, label: formatTime(now) };
      }
    }
    if (mapped.length === 0 && live > 0) {
      const now = Date.now();
      return [
        { t: now - 3_600_000, index: live, label: formatTime(now - 3_600_000) },
        { t: now, index: live, label: formatTime(now) },
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
  }, [points, index, genesis]);

  const handleStake = async () => {
    if (!telegramId || busy) return;
    const n = parseInt(amount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setMsg(t("stardustMarket.invalidAmount"));
      return;
    }
    if (n > banked) {
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
    const newBalance = res.balance ?? Math.max(0, banked - n);
    setBanked(newBalance);
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
    const newBalance = res.balance ?? banked;
    setBanked(newBalance);
    onBalanceChange?.(newBalance);
    setMsg(t("stardustMarket.unstakedSuccess", { n: (res.payout ?? 0).toLocaleString() }));
    window.dispatchEvent(new CustomEvent("stardust-refresh"));
    window.dispatchEvent(new Event("zoom-data-refresh"));
    void refresh();
  };

  const withdrawPreview = maturityPayout > 0 ? maturityPayout : stardustStakePayout(staked);

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
              <span style={{ marginRight: 6 }}>★</span>
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
          {staked > 0 && (
            <span style={{ color: CYAN }}>{t("stardustMarket.staked", { n: staked.toLocaleString() })}</span>
          )}
        </div>

        {/* Chart — compact */}
        <div className="px-3 flex-shrink-0" style={{ height: 110, width: "100%", minWidth: 0 }}>
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
            <div className="flex items-center justify-center h-full" />
          )}
        </div>

        {/* Stake */}
        <div className="px-4 pt-2 pb-4 flex-1 overflow-y-auto min-h-0">
          <div className="rounded-xl p-3" style={{ background: "rgba(255,215,64,0.05)", border: "1px solid rgba(255,215,64,0.15)" }}>
            <div className="flex justify-between mb-2 text-[10px]">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{t("stardustMarket.stakeTerm")}</span>
              <span style={{ color: "#ffd740", fontWeight: 800 }}>{shownWallet.toLocaleString()} ★</span>
            </div>
            {staked > 0 && (
              <div className="text-[10px] mb-2 font-bold" style={{ color: "#69f0ae" }}>
                {t("stardustMarket.maturityPayout", { n: withdrawPreview.toLocaleString() })}
              </div>
            )}
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
                onClick={() => setAmount(String(Math.max(0, Math.floor(banked))))}
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
