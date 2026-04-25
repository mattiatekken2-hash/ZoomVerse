import { useEffect, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const PRICE_TON = 7;
const NEON_BLUE = "#3b82f6";
const NEON_GREEN_E = "#22c55e";

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  sunCount?: number;
  onUnlocked?: () => void;
}

function EarthCollectionWidgetBase({ telegramId, unlocked = false, ownedBundles = 0, sunCount = 0, onUnlocked }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stock, setStock] = useState<{ sold: number; remaining: number; max: number } | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const fetchStock = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/earth-collection/stock`);
      if (r.ok) setStock(await r.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStock();
    const onRefresh = () => fetchStock();
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
  }, []);

  useEffect(() => { if (open) fetchStock(); }, [open]);

  const soldOut = !!stock && stock.remaining <= 0;

  const handleBuy = async () => {
    if (!telegramId) { setMessage("Telegram ID missing"); return; }
    if (sunCount <= 0) {
      setMessage("Requisito richiesto: Devi possedere il SOLE per sbloccare questa collezione");
      return;
    }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage("Connect your wallet first");
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
      const confirmResult = await confirmTonPurchase(telegramId, "earth_collection", connectedAddress, PRICE_TON, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage("Earth Collection unlocked!");
        onUnlocked?.();
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setOpen(false);
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage("Verifying payment on-chain…");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage("Earth Collection unlocked!");
          onUnlocked?.();
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setOpen(false);
        } else if (final?.status === "failed") {
          setMessage("Payment not detected on-chain");
        } else {
          setMessage("Awaiting confirmation…");
        }
      } else {
        setMessage(confirmResult.error || "Credit failed");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage("Payment cancelled");
      } else {
        setMessage("TON payment failed");
        console.error("[earth_collection] sendTransaction error:", err);
      }
    }
    setBuying(false);
  };

  return (
    <>
      <style>{`
        @keyframes earthCollFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-6px) rotate(0.5deg); }
        }
        @keyframes earthCollGlow {
          0%, 100% { box-shadow: 0 0 12px ${NEON_BLUE}55, 0 0 24px ${NEON_GREEN_E}22; }
          50%      { box-shadow: 0 0 20px ${NEON_BLUE}99, 0 0 40px ${NEON_GREEN_E}44; }
        }
        @keyframes earthCollPulse {
          0%, 100% { box-shadow: 0 0 16px ${NEON_GREEN_E}66; }
          50%      { box-shadow: 0 0 28px ${NEON_GREEN_E}cc, 0 0 48px ${NEON_BLUE}55; }
        }
        @keyframes ecModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ec-tile-img {
          animation: earthCollFloat 3.2s ease-in-out infinite;
        }
        .ec-planet {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background:
            /* continents — irregular green blobs */
            radial-gradient(ellipse 22% 16% at 28% 36%, rgba(34,160,80,0.95) 0%, rgba(22,120,60,0.7) 55%, transparent 72%),
            radial-gradient(ellipse 14% 11% at 60% 28%, rgba(20,140,70,0.9) 0%, transparent 65%),
            radial-gradient(ellipse 18% 13% at 70% 60%, rgba(28,150,75,0.95) 0%, transparent 65%),
            radial-gradient(ellipse 11% 9% at 36% 70%, rgba(34,170,80,0.95) 0%, transparent 65%),
            radial-gradient(ellipse 9% 7% at 50% 84%, rgba(40,160,75,0.85) 0%, transparent 65%),
            radial-gradient(ellipse 8% 6% at 18% 72%, rgba(34,150,80,0.85) 0%, transparent 65%),
            radial-gradient(ellipse 12% 9% at 82% 22%, rgba(28,140,70,0.85) 0%, transparent 65%),
            /* white clouds */
            radial-gradient(ellipse 28% 6% at 25% 22%, rgba(255,255,255,0.45) 0%, transparent 70%),
            radial-gradient(ellipse 20% 5% at 70% 78%, rgba(255,255,255,0.4) 0%, transparent 70%),
            /* base ocean sphere with highlight */
            radial-gradient(circle at 30% 28%, #93c5fd 0%, #3b82f6 35%, #1d4ed8 75%, #0c2d72 100%);
          background-size: 100% 100%;
          animation: ecPlanetSpin 16s linear infinite;
          box-shadow:
            inset -8px -10px 18px rgba(8,18,50,0.65),
            inset 6px 8px 14px rgba(180,210,255,0.55),
            0 0 10px rgba(120,170,255,0.55);
          position: relative;
          overflow: hidden;
        }
        @keyframes ecPlanetSpin {
          from { background-position:
            0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%; }
          to   { background-position:
            300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 0% 50%; }
        }
        .ec-planet::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 70% 75%, transparent 55%, rgba(0,0,0,0.55) 100%);
          pointer-events: none;
        }
        .ec-planet-lg {
          box-shadow:
            inset -16px -20px 32px rgba(8,18,50,0.65),
            inset 12px 14px 26px rgba(180,210,255,0.65),
            0 0 22px rgba(120,170,255,0.6);
        }
        .ec-tile-frame {
          animation: earthCollGlow 2.6s ease-in-out infinite;
        }
        .ec-buy-btn {
          background: linear-gradient(135deg, ${NEON_GREEN_E}, ${NEON_BLUE});
          color: #02143a;
          font-weight: 900;
          letter-spacing: 0.05em;
          border: none;
          border-radius: 12px;
          padding: 14px 20px;
          cursor: pointer;
          animation: earthCollPulse 2.4s ease-in-out infinite;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .ec-buy-btn:active { transform: scale(0.96); }
        .ec-buy-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; filter: grayscale(0.4); }
        .ec-modal-card {
          animation: ecModalIn 0.28s cubic-bezier(0.2,0.9,0.3,1.2);
        }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label="Earth Collection Limited"
        style={{
          position: "fixed",
          left: 12,
          top: 200,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(8,12,28,0.78)",
          border: `1.5px solid ${NEON_BLUE}66`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        className="ec-tile-frame"
        data-testid="button-earth-collection"
      >
        <div className="ec-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 6px ${NEON_BLUE}aa)` }}>
          <div className="ec-planet" aria-label="Earth Collection planet" />
        </div>
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,6,16,0.74)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "140px 18px 24px",
            overflowY: "auto",
          }}
        >
          <div
            className="ec-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, rgba(12,14,28,0.96), rgba(8,10,22,0.98))",
              border: `1px solid ${NEON_BLUE}55`,
              boxShadow: `0 0 36px ${NEON_BLUE}33, 0 0 64px ${NEON_GREEN_E}22`,
              borderRadius: 18,
              padding: 22,
              color: "#fff",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12, width: 32, height: 32,
                borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16,
                fontWeight: 900, cursor: "pointer", lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 18, marginTop: 6,
            }}>
              <div
                className="ec-tile-frame"
                style={{
                  width: 180, height: 180, borderRadius: 18,
                  background: "rgba(8,12,28,0.6)",
                  border: `2px solid ${NEON_BLUE}66`,
                  padding: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <div className="ec-tile-img" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 12px ${NEON_BLUE}cc)` }}>
                  <div className="ec-planet ec-planet-lg" aria-label="Earth Collection planet" />
                </div>
              </div>
            </div>

            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 20, fontWeight: 900, letterSpacing: "0.18em",
              textAlign: "center", marginBottom: 6, color: "#fff",
              textShadow: `0 0 12px ${NEON_BLUE}88, 0 0 24px ${NEON_GREEN_E}44`,
              textTransform: "uppercase",
            }}>
              Earth Collection Limited
            </div>
            <div style={{
              fontSize: 12, color: "rgba(255,255,255,0.65)", textAlign: "center",
              lineHeight: 1.5, marginBottom: 18, padding: "0 6px",
            }}>
              Unlock 4 exclusive earth slots. Speed: <b style={{ color: NEON_BLUE }}>0.017 TON/day</b>. Requires SUN module.
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 6, marginBottom: 14,
              fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              color: soldOut ? "#ff5577" : NEON_GREEN_E, fontWeight: 800,
            }}>
              {stock
                ? soldOut
                  ? "SOLD OUT"
                  : <>Limited: <b style={{ color: "#fff" }}>{stock.remaining}</b> / {stock.max} left</>
                : "Loading…"}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "14px 16px", borderRadius: 14,
              background: `linear-gradient(135deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04))`,
              border: `1px solid ${NEON_GREEN_E}44`,
            }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Price</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>7 TON</span>
              </div>
              <button
                className="ec-buy-btn"
                onClick={handleBuy}
                disabled={buying || soldOut || sunCount <= 0}
                title={sunCount <= 0 ? "Devi possedere il SOLE per sbloccare questa collezione" : undefined}
                data-testid="button-buy-earth-collection"
              >
                {soldOut
                  ? "SOLD OUT"
                  : buying
                  ? "PROCESSING…"
                  : sunCount <= 0
                  ? "🔒 SOLE RICHIESTO"
                  : ownedBundles > 0
                  ? `BUY ANOTHER (OWN ${ownedBundles})`
                  : "BUY"}
              </button>
            </div>

            {message && (
              <div style={{
                marginTop: 12, padding: "8px 12px", borderRadius: 8,
                background: "rgba(59,130,246,0.08)", border: `1px solid ${NEON_BLUE}33`,
                fontSize: 12, color: NEON_BLUE, textAlign: "center",
              }}>
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const EarthCollectionWidget = memo(EarthCollectionWidgetBase);
