import { useState } from "react";
import { WalletPopup } from "../components/WalletPopup";


const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

const BUNDLES = [
  { id: "b1", name: "Starter Pack", desc: "2,000 $ZOOM + 1 Basic Planet guaranteed", priceTon: 0.5, zoom: 2000, color: "#8892b0" },
  { id: "b2", name: "Explorer Pack", desc: "8,000 $ZOOM + 1 Rare Planet guaranteed", priceTon: 1.5, zoom: 8000, color: "#4facfe" },
  { id: "b3", name: "Legend Pack", desc: "25,000 $ZOOM + 1 Epic Planet guaranteed", priceTon: 4.0, zoom: 25000, color: "#c471ed" },
];

interface ShopPageProps {
  balance: number;
  hasSun: boolean;
}

export function ShopPage({ hasSun }: ShopPageProps) {
  const [walletCopied, setWalletCopied] = useState(false);
  const [popup, setPopup] = useState<{ amount: string; purpose: string } | null>(null);
  const sunAvailable = 18;

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(WALLET).catch(() => {});
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 2000);
  };

  const openPopup = (amount: string, purpose: string) => {
    setPopup({ amount, purpose });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Fixed Wallet Banner */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(6,8,16,0.95)",
          borderBottom: "1px solid rgba(255,215,0,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="text-sm font-black gold-text flex-shrink-0">💎 WALLET</div>
        <div className="flex-1 min-w-0">
          <div
            className="font-mono text-xs truncate"
            style={{ color: "rgba(255,215,0,0.7)" }}
          >
            {WALLET}
          </div>
        </div>
        <button
          onClick={handleCopyWallet}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all active:scale-95"
          style={{
            background: walletCopied ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.12)",
            color: walletCopied ? "#00e676" : "#ffd700",
            border: `1px solid ${walletCopied ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.25)"}`,
            whiteSpace: "nowrap",
          }}
        >
          {walletCopied ? "✓ Copied" : "Copy Link"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {/* THE SUN */}
          <div
            className="rounded-2xl p-5 border relative overflow-hidden"
            style={{
              borderColor: "rgba(255,179,71,0.3)",
              background: "linear-gradient(135deg, rgba(255,179,71,0.08) 0%, rgba(255,140,0,0.04) 100%)",
              boxShadow: "0 0 32px rgba(255,179,71,0.1)",
            }}
            data-testid="shop-sun"
          >
            <div
              className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(255,179,71,0.15) 0%, transparent 70%)",
                filter: "blur(20px)",
                transform: "translate(30%, -30%)",
              }}
            />
            <div className="flex items-start justify-between mb-3">
              <div>
                <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 6 }}>☀️</div>
                <div className="font-black text-xl tracking-wide" style={{ color: "#ffb347" }}>THE SUN</div>
                <div className="text-xs mt-1" style={{ color: "rgba(255,179,71,0.6)" }}>
                  Limited Edition · {sunAvailable}/20 available
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "rgba(255,179,71,0.15)", color: "#ffb347", border: "1px solid rgba(255,179,71,0.3)" }}>
                EXCLUSIVE
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {["Not tradeable", "Max yield", "10,000/hr", "Activation fee in TON"].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,179,71,0.08)", color: "rgba(255,179,71,0.7)", border: "1px solid rgba(255,179,71,0.15)" }}>
                  {tag}
                </span>
              ))}
            </div>
            <div
              className="text-xs mb-3 text-center"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {hasSun ? "You already own THE SUN — check your Farm to activate" : "Get a SUN-**** code from official channels or buy below"}
            </div>
            <button
              onClick={() => !hasSun && openPopup("10 TON", "Purchase THE SUN")}
              disabled={hasSun}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center transition-all active:scale-95"
              style={{
                background: hasSun
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, rgba(255,179,71,0.2), rgba(255,140,0,0.15))",
                color: hasSun ? "rgba(255,255,255,0.2)" : "#ffb347",
                boxShadow: hasSun ? "none" : "0 0 20px rgba(255,179,71,0.2)",
                border: `1px solid ${hasSun ? "rgba(255,255,255,0.06)" : "rgba(255,179,71,0.3)"}`,
                cursor: hasSun ? "not-allowed" : "pointer",
              }}
              data-testid="sun-price"
            >
              {hasSun ? "✓ Already Owned" : "BUY — 10 TON"}
            </button>
          </div>

          {/* BUNDLES */}
          <div>
            <div className="font-black text-sm tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              $ZOOM Bundles
            </div>
            <div className="flex flex-col gap-3">
              {BUNDLES.map(bundle => (
                <div
                  key={bundle.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: bundle.color + "30", background: bundle.color + "06" }}
                  data-testid={`bundle-${bundle.id}`}
                >
                  <div className="flex items-center gap-4 p-4">
                    <div
                      className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-lg"
                      style={{ background: bundle.color + "18", color: bundle.color, border: `1px solid ${bundle.color}30` }}
                    >
                      {bundle.zoom >= 20000 ? "⬡" : bundle.zoom >= 8000 ? "◈" : "◇"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm" style={{ color: bundle.color }}>{bundle.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{bundle.desc}</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="font-black text-base gold-text">{bundle.priceTon}</div>
                      <div className="text-xs gold-text opacity-70">TON</div>
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${bundle.color}15` }}>
                    <button
                      onClick={() => openPopup(`${bundle.priceTon} TON`, `Purchase ${bundle.name}`)}
                      className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                      style={{
                        background: bundle.color + "10",
                        color: bundle.color,
                      }}
                    >
                      BUY — {bundle.priceTon} TON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Popup */}
      {popup && (
        <WalletPopup
          isOpen={true}
          amount={popup.amount}
          purpose={popup.purpose}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
