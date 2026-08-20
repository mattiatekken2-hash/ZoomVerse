/**
 * Seller widget — manage Lab models currently listed on Market.
 * Shows 1h shelf timer; after expiry → Reactivate; always can Delist → Farm.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchMyMarketListings,
  reactivateMarketListing,
  type ServerMarketListing,
} from "../utils/api";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";
import type { Planet } from "../hooks/useGameState";
import { LAB_STARDUST_DISPLAY_NAME, LAB_ZOOM_DISPLAY_NAME, labMarketPathForShapeId, isLabStardustShapeId, isLabZoomShapeId, resolveLabStardustShapeId } from "@workspace/game-models";

const CYAN = "#9EC5E8";
const GOLD = "#ffd740";

interface Props {
  telegramId: string | null;
  myPlanets: Planet[];
  onUnlist: (planetId: string) => void;
  visible?: boolean;
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function labelFor(listing: ServerMarketListing): string {
  const shape = listing.shapeId ?? "";
  if (isLabZoomShapeId(shape)) return LAB_ZOOM_DISPLAY_NAME[shape];
  if (isLabStardustShapeId(shape)) {
    const id = resolveLabStardustShapeId(shape)!;
    return LAB_STARDUST_DISPLAY_NAME[id];
  }
  if (listing.planetDisplayName) return listing.planetDisplayName;
  return shape || listing.planetType || "Model";
}

export function MyMarketListingsWidget({ telegramId, myPlanets, onUnlist, visible = true }: Props) {
  const [rows, setRows] = useState<ServerMarketListing[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!telegramId) {
      setRows([]);
      setLoaded(true);
      return;
    }
    const list = await fetchMyMarketListings(telegramId);
    setRows(list.filter((l) => labMarketPathForShapeId(l.shapeId)));
    setLoaded(true);
  }, [telegramId]);

  useEffect(() => {
    if (!visible) return;
    void reload();
    const id = window.setInterval(() => { void reload(); }, 20_000);
    return () => window.clearInterval(id);
  }, [visible, reload]);

  useEffect(() => {
    if (!visible || rows.length === 0) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [visible, rows.length]);

  void tick;

  if (!telegramId) return null;

  const handleReactivate = async (listingId: number) => {
    if (!telegramId || busyId != null) return;
    setBusyId(listingId);
    const res = await reactivateMarketListing(telegramId, listingId);
    setBusyId(null);
    if (res.ok) await reload();
  };

  const handleDelist = (listing: ServerMarketListing) => {
    const planetId =
      listing.planetId
      ?? myPlanets.find((p) => p.serverListingId === listing.id)?.id;
    if (!planetId) return;
    onUnlist(planetId);
    window.setTimeout(() => { void reload(); }, 600);
  };

  return (
    <section
      className="mb-4 rounded-2xl p-3"
      style={{
        background: "rgba(158,197,232,0.06)",
        border: "1px solid rgba(158,197,232,0.2)",
      }}
      data-testid="my-market-listings-widget"
    >
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(158,197,232,0.7)", textTransform: "uppercase" }}>
            Your listed models
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Shop shelf lasts 1h — then Reactivate, or Delist back to Farm.
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: CYAN }}>{rows.length}</span>
      </div>

      {loaded && rows.length === 0 ? (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "6px 0 2px" }}>
          No models on the shelf yet. List one from Farm to start the 1h timer.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {rows.map((listing) => {
          const planet =
            myPlanets.find((p) => p.serverListingId === listing.id)
            ?? myPlanets.find((p) => p.id === listing.planetId);
          const remaining = typeof listing.remainingMs === "number"
            ? Math.max(0, listing.remainingMs)
            : 0;
          const activated = listing.lastActivatedAt
            ? new Date(listing.lastActivatedAt).getTime()
            : listing.createdAt
              ? new Date(listing.createdAt).getTime()
              : 0;
          const liveRemain = Math.max(0, activated + 3_600_000 - Date.now());
          const expired = listing.expired || liveRemain <= 0;
          const path = labMarketPathForShapeId(listing.shapeId);
          const fakePlanet: Planet | null = planet ?? (listing.shapeId ? {
            id: `listing-${listing.id}`,
            name: "BASIC",
            displayName: labelFor(listing),
            shapeId: listing.shapeId,
            rate: Number(listing.planetRate ?? 0),
            color: path === "stardust" ? "#ffd740" : "#7bed9f",
            glowColor: path === "stardust" ? "#ffc107" : "#2ed573",
            createdAt: Date.now(),
            farmStartedAt: 0,
            lastCollectedAt: 0,
            isListedInMarket: true,
            isFarmingActive: false,
            marketPrice: listing.price,
            craftCost: 0,
            float: 0.5,
            durability: 100,
            durabilityUpdatedAt: 0,
            farmDurationHours: 1,
          } : null);

          return (
            <div
              key={listing.id}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2"
              style={{
                background: expired ? "rgba(255,138,128,0.06)" : "rgba(0,0,0,0.25)",
                border: `1px solid ${expired ? "rgba(255,138,128,0.28)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div style={{ width: 52, height: 52, flexShrink: 0 }}>
                {fakePlanet ? (
                  <PlanetVoxelThumb planet={fakePlanet} size={52} animate={!expired} suspendGl={!visible} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(255,255,255,0.06)" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 12, fontWeight: 900, color: "#E8ECF4" }} className="truncate">
                  {labelFor(listing)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, marginTop: 2 }}>
                  {Number(listing.price).toFixed(2)} TON
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    marginTop: 2,
                    color: expired ? "#ff8a80" : "#69f0ae",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {expired ? "Shelf expired" : `On shelf ${formatRemain(liveRemain || remaining)}`}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {expired ? (
                  <button
                    type="button"
                    disabled={busyId === listing.id}
                    onClick={() => void handleReactivate(listing.id)}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase"
                    style={{
                      background: "linear-gradient(135deg,#F2F5FA,#9EC5E8)",
                      color: "#0a1220",
                      border: "none",
                      opacity: busyId === listing.id ? 0.6 : 1,
                    }}
                    data-testid={`btn-reactivate-listing-${listing.id}`}
                  >
                    {busyId === listing.id ? "…" : "Reactivate"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDelist(listing)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  data-testid={`btn-delist-listing-${listing.id}`}
                >
                  Delist
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
