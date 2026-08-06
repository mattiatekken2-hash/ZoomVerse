import { memo, useState, useEffect, useCallback } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { claimDailyStellaRedstar, confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";
import { haptic } from "../utils/haptic";

const WALLET = "UQB7vku7fJS196hYJa86PjQW9rq0Q7hzyqH97Ki5hJHesIdr";
const PRICE_TON = 60;
const STELLA_RED = "#dc143c";
const STELLA_GLOW = "#ff2244";

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  lastClaimAt?: number;
  onClaim?: (newRedStarBalance: number) => void;
  onUnlocked?: () => void;
}

function fmt(ms: number): string {
  if (ms <= 0) return "0s";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function StellaRossaCollectionWidgetBase({
  telegramId,
  unlocked = false,
  ownedBundles = 0,
  lastClaimAt = 0,
  onClaim,
  onUnlocked,
}: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const nextClaimAt = lastClaimAt + CLAIM_COOLDOWN_MS;
  const canClaim = unlocked && now >= nextClaimAt;
  const cooldownRemaining = Math.max(0, nextClaimAt - now);

  const handleClaim = useCallback(async () => {
    if (!telegramId || !canClaim || claiming) return;
    haptic();
    setClaiming(true);
    try {
      const r = await claimDailyStellaRedstar(telegramId);
      if (r.ok) {
        setMsg(`+${r.awarded} ★ Redstar claimed!`);
        onClaim?.(r.newRedStarBalance ?? 0);
      } else {
        setMsg(r.error ?? "Claim failed");
      }
    } catch {
      setMsg("Claim failed");
    }
    setClaiming(false);
  }, [telegramId, canClaim, claiming, onClaim]);

  const handleBuy = useCallback(async () => {
    if (!telegramId) { setMsg("Telegram ID missing"); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMsg("Connect your GRAM wallet first");
      return;
    }
    haptic();
    setBuying(true);
    try {
      const nanotons = BigInt(Math.round(PRICE_TON * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(
        telegramId,
        "stella_rossa_collection",
        connectedAddress,
        PRICE_TON,
        boc,
      );
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMsg("🔴 REDSTAR Collection activated!");
        onUnlocked?.();
        window.dispatchEvent(new Event("zoom-data-refresh"));
        setOpen(false);
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMsg("Verifying payment...");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMsg("🔴 REDSTAR Collection activated!");
          onUnlocked?.();
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setOpen(false);
        } else if (final?.status === "failed") {
          setMsg("Payment not detected on chain");
        } else {
          setMsg("Payment pending — check back shortly");
        }
      } else {
        setMsg(confirmResult.error || "Purchase failed");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMsg("Cancelled");
      } else {
        setMsg("Purchase failed");
      }
    }
    setBuying(false);
  }, [telegramId, connectedAddress, tonConnectUI, onUnlocked]);

  return (
    <>
      <style>{`
        @keyframes srFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50%       { transform: translateY(-3px) scale(1.02); }
        }
        @keyframes srGlow {
          0%, 100% { box-shadow: 0 0 12px ${STELLA_RED}88, 0 0 22px ${STELLA_RED}33; }
          50%       { box-shadow: 0 0 20px ${STELLA_GLOW}cc, 0 0 38px ${STELLA_RED}55; }
        }
        .sr-btn-tile { animation: srGlow 2.6s ease-in-out infinite; }
        .sr-btn-icon { animation: srFloat 3.2s ease-in-out infinite; }
      `}</style>

      {/* Fixed floating button — 2x2 grid lower-left */}
      <button
        onClick={() => setOpen(true)}
        aria-label="REDSTAR Collection"
        className="sr-btn-tile"
        style={{
          position: "fixed",
          left: 12,
          top: 250,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(20,0,4,0.88)",
          border: `1.5px solid ${unlocked ? STELLA_RED + "88" : "rgba(255,255,255,0.18)"}`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-stella-rossa"
      >
        <div
          className="sr-btn-icon"
          style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 0,
          }}
        >
          {unlocked ? (
            <>
              <svg width={24} height={24} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: `drop-shadow(0 0 6px ${STELLA_RED}cc)` }}>
                <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
                <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
                <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
                <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
                <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
                <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
                <rect x="4" y="11" width="4" height="1" fill="#880011" />
                <rect x="5" y="1" width="1" height="1" fill="#ff88aa" />
                <rect x="4" y="3" width="2" height="1" fill="#ff6688" />
              </svg>
              {canClaim && (
                <span style={{ fontSize: 7, fontWeight: 900, color: STELLA_GLOW, letterSpacing: "0.04em", marginTop: -2 }}>CLAIM</span>
              )}
            </>
          ) : (
            <>
              {/* Locked padlock icon */}
              <svg width={20} height={20} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 4px rgba(220,20,60,0.6))" }}>
                <rect x="3" y="5" width="6" height="5" fill="#dc143c" opacity="0.7" />
                <rect x="4" y="3" width="4" height="3" fill="none" stroke="#dc143c" strokeWidth="1.2" rx="2" />
                <rect x="5" y="7" width="2" height="2" fill="#ff8899" />
              </svg>
              <span style={{ fontSize: 6, fontWeight: 900, color: "rgba(220,20,60,0.8)", letterSpacing: "0.04em", marginTop: 1 }}>60 GRAM</span>
            </>
          )}
        </div>
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(4,0,2,0.88)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "calc(env(safe-area-inset-top, 0px) + 130px) 14px calc(env(safe-area-inset-bottom, 0px) + 80px)",
            overflowY: "auto",
          }}
          data-testid="modal-stella-rossa"
        >
          <div style={{
            position: "relative", width: "100%", maxWidth: 440,
            background: `linear-gradient(180deg, rgba(20,0,4,0.97), rgba(8,0,2,0.99))`,
            border: `1px solid ${STELLA_RED}55`,
            boxShadow: `0 0 40px ${STELLA_RED}33`,
            borderRadius: 18, padding: 22, color: "#fff",
          }}>
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12,
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >✕</button>

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <svg width={36} height={36} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ marginBottom: 0, filter: `drop-shadow(0 0 8px #ff2244cc)` }}>
                <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
                <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
                <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
                <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
                <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
                <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
                <rect x="4" y="11" width="4" height="1" fill="#880011" />
                <rect x="5" y="1" width="1" height="1" fill="#ff88aa" />
                <rect x="4" y="3" width="2" height="1" fill="#ff6688" />
              </svg>
              <div style={{
                fontFamily: "'Orbitron', 'Inter', sans-serif",
                fontSize: 15, fontWeight: 900, letterSpacing: "0.18em",
                textTransform: "uppercase", color: STELLA_GLOW,
                textShadow: `0 0 14px ${STELLA_RED}99`,
              }}>REDSTAR</div>
              <div style={{ fontSize: 10, color: "rgba(255,100,100,0.65)", marginTop: 4, letterSpacing: "0.08em" }}>
                EXCLUSIVE COLLECTION
              </div>
            </div>

            {/* Stats (shown only when unlocked) */}
            {unlocked && (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: 8, marginBottom: 16,
                }}>
                  {[
                    { label: "PLANETS", value: `${ownedBundles * 4}` },
                    { label: "GRAM/MONTH", value: `${(ownedBundles * 4 * 0.005208 * 720).toFixed(1)}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{
                      background: "rgba(80,0,15,0.55)", border: `1px solid ${STELLA_RED}33`,
                      borderRadius: 10, padding: "10px 12px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{value}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,120,120,0.6)", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Planet slots */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 20 }}>
                  {["SR-1", "SR-2", "SR-3", "SR-4"].map((label) => (
                    <div key={label} style={{
                      borderRadius: 8, background: "rgba(60,0,12,0.65)",
                      border: `1px solid ${STELLA_RED}40`,
                      padding: "8px 4px", textAlign: "center",
                    }}>
                      <svg width={18} height={18} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ display: "block", margin: "0 auto 2px", filter: "drop-shadow(0 0 4px #ff2244aa)" }}>
                        <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
                        <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
                        <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
                        <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
                        <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
                        <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
                        <rect x="4" y="11" width="4" height="1" fill="#880011" />
                      </svg>
                      <div style={{ fontSize: 8, color: "rgba(255,100,100,0.75)", fontWeight: 700, letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: 7, color: "rgba(255,80,80,0.45)", marginTop: 1 }}>GRAM/h</div>
                    </div>
                  ))}
                </div>

                {/* Daily Redstar claim */}
                <div style={{
                  background: "rgba(60,0,12,0.55)", border: `1px solid ${STELLA_RED}40`,
                  borderRadius: 12, padding: "14px 16px", marginBottom: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: STELLA_GLOW, letterSpacing: "0.1em" }}>
                        DAILY REDSTAR
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,120,120,0.6)", marginTop: 2 }}>
                        Claim 10 ★ every 24 hours
                      </div>
                    </div>
                    <svg width={22} height={22} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 5px #dc143ccc)" }}>
                      <rect x="5" y="0" width="2" height="2" fill="#dc143c" />
                      <rect x="3" y="2" width="6" height="2" fill="#dc143c" />
                      <rect x="1" y="4" width="10" height="2" fill="#dc143c" />
                      <rect x="0" y="5" width="12" height="2" fill="#ff2244" />
                      <rect x="1" y="7" width="10" height="2" fill="#dc143c" />
                      <rect x="3" y="9" width="6" height="2" fill="#dc143c" />
                      <rect x="5" y="11" width="2" height="1" fill="#a00020" />
                    </svg>
                  </div>
                  <button
                    disabled={!canClaim || claiming}
                    onClick={handleClaim}
                    style={{
                      width: "100%", padding: "10px 0", borderRadius: 8,
                      fontWeight: 800, fontSize: 12, letterSpacing: "0.08em",
                      cursor: canClaim && !claiming ? "pointer" : "not-allowed",
                      transition: "all 0.2s",
                      background: canClaim
                        ? `linear-gradient(135deg, ${STELLA_RED}cc, ${STELLA_GLOW}99)`
                        : "rgba(255,255,255,0.05)",
                      border: `1px solid ${canClaim ? STELLA_GLOW : "rgba(255,255,255,0.08)"}`,
                      color: canClaim ? "#fff" : "rgba(255,255,255,0.3)",
                      boxShadow: canClaim ? `0 0 16px ${STELLA_RED}55` : "none",
                      opacity: claiming ? 0.6 : 1,
                    }}
                  >
                    {claiming ? "CLAIMING..." : canClaim ? "CLAIM 10 ★ REDSTAR" : `Next in ${fmt(cooldownRemaining)}`}
                  </button>
                </div>
              </>
            )}

            {/* Purchase section — shown when not unlocked OR to buy more bundles */}
            <div style={{
              background: "rgba(40,0,8,0.6)", border: `1px solid ${STELLA_RED}33`,
              borderRadius: 12, padding: "16px", marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: STELLA_GLOW, letterSpacing: "0.1em", marginBottom: 6 }}>
                {unlocked ? "BUY ANOTHER BUNDLE" : "UNLOCK COLLECTION"}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,150,150,0.65)", marginBottom: 12, lineHeight: 1.5 }}>
                {unlocked
                  ? `Add 4 more red star planets (+${(4 * 0.005208 * 720).toFixed(1)} GRAM/month)`
                  : "4 exclusive red star planets · 15 GRAM/month · farms automatically"
                }
              </div>
              <button
                onClick={handleBuy}
                disabled={buying}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 8,
                  fontWeight: 800, fontSize: 13, letterSpacing: "0.08em",
                  cursor: buying ? "not-allowed" : "pointer",
                  background: buying
                    ? "rgba(255,255,255,0.08)"
                    : `linear-gradient(135deg, #8b0000cc, ${STELLA_RED}cc)`,
                  border: `1px solid ${STELLA_GLOW}66`,
                  color: buying ? "rgba(255,255,255,0.3)" : "#fff",
                  boxShadow: buying ? "none" : `0 0 18px ${STELLA_RED}44`,
                  opacity: buying ? 0.7 : 1,
                  transition: "all 0.2s",
                }}
              >
                {buying ? "PROCESSING..." : `BUY — ${PRICE_TON} TON`}
              </button>
            </div>

            {/* Feedback */}
            {msg && (
              <div style={{
                textAlign: "center", fontSize: 12, fontWeight: 700,
                color: msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("not") ? "#ff5252" : STELLA_GLOW,
                padding: "6px 0",
              }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const StellaRossaCollectionWidget = memo(StellaRossaCollectionWidgetBase);
