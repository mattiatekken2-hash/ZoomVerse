import type { PlanetType } from "../hooks/useGameState";
import { PLANET_CONFIG, getRarityColorsForModel } from "../hooks/useGameState";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import { ObjectThumb } from "./MysteryModel3D";
import { getModelById } from "@workspace/game-models";
import { PlanetFloatBar } from "./PlanetFloatBar";
import { getListingDisplayFloat, FLOAT_PLANET_TYPES } from "../utils/planetFloat";
import { getPlanetDisplayName } from "../utils/planetNames";

const RARITY_COLORS: Record<string, string> = {
  BASIC: "#8892b0",
  V1: "#f5fbff",
  V1_NFT: "#cfe4ff",
  RARE: "#4facfe",
  EPIC: "#c471ed",
  MYTHIC: "#ff4500",
  PLASMA: "#00e676",
  GOLD: "#ffd700",
};

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export interface MarketPlanetListingView {
  id: string;
  name: PlanetType;
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
  onBuy: () => void;
  onUnlist: () => void;
  onShare?: () => void;
  /** When set, replaces action buttons (e.g. live activity sold row). */
  statusText?: string;
}

export function MarketPlanetCard({
  listing,
  canBuy,
  sharing = false,
  highlighted = false,
  onBuy,
  onUnlist,
  onShare,
  statusText,
}: Props) {
  const cfg = PLANET_CONFIG[listing.name];
  if (!cfg) return null;
  const modelColors = listing.modelId ? getRarityColorsForModel(listing.name) : null;
  const cardColor = modelColors?.color ?? cfg.color;
  const rarityColor = RARITY_COLORS[listing.name] ?? cardColor;
  const displayName = listing.displayName || getPlanetDisplayName({
    id: listing.serverId?.toString() ?? listing.id,
    name: listing.name,
    rate: listing.rate,
    color: cfg.color,
    glowColor: cfg.glowColor,
    craftCost: 0,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: true,
    isFarmingActive: false,
  } as never);
  const listingFloat = FLOAT_PLANET_TYPES.has(listing.name)
    ? getListingDisplayFloat({ id: listing.serverId ?? listing.id, planetFloat: listing.planetFloat })
    : undefined;
  const fakePlanet = {
    id: listing.id,
    name: listing.name,
    color: cfg.color,
    glowColor: cfg.glowColor,
    rate: listing.rate,
    craftCost: 0,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: true,
    isFarmingActive: false,
    modelId: listing.modelId,
    shapeId: listing.shapeId,
  };

  return (
    <div
      id={listing.serverId != null ? `listing-card-${listing.serverId}` : undefined}
      className={`farm-inventory-card${highlighted ? " deeplink-focus-glow" : ""}`}
      style={{
        borderRadius: 16,
        border: `1.5px solid ${highlighted ? "rgba(0,230,255,0.7)" : rgba(cardColor, 0.72)}`,
        background: "#08080c",
        boxShadow: highlighted
          ? "0 0 26px rgba(0,230,255,0.55)"
          : `0 0 12px ${rgba(cardColor, 0.22)}, 0 8px 24px rgba(0,0,0,0.45)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 308,
      }}
      data-testid={`listing-${listing.id}`}
    >
      <div
        style={{
          position: "relative",
          height: 188,
          background: `linear-gradient(180deg, ${rgba(cardColor, 0.98)} 0%, ${rgba(cardColor, 0.72)} 32%, ${rgba(cardColor, 0.28)} 68%, #08080c 100%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            width: 128,
            height: 128,
          }}
        >
          {listing.modelId ? (
            <ObjectThumb
              shapeId={listing.shapeId || getModelById(listing.modelId)?.shapeId || "minifig"}
              primaryColor={modelColors!.color}
              accentColor={modelColors!.accentHex}
              size={128}
            />
          ) : (
            <PlanetVoxelThumb planet={fakePlanet} size={128} animate hiQuality eager />
          )}
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
              border: `1px solid ${rgba(cardColor, 0.35)}`,
              borderRadius: 999,
              background: cardColor,
              color: "#08080c",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.1em",
              padding: "6px 14px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
            }}
          >
            {displayName}
          </div>
        </div>
      </div>

      <div style={{ background: "#08080c", padding: "22px 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>{cfg.label}</span>
          <span style={{ color: rarityColor, fontWeight: 800 }}>{listing.price.toFixed(2)} GRAM</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.42)", fontWeight: 600 }}>Rate</span>
          <span style={{ color: "#fff", fontWeight: 800 }}>+{listing.rate.toLocaleString()}/h</span>
        </div>
        {typeof listingFloat === "number" && (
          <div className="mt-1">
            <PlanetFloatBar value={listingFloat} compact />
          </div>
        )}
        <div className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
          {listing.isOwn ? "Your listing" : listing.seller}
        </div>
      </div>

      <div style={{ padding: "8px 10px 12px", marginTop: "auto", display: "flex", gap: 6 }}>
        {statusText ? (
          <div
            className="flex-1 py-2.5 rounded-xl text-[9px] font-bold text-center leading-snug"
            style={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {statusText}
          </div>
        ) : (
          <>
        {listing.isOwn && listing.serverId != null && onShare && (
          <button
            type="button"
            disabled={sharing}
            onClick={onShare}
            className="px-2 rounded-xl text-xs font-bold border"
            style={{ borderColor: "rgba(0,180,255,0.3)", color: "#36c5ff", background: "rgba(0,180,255,0.08)" }}
          >
            {sharing ? "…" : "🔗"}
          </button>
        )}
        {listing.isOwn ? (
          <button
            type="button"
            onClick={onUnlist}
            className="flex-1 py-2.5 rounded-xl text-[10px] font-black tracking-wide border"
            style={{ borderColor: "rgba(255,215,0,0.35)", color: "#ffd700", background: "rgba(255,215,0,0.08)" }}
          >
            DELIST
          </button>
        ) : (
          <button
            type="button"
            disabled={!canBuy}
            onClick={onBuy}
            className="flex-1 py-2.5 rounded-xl text-[10px] font-black tracking-wide"
            style={{
              background: canBuy ? "#ffffff" : "rgba(255,255,255,0.06)",
              color: canBuy ? "#0a0a0f" : "rgba(255,255,255,0.25)",
              cursor: canBuy ? "pointer" : "not-allowed",
            }}
          >
            BUY
          </button>
        )}
          </>
        )}
      </div>
    </div>
  );
}
