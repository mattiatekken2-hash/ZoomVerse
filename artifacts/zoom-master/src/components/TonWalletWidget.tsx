/**
 * TonWalletWidget — header pill button showing "TON + balance".
 * Tap to open a full wallet modal with:
 *   - Unified TON balance (spendable + accrued staking)
 *   - Deposit via TonConnect (min 0.25 TON)
 *   - Withdrawal (min 10 TON) — moved here from PixelAvatar
 */
import { memo, useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode, type MouseEvent } from "react";
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
import { ExchangeWidget } from "./ExchangeWidget";
import { WalletActionPopup, FieldLabel, Feedback } from "./WalletActionPopup";
import { useT } from "../i18n/LanguageContext";

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
  /** Open My History from the wallet chip row. */
  onOpenHistory?: () => void;
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
  const { t } = useT();
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
            {t("wallet.connect")}
          </span>
        </>
      )}
    </button>
  );
}

function CompactWalletChip({
  label,
  icon,
  color,
  onClick,
  testId,
}: {
  label: string;
  icon: string;
  color: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex items-center gap-1 active:scale-95 transition-transform"
      style={{
        padding: "5px 9px",
        borderRadius: 10,
        background: `${color}14`,
        border: `1px solid ${color}44`,
        boxShadow: `0 0 12px ${color}18`,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1, color, fontWeight: 900 }}>{icon}</span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.08em",
          color,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </button>
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
  overlay = true,
  zoomBalance = 0,
  onOpenHistory,
}: Props & { overlay?: boolean; zoomBalance?: number }) {
  const { t } = useT();
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
    if (!telegramId) { setDErr(t("wallet.sessionNotReady")); return; }
    const n = parseFloat(dAmount);
    if (!Number.isFinite(n) || n < DEPOSIT_MIN_TON) {
      setDErr(t("wallet.depositMin", { min: DEPOSIT_MIN_TON })); return;
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
      if (!txResult?.boc) { setDErr(t("wallet.txCancelled")); setDepositing(false); return; }

      const res = await depositTonConfirm({ telegramId, walletAddress, boc: txResult.boc, amountTon: n });
      if (!res.ok && !res.pending) { setDErr(res.error || t("wallet.depositFailed")); setDepositing(false); return; }

      if (res.txnId && !res.alreadyCredited) {
        // poll until final
        const final = await pollTxnUntilFinal(res.txnId, { maxMs: 120_000 });
        if (final?.status === "completed") {
          // Deposits now credit the DEPOSIT balance (Shop-only), not the
          // earned tonBalance. Fire a refresh so the next /grants pull picks
          // up the new deposit balance authoritatively.
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setDMsg(t("wallet.depositConfirmed", { n }));
        } else if (final?.status === "failed") {
          setDErr(t("wallet.depositVerifyFailed"));
        } else {
          setDMsg(t("wallet.depositVerifying"));
        }
      } else if (res.alreadyCredited) {
        setDMsg(t("wallet.depositAlreadyCredited"));
      } else {
        setDMsg(t("wallet.depositSubmitted"));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancel") && !msg.includes("Cancel")) setDErr(t("wallet.txFailed"));
    }
    setDepositing(false);
  };

  // ── withdraw handler ────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    setWErr(null); setWMsg(null);
    if (!canWithdraw) {
      setWErr(earthCollectionUnlocked && sunCount <= 0
        ? t("wallet.withdrawEarthSunRequired")
        : t("wallet.withdrawCollectionRequired")); return;
    }
    if (!telegramId) { setWErr(t("wallet.sessionNotReady")); return; }
    const n = parseFloat(wAmount);
    if (!Number.isFinite(n) || n < WITHDRAWAL_MIN_TON) {
      setWErr(t("wallet.withdrawMin", { min: WITHDRAWAL_MIN_TON })); return;
    }
    if (liveEarnedTon < WITHDRAWAL_MIN_TON) {
      setWErr(t("wallet.withdrawEarnedMin", { min: WITHDRAWAL_MIN_TON })); return;
    }
    if (liveEarnedTon < n + WITHDRAWAL_FEE_TON) {
      setWErr(t("wallet.withdrawInsufficientEarned", {
        total: (n + WITHDRAWAL_FEE_TON).toFixed(4),
        fee: WITHDRAWAL_FEE_TON,
      })); return;
    }
    if (!wWallet.trim()) { setWErr(t("wallet.withdrawAddressRequired")); return; }

    setSubmitting(true);
    const res = await requestTonWithdrawal({ telegramId, amountTon: n, walletAddress: wWallet.trim() });
    setSubmitting(false);
    if (!res.ok) { setWErr(res.error || t("wallet.withdrawFailed")); return; }
    if (typeof res.newTonBalance === "number" && typeof res.balanceEpoch === "number") {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.newTonBalance, epoch: res.balanceEpoch },
      }));
    }
    setWMsg(t("wallet.withdrawSubmitted", { n: n.toFixed(4) }));
    setWAmount(""); void refreshWithdrawals();
  };

  const NEON = "#0fd9ff";
  const HISTORY_GOLD = "#ffd740";
  const inputStyle: CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "11px 12px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.45)",
    border: `1px solid ${NEON}33`,
    color: "#fff",
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    outline: "none",
    boxSizing: "border-box",
    textAlign: "center",
  };
  const inputStyleCompact: CSSProperties = {
    ...inputStyle,
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
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
      <div
        style={
          overlay
            ? {
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 4,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                maxWidth: "calc(100% - 24px)",
                pointerEvents: "auto",
              }
            : { display: "flex", justifyContent: "center", gap: 28, padding: "2px 0 6px" }
        }
      >
        {onOpenHistory && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenHistory(); }}
            data-testid="wallet-history-orb"
            aria-label={t("history.title")}
            title={t("history.title")}
            className="active:scale-95 transition-transform flex items-center justify-center flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,215,64,0.12)",
              border: "1px solid rgba(255,215,64,0.40)",
              boxShadow: "0 0 12px rgba(255,215,64,0.16)",
              cursor: "pointer",
              color: HISTORY_GOLD,
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
            }}
          >
            📜
          </button>
        )}
        <CompactWalletChip
          label={t("wallet.deposit")}
          icon="↓"
          color={NEON}
          onClick={(e) => { e.stopPropagation(); setActiveModal("deposit"); }}
          testId="wallet-deposit-orb"
        />
        <CompactWalletChip
          label={t("wallet.withdraw")}
          icon="↑"
          color="#00e676"
          onClick={(e) => { e.stopPropagation(); setActiveModal("withdraw"); }}
          testId="wallet-withdraw-orb"
        />
        <ExchangeWidget balance={zoomBalance} />
      </div>

      {activeModal === "deposit" && (
        <WalletActionPopup
          title={t("wallet.depositTitle")}
          subtitle={t("wallet.depositHint", { min: DEPOSIT_MIN_TON })}
          color={NEON}
          icon="↓"
          onClose={() => setActiveModal(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <FieldLabel color={`${NEON}99`}>{t("wallet.amountLabel")}</FieldLabel>
              <input
                type="number"
                inputMode="decimal"
                value={dAmount}
                onChange={(e) => setDAmount(e.target.value)}
                placeholder={t("wallet.depositPlaceholder", { min: DEPOSIT_MIN_TON })}
                disabled={depositing}
                style={inputStyle}
              />
            </div>
            <button
              type="button"
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
              {depositing ? t("common.processing") : !walletAddress ? t("wallet.connect") : t("wallet.depositBtn")}
            </button>
            {dErr && <Feedback tone="error">{dErr}</Feedback>}
            {dMsg && <Feedback tone="ok">{dMsg}</Feedback>}
          </div>
        </WalletActionPopup>
      )}

      {activeModal === "withdraw" && (
        <WalletActionPopup
          title={t("wallet.withdrawTitle")}
          subtitle={canWithdraw ? t("wallet.withdrawHint", { min: WITHDRAWAL_MIN_TON, fee: WITHDRAWAL_FEE_TON }) : undefined}
          color="#00e676"
          icon="↑"
          onClose={() => setActiveModal(null)}
        >
          {canWithdraw ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                className="rounded-xl text-center py-2"
                style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.18)" }}
              >
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                  {t("wallet.availableEarned")}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#00e676", marginTop: 2 }}>
                  {liveEarnedTon.toFixed(4)} GRAM
                </div>
              </div>
              <div>
                <FieldLabel color="rgba(0,230,118,0.65)">{t("wallet.amountLabel")}</FieldLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={t("wallet.withdrawAmountPlaceholder", { min: WITHDRAWAL_MIN_TON })}
                    value={wAmount}
                    onChange={(e) => setWAmount(e.target.value)}
                    disabled={submitting}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setWAmount(String(Math.max(WITHDRAWAL_MIN_TON, Math.floor(liveEarnedTon * 10000) / 10000)))}
                    disabled={submitting || liveEarnedTon < WITHDRAWAL_MIN_TON}
                    style={{
                      padding: "0 12px",
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      color: "#00e676",
                      background: "rgba(0,230,118,0.10)",
                      border: "1px solid rgba(0,230,118,0.25)",
                      cursor: submitting ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {t("common.max")}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel>{t("wallet.addressLabel")}</FieldLabel>
                <input
                  type="text"
                  placeholder={t("wallet.withdrawAddressPlaceholder")}
                  value={wWallet}
                  onChange={(e) => setWWallet(e.target.value)}
                  disabled={submitting}
                  style={inputStyleCompact}
                />
              </div>
              <button
                type="button"
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
                {submitting ? t("common.processing") : t("wallet.withdrawBtn")}
              </button>
              {wErr && <Feedback tone="error">{wErr}</Feedback>}
              {wMsg && <Feedback tone="ok">{wMsg}</Feedback>}
            </div>
          ) : (
            <Feedback tone="error">
              {earthCollectionUnlocked && sunCount <= 0
                ? t("wallet.withdrawSunRequired")
                : t("wallet.withdrawEligible")}
            </Feedback>
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
  const { t } = useT();
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
      aria-label={t("wallet.gramWalletAria")}
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
