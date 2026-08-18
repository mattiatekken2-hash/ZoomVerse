import type { SunState } from "../hooks/useGameState";
import {
  SUN_CONFIG,
  formatDuration,
  getSunTimeRemaining,
  isSunActive,
  isSunExpired,
} from "../hooks/useGameState";
import { SunFarmThumb } from "./SunFarmThumb";

interface SunFarmInventoryCardProps {
  sun: SunState;
  sunMultiplier?: number;
  suspendGl?: boolean;
  onCardClick?: () => void;
  onStartFarm?: () => void;
  testId?: string;
}

const CARD_COLOR = "#ffee58";

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(255,238,88,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function SunFarmInventoryCard({
  sun,
  sunMultiplier = 1,
  suspendGl = false,
  onCardClick,
  onStartFarm,
  testId = "sun-inventory-card",
}: SunFarmInventoryCardProps) {
  const active = isSunActive(sun);
  const expired = isSunExpired(sun);
  const remaining = sun.isActive ? getSunTimeRemaining(sun) : 0;
  const farmHours = sun.farmDurationHours ?? 1;
  const displayRate = SUN_CONFIG.rate * Math.max(1, sunMultiplier);
  const cycleTotal = Math.round(displayRate * farmHours);
  const orbThumb = 128;
  const heroHeight = 188;

  return (
    <div
      className="farm-inventory-card"
      style={{
        borderRadius: 16,
        border: `1.5px solid ${rgba(CARD_COLOR, 0.72)}`,
        background: "#08080c",
        boxShadow: `0 0 12px ${rgba(CARD_COLOR, 0.22)}, 0 8px 24px rgba(0,0,0,0.45)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: onCardClick ? "pointer" : undefined,
        width: "100%",
        minHeight: 308,
      }}
      onClick={onCardClick}
      data-testid={testId}
    >
      <div
        style={{
          position: "relative",
          flex: "0 0 auto",
          height: heroHeight,
          background: `linear-gradient(180deg, ${rgba(CARD_COLOR, 0.98)} 0%, ${rgba(CARD_COLOR, 0.72)} 32%, ${rgba(CARD_COLOR, 0.28)} 68%, #08080c 100%)`,
          padding: "0 10px",
        }}
      >
        {active && (
          <div
            className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full pulse-soft"
            style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
          />
        )}
        {expired && (
          <div
            className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full"
            style={{ background: "#ff5252", boxShadow: "0 0 8px #ff5252" }}
          />
        )}

        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            width: orbThumb,
            height: orbThumb,
            filter: expired ? "grayscale(1) brightness(0.5)" : undefined,
            transition: "filter 0.3s",
          }}
        >
          <SunFarmThumb size={orbThumb} animate={active || expired} suspendGl={suspendGl} />
        </div>

        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: -14,
            transform: "translateX(-50%)",
            zIndex: 2,
            maxWidth: "90%",
          }}
        >
          <div
            style={{
              border: `1px solid ${rgba(CARD_COLOR, 0.35)}`,
              borderRadius: 999,
              background: CARD_COLOR,
              color: "#08080c",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.12em",
              padding: "7px 18px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
              textAlign: "center",
            }}
          >
            THE SUN{sunMultiplier > 1 ? ` ×${sunMultiplier}` : ""}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#08080c",
          padding: "22px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>Farm</span>
            <span style={{ color: "#fff", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {cycleTotal.toLocaleString()} / {farmHours}H
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>Rate</span>
            <span style={{ color: "rgba(255,255,255,0.88)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {displayRate.toLocaleString()} / H
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "8px 10px 12px", marginTop: "auto", flexShrink: 0 }}>
        {active ? (
          <div
            style={{
              borderRadius: 12,
              padding: "14px 0",
              textAlign: "center",
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "0.04em",
              color: "#ffffff",
              fontVariantNumeric: "tabular-nums",
            }}
            data-testid="status-sun-farming"
          >
            {formatDuration(remaining)}
          </div>
        ) : expired ? (
          <button
            type="button"
            style={{
              width: "100%",
              borderRadius: 12,
              padding: "14px 0",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              background: "rgba(255,255,255,0.04)",
              border: `1.5px solid ${rgba(CARD_COLOR, 0.65)}`,
              color: CARD_COLOR,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStartFarm?.();
            }}
            data-testid="btn-reactivate-sun"
          >
            <span>REACTIVATE</span>
            <span style={{ fontSize: 8, opacity: 0.85 }}>1 ★ Redstar</span>
          </button>
        ) : (
          <button
            type="button"
            style={{
              width: "100%",
              borderRadius: 10,
              padding: "9px 8px",
              minHeight: 38,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              cursor: "pointer",
              background: "#ffffff",
              color: "#0a0a0f",
              border: "1px solid rgba(255,255,255,0.92)",
              boxShadow: "0 3px 12px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStartFarm?.();
            }}
            data-testid="btn-farm-sun"
          >
            START FARM
          </button>
        )}
      </div>
    </div>
  );
}
