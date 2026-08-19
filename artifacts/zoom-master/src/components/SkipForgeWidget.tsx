import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SkipForward } from "lucide-react";
import { useT } from "../i18n/LanguageContext";

const SKIP_COST = 1;

interface SkipForgeWidgetProps {
  isForging: boolean;
  canSkip: boolean;
  stardustBalance: number;
  onSkip: () => { ok: boolean; reason?: string };
}

function SkipForgeWidgetBase({ isForging, canSkip, stardustBalance, onSkip }: SkipForgeWidgetProps) {
  const { t } = useT();
  const [showPopup, setShowPopup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!showPopup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showPopup]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMessage(null);
    setShowPopup(true);
  };

  const handleSkip = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (!isForging) {
      setMessage(t("skipForge.notForging"));
      return;
    }
    if (stardustBalance < SKIP_COST) {
      setMessage(t("skipForge.noStardust"));
      return;
    }
    setBusy(true);
    window.requestAnimationFrame(() => {
      try {
        const res = onSkip();
        if (res.ok) {
          setShowPopup(false);
          setMessage(null);
        } else {
          setMessage(res.reason ?? t("skipForge.noStardust"));
        }
      } finally {
        setBusy(false);
      }
    });
  };

  const ringColor = canSkip
    ? "rgba(255, 215, 120, 0.55)"
    : isForging
      ? "rgba(255, 255, 255, 0.28)"
      : "rgba(255, 255, 255, 0.18)";

  const popup = showPopup ? createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && setShowPopup(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,8,16,0.88)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        pointerEvents: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(135deg, rgba(20,28,48,0.98), rgba(6,8,16,0.98))",
          border: "1.5px solid rgba(255,255,255,0.18)",
          borderRadius: 20,
          padding: 24,
          maxWidth: 320,
          width: "100%",
          boxShadow: "0 0 48px rgba(0, 8, 20, 0.55)",
          textAlign: "center",
          pointerEvents: "auto",
        }}
      >
        <div style={{ marginBottom: 8, lineHeight: 1, display: "flex", justifyContent: "center" }}>
          <SkipForward size={52} strokeWidth={2.2} color="#ffd866" />
        </div>
        <div className="font-black text-lg tracking-wider" style={{ color: "#E8ECF4", marginBottom: 4 }}>
          {t("skipForge.title")}
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 18, lineHeight: 1.5 }}>
          {t("skipForge.desc")}
        </div>
        <div className="font-black text-2xl" style={{ color: "#ffd866", marginBottom: 16 }}>
          {t("skipForge.cost")}
        </div>
        {message && (
          <div className="text-xs" style={{ color: "rgba(200,220,255,0.85)", marginBottom: 12 }}>{message}</div>
        )}
        <button
          type="button"
          onClick={handleSkip}
          disabled={busy}
          className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
          style={{
            background: busy ? "rgba(255,255,255,0.12)" : "hsl(210 22% 90%)",
            color: "hsl(222 28% 10%)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 16px rgba(0, 8, 20, 0.35)",
            marginBottom: 8,
            opacity: busy ? 0.6 : 1,
            pointerEvents: "auto",
          }}
          data-testid="button-confirm-skip-forge"
        >
          {busy ? t("common.processing") : t("skipForge.btn")}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
          disabled={busy}
          className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.5)",
            border: "1px solid rgba(255,255,255,0.15)",
            pointerEvents: "auto",
          }}
        >
          {t("common.cancel").toUpperCase()}
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="active:scale-95 pointer-events-auto flex-shrink-0"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: canSkip
            ? "radial-gradient(circle, rgba(255, 200, 80, 0.22), rgba(20, 28, 48, 0.92))"
            : "radial-gradient(circle, rgba(20, 28, 48, 0.92), rgba(6, 8, 16, 0.88))",
          border: `1.5px solid ${ringColor}`,
          boxShadow: canSkip
            ? "0 0 16px rgba(255, 200, 80, 0.28), inset 0 0 6px rgba(255, 255, 255, 0.06)"
            : `0 0 10px ${ringColor}, inset 0 0 6px rgba(255, 255, 255, 0.04)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          touchAction: "manipulation",
          userSelect: "none",
          opacity: isForging ? 1 : 0.72,
          transition: "opacity 0.2s, box-shadow 0.15s",
        }}
        data-testid="button-skip-forge"
        aria-label={t("skipForge.aria")}
      >
        <SkipForward
          size={26}
          strokeWidth={2.4}
          color={canSkip ? "#ffd866" : "rgba(255,255,255,0.55)"}
        />
      </button>
      {popup}
    </>
  );
}

export const SkipForgeWidget = memo(SkipForgeWidgetBase);
