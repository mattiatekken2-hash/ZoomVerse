import { memo, useState, useEffect, useCallback } from "react";
import { claimDailyStellaRedstar } from "../utils/api";
import { haptic } from "../utils/haptic";

const STELLA_RED = "#dc143c";
const STELLA_GLOW = "#ff2244";

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
  lastClaimAt?: number;
  onClaim?: (newRedStarBalance: number) => void;
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
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
        setMsg(`+${r.awarded} ⭐ Redstar claimed!`);
        onClaim?.(r.newRedStarBalance ?? 0);
      } else {
        setMsg(r.error ?? "Claim failed");
      }
    } catch {
      setMsg("Claim failed");
    }
    setClaiming(false);
  }, [telegramId, canClaim, claiming, onClaim]);

  if (!unlocked) return null;

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

      {/* Fixed floating button — 2x2 grid lower-left (below LabRank at top:170) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Stella Rossa Collection"
        className="sr-btn-tile"
        style={{
          position: "fixed",
          left: 12,
          top: 250,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(20,0,4,0.88)",
          border: `1.5px solid ${STELLA_RED}88`,
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
          <svg width={24} height={24} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: `drop-shadow(0 0 6px ${STELLA_RED}cc)` }}>
            <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
            <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
            <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
            <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
            <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
            <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
            <rect x="4" y="11" width="4" height="1" fill="#880011" />
            {/* Highlight */}
            <rect x="5" y="1" width="1" height="1" fill="#ff88aa" />
            <rect x="4" y="3" width="2" height="1" fill="#ff6688" />
          </svg>
          {canClaim && (
            <span style={{
              fontSize: 7, fontWeight: 900, color: STELLA_GLOW,
              letterSpacing: "0.04em", marginTop: -2,
            }}>CLAIM</span>
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
              }}>STELLA ROSSA</div>
              <div style={{ fontSize: 10, color: "rgba(255,100,100,0.65)", marginTop: 4, letterSpacing: "0.08em" }}>
                EXCLUSIVE COLLECTION
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 8, marginBottom: 16,
            }}>
              {[
                { label: "PLANETS", value: `${ownedBundles * 4}` },
                { label: "TON/h", value: `${(ownedBundles * 4 * 0.000521).toFixed(4)}` },
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

            {/* Planet slots preview */}
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
                  <div style={{ fontSize: 7, color: "rgba(255,80,80,0.45)", marginTop: 1 }}>TON/h</div>
                </div>
              ))}
            </div>

            {/* Daily Redstar claim */}
            <div style={{
              background: "rgba(60,0,12,0.55)", border: `1px solid ${STELLA_RED}40`,
              borderRadius: 12, padding: "14px 16px", marginBottom: 12,
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 8,
              }}>
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

            {/* Feedback message */}
            {msg && (
              <div style={{
                textAlign: "center", fontSize: 12, fontWeight: 700,
                color: msg.includes("fail") || msg.includes("fail") ? "#ff5252" : STELLA_GLOW,
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
