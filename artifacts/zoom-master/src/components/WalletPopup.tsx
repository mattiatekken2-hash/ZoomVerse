import { useState } from "react";
import { haptic } from "../utils/haptic";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

interface WalletPopupProps {
  isOpen: boolean;
  amount: string;
  purpose: string;
  instruction?: string;
  copyLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
}

export function WalletPopup({ isOpen, amount, purpose, instruction, copyLabel, onClose, onConfirm, confirmLabel }: WalletPopupProps) {
  const [copied, setCopied] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    haptic(8);
    navigator.clipboard.writeText(WALLET).catch(() => {});
    setCopied(true);
    setHasCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = () => {
    haptic(10);
    onConfirm?.();
    onClose();
  };

  return (
    <div
      className="absolute inset-0 flex items-end justify-center z-50"
      style={{ background: "rgba(6,8,16,0.88)", backdropFilter: "blur(16px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full rounded-t-3xl px-5 pt-6 pb-10"
        style={{
          background: "linear-gradient(180deg, rgba(18,22,40,0.98) 0%, rgba(8,10,20,0.99) 100%)",
          border: "1px solid rgba(255,215,0,0.12)",
          borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(255,215,0,0.08)",
        }}
      >
        <div className="w-12 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />

        <div className="flex items-center gap-3 mb-5">
          <div className="text-3xl">💎</div>
          <div>
            <div className="font-black text-base gold-text tracking-wide">{purpose}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              Send exactly <span className="gold-text">{amount}</span>
            </div>
          </div>
        </div>

        <div className="text-xs mb-3 font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
          TON Wallet Address
        </div>

        <div
          className="rounded-2xl p-4 mb-3 border"
          style={{ background: "rgba(255,215,0,0.04)", borderColor: "rgba(255,215,0,0.15)" }}
        >
          <div className="font-mono text-sm break-all mb-3" style={{ color: "rgba(255,215,0,0.9)", lineHeight: 1.6 }}>
            {WALLET}
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-3 rounded-xl font-black text-sm tracking-wider uppercase transition-all active:scale-95"
            style={{
              background: copied ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.12)",
              color: copied ? "#00e676" : "#ffd700",
              border: `1px solid ${copied ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.25)"}`,
              boxShadow: copied ? "0 0 16px rgba(0,230,118,0.2)" : "none",
            }}
          >
            {copied ? "✓ COPIED!" : (copyLabel || "📋 COPY ADDRESS")}
          </button>
        </div>

        <div className="text-xs mb-4 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
          {instruction || `Open your TON wallet app, send ${amount} to the address above, then confirm below`}
        </div>

        {onConfirm && (
          <button
            onClick={handleConfirm}
            disabled={!hasCopied}
            className="w-full py-4 rounded-2xl font-black text-base tracking-wider uppercase transition-all active:scale-95 mb-3"
            style={{
              background: hasCopied
                ? "linear-gradient(135deg, #ffd700, #ffb347)"
                : "rgba(255,255,255,0.05)",
              color: hasCopied ? "#060810" : "rgba(255,255,255,0.2)",
              boxShadow: hasCopied ? "0 0 24px rgba(255,215,0,0.4)" : "none",
              cursor: hasCopied ? "pointer" : "not-allowed",
            }}
          >
            {hasCopied ? (confirmLabel || "I've Sent the Payment") : "Copy address first ↑"}
          </button>
        )}

        <button
          onClick={() => { haptic(5); onClose(); }}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
