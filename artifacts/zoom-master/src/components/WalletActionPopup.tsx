import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/LanguageContext";

export function WalletActionPopup({
  title,
  subtitle,
  color,
  icon,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  color: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      data-testid="wallet-action-backdrop"
    >
      <div
        className="w-full rounded-2xl overflow-hidden flex flex-col relative"
        style={{
          maxWidth: 300,
          background: "linear-gradient(180deg, rgba(14,18,32,0.98), rgba(8,10,22,0.99))",
          border: `1px solid ${color}44`,
          boxShadow: `0 12px 40px ${color}18`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.closeAria")}
          className="absolute top-3 right-3 flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: 13,
            zIndex: 2,
          }}
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center px-4 pt-5 pb-3">
          <div
            className="flex items-center justify-center rounded-full mb-2"
            style={{
              width: 44,
              height: 44,
              background: `${color}18`,
              border: `1px solid ${color}44`,
              fontSize: 20,
              fontWeight: 900,
              color,
            }}
          >
            {icon}
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", color }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, lineHeight: 1.45, color: "rgba(255,255,255,0.42)", marginTop: 6, maxWidth: 240 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ padding: "0 16px 16px" }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function FieldLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: color ?? "rgba(255,255,255,0.38)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function Feedback({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  const isErr = tone === "error";
  return (
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: isErr ? "#ff8a80" : "#69f0ae",
        padding: "8px 10px",
        borderRadius: 10,
        background: isErr ? "rgba(255,80,80,0.08)" : "rgba(0,230,118,0.08)",
        border: `1px solid ${isErr ? "rgba(255,80,80,0.22)" : "rgba(0,230,118,0.22)"}`,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}
