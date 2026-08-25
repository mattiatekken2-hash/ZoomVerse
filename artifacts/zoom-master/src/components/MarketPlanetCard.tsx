import {
  LAB_STARDUST_DISPLAY_NAME,
  LAB_STARDUST_FARM_RATE,
  LAB_ZOOM_DISPLAY_NAME,
  LAB_ZOOM_FARM_RATE,
  isLabStardustShapeId,
  isLabZoomShapeId,
  resolveLabStardustShapeId,
  resolveLabShapeIdFromPlanet,
  labMarketPathForPlanet,
  labForgeChromeForPlanet,
  labModelDisplayName,
  formatMarketListingPrice,
  parseMarketPriceCurrency,
  type LabMarketPath,
} from "@workspace/game-models";
import { useGlThumbsPaused } from "../utils/glThumbGate";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import { ZoomCubeIcon } from "./ZoomCubeIcon";

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const PATH_THEME: Record<LabMarketPath, { accent: string; glow: string; label: string; yieldUnit: string }> = {
  zoom: { accent: "#7bed9f", glow: "#2ed573", label: "ZOOM", yieldUnit: "ZOOM/h" },
  stardust: { accent: "#ffd740", glow: "#ffc107", label: "★ STARDUST", yieldUnit: "★/h" },
};

export interface MarketPlanetListingView {
  id: string;
  /** Legacy rarity field — ignored for Lab market UI. */
  name?: string;
  price: number;
  rate: number;
  seller: string;
  isOwn: boolean;
  serverId?: number;
  planetFloat?: number | null;
  displayName?: string | null;
  farmDurationHours?: number | null;
  modelId?: string | null;
  shapeId?: string | null;
  planetType?: string | null;
  priceCurrency?: "zmc" | "gram" | "zoom" | "stardust" | null;
  marketPath?: LabMarketPath | null;
  planetId?: string | null;
}

interface Props {
  listing: MarketPlanetListingView;
  canBuy: boolean;
  highlighted?: boolean;
  suspendGl?: boolean;
  onBuy: () => void;
  onUnlist?: () => void;
  statusText?: string;
}

function resolveTitle(listing: MarketPlanetListingView, path: LabMarketPath): string {
  const labName = labModelDisplayName({
    shapeId: listing.shapeId,
    displayName: listing.displayName,
  });
  if (labName) return labName;
  if (listing.displayName && listing.displayName.trim()) return listing.displayName;
  if (isLabZoomShapeId(listing.shapeId)) return LAB_ZOOM_DISPLAY_NAME[listing.shapeId];
  if (isLabStardustShapeId(listing.shapeId)) {
    const id = resolveLabStardustShapeId(listing.shapeId)!;
    return LAB_STARDUST_DISPLAY_NAME[id];
  }
  return path === "zoom" ? "ZOOM Model" : "Stardust Model";
}

function resolveRate(listing: MarketPlanetListingView, path: LabMarketPath): number {
  if (listing.rate > 0) return listing.rate;
  if (isLabZoomShapeId(listing.shapeId)) return LAB_ZOOM_FARM_RATE[listing.shapeId];
  if (isLabStardustShapeId(listing.shapeId)) {
    const id = resolveLabStardustShapeId(listing.shapeId)!;
    return LAB_STARDUST_FARM_RATE[id];
  }
  return path === "stardust" ? 0.22 : 3.5;
}

export function MarketPlanetCard({
  listing,
  canBuy,
  highlighted = false,
  suspendGl = false,
  onBuy,
  onUnlist,
  statusText,
}: Props) {
  const path = listing.marketPath ?? labMarketPathForPlanet({
    shapeId: listing.shapeId,
    displayName: listing.displayName,
    rate: listing.rate,
  });

  const theme = PATH_THEME[path] ?? PATH_THEME.zoom;
  const title = resolveTitle(listing, path);
  const rate = resolveRate(listing, path);
  const glPaused = useGlThumbsPaused();
  const hideGl = suspendGl || glPaused;

  const shapeId = resolveLabShapeIdFromPlanet({
    shapeId: listing.shapeId,
    displayName: listing.displayName,
  }) ?? listing.shapeId ?? undefined;
  const chrome = labForgeChromeForPlanet({
    shapeId,
    displayName: listing.displayName,
  }) ?? { color: theme.accent, glowColor: theme.glow };
  const accent = chrome.color;
  const glow = chrome.glowColor;

  const fakePlanet = {
    id: listing.id,
    name: "BASIC" as const,
    color: chrome.color,
    glowColor: chrome.glowColor,
    rate,
    craftCost: 0,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: true,
    isFarmingActive: false,
    marketPrice: listing.price,
    displayName: title,
    shapeId,
  };

  return (
    <article
      id={listing.serverId != null ? `listing-card-${listing.serverId}` : undefined}
      className={`lab-market-card${highlighted ? " lab-market-card--focus" : ""}`}
      style={{
        ["--mkt-accent" as string]: accent,
        ["--mkt-glow" as string]: glow,
        ["--mkt-accent-a" as string]: rgba(accent, 0.22),
      }}
      data-testid={`listing-${listing.id}`}
      data-path={path}
    >
      <div className="lab-market-card__stage">
        <div className="lab-market-card__orb" aria-hidden>
          {hideGl ? (
            <div style={{ width: 132, height: 132, flexShrink: 0 }} aria-hidden />
          ) : (
            <PlanetVoxelThumb planet={fakePlanet} size={132} animate />
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
            +{rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} {theme.yieldUnit}
          </span>
          <span className="lab-market-card__price">{formatMarketListingPrice(listing.price, parseMarketPriceCurrency(listing.priceCurrency))}</span>
        </div>
        <p className="lab-market-card__seller">
          {listing.isOwn ? "Your listing" : listing.seller}
        </p>

        <div className="lab-market-card__actions">
          {statusText ? (
            <div className="lab-market-card__status">{statusText}</div>
          ) : listing.isOwn ? (
            <>
              {onUnlist ? (
                <button type="button" onClick={onUnlist} className="lab-market-card__delist">
                  Delist
                </button>
              ) : (
                <div className="lab-market-card__status">Online</div>
              )}
            </>
          ) : (
            <button
              type="button"
              disabled={!canBuy}
              onClick={onBuy}
              className="lab-market-card__buy"
            >
              {canBuy ? "Buy" : "Can't buy"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
