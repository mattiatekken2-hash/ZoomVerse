import {
  LAB_STARDUST_POT_SHAPE_ID,
  LAB_ZOOM_DISPLAY_NAME,
  LAB_ZOOM_FARM_RATE,
  isLabZoomShapeId,
  labMarketPathForShapeId,
  type LabMarketPath,
} from "@workspace/game-models";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const PATH_THEME: Record<LabMarketPath, { accent: string; glow: string; label: string; yieldUnit: string }> = {
  zoom: { accent: "#7bed9f", glow: "#2ed573", label: "$ZOOM", yieldUnit: "$ZOOM/h" },
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
}

interface Props {
  listing: MarketPlanetListingView;
  canBuy: boolean;
  sharing?: boolean;
  highlighted?: boolean;
  suspendGl?: boolean;
  onBuy: () => void;
  onUnlist: () => void;
  onShare?: () => void;
  statusText?: string;
}

function resolveTitle(listing: MarketPlanetListingView, path: LabMarketPath): string {
  if (listing.displayName && listing.displayName.trim()) return listing.displayName;
  if (isLabZoomShapeId(listing.shapeId)) return LAB_ZOOM_DISPLAY_NAME[listing.shapeId];
  if (listing.shapeId === LAB_STARDUST_POT_SHAPE_ID) return "Stardust Pot";
  return path === "zoom" ? "ZOOM Model" : "Stardust Pot";
}

function resolveRate(listing: MarketPlanetListingView, path: LabMarketPath): number {
  if (listing.rate > 0) return listing.rate;
  if (isLabZoomShapeId(listing.shapeId)) return LAB_ZOOM_FARM_RATE[listing.shapeId];
  return path === "stardust" ? 0.22 : 3.5;
}

export function MarketPlanetCard({
  listing,
  canBuy,
  sharing = false,
  highlighted = false,
  suspendGl = false,
  onBuy,
  onUnlist,
  onShare,
  statusText,
}: Props) {
  const path = labMarketPathForShapeId(listing.shapeId);
  if (!path) return null;

  const theme = PATH_THEME[path];
  const accent = theme.accent;
  const title = resolveTitle(listing, path);
  const rate = resolveRate(listing, path);

  const fakePlanet = {
    id: listing.id,
    name: "BASIC" as const,
    color: accent,
    glowColor: theme.glow,
    rate,
    craftCost: 0,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: true,
    isFarmingActive: false,
    marketPrice: listing.price,
    displayName: title,
    shapeId: listing.shapeId ?? undefined,
  };

  return (
    <article
      id={listing.serverId != null ? `listing-card-${listing.serverId}` : undefined}
      className={`lab-market-card${highlighted ? " lab-market-card--focus" : ""}`}
      style={{
        ["--mkt-accent" as string]: accent,
        ["--mkt-glow" as string]: theme.glow,
        ["--mkt-accent-a" as string]: rgba(accent, 0.22),
      }}
      data-testid={`listing-${listing.id}`}
      data-path={path}
    >
      <div className="lab-market-card__stage">
        <div className="lab-market-card__orb" aria-hidden>
          <PlanetVoxelThumb planet={fakePlanet} size={132} animate suspendGl={suspendGl} />
        </div>
        <span className="lab-market-card__path">{theme.label}</span>
      </div>

      <div className="lab-market-card__body">
        <h3 className="lab-market-card__title">{title}</h3>
        <div className="lab-market-card__meta">
          <span className="lab-market-card__yield">
            +{rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} {theme.yieldUnit}
          </span>
          <span className="lab-market-card__price">{listing.price.toFixed(2)} GRAM</span>
        </div>
        <p className="lab-market-card__seller">
          {listing.isOwn ? "Your listing" : listing.seller}
        </p>

        <div className="lab-market-card__actions">
          {statusText ? (
            <div className="lab-market-card__status">{statusText}</div>
          ) : listing.isOwn ? (
            <>
              {listing.serverId != null && onShare && (
                <button
                  type="button"
                  disabled={sharing}
                  onClick={onShare}
                  className="lab-market-card__share"
                  aria-label="Share listing"
                >
                  {sharing ? "…" : "Share"}
                </button>
              )}
              <button type="button" onClick={onUnlist} className="lab-market-card__delist">
                Delist
              </button>
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
