import { useState } from "react";

interface ShopPageProps {
  balance: number;
}

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

const BUNDLES = [
  { id: "b1", name: "Starter Pack", desc: "2,000 $ZOOM + 1 Basic Planet guaranteed", priceTon: 0.5, zoom: 2000, color: "#8892b0" },
  { id: "b2", name: "Explorer Pack", desc: "8,000 $ZOOM + 1 Rare Planet guaranteed", priceTon: 1.5, zoom: 8000, color: "#4facfe" },
  { id: "b3", name: "Legend Pack", desc: "25,000 $ZOOM + 1 Epic Planet guaranteed", priceTon: 4.0, zoom: 25000, color: "#c471ed" },
];

export function ShopPage({ balance: _balance }: ShopPageProps) {
  const [copiedWallet, setCopiedWallet] = useState(false);
  const sunAvailable = 18;

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(WALLET).catch(() => {});
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">Shop</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Exclusive items & bundles</p>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-4">
        <div
          className="rounded-2xl p-5 border relative overflow-hidden"
          style={{
            borderColor: "rgba(255,215,0,0.3)",
            background: "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(255,140,0,0.04) 100%)",
            boxShadow: "0 0 32px rgba(255,215,0,0.12)",
          }}
          data-testid="shop-sun"
        >
          <div
            className="absolute top-0 right-0 w-40 h-40 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
              transform: "translate(30%, -30%)",
            }}
          />
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-3xl mb-1">☀️</div>
              <div className="font-black text-xl gold-text tracking-wide">THE SUN</div>
              <div className="text-xs mt-1" style={{ color: "rgba(255,215,0,0.6)" }}>
                Limited Edition · {sunAvailable}/20 available
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(255,215,0,0.15)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.3)" }}
            >
              EXCLUSIVE
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {["Not tradeable", "Max yield", "Not farmable", "Fixed 10,000/hr"].map(tag => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,215,0,0.08)", color: "rgba(255,215,0,0.7)", border: "1px solid rgba(255,215,0,0.15)" }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div
            className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center border mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.1))",
              color: "#ffd700",
              boxShadow: "0 0 20px rgba(255,215,0,0.2)",
              border: "1px solid rgba(255,215,0,0.3)",
            }}
            data-testid="sun-price"
          >
            10 TON
          </div>

          <div className="text-xs mb-2 text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            Send payment to official ZOOM wallet
          </div>
          <div
            className="rounded-xl px-3 py-3 flex items-center justify-between gap-2 border"
            style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(0,0,0,0.4)" }}
          >
            <span className="text-xs font-mono truncate flex-1" style={{ color: "rgba(255,215,0,0.7)" }}>
              {WALLET}
            </span>
            <button
              onClick={handleCopyWallet}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all active:scale-95"
              style={{
                background: copiedWallet ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.12)",
                color: copiedWallet ? "#00e676" : "#ffd700",
                border: `1px solid ${copiedWallet ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.25)"}`,
                whiteSpace: "nowrap",
              }}
              data-testid="button-copy-wallet"
            >
              {copiedWallet ? "✓ Copied" : "Copy Link"}
            </button>
          </div>
        </div>

        <div>
          <div className="font-black text-sm tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
            BUNDLES
          </div>
          <div className="flex flex-col gap-3">
            {BUNDLES.map(bundle => (
              <div
                key={bundle.id}
                className="rounded-2xl border p-4 flex items-center gap-4"
                style={{
                  borderColor: bundle.color + "30",
                  background: bundle.color + "06",
                }}
                data-testid={`bundle-${bundle.id}`}
              >
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
                  <div className="font-black text-sm gold-text">{bundle.priceTon} TON</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>+{bundle.zoom.toLocaleString()} $ZOOM</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
