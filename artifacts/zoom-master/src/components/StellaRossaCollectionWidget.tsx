import { memo } from "react";
import { useT } from "../i18n/LanguageContext";

const STELLA_RED = "#dc143c";
const STELLA_DARK = "#8b0000";
const STELLA_GLOW = "#ff2244";

interface Props {
  telegramId: string | null;
  unlocked?: boolean;
  ownedBundles?: number;
}

function StellaRossaCollectionWidgetBase({ unlocked = false, ownedBundles = 0 }: Props) {
  const { t } = useT();

  return (
    <>
      <style>{`
        @keyframes stellaFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%       { transform: translateY(-5px) rotate(-0.5deg); }
        }
        @keyframes stellaGlow {
          0%, 100% { box-shadow: 0 0 12px ${STELLA_RED}88, 0 0 24px ${STELLA_DARK}44; }
          50%       { box-shadow: 0 0 22px ${STELLA_GLOW}cc, 0 0 44px ${STELLA_RED}55, 0 0 66px ${STELLA_DARK}33; }
        }
        @keyframes stellaPulse {
          0%, 100% { box-shadow: 0 0 16px ${STELLA_RED}88; }
          50%       { box-shadow: 0 0 28px ${STELLA_GLOW}dd, 0 0 52px ${STELLA_RED}44; }
        }
        @keyframes stellaModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .sr-tile-img  { animation: stellaFloat 3.8s ease-in-out infinite; }
        .sr-tile-frame { animation: stellaGlow 2.9s ease-in-out infinite; }
        .sr-dot { animation: stellaPulse 1.7s ease-in-out infinite; }
      `}</style>

      {/* Compact info card shown inline in Lab — no floating button */}
      <div
        className="sr-tile-frame"
        style={{
          margin: "8px 0",
          borderRadius: 14,
          border: `1.5px solid ${unlocked ? STELLA_RED : "rgba(220,20,60,0.35)"}`,
          background: unlocked
            ? "linear-gradient(135deg, rgba(60,0,10,0.92), rgba(25,0,5,0.97))"
            : "rgba(30,0,5,0.75)",
          padding: "14px 16px",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative star pattern */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, rgba(220,20,60,0.08) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          borderRadius: 14,
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          {/* Star orb */}
          <div
            className="sr-tile-img"
            style={{
              width: 52, height: 52, flexShrink: 0,
              borderRadius: 12,
              background: "rgba(10,0,3,0.8)",
              border: `1.5px solid ${STELLA_RED}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26,
            }}
          >
            🌺
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Orbitron', 'Inter', sans-serif",
              fontSize: 12, fontWeight: 900, letterSpacing: "0.15em",
              textTransform: "uppercase", color: STELLA_GLOW,
              textShadow: `0 0 10px ${STELLA_RED}88`,
              marginBottom: 3,
            }}>
              STELLA ROSSA COLLECTION
            </div>
            {unlocked ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span
                    className="sr-dot"
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: STELLA_GLOW,
                      boxShadow: `0 0 6px ${STELLA_RED}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: STELLA_GLOW, textTransform: "uppercase" }}>
                    {t("common.active") || "ACTIVE"}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,120,120,0.8)", lineHeight: 1.5 }}>
                  {ownedBundles * 4} stella planets · {(ownedBundles * 4 * 0.000521).toFixed(4)} TON/h
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: "rgba(220,20,60,0.65)", lineHeight: 1.5 }}>
                Exclusive collection · 4 TON-farming planets
                <br />
                <span style={{ color: "rgba(255,80,80,0.7)" }}>
                  Available via admin grant
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Planet slots preview when unlocked */}
        {unlocked && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, marginTop: 12,
          }}>
            {["STELLA1", "STELLA2", "STELLA3", "STELLA4"].map((type) => (
              <div
                key={type}
                style={{
                  borderRadius: 8,
                  background: "rgba(80,0,15,0.6)",
                  border: `1px solid ${STELLA_RED}44`,
                  padding: "6px 4px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 2 }}>🌺</div>
                <div style={{ fontSize: 8, color: "rgba(255,100,100,0.7)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  {type.replace("STELLA", "SR-")}
                </div>
                <div style={{ fontSize: 7, color: "rgba(255,80,80,0.55)", marginTop: 1 }}>
                  TON/h
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export const StellaRossaCollectionWidget = memo(StellaRossaCollectionWidgetBase);
