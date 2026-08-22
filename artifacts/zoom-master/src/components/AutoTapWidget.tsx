import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";
import { useT } from "../i18n/LanguageContext";

const WALLET = "UQB7vku7fJS196hYJa86PjQW9rq0Q7hzyqH97Ki5hJHesIdr";
const PRICE_TON = 3;
const TAPS_PER_SECOND = 10;

interface AutoTapWidgetProps {
  hasAutoTap: boolean;
  telegramId: string | null;
}

/** Hold START BUILD to auto-tap at 10/s. No-ops when auto-tap is not owned. */
export function useAutoTapHold(opts: {
  enabled: boolean;
  canCraft: boolean;
  onTap: () => void;
}) {
  const { enabled, canCraft, onTap } = opts;
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const onTapRef = useRef(onTap);
  const canCraftRef = useRef(canCraft);
  const enabledRef = useRef(enabled);
  onTapRef.current = onTap;
  canCraftRef.current = canCraft;
  enabledRef.current = enabled;

  const stopHold = useCallback((pointerId?: number) => {
    if (pointerId != null && activePointerRef.current != null && activePointerRef.current !== pointerId) {
      return;
    }
    activePointerRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHolding(false);
  }, []);

  const startHold = useCallback((pointerId: number) => {
    if (!enabledRef.current) return;
    if (intervalRef.current) return;
    activePointerRef.current = pointerId;
    setHolding(true);
    if (canCraftRef.current) onTapRef.current();
    intervalRef.current = setInterval(() => {
      if (!canCraftRef.current) return;
      onTapRef.current();
    }, Math.round(1000 / TAPS_PER_SECOND));
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);

  useEffect(() => {
    if (!canCraft || !enabled) stopHold();
  }, [canCraft, enabled, stopHold]);

  useEffect(() => {
    const onVis = () => { if (document.hidden) stopHold(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stopHold]);

  return { startHold, stopHold, holding };
}

function AutoTapWidgetBase({ hasAutoTap, telegramId }: AutoTapWidgetProps) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [showBuy, setShowBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const tmr = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(tmr);
  }, [message]);

  const handleClick = () => {
    if (!hasAutoTap) {
      setShowBuy(true);
      return;
    }
    setMessage(t("autoTap.holdHint"));
  };

  const handleBuy = async () => {
    if (!telegramId) { setMessage(t("pay.tgMissing")); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage(t("pay.connectFirst"));
      return;
    }
    setBuying(true);
    try {
      const nanotons = BigInt(Math.round(PRICE_TON * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, "auto_tap", connectedAddress, PRICE_TON, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage(t("autoTap.unlocked"));
        setShowBuy(false);
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage(t("pay.verifying"));
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(t("autoTap.unlocked"));
          setShowBuy(false);
          window.dispatchEvent(new Event("zoom-data-refresh"));
        } else if (final?.status === "failed") {
          setMessage(t("pay.notDetected"));
        } else {
          setMessage(t("pay.awaiting"));
        }
      } else {
        setMessage(confirmResult.error || t("pay.creditFailed"));
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage(t("pay.cancelled"));
      } else {
        setMessage(t("pay.failed"));
        console.error("[auto_tap] sendTransaction error:", err);
      }
    }
    setBuying(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-no-global-haptic
        className="active:scale-95"
        style={{
          position: "fixed",
          left: 10,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px + 118px)",
          height: 34,
          padding: "0 11px",
          borderRadius: 999,
          background: hasAutoTap
            ? "rgba(0, 0, 0, 0.72)"
            : "rgba(8, 10, 18, 0.88)",
          border: hasAutoTap
            ? "1px solid rgba(0, 230, 118, 0.45)"
            : "1px solid rgba(255,255,255,0.22)",
          color: hasAutoTap ? "#69f0ae" : "#E8ECF4",
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          zIndex: 40,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
        }}
        data-testid="button-auto-tap"
        aria-label={hasAutoTap ? t("autoTap.holdAria") : t("autoTap.buyAria")}
      >
        {t("autoTap.pill")}
        {hasAutoTap ? " ✓" : ""}
      </button>

      {message && !showBuy && (
        <div
          style={{
            position: "fixed",
            left: 10,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px + 156px)",
            zIndex: 41,
            maxWidth: 180,
            padding: "6px 10px",
            borderRadius: 10,
            background: "rgba(8,10,18,0.92)",
            border: "1px solid rgba(255,255,255,0.16)",
            color: "rgba(232,236,244,0.85)",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          {message}
        </div>
      )}

      {showBuy && (
        <div
          onClick={() => !buying && setShowBuy(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,8,16,0.85)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(20,28,48,0.98), rgba(6,8,16,0.98))",
              border: "1.5px solid rgba(255,255,255,0.18)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 340,
              width: "100%",
              boxShadow: "0 0 48px rgba(0, 8, 20, 0.55)",
              textAlign: "center",
            }}
          >
            <div className="font-black text-lg tracking-wider" style={{ color: "#E8ECF4", marginBottom: 4 }}>
              {t("autoTap.title")}
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 18, lineHeight: 1.5 }}>
              {t("autoTap.desc")}
            </div>
            <div className="font-black text-2xl" style={{ color: "#fff", marginBottom: 16 }}>
              {PRICE_TON} GRAM
            </div>
            {message && (
              <div className="text-xs" style={{ color: "rgba(200,220,255,0.85)", marginBottom: 12 }}>{message}</div>
            )}
            <button
              onClick={handleBuy}
              disabled={buying}
              className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: buying ? "rgba(255,255,255,0.12)" : "hsl(210 22% 90%)",
                color: "hsl(222 28% 10%)",
                border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: "0 4px 16px rgba(0, 8, 20, 0.35)",
                marginBottom: 8,
                opacity: buying ? 0.6 : 1,
              }}
              data-testid="button-buy-auto-tap"
            >
              {buying ? t("common.processing") : t("autoTap.buyBtn", { n: PRICE_TON })}
            </button>
            <button
              onClick={() => setShowBuy(false)}
              disabled={buying}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {t("common.cancel").toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export const AutoTapWidget = memo(AutoTapWidgetBase);
