import type { Planet } from "../hooks/useGameState";
import {
  formatDuration,
  getFarmTimeRemaining,
  getPlanetDisplayColors,
  isFarmActive,
  isFarmExpired,
} from "../hooks/useGameState";
import { getPlanetDisplayName } from "../utils/planetNames";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { WalletStarIcon } from "./WalletStarIcon";
import { useT } from "../i18n/LanguageContext";
import { isLabForgeGeneratorPlanet, isLabStardustShapeId } from "@workspace/game-models";

export type FarmCardVariant = "grid" | "compact";

interface FarmInventoryCardProps {
  planet: Planet;
  variant?: FarmCardVariant;
  suspendGl?: boolean;
  onCardClick?: () => void;
  onStartFarm?: () => void;
  onUnlist?: () => void;
  className?: string;
  testId?: string;
  /** Load voxel thumb immediately (Lab reveal). */
  eagerThumb?: boolean;
  /** Stagger WebGL init on Farm grid. */
  glDelayMs?: number;
  /** Hide START FARM / REACTIVATE footer (Lab reveal card). */
  hideActions?: boolean;
  /** Label for the listed-state footer button (Market My List uses Remove). */
  listedActionLabel?: string;
  /** Disable Remove when Farm slots are full. */
  listedActionDisabled?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,215,0,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function formatYieldAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function FarmInventoryCard({
  planet,
  variant = "grid",
  suspendGl = false,
  onCardClick,
  onStartFarm,
  onUnlist,
  className = "",
  testId,
  eagerThumb = false,
  glDelayMs = 0,
  hideActions = false,
  listedActionLabel,
  listedActionDisabled = false,
}: FarmInventoryCardProps) {
  const { t } = useT();
  const compact = variant === "compact";
  const displayColors = getPlanetDisplayColors(planet);
  const cardColor = displayColors.color;
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const isListed = planet.isListedInMarket;
  const remaining = getFarmTimeRemaining(planet);
  const farmHours = planet.farmDurationHours ?? 1;
  const planetFloat = !isLabForgeGeneratorPlanet(planet) && isFloatablePlanet(planet)
    ? getDisplayFloat(planet)
    : undefined;
  const isPlatinumNft = planet.name === "V1_NFT";
  const isStardustYield = planet.name === "MUSHROOM" || isLabStardustShapeId(planet.shapeId);
  const yieldIconSize = compact ? 10 : 11;
  const orbThumb = compact ? 112 : 128;
  const heroHeight = compact ? 168 : 188;
  const heroOrbTop = compact ? 14 : 16;

  const cycleTotal = planet.name === "MUSHROOM"
    ? 5
    : planet.rate * farmHours;
  const showCycleRow = farmHours >= 2 && planet.name !== "MUSHROOM";
  const hourLabel = planet.name === "MUSHROOM"
    ? "5 ★"
    : formatYieldAmount(planet.rate);
  const cycleLabel = planet.name === "MUSHROOM"
    ? "5 ★"
    : formatYieldAmount(cycleTotal);

  return (
    <div
      className={`farm-inventory-card ${className}`.trim()}
      style={{
        borderRadius: compact ? 18 : 16,
        border: `1.5px solid ${isListed ? rgba(cardColor, 0.55) : rgba(cardColor, 0.72)}`,
        background: "#08080c",
        boxShadow: `0 0 ${compact ? 16 : 12}px ${rgba(cardColor, 0.22)}, 0 8px 24px rgba(0,0,0,0.45)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: onCardClick ? "pointer" : undefined,
        width: compact ? 268 : "100%",
        maxWidth: compact ? 268 : undefined,
        minHeight: compact ? undefined : 308,
        height: compact ? undefined : "100%",
      }}
      onClick={onCardClick}
      data-testid={testId}
    >
      {/* Hero — rarity gradient + orb */}
      <div
        style={{
          position: "relative",
          flex: "0 0 auto",
          height: heroHeight,
          background: `linear-gradient(180deg, ${rgba(cardColor, 0.98)} 0%, ${rgba(cardColor, 0.72)} 32%, ${rgba(cardColor, 0.28)} 68%, #08080c 100%)`,
          padding: compact ? "0 10px" : "0 10px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: heroOrbTop,
            left: "50%",
            transform: "translateX(-50%)",
            width: orbThumb,
            height: orbThumb,
            filter: expired ? "grayscale(1) brightness(0.5)" : undefined,
            transition: "filter 0.3s",
          }}
        >
          <PlanetVoxelThumb
            planet={planet}
            size={orbThumb}
            animate
            suspendGl={suspendGl}
            eager={eagerThumb}
            glDelayMs={glDelayMs}
            hiQuality={false}
          />
          {isPlatinumNft && (
            <span className="nft-badge absolute" style={{ top: -4, left: -4 }} aria-label="NFT">
              NFT
            </span>
          )}
        </div>

        {/* Name pill — overlaps hero / stats */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: compact ? -11 : -14,
            transform: "translateX(-50%)",
            zIndex: 2,
            maxWidth: "90%",
          }}
        >
          <div
            style={{
              display: "block",
              width: "100%",
              border: compact ? 0 : `1px solid ${rgba(cardColor, 0.35)}`,
              borderRadius: 999,
              background: compact ? "#050508" : cardColor,
              color: compact ? "#fff" : "#08080c",
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: "0.12em",
              padding: compact ? "5px 14px" : "7px 18px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
              textAlign: "center",
            }}
          >
            {getPlanetDisplayName(planet)}
          </div>
        </div>
      </div>

      {/* Stats panel */}
      <div
        style={{
          background: "#08080c",
          padding: compact ? "18px 12px 10px" : "22px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: compact ? 4 : 6,
          flex: compact ? undefined : "1 1 auto",
        }}
      >
        {typeof planetFloat === "number" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: compact ? 10 : 12 }}>
            <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>{t("farm.floatLabel")}</span>
            <span style={{ color: "#fff", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {planetFloat.toFixed(4)}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : 4 }}>
          {showCycleRow && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: compact ? 10 : 11 }}>
              <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>{t("farm.farmLabel")}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#fff", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {isStardustYield
                  ? <WalletStarIcon variant="stardust" size={yieldIconSize} />
                  : <ZoomCubeIcon size={yieldIconSize} />}
                {cycleLabel} / {farmHours}H
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, fontSize: compact ? 10 : 11 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.88)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {isStardustYield
                ? <WalletStarIcon variant="stardust" size={yieldIconSize} />
                : <ZoomCubeIcon size={yieldIconSize} />}
              {hourLabel} / H
            </span>
          </div>
        </div>
      </div>

      {/* Action button */}
      {!hideActions && (
      <div style={{ padding: compact ? "8px 10px 10px" : "8px 10px 12px", marginTop: compact ? undefined : "auto", flexShrink: 0 }}>
        {active ? (
          <div
            style={{
              borderRadius: 12,
              padding: compact ? "9px 0" : "14px 0",
              textAlign: "center",
              fontSize: compact ? 12 : 14,
              fontWeight: 900,
              letterSpacing: "0.04em",
              color: "#ffffff",
              fontVariantNumeric: "tabular-nums",
            }}
            data-testid={`status-farming-${planet.id}`}
          >
            {formatDuration(remaining)}
          </div>
        ) : isListed ? (
          <button
            type="button"
            disabled={listedActionDisabled || !onUnlist}
            style={{
              width: "100%",
              borderRadius: 12,
              padding: compact ? "9px 0" : "14px 0",
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              background: listedActionDisabled ? "rgba(255,255,255,0.04)" : "rgba(255,82,82,0.12)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: listedActionDisabled ? "rgba(255,255,255,0.28)" : "#ff8a80",
              cursor: listedActionDisabled || !onUnlist ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (listedActionDisabled) return;
              onUnlist?.();
            }}
            data-testid={`btn-unlist-${planet.id}`}
          >
            {listedActionDisabled
              ? (listedActionLabel ?? "Slots full").toUpperCase()
              : (listedActionLabel ?? t("farm.delist")).toUpperCase()}
          </button>
        ) : expired ? (
          <button
            type="button"
            style={{
              width: "100%",
              borderRadius: 12,
              padding: compact ? "9px 0" : "14px 0",
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              background: "rgba(255,255,255,0.04)",
              border: `1.5px solid ${rgba(cardColor, 0.65)}`,
              color: cardColor,
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
            data-testid={`btn-reactivate-${planet.id}`}
          >
            <span>{t("farm.reactivate").toUpperCase()}</span>
            <span style={{ fontSize: compact ? 7 : 8, opacity: 0.85 }}>{t("farm.reactivateCost")}</span>
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
              lineHeight: 1.15,
              cursor: "pointer",
              touchAction: "manipulation",
              background: "#000000",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 3px 12px rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStartFarm?.();
            }}
            data-testid={`btn-farm-${planet.id}`}
          >
            <ZoomCubeIcon size={12} />
            {t("farm.startFarmBtn")}
          </button>
        )}
      </div>
      )}
    </div>
  );
}
