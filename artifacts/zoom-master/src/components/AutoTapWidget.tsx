import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";
import { useT } from "../i18n/LanguageContext";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const PRICE_TON = 3;
const TAPS_PER_SECOND = 10;

interface AutoTapWidgetProps {
  hasAutoTap: boolean;
  canCraft: boolean;
  telegramId: string | null;
  onTap: () => void;
}

function AutoTapWidgetBase({ hasAutoTap, canCraft, telegramId, onTap }: AutoTapWidgetProps) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [showBuy, setShowBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTapRef = useRef(onTap);
  const canCraftRef = useRef(canCraft);
  onTapRef.current = onTap;
  canCraftRef.current = canCraft;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHolding(false);
  }, []);

  const startHold = useCallback(() => {
    if (intervalRef.current) return;
    setHolding(true);
    // Fire one tap immediately, then continue at TAPS_PER_SECOND.
    if (canCraftRef.current) onTapRef.current();
    intervalRef.current = setInterval(() => {
      if (!canCraftRef.current) return;
      onTapRef.current();
    }, Math.round(1000 / TAPS_PER_SECOND));
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);

  const handleClick = () => {
    if (!hasAutoTap) {
      setShowBuy(true);
    }
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

  const widgetColor = hasAutoTap ? "#00f2fe" : "rgba(255,255,255,0.35)";
  const ringColor = hasAutoTap ? "rgba(0,242,254,0.6)" : "rgba(255,255,255,0.2)";
  const dim = !hasAutoTap || !canCraft;

  return (
    <>
      <button
        onClick={handleClick}
        onPointerDown={(e) => {
          if (!hasAutoTap) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          startHold();
        }}
        onPointerUp={() => { if (hasAutoTap) stopHold(); }}
        onPointerCancel={() => { if (hasAutoTap) stopHold(); }}
        onPointerLeave={() => { if (hasAutoTap) stopHold(); }}
        onContextMenu={(e) => e.preventDefault()}
        className="active:scale-95"
        style={{
          position: "fixed",
          // Anchored bottom-left, just above the FORGE PLANET button row
          // (button row ≈ 70px + bottom nav 70px + safe-area bottom).
          left: 12,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 158px)",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: holding
            ? "radial-gradient(circle, rgba(0,242,254,0.35), rgba(0,242,254,0.08))"
            : "radial-gradient(circle, rgba(20,28,48,0.92), rgba(6,8,16,0.88))",
          border: `1.5px solid ${ringColor}`,
          boxShadow: holding
            ? `0 0 24px ${widgetColor}, inset 0 0 12px rgba(0,242,254,0.25)`
            : `0 0 12px ${ringColor}, inset 0 0 6px rgba(255,255,255,0.04)`,
          color: widgetColor,
          fontSize: 22,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          opacity: dim ? 0.7 : 1,
          transition: "opacity 0.2s, box-shadow 0.15s",
          zIndex: 40,
          backdropFilter: "blur(8px)",
        }}
        data-testid="button-auto-tap"
        aria-label={hasAutoTap ? t("autoTap.holdAria") : t("autoTap.buyAria")}
      >
        {hasAutoTap ? <img src="/lightning-pixel.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} /> : "🔒"}
      </button>

      {showBuy && (
        <div
          onClick={() => !buying && setShowBuy(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,8,16,0.85)",
            backdropFilter: "blur(8px)",
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
              border: "1.5px solid rgba(0,242,254,0.4)",
              borderRadius: 20,
              padding: 24,
              maxWidth: 340,
              width: "100%",
              boxShadow: "0 0 48px rgba(0,242,254,0.3)",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <img src="/lightning-pixel.png" alt="" style={{ width: 48, height: 48, imageRendering: "pixelated" }} />
            </div>
            <div className="font-black text-lg tracking-wider" style={{ color: "#00f2fe", marginBottom: 4 }}>
              {t("autoTap.title")}
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 18, lineHeight: 1.5 }}>
              {t("autoTap.desc")}
            </div>
            <div className="font-black text-2xl" style={{ color: "#fff", marginBottom: 16 }}>
              {PRICE_TON} TON
            </div>
            {message && (
              <div className="text-xs" style={{ color: "#00f2fe", marginBottom: 12 }}>{message}</div>
            )}
            <button
              onClick={handleBuy}
              disabled={buying}
              className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
              style={{
                background: buying ? "rgba(0,242,254,0.3)" : "linear-gradient(135deg, #00f2fe, #0088ff)",
                color: "#060810",
                border: "none",
                boxShadow: "0 4px 16px rgba(0,136,255,0.4)",
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
