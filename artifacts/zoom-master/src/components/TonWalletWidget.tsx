/**
 * TonWalletWidget — header pill showing on-chain $ZMC.
 * Wallet tab Deposit / Withdraw chips open STON.fi (buy / sell $ZMC).
 */
import { memo, useCallback, useState, type CSSProperties, type MouseEvent } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import type { Planet } from "../hooks/useGameState";
import { GramDiamondIcon } from "./GramDiamondIcon";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { useT } from "../i18n/LanguageContext";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { unlinkZmcWallet, ZMC_WALLET_CLEARED_EVENT } from "../utils/api";
import { ZMC_STONFI_BUY, ZMC_STONFI_SELL, formatZmcAmount, openExternalUrl } from "../utils/zmcToken";


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

/* ─── CONNECT WALLET (Wallet tab header) ─────────────────────────────────── */
export function GramWalletConnectButton({ telegramId }: { telegramId?: string | null }) {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const NEON = "#0fd9ff";

  const clearLinkedWallet = useCallback(async () => {
    if (telegramId) {
      await unlinkZmcWallet(telegramId);
    }
    window.dispatchEvent(new Event(ZMC_WALLET_CLEARED_EVENT));
    try {
      await tonConnectUI.disconnect();
    } catch { /**/ }
  }, [telegramId, tonConnectUI]);

  const handleDisconnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearLinkedWallet();
    } finally {
      setBusy(false);
    }
  }, [busy, clearLinkedWallet]);

  const handleChange = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearLinkedWallet();
      await tonConnectUI.openModal();
    } finally {
      setBusy(false);
    }
  }, [busy, clearLinkedWallet, tonConnectUI]);

  const chipStyle = (color: string, filled = false): CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.10em",
    textTransform: "uppercase" as const,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.55 : 1,
    border: `1px solid ${color}55`,
    background: filled ? `${color}22` : `${color}14`,
    color,
    boxShadow: `0 0 12px ${color}18`,
  });

  if (walletAddress) {
    return (
      <div
        className="flex items-center justify-center gap-2 flex-wrap"
        data-testid="wallet-connected-row"
      >
        <div
          title={walletAddress}
          aria-label={walletAddress}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(15,217,255,0.10)",
            border: `1px solid ${NEON}55`,
            boxShadow: `0 0 16px ${NEON}18`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: "100%",
          }}
        >
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
        </div>
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={busy}
          data-testid="wallet-disconnect-button"
          aria-label={t("wallet.disconnect")}
          style={chipStyle("#ff8a80")}
        >
          {t("wallet.disconnect")}
        </button>
        <button
          type="button"
          onClick={() => void handleChange()}
          disabled={busy}
          data-testid="wallet-change-button"
          aria-label={t("wallet.changeWallet")}
          style={chipStyle(NEON, true)}
        >
          {t("wallet.changeWallet")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => tonConnectUI.openModal()}
      className="mx-auto flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      title={t("wallet.connect")}
      aria-label={t("wallet.connect")}
      style={{
        padding: "10px 18px",
        borderRadius: 999,
        background: "linear-gradient(135deg, rgba(15,217,255,0.18), rgba(0,170,255,0.10))",
        border: `1px solid ${NEON}44`,
        boxShadow: `0 0 20px ${NEON}22`,
        cursor: "pointer",
        maxWidth: "100%",
      }}
      data-testid="wallet-connect-button"
    >
      <ZoomCubeIcon size={18} />
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
  icon?: string;
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
      {icon && (
        <span style={{ fontSize: 11, lineHeight: 1, color, fontWeight: 900 }}>{icon}</span>
      )}
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

/* ─── WALLET PANEL (Deposit / Withdraw → STON.fi $ZMC) ─────────────────── */
export function GramWalletPanel({
  overlay = true,
  onOpenHistory,
}: Props & { overlay?: boolean; zoomBalance?: number }) {
  const { t } = useT();

  const NEON = "#0fd9ff";
  const HISTORY_GOLD = "#ffd740";

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
                flexWrap: "nowrap",
                justifyContent: "flex-end",
                maxWidth: "calc(100% - 24px)",
                pointerEvents: "auto",
              }
            : { display: "flex", justifyContent: "center", gap: 28, padding: "2px 0 6px" }
        }
      >
        {onOpenHistory && (
          <CompactWalletChip
            label={t("wallet.history")}
            color={HISTORY_GOLD}
            onClick={(e) => { e.stopPropagation(); onOpenHistory(); }}
            testId="wallet-history-orb"
          />
        )}
        <CompactWalletChip
          label={t("wallet.deposit")}
          icon="↓"
          color={NEON}
          onClick={(e) => {
            e.stopPropagation();
            openExternalUrl(ZMC_STONFI_BUY);
          }}
          testId="wallet-deposit-orb"
        />
        <CompactWalletChip
          label={t("wallet.withdraw")}
          icon="↑"
          color="#00e676"
          onClick={(e) => {
            e.stopPropagation();
            openExternalUrl(ZMC_STONFI_SELL);
          }}
          testId="wallet-withdraw-orb"
        />
      </div>
    </>
  );
}

/* ─── HEADER PILL BUTTON ─────────────────────────────────────────────────── */
function TonWalletWidgetBase(props: Props) {
  const { telegramId, labVariant = false, onOpenWalletTab } = props;
  const { t } = useT();
  const zmc = useZmcStatus(telegramId);
  const shown = zmc.connected || zmc.zmcBalance > 0
    ? formatZmcAmount(zmc.zmcBalance)
    : "—";

  return (
    <button
      type="button"
      aria-label={t("wallet.gramWalletAria")}
      onClick={() => onOpenWalletTab?.()}
      className="glass-neon flex items-center gap-1.5 rounded-full font-black cursor-pointer active:scale-95"
      style={{
        background: "linear-gradient(135deg, rgba(8,28,42,0.90), rgba(6,12,22,0.94))",
        border: "1px solid rgba(15,217,255,0.42)",
        boxShadow: "0 0 10px rgba(15,217,255,0.16)",
        color: "#7ee8ff",
        textShadow: "0 0 6px rgba(15,217,255,0.45)",
        fontSize: labVariant ? 14 : 12,
        whiteSpace: "nowrap",
        padding: labVariant ? "8px 14px" : "5px 10px",
        gap: 6,
      }}
    >
      <ZoomCubeIcon size={labVariant ? 22 : 20} />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{shown}</span>
    </button>
  );
}

export type TonWalletProps = Props;

export const TonWalletWidget = memo(TonWalletWidgetBase);
