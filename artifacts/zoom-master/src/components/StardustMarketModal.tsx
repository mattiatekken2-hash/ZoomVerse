/**
 * StardustMarketModal — live global STARDUST index, chart, and stake pool.
 * Opens from Wallet when tapping the STARDUST balance row.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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

const REFRESH_MS = 12_000;

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

function SpinningStardustCoin({ index, spinning }: { index: number; spinning: boolean }) {
  const pct = ((index - 1) * 100).toFixed(2);
  const up = index >= 1;
  return (
    <div className="stardust-coin-wrap" aria-hidden>
      <div
        className={`stardust-coin-3d${spinning ? " stardust-coin-3d--spin" : ""}`}
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "linear-gradient(145deg, #fffef0 0%, #ffd740 38%, #ffb300 72%, #ff8f00 100%)",
          boxShadow: "0 0 28px rgba(255,215,64,0.45), 0 4px 0 rgba(255,255,255,0.35) inset",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          color: "#7a5200",
          fontWeight: 900,
        }}
      >
        ★
      </div>
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: up ? "#ffd740" : "#ff8a80",
          lineHeight: 1.35,
        }}
      >
        {up ? "+" : ""}{pct}%
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
          dal lancio (base 1.000)
        </div>
      </div>
    </div>
  );
}

export function StardustMarketModal({
  telegramId,
  walletBalance,
  depositBalance,
  earnedGramBalance,
  onClose,
  onBalanceChange,
}: Props) {
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
      setMsg("Enter a valid amount");
      return;
    }
    if (n > balance) {
      setMsg("Not enough STARDUST");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await stakeStardust(telegramId, n);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error?.includes("migrated")
        ? "Stake needs a DB update on the server — contact admin"
        : (res.error ?? "Stake failed"));
      return;
    }
    const newBalance = res.balance ?? Math.max(0, balance - n);
    const newStaked = res.staked ?? staked + n;
    setBalance(newBalance);
    setStaked(newStaked);
    if (typeof res.stakedValue === "number") setStakedValue(res.stakedValue);
    onBalanceChange?.(newBalance);
    if (typeof res.balanceEpoch === "number") {
      try {
        window.dispatchEvent(new CustomEvent("zoom-server-stardust-snap", {
          detail: { stardustBalance: newBalance, epoch: res.balanceEpoch },
        }));
      } catch { /**/ }
    }
    setAmount("");
    setMsg(`✓ Staked ${n.toLocaleString()} ★`);
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
      setMsg(res.error ?? "Unstake failed");
      return;
    }
    setMsg(`✓ Withdrew ${(res.payout ?? 0).toLocaleString()} ★`);
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
      setConvertMsg("Enter a valid GRAM amount");
      return;
    }
    if (g > convertibleGram) {
      setConvertMsg(`Not enough GRAM (${convertibleGram.toFixed(4)} available: ${liveDeposit.toFixed(4)} deposit + ${liveEarned.toFixed(4)} earned)`);
      return;
    }
    setConvertBusy(true);
    setConvertMsg(null);
    const res = await convertDepositToStardust(telegramId, g);
    setConvertBusy(false);
    if (!res.ok) {
      setConvertMsg(res.error ?? "Conversion failed");
      return;
    }
    setConvertGram("");
    setConvertMsg(`✓ +${(res.stardustReceived ?? 0).toLocaleString()} ★ from ${g} GRAM`);
    if (typeof res.stardustBalance === "number") {
      setBalance(res.stardustBalance);
      onBalanceChange?.(res.stardustBalance);
    }
    if (typeof res.depositBalance === "number") setLiveDeposit(res.depositBalance);
    if (typeof res.tonBalance === "number") setLiveEarned(res.tonBalance);
    window.dispatchEvent(new CustomEvent("stardust-refresh"));
    window.dispatchEvent(new Event("zoom-data-refresh"));
    void refresh();
  };

  const pctChange = genesis > 0 ? ((index - genesis) / genesis) * 100 : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(255,215,64,0.08) 0%, rgba(8,10,18,0.98) 28%)",
          border: "1px solid rgba(255,215,64,0.22)",
          boxShadow: "0 -12px 48px rgba(255,215,64,0.12)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", color: "rgba(255,215,64,0.5)" }}>
              STARDUST MARKET
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#ffd740", marginTop: 2 }}>
              Valore ★ {formatIndex(index)}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginTop: 4, maxWidth: 200, lineHeight: 1.4 }}>
              Prezzo globale STARDUST — parte da 1.000 al lancio e sale o scende con convert, stake e spese in-game
            </div>
          </div>
          <SpinningStardustCoin index={index} spinning={!loading} />
        </div>

        <div className="px-5 pb-2 flex gap-3 text-xs">
          <div style={{ color: "rgba(255,255,255,0.45)" }}>
            24h move{" "}
            <span style={{ color: pctChange >= 0 ? "#69f0ae" : "#ff8a80", fontWeight: 800 }}>
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.35)" }}>
            Pool {totalStaked.toLocaleString()} ★ staked
          </div>
        </div>

        <div className="px-3 pb-2" style={{ height: 180 }}>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="stardustChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffd740" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ffd740" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={(v) => Number(v).toFixed(3)}
                />
                <Tooltip
                  contentStyle={{ background: "#0c1018", border: "1px solid rgba(255,215,64,0.25)", borderRadius: 8 }}
                  labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  formatter={(v: number) => [formatIndex(v), "Valore ★"]}
                />
                <Area type="monotone" dataKey="index" stroke="#ffd740" strokeWidth={2} fill="url(#stardustChartFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-center px-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              {loading ? "Loading live chart…" : "Valore al lancio (1.000) — la linea si muove quando i giocatori convertono, stakano o spendono STARDUST"}
            </div>
          )}
        </div>

        <div
          className="mx-4 mb-3 rounded-2xl p-4"
          style={{ background: "rgba(0,136,255,0.06)", border: "1px solid rgba(0,136,255,0.18)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <GramDiamondIcon size={20} />
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "rgba(0,180,255,0.65)" }}>
              CONVERT GRAM → STARDUST
            </div>
          </div>
          <div className="flex justify-between mb-1 text-xs">
            <span style={{ color: "rgba(255,255,255,0.4)" }}>Available GRAM</span>
            <span style={{ color: "#0088ff", fontWeight: 800 }}>{convertibleGram.toFixed(4)} GRAM</span>
          </div>
          <div className="flex justify-between mb-2 text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>
            <span>Deposit {liveDeposit.toFixed(4)}</span>
            <span>Earned {liveEarned.toFixed(4)}</span>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="GRAM to convert"
              value={convertGram}
              onChange={(e) => setConvertGram(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-bold"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(0,136,255,0.25)",
                color: "#e8f4ff",
              }}
            />
            <button
              type="button"
              disabled={convertBusy || !telegramId || convertibleGram <= 0}
              onClick={() => setConvertGram(String(Math.max(0.01, Math.floor(convertibleGram * 100) / 100)))}
              className="px-3 rounded-xl text-[10px] font-black"
              style={{ background: "rgba(0,136,255,0.12)", color: "#0088ff", border: "1px solid rgba(0,136,255,0.25)" }}
            >
              MAX
            </button>
          </div>
          {convertPreview > 0 && (
            <div className="text-[10px] font-bold mb-2" style={{ color: "rgba(255,215,64,0.75)" }}>
              ≈ {convertPreview.toLocaleString()} ★ at index {index.toFixed(3)}
            </div>
          )}
          <button
            type="button"
            disabled={convertBusy || !telegramId}
            onClick={() => { void handleConvert(); }}
            className="w-full py-2.5 rounded-xl text-xs font-black"
            style={{
              background: "linear-gradient(135deg, #0088ff, #0066cc)",
              color: "#fff",
              boxShadow: "0 0 16px rgba(0,136,255,0.25)",
            }}
          >
            CONVERT TO STARDUST
          </button>
          {convertMsg && (
            <div className="mt-2 text-center text-[10px] font-bold" style={{ color: convertMsg.startsWith("✓") ? "#69f0ae" : "#ff8a80" }}>
              {convertMsg}
            </div>
          )}
          <div className="mt-2 text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
            Uses deposit + earned GRAM at the live index. Then pay for anything in Shop with ★ STARDUST.
          </div>
        </div>

        <div
          className="mx-4 mb-3 rounded-2xl p-4"
          style={{ background: "rgba(255,215,64,0.06)", border: "1px solid rgba(255,215,64,0.18)" }}
        >
          <div className="flex justify-between mb-3">
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "rgba(255,215,64,0.55)" }}>
                WALLET
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#ffd740" }}>{balance.toLocaleString()} ★</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: "rgba(255,215,64,0.55)" }}>
                STAKED VALUE
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff8e0" }}>{stakedValue.toLocaleString()} ★</div>
              <div style={{ fontSize: 9, color: pnl >= 0 ? "#69f0ae" : "#ff8a80", fontWeight: 700 }}>
                {pnl >= 0 ? "+" : ""}{pnl.toLocaleString()} vs deposited ({staked.toLocaleString()} locked)
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="number"
              min={1}
              placeholder="Amount to stake"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-bold"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,215,64,0.25)",
                color: "#fff8e0",
              }}
            />
            <button
              type="button"
              disabled={busy || !telegramId}
              onClick={() => setAmount(String(Math.max(1, Math.floor(balance / 2))))}
              className="px-3 rounded-xl text-[10px] font-black"
              style={{ background: "rgba(255,215,64,0.12)", color: "#ffd740", border: "1px solid rgba(255,215,64,0.25)" }}
            >
              50%
            </button>
            <button
              type="button"
              disabled={busy || !telegramId}
              onClick={() => setAmount(String(balance))}
              className="px-3 rounded-xl text-[10px] font-black"
              style={{ background: "rgba(255,215,64,0.12)", color: "#ffd740", border: "1px solid rgba(255,215,64,0.25)" }}
            >
              MAX
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !telegramId}
              onClick={() => { void handleStake(); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-black"
              style={{
                background: "linear-gradient(135deg, #ffd740, #ffb300)",
                color: "#1a1000",
                boxShadow: "0 0 16px rgba(255,215,64,0.25)",
              }}
            >
              STAKE ★
            </button>
            <button
              type="button"
              disabled={busy || !telegramId || staked <= 0 || !canWithdraw}
              onClick={() => { void handleUnstakeAll(); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-black"
              style={{
                background: canWithdraw ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: canWithdraw ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
              }}
            >
              {staked <= 0 ? "WITHDRAW ALL" : canWithdraw ? "WITHDRAW ALL" : `LOCKED ${lockDaysRemaining}d`}
            </button>
          </div>

          {msg && (
            <div className="mt-2 text-center text-[10px] font-bold" style={{ color: msg.startsWith("✓") ? "#69f0ae" : "#ff8a80" }}>
              {msg}
            </div>
          )}

          <div className="mt-3 text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
            Live index moves with global STARDUST activity. Staked value tracks the chart in real time. After staking, withdraw unlocks in 30 days.
          </div>
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
