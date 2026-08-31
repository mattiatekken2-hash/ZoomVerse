import { useGlThumbsPaused } from "../utils/glThumbGate";
import type { Planet } from "../hooks/useGameState";
import {
  formatDuration,
  getFarmTimeRemaining,
  getPlanetFarmDurationHours,
  isFarmActive,
  isFarmExpired,
} from "../hooks/useGameState";
import { getPlanetDisplayName } from "../utils/planetNames";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { useT } from "../i18n/LanguageContext";
import { labForgeChromeForPlanet, labMarketPathForPlanet, type LabMarketPath } from "@workspace/game-models";

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
  /** My List only: 1h shop-shelf countdown. Never set on Farm cards. */
  shelfRemainingMs?: number;
  shelfExpired?: boolean;
  onRelist?: () => void;
  relistBusy?: boolean;
  relistFeeLabel?: string;
  vipLevel?: "NONE" | "BASE" | "PRO";
}

const PATH_THEME: Record<LabMarketPath, { accent: string; glow: string; label: string; yieldUnit: string }> = {
  zoom: { accent: "#7bed9f", glow: "#2ed573", label: "ZOOM", yieldUnit: "ZOOM/h" },
  stardust: { accent: "#ffd740", glow: "#ffc107", label: "★ STARDUST", yieldUnit: "★/h" },
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function formatYieldAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatShelfClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
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
  shelfRemainingMs,
  shelfExpired = false,
  onRelist,
  relistBusy = false,
  relistFeeLabel,
  vipLevel = "NONE",
}: FarmInventoryCardProps) {
  const { t } = useT();
  const glPaused = useGlThumbsPaused();
  const hideGl = suspendGl || glPaused;
  const compact = variant === "compact";
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const isListed = planet.isListedInMarket;
  const remaining = getFarmTimeRemaining(planet);
  const farmHours = getPlanetFarmDurationHours(planet);
  const isPlatinumNft = planet.name === "V1_NFT";

  const path: LabMarketPath = planet.name === "MUSHROOM"
    ? "stardust"
    : labMarketPathForPlanet(planet);
  const theme = PATH_THEME[path] ?? PATH_THEME.zoom;
  const chrome = labForgeChromeForPlanet(planet);
  const accent = chrome?.color ?? theme.accent;
  const glow = chrome?.glowColor ?? theme.glow;
  const reactivateColor = accent;
  const title = getPlanetDisplayName(planet);
  const hourRate = planet.name === "MUSHROOM" ? 5 : planet.rate;
  const cycleTotal = planet.name === "MUSHROOM" ? 5 : planet.rate * farmHours;
  const showCycle = farmHours >= 2 && planet.name !== "MUSHROOM";
  const orbSize = compact ? 112 : 132;

  return (
    <article
      className={`lab-market-card farm-inventory-card${compact ? " lab-market-card--compact" : ""}${className ? ` ${className}` : ""}`}
      style={{
        ["--mkt-accent" as string]: accent,
        ["--mkt-glow" as string]: glow,
        ["--mkt-accent-a" as string]: rgba(accent, 0.22),
        ["--farm-reactivate" as string]: reactivateColor,
        cursor: onCardClick ? "pointer" : undefined,
        width: compact ? 268 : "100%",
        maxWidth: compact ? 268 : undefined,
        height: compact ? undefined : "100%",
      }}
      onClick={onCardClick}
      data-testid={testId}
      data-path={path}
    >
      <div className="lab-market-card__stage">
        <div
          className="lab-market-card__orb"
          aria-hidden
        >
          {hideGl ? (
            <div style={{ width: orbSize, height: orbSize, flexShrink: 0 }} aria-hidden />
          ) : (
            <PlanetVoxelThumb
              planet={planet}
              size={orbSize}
              animate
              eager={eagerThumb}
              glDelayMs={glDelayMs}
              hiQuality={false}
            />
          )}
          {isPlatinumNft && (
            <span className="nft-badge absolute" style={{ top: -4, left: -4 }} aria-label="NFT">
              NFT
            </span>
          )}
        </div>
        <span className="lab-market-card__path">
          {path === "zoom" && (
            <span className="lab-market-card__zoom-mark">
              <ZoomCubeIcon size={14} />
            </span>
          )}
          {theme.label}
        </span>
      </div>

      <div className="lab-market-card__body">
        <h3 className="lab-market-card__title">{title}</h3>
        <div className="lab-market-card__meta">
          <span className="lab-market-card__yield">
            {path === "zoom" && <ZoomCubeIcon size={14} />}
            +{formatYieldAmount(hourRate)} {theme.yieldUnit}
          </span>
          {showCycle && (
            <span className="lab-market-card__price">
              {formatYieldAmount(cycleTotal)} / {farmHours}H
            </span>
          )}
        </div>

        {!hideActions && (
          <div className="lab-market-card__actions">
            {active ? (
              <div
                className="lab-market-card__status"
                data-testid={`status-farming-${planet.id}`}
              >
                {formatDuration(remaining)}
              </div>
            ) : isListed ? (
              <div className="flex flex-col gap-1.5 w-full">
                {shelfRemainingMs != null && !shelfExpired && (
                  <div
                    className="lab-market-card__status"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t("market.shelfLive", { t: formatShelfClock(shelfRemainingMs) })}
                  </div>
                )}
                {shelfExpired && onRelist && (
                  <button
                    type="button"
                    disabled={relistBusy}
                    className="lab-market-card__buy"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (relistBusy) return;
                      onRelist();
                    }}
                  >
                    <span>{t("market.relist").toUpperCase()}</span>
                    {relistFeeLabel ? (
                      <span className="farm-inventory-card__reactivate-cost">{relistFeeLabel}</span>
                    ) : null}
                  </button>
                )}
                {shelfExpired && !onRelist && (
                  <div className="lab-market-card__status">{t("market.shelfExpired")}</div>
                )}
                <button
                  type="button"
                  disabled={listedActionDisabled || !onUnlist}
                  className="lab-market-card__delist"
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
              </div>
            ) : expired ? (
              <button
                type="button"
                className="farm-inventory-card__reactivate"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartFarm?.();
                }}
                data-testid={`btn-reactivate-${planet.id}`}
              >
                <span>{vipLevel === "PRO" ? t("farm.reactivateFreeVipPro") : t("farm.reactivate").toUpperCase()}</span>
                <span className="farm-inventory-card__reactivate-cost">
                  {vipLevel === "PRO" ? t("farm.reactivateCostVipPro") : t("farm.reactivateCost")}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="lab-market-card__buy"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartFarm?.();
                }}
                data-testid={`btn-farm-${planet.id}`}
              >
                {t("farm.startFarmBtn")}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
