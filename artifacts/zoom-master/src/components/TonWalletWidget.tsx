/**
 * TonWalletWidget — header pill button showing "TON + balance".
 * Tap to open a full wallet modal with:
 *   - Unified TON balance (spendable + accrued staking)
 *   - Deposit via TonConnect (min 0.25 TON)
 *   - Withdrawal (min 10 TON) — moved here from PixelAvatar
 */
import { memo, useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
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
import { GramDiamondIcon } from "./GramDiamondIcon";

const TON_RECEIVER_WALLET = "UQB7vku7fJS196hYJa86PjQW9rq0Q7hzyqH97Ki5hJHesIdr";
const POLL_MS = 60_000;

/** Official Telegram GRAM / Wallet diamond mark. */
export function GramWalletIcon({ size = 18 }: { size?: number }) {
  return <GramDiamondIcon size={size} />;
}

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
  /** Slightly larger pill for the Lab viewport header. */
  labVariant?: boolean;
  /** Tap header pill → open Wallet tab instead of inline modal. */
  onOpenWalletTab?: () => void;
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

/* ─── CONNECT WALLET (Wallet tab header) ─────────────────────────────────── */
export function GramWalletConnectButton() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const NEON = "#0fd9ff";

  return (
    <button
      type="button"
      onClick={() => tonConnectUI.openModal()}
      className="mx-auto flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      style={{
        padding: "10px 18px",
        borderRadius: 999,
        background: walletAddress ? "rgba(15,217,255,0.10)" : "linear-gradient(135deg, rgba(15,217,255,0.18), rgba(0,170,255,0.10))",
        border: `1px solid ${walletAddress ? `${NEON}55` : `${NEON}44`}`,
        boxShadow: walletAddress ? `0 0 16px ${NEON}18` : `0 0 20px ${NEON}22`,
        cursor: "pointer",
        maxWidth: "100%",
      }}
      data-testid="wallet-connect-button"
    >
      {walletAddress ? (
        <>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#00e676",
              boxShadow: "0 0 8px #00e676",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: NEON,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
        </>
      ) : (
        <>
          <GramWalletIcon size={18} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: NEON,
            }}
          >
            Connect Wallet
          </span>
        </>
      )}
    </button>
  );
}

function RoundWalletAction({
  label,
  sublabel,
  color,
  onClick,
  testId,
}: {
  label: string;
  sublabel: string;
  color: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(145deg, ${color}22, ${color}08)`,
          border: `1.5px solid ${color}55`,
          boxShadow: `0 0 18px ${color}20`,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1, color, fontWeight: 900 }}>
          {label === "Deposit" ? "↓" : "↑"}
        </span>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color, textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
    </button>
  );
}

function WalletActionPopup({
  title,
  color,
  onClose,
  children,
}: {
  title: string;
  color: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      data-testid="wallet-action-backdrop"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(6,14,32,0.98), rgba(2,8,18,0.99))",
          border: `1px solid ${color}44`,
          boxShadow: `0 0 32px ${color}18`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${color}22` }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.14em", color, textTransform: "uppercase" }}>
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "14px 16px 18px" }}>{children}</div>
      </div>
    </div>
  );
}

/* ─── WALLET PANEL (embedded in Wallet tab) ─────────────────────────────── */
export function GramWalletPanel({
  tonBalance,
  depositBalance: _depositBalance,
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
}: Props) {
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
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | null>(null);

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
      setDErr(`Minimum deposit is ${DEPOSIT_MIN_TON} GRAM`); return;
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
          setDMsg(`Deposit confirmed! +${n} GRAM aggiunti al saldo deposito (spendibile nello Shop).`);
        } else if (final?.status === "failed") {
          setDErr("Deposit verification failed. Contact support if GRAM was deducted.");
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
      setWErr(`Minimum amount: ${WITHDRAWAL_MIN_TON} GRAM`); return;
    }
    // Withdrawals are paid out of EARNED GRAM only — depositBalance is
    // intentionally excluded so external deposits stay one-way (in-only).
    if (liveEarnedTon < WITHDRAWAL_MIN_TON) {
      setWErr(`Minimo ${WITHDRAWAL_MIN_TON} GRAM guadagnati per prelevare`); return;
    }
    if (liveEarnedTon < n + WITHDRAWAL_FEE_TON) {
      setWErr(`Saldo GRAM guadagnato insufficiente. Servono ${(n + WITHDRAWAL_FEE_TON).toFixed(4)} GRAM (importo + ${WITHDRAWAL_FEE_TON} di fee)`); return;
    }
    if (!wWallet.trim()) { setWErr("Enter your GRAM wallet address"); return; }

    setSubmitting(true);
    const res = await requestTonWithdrawal({ telegramId, amountTon: n, walletAddress: wWallet.trim() });
    setSubmitting(false);
    if (!res.ok) { setWErr(res.error || "Withdrawal failed"); return; }
    if (typeof res.newTonBalance === "number" && typeof res.balanceEpoch === "number") {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.newTonBalance, epoch: res.balanceEpoch },
      }));
    }
    setWMsg(`Request submitted. You'll receive ${n.toFixed(4)} GRAM after admin approval.`);
    setWAmount(""); void refreshWithdrawals();
  };

  const NEON = "#0fd9ff";
  const inputStyle: CSSProperties = {
    width: "100%",
    minHeight: 46,
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.45)",
    border: `1px solid ${NEON}33`,
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    outline: "none",
    boxSizing: "border-box",
  };
  const btnPrimary: CSSProperties = {
    width: "100%",
    minHeight: 46,
    padding: "12px 16px",
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: 0.8,
    cursor: "pointer",
    border: "none",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", gap: 28, padding: "2px 0 6px" }}>
        <RoundWalletAction
          label="Deposit"
          sublabel="TonConnect"
          color={NEON}
          onClick={() => setActiveModal("deposit")}
          testId="wallet-deposit-orb"
        />
        <RoundWalletAction
          label="Withdraw"
          sublabel="To wallet"
          color="#00e676"
          onClick={() => setActiveModal("withdraw")}
          testId="wallet-withdraw-orb"
        />
      </div>

      {activeModal === "deposit" && (
        <WalletActionPopup title="Deposit GRAM" color={NEON} onClose={() => setActiveModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(180,220,240,0.6)" }}>
              Send GRAM to your in-game balance via TonConnect. Min {DEPOSIT_MIN_TON} GRAM.
            </div>
            <input
              type="number"
              inputMode="decimal"
              value={dAmount}
              onChange={(e) => setDAmount(e.target.value)}
              placeholder={`Min ${DEPOSIT_MIN_TON} GRAM`}
              disabled={depositing}
              style={inputStyle}
            />
            <button
              onClick={() => void handleDeposit()}
              disabled={depositing}
              style={{
                ...btnPrimary,
                background: `linear-gradient(135deg, ${NEON}, #00aaff)`,
                color: "#001a2e",
                opacity: depositing ? 0.6 : 1,
                cursor: depositing ? "not-allowed" : "pointer",
              }}
            >
              {depositing ? "..." : !walletAddress ? "Connect Wallet" : "DEPOSIT GRAM"}
            </button>
            {dErr && <div style={{ fontSize: 11, color: "#ff7a7a", padding: "8px 12px", borderRadius: 8, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)" }}>{dErr}</div>}
            {dMsg && <div style={{ fontSize: 11, color: NEON, padding: "8px 12px", borderRadius: 8, background: `${NEON}0d`, border: `1px solid ${NEON}33` }}>{dMsg}</div>}
          </div>
        </WalletActionPopup>
      )}

      {activeModal === "withdraw" && (
        <WalletActionPopup title="Withdraw GRAM" color="#00e676" onClose={() => setActiveModal(null)}>
          {canWithdraw ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(180,220,240,0.6)" }}>
                Min {WITHDRAWAL_MIN_TON} GRAM · Fee {WITHDRAWAL_FEE_TON} GRAM
              </div>
              <input
                type="number"
                inputMode="decimal"
                placeholder={`Amount (min ${WITHDRAWAL_MIN_TON})`}
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
                disabled={submitting}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="GRAM wallet address (UQ... / EQ...)"
                value={wWallet}
                onChange={(e) => setWWallet(e.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
              />
              <button
                onClick={() => void handleWithdraw()}
                disabled={submitting}
                style={{
                  ...btnPrimary,
                  background: "linear-gradient(135deg, #00e676, #00c853)",
                  color: "#001a0e",
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "..." : "WITHDRAW GRAM"}
              </button>
              {wErr && <div style={{ fontSize: 11, color: "#ff7a7a", padding: "7px 11px", borderRadius: 8, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)" }}>{wErr}</div>}
              {wMsg && <div style={{ fontSize: 11, color: "#00e676", padding: "7px 11px", borderRadius: 8, background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.25)" }}>{wMsg}</div>}
              {withdrawals.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 6 }}>Recent withdrawals</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                    {withdrawals.slice(0, 8).map((w) => {
                      const col = w.status === "paid" ? "#3ddc97" : w.status === "rejected" ? "#ff7a7a" : "#f5d36a";
                      return (
                        <div key={w.id} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{w.amountTon.toFixed(4)} GRAM</span>
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
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)" }}>
              {earthCollectionUnlocked && sunCount <= 0
                ? "GRAM withdrawals require a SUN module (Earth Collection)."
                : "GRAM withdrawals are available to White or Earth Collection holders."}
            </div>
          )}
        </WalletActionPopup>
      )}
    </>
  );
}

/* ─── HEADER PILL BUTTON ─────────────────────────────────────────────────── */
function TonWalletWidgetBase(props: Props) {
  const {
    tonBalance, telegramId, whitePlanets, earthPlanets, blackPlanets,
    supernovaPlanets = [], labVariant = false, onOpenWalletTab,
  } = props;
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
    <button
      type="button"
      aria-label="GRAM Wallet"
      onClick={() => onOpenWalletTab?.()}
      className="glass-neon flex items-center gap-1.5 rounded-full font-black cursor-pointer active:scale-95"
      style={{
        background: "linear-gradient(135deg, rgba(0,30,22,0.85), rgba(0,10,8,0.92))",
        border: "1px solid rgba(0,242,180,0.45)",
        boxShadow: "0 0 10px rgba(0,242,180,0.18)",
        color: "#00f2b4",
        textShadow: "0 0 6px rgba(0,242,180,0.55)",
        fontSize: labVariant ? 14 : 12,
        whiteSpace: "nowrap",
        padding: labVariant ? "8px 14px" : "5px 10px",
        gap: 6,
      }}
    >
      <GramWalletIcon size={labVariant ? 22 : 20} />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTon(total, 2)}</span>
    </button>
  );
}

export type TonWalletProps = Props;

export const TonWalletWidget = memo(TonWalletWidgetBase);
