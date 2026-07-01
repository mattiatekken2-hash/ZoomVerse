/**
 * TonWalletWidget — header pill button showing "TON + balance".
 * Tap to open a full wallet modal with:
 *   - Unified TON balance (spendable + accrued staking)
 *   - Deposit via TonConnect (min 0.25 TON)
 *   - Withdrawal (min 10 TON) — moved here from PixelAvatar
 */
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import {
  fetchStakingStatus,
  depositTonConfirm,
  requestTonWithdrawal,
  fetchMyWithdrawals,
  pollTxnUntilFinal,
  DEPOSIT_MIN_TON,
  WITHDRAWAL_MIN_TON,
  WITHDRAWAL_FEE_TON,
  type TonWithdrawal,
  type StakingStatusResponse,
} from "../utils/api";
import { getWhitePlanetPendingTon, type Planet } from "../hooks/useGameState";

const TON_RECEIVER_WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const POLL_MS = 60_000;
const TON_LOGO_URL = "/ton-logo.svg";

interface Props {
  // Earned TON balance (withdrawable). From staking, collection collects,
  // admin credits, leaderboard rewards.
  tonBalance: number;
  // Deposit TON balance (spendable in Shop only — never withdrawable).
  depositBalance: number;
  telegramId: string | null;
  whiteCollectionUnlocked: boolean;
  earthCollectionUnlocked: boolean;
  blackCollectionUnlocked: boolean;
  supernovaCollectionUnlocked?: boolean;
  sunCount: number;
  whitePlanets: Planet[];
  earthPlanets: Planet[];
  blackPlanets: Planet[];
  supernovaPlanets?: Planet[];
}

function formatTon(v: number, decimals = 3): string {
  if (!Number.isFinite(v) || v <= 0) return "0." + "0".repeat(decimals);
  if (v < 0.001) return v.toFixed(6);
  if (v < 0.01)  return v.toFixed(5);
  if (v < 0.1)   return v.toFixed(4);
  if (v < 10)    return v.toFixed(3);
  if (v < 1000)  return v.toFixed(2);
  return v.toFixed(1);
}

function sumAccrued(s: StakingStatusResponse): number {
  return (
    (s.v1?.accruedTon     ?? 0) +
    (s.sun?.accruedTon    ?? 0) +
    (s.basic?.accruedTon  ?? 0) +
    (s.rare?.accruedTon   ?? 0) +
    (s.epic?.accruedTon   ?? 0) +
    (s.mythic?.accruedTon ?? 0) +
    (s.gold?.accruedTon   ?? 0)
  );
}

/* ─── MODAL ─────────────────────────────────────────────────────────────── */
function WalletModal({
  onClose,
  tonBalance,
  depositBalance,
  telegramId,
  whiteCollectionUnlocked,
  earthCollectionUnlocked,
  blackCollectionUnlocked,
  sunCount,
  whitePlanets,
  earthPlanets,
  blackPlanets,
  supernovaCollectionUnlocked = false,
  supernovaPlanets = [],
}: Props & { onClose: () => void }) {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress   = useTonAddress();
  const canWithdraw = whiteCollectionUnlocked || (earthCollectionUnlocked && sunCount > 0) || blackCollectionUnlocked || supernovaCollectionUnlocked;

  // ── live EARNED TON (settled tonBalance + pending collection yields) ────
  // Pending collection yields are EARNED TON in the making — they get
  // credited to `tonBalance` on COLLECT, so they're aggregated here, not
  // in depositBalance.
  const liveEarnedTon = (() => {
    const now = Date.now();
    let pending = 0;
    for (const p of whitePlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of earthPlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of blackPlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of supernovaPlanets) pending += getWhitePlanetPendingTon(p, now);
    return Math.max(0, tonBalance) + pending;
  })();
  const safeDeposit = Math.max(0, depositBalance);

  // ── staking accrued (poll once on open) ────────────────────────────────
  const [accrued, setAccrued] = useState(0);
  useEffect(() => {
    if (!telegramId) return;
    let cancelled = false;
    fetchStakingStatus(telegramId).then((s) => {
      if (!cancelled && s) setAccrued(sumAccrued(s));
    });
    return () => { cancelled = true; };
  }, [telegramId]);

  // Total at the top = EARNED (settled + pending) + DEPOSIT + staking accrued.
  const totalTon = liveEarnedTon + safeDeposit + Math.max(0, accrued);

  // ── withdraw state ──────────────────────────────────────────────────────
  const [wAmount,        setWAmount]    = useState("");
  const [wWallet,        setWWallet]    = useState("");
  const [wMsg,           setWMsg]       = useState<string | null>(null);
  const [wErr,           setWErr]       = useState<string | null>(null);
  const [submitting,     setSubmitting] = useState(false);
  const [withdrawals,    setWithdrawals] = useState<TonWithdrawal[]>([]);

  // ── deposit state ───────────────────────────────────────────────────────
  const [dAmount,  setDAmount]  = useState(String(DEPOSIT_MIN_TON));
  const [dMsg,     setDMsg]     = useState<string | null>(null);
  const [dErr,     setDErr]     = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  const refreshWithdrawals = useCallback(async () => {
    if (!telegramId || !canWithdraw) return;
    const list = await fetchMyWithdrawals(telegramId);
    setWithdrawals(list);
  }, [telegramId, canWithdraw]);

  useEffect(() => { void refreshWithdrawals(); }, [refreshWithdrawals]);

  // ── tick for live balance ───────────────────────────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    // Battery-saver: tick only every 10s. Balance updates are server-side
    // and don't need sub-second reactivity.
    const id = window.setInterval(() => setTick((n) => n + 1), 10000);
    return () => window.clearInterval(id);
  }, []);

  // ── deposit handler ─────────────────────────────────────────────────────
  const handleDeposit = async () => {
    setDErr(null); setDMsg(null);
    if (!telegramId) { setDErr("Session not ready"); return; }
    const n = parseFloat(dAmount);
    if (!Number.isFinite(n) || n < DEPOSIT_MIN_TON) {
      setDErr(`Minimum deposit is ${DEPOSIT_MIN_TON} TON`); return;
    }
    if (!walletAddress) {
      // open TonConnect; user will reconnect and come back
      await tonConnectUI.openModal();
      return;
    }
    setDepositing(true);
    try {
      const nanotons = String(Math.round(n * 1e9));
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: TON_RECEIVER_WALLET, amount: nanotons }],
      });
      if (!txResult?.boc) { setDErr("Transaction cancelled or failed"); setDepositing(false); return; }

      const res = await depositTonConfirm({ telegramId, walletAddress, boc: txResult.boc, amountTon: n });
      if (!res.ok && !res.pending) { setDErr(res.error || "Deposit failed"); setDepositing(false); return; }

      if (res.txnId && !res.alreadyCredited) {
        // poll until final
        const final = await pollTxnUntilFinal(res.txnId, { maxMs: 120_000 });
        if (final?.status === "completed") {
          // Deposits now credit the DEPOSIT balance (Shop-only), not the
          // earned tonBalance. Fire a refresh so the next /grants pull picks
          // up the new deposit balance authoritatively.
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setDMsg(`Deposit confirmed! +${n} TON aggiunti al saldo deposito (spendibile nello Shop).`);
        } else if (final?.status === "failed") {
          setDErr("Deposit verification failed. Contact support if TON was deducted.");
        } else {
          setDMsg("Deposit is being verified on-chain. Balance will update shortly.");
        }
      } else if (res.alreadyCredited) {
        setDMsg("Deposit already credited.");
      } else {
        setDMsg("Deposit submitted — verifying on-chain.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancel") && !msg.includes("Cancel")) setDErr("Transaction failed");
    }
    setDepositing(false);
  };

  // ── withdraw handler ────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    setWErr(null); setWMsg(null);
    if (!canWithdraw) {
      setWErr(earthCollectionUnlocked && sunCount <= 0
        ? "Earth Collection requires a SUN module to withdraw"
        : "Available to White or Earth Collection holders"); return;
    }
    if (!telegramId) { setWErr("Session not ready"); return; }
    const n = parseFloat(wAmount);
    if (!Number.isFinite(n) || n < WITHDRAWAL_MIN_TON) {
      setWErr(`Minimum amount: ${WITHDRAWAL_MIN_TON} TON`); return;
    }
    // Withdrawals are paid out of EARNED TON only — depositBalance is
    // intentionally excluded so external deposits stay one-way (in-only).
    if (liveEarnedTon < WITHDRAWAL_MIN_TON) {
      setWErr(`Minimo ${WITHDRAWAL_MIN_TON} TON guadagnati per prelevare`); return;
    }
    if (liveEarnedTon < n + WITHDRAWAL_FEE_TON) {
      setWErr(`Saldo TON guadagnato insufficiente. Servono ${(n + WITHDRAWAL_FEE_TON).toFixed(4)} TON (importo + ${WITHDRAWAL_FEE_TON} di fee)`); return;
    }
    if (!wWallet.trim()) { setWErr("Enter your TON wallet address"); return; }

    setSubmitting(true);
    const res = await requestTonWithdrawal({ telegramId, amountTon: n, walletAddress: wWallet.trim() });
    setSubmitting(false);
    if (!res.ok) { setWErr(res.error || "Withdrawal failed"); return; }
    if (typeof res.newTonBalance === "number" && typeof res.balanceEpoch === "number") {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.newTonBalance, epoch: res.balanceEpoch },
      }));
    }
    setWMsg(`Request submitted. You'll receive ${n.toFixed(4)} TON after admin approval.`);
    setWAmount(""); void refreshWithdrawals();
  };

  const NEON = "#0fd9ff";

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(2,6,16,0.84)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px,100%)", borderRadius: 20,
          background: "linear-gradient(160deg, rgba(6,14,32,0.98), rgba(2,8,18,0.99))",
          border: `1px solid ${NEON}44`,
          boxShadow: `0 0 40px ${NEON}18`,
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ padding: "16px 18px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: `${NEON}bb`, fontSize: 10, fontWeight: 900, letterSpacing: 1.4 }}>TON WALLET</div>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, letterSpacing: 0.6, textShadow: `0 0 12px ${NEON}55` }}>
              {formatTon(totalTon)} <span style={{ fontSize: 13, color: NEON, opacity: 0.8 }}>TON</span>
            </div>
            {accrued > 0 && (
              <div style={{ fontSize: 10, color: `${NEON}88`, marginTop: 2 }}>
                +{formatTon(accrued)} accruing from staking
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(220,235,255,0.8)", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* balance rows — earned (withdrawable) + deposit (shop-only) */}
        <div style={{ margin: "12px 18px 0", padding: "10px 14px", borderRadius: 12,
          background: `${NEON}08`, border: `1px solid ${NEON}22`,
          display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(180,220,240,0.6)", fontSize: 11, fontWeight: 700 }}>Earned TON</span>
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              {formatTon(liveEarnedTon)} TON
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(180,220,240,0.45)", fontSize: 10, fontWeight: 700 }}>Deposit (Shop only)</span>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {formatTon(safeDeposit)} TON
            </span>
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", margin: "14px 18px 0", gap: 6 }}>
          {(["deposit", "withdraw"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 10, fontWeight: 900, fontSize: 11,
              letterSpacing: 0.8, textTransform: "uppercase", cursor: "pointer",
              border: tab === t ? `1px solid ${NEON}66` : "1px solid rgba(255,255,255,0.1)",
              background: tab === t ? `${NEON}18` : "rgba(255,255,255,0.03)",
              color: tab === t ? NEON : "rgba(180,220,240,0.55)",
              transition: "all 0.15s",
            }}>{t === "deposit" ? "Deposit" : "Withdraw"}</button>
          ))}
        </div>

        {/* content */}
        <div style={{ padding: "14px 18px 20px" }}>
          {tab === "deposit" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "rgba(180,220,240,0.55)" }}>
                Send TON to your in-game balance via TonConnect. Min {DEPOSIT_MIN_TON} TON.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number" inputMode="decimal"
                  value={dAmount}
                  onChange={(e) => setDAmount(e.target.value)}
                  placeholder={`Min ${DEPOSIT_MIN_TON}`}
                  disabled={depositing}
                  style={{
                    flex: 1, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(0,0,0,0.4)", border: `1px solid ${NEON}33`,
                    color: "#fff", fontSize: 15, fontWeight: 800,
                    fontVariantNumeric: "tabular-nums", outline: "none",
                  }}
                />
                <button
                  onClick={() => void handleDeposit()}
                  disabled={depositing}
                  style={{
                    padding: "10px 16px", borderRadius: 10, fontWeight: 900, fontSize: 12,
                    letterSpacing: 0.8, cursor: depositing ? "not-allowed" : "pointer",
                    background: `linear-gradient(135deg, ${NEON}, #00aaff)`,
                    border: "none", color: "#001a2e",
                    opacity: depositing ? 0.6 : 1, whiteSpace: "nowrap",
                  }}
                >{depositing ? "..." : !walletAddress ? "Connect" : "DEPOSIT"}</button>
              </div>
              {dErr && <div style={{ fontSize: 11, color: "#ff7a7a", padding: "7px 11px", borderRadius: 8, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)" }}>{dErr}</div>}
              {dMsg && <div style={{ fontSize: 11, color: NEON, padding: "7px 11px", borderRadius: 8, background: `${NEON}0d`, border: `1px solid ${NEON}33` }}>{dMsg}</div>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {canWithdraw ? (
                <>
                  <div style={{ fontSize: 11, color: "rgba(180,220,240,0.55)" }}>
                    Min {WITHDRAWAL_MIN_TON} TON · Fee {WITHDRAWAL_FEE_TON} TON
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number" inputMode="decimal"
                      placeholder={`Amount (min ${WITHDRAWAL_MIN_TON})`}
                      value={wAmount}
                      onChange={(e) => setWAmount(e.target.value)}
                      disabled={submitting}
                      style={{
                        flex: 1, padding: "10px 12px", borderRadius: 10,
                        background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,242,254,0.25)",
                        color: "#fff", fontSize: 14, fontWeight: 800,
                        fontVariantNumeric: "tabular-nums", outline: "none",
                      }}
                    />
                    <button
                      onClick={() => void handleWithdraw()}
                      disabled={submitting}
                      style={{
                        padding: "10px 14px", borderRadius: 10, fontWeight: 900, fontSize: 11,
                        letterSpacing: 0.6, cursor: submitting ? "not-allowed" : "pointer",
                        background: "linear-gradient(135deg, #c471ed, #7b2fff)",
                        border: "none", color: "#fff",
                        opacity: submitting ? 0.6 : 1, whiteSpace: "nowrap",
                      }}
                    >{submitting ? "..." : "WITHDRAW"}</button>
                  </div>
                  <input
                    type="text"
                    placeholder="Your TON wallet address (UQ... / EQ...)"
                    value={wWallet}
                    onChange={(e) => setWWallet(e.target.value)}
                    disabled={submitting}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,242,254,0.25)",
                      color: "#fff", fontSize: 13, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {wErr && <div style={{ fontSize: 11, color: "#ff7a7a", padding: "7px 11px", borderRadius: 8, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)" }}>{wErr}</div>}
                  {wMsg && <div style={{ fontSize: 11, color: "#c471ed", padding: "7px 11px", borderRadius: 8, background: "rgba(192,96,255,0.08)", border: "1px solid rgba(192,96,255,0.3)" }}>{wMsg}</div>}
                  {withdrawals.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 6 }}>Recent withdrawals</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                        {withdrawals.slice(0, 8).map((w) => {
                          const col = w.status === "paid" ? "#3ddc97" : w.status === "rejected" ? "#ff7a7a" : "#f5d36a";
                          return (
                            <div key={w.id} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                <span style={{ color: "#fff", fontWeight: 700 }}>{w.amountTon.toFixed(4)} TON</span>
                                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>{new Date(w.createdAt).toLocaleString()}</span>
                                {w.status === "paid" && w.txHash && (
                                  <a href={`https://tonscan.org/tx/${w.txHash}`} target="_blank" rel="noreferrer" style={{ color: NEON, fontSize: 10, textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>View tx</a>
                                )}
                              </div>
                              <span style={{ color: col, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>{w.status}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)" }}>
                  {earthCollectionUnlocked && sunCount <= 0
                    ? "TON withdrawals require a SUN module (Earth Collection)."
                    : "TON withdrawals are available to White or Earth Collection holders."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── HEADER PILL BUTTON ─────────────────────────────────────────────────── */
function TonWalletWidgetBase(props: Props) {
  const { tonBalance, telegramId, whitePlanets, earthPlanets, blackPlanets, supernovaPlanets = [] } = props;
  const [open, setOpen] = useState(false);
  const [accrued, setAccrued] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAccrued = useCallback(async () => {
    if (!telegramId) return;
    const s = await fetchStakingStatus(telegramId);
    if (s) setAccrued(sumAccrued(s));
  }, [telegramId]);

  useEffect(() => {
    void loadAccrued();
    timerRef.current = setInterval(() => { void loadAccrued(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void loadAccrued(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadAccrued]);

  // live pending collection yields for the pill display
  const pendingTon = (() => {
    const now = Date.now();
    let p = 0;
    for (const pl of whitePlanets) p += getWhitePlanetPendingTon(pl, now);
    for (const pl of earthPlanets) p += getWhitePlanetPendingTon(pl, now);
    for (const pl of blackPlanets) p += getWhitePlanetPendingTon(pl, now);
    for (const pl of supernovaPlanets) p += getWhitePlanetPendingTon(pl, now);
    return p;
  })();

  const total = Math.max(0, tonBalance) + pendingTon + Math.max(0, accrued);

  return (
    <>
      <button
        type="button"
        aria-label="TON Wallet"
        onClick={() => setOpen(true)}
        className="glass-neon flex items-center gap-1 px-2 py-1 rounded-full font-black cursor-pointer active:scale-95"
        style={{
          background: "linear-gradient(135deg, rgba(0,30,22,0.85), rgba(0,10,8,0.92))",
          border: "1px solid rgba(0,242,180,0.45)",
          boxShadow: "0 0 10px rgba(0,242,180,0.18)",
          color: "#00f2b4",
          textShadow: "0 0 6px rgba(0,242,180,0.55)",
          backdropFilter: "blur(6px)",
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        <img
          src={TON_LOGO_URL}
          alt="TON"
          draggable={false}
          style={{
            width: 20,
            height: 20,
            display: "inline-block",
            objectFit: "contain",
            borderRadius: "0%",
            filter: "drop-shadow(0 0 4px rgba(0,200,255,0.5))",
          }}
        />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTon(total, 2)}</span>
      </button>

      {open && (
        <WalletModal
          {...props}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export const TonWalletWidget = memo(TonWalletWidgetBase);
