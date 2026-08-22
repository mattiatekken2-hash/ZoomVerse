/**
 * Private seller inventory — farm-style cards for models listed on Market.
 * Delist only here (blocked if Farm slots are full). After 1h, Reactivate for $ZOOM.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchMyMarketListings,
  reactivateMarketListing,
  type ServerMarketListing,
} from "../utils/api";
import { FarmInventoryCard } from "./FarmInventoryCard";
import type { Planet } from "../hooks/useGameState";
import { farmSlotUsedCount } from "../hooks/useGameState";
import {
  LAB_STARDUST_DISPLAY_NAME,
  LAB_ZOOM_DISPLAY_NAME,
  labMarketPathForPlanet,
  isLabStardustShapeId,
  isLabZoomShapeId,
  resolveLabStardustShapeId,
  resolveLabShapeIdFromPlanet,
} from "@workspace/game-models";

interface Props {
  telegramId: string | null;
  myPlanets: Planet[];
  onUnlist: (planetId: string) => void;
  visible?: boolean;
  maxSlots?: number;
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

function planetFromListing(listing: ServerMarketListing, local: Planet | undefined): Planet {
  const path = labMarketPathForPlanet({ shapeId: listing.shapeId, displayName: listing.planetDisplayName });
  const shapeId = resolveLabShapeIdFromPlanet({
    shapeId: listing.shapeId,
    displayName: listing.planetDisplayName,
  }) ?? listing.shapeId ?? undefined;
  if (local) return { ...local, shapeId: local.shapeId || shapeId, isListedInMarket: true, marketPrice: listing.price };
  return {
    id: listing.planetId || `listing-${listing.id}`,
    name: "BASIC",
    displayName: labelFor(listing),
    shapeId,
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
    serverListingId: listing.id,
  };
}

export function MyMarketListingsWidget({ telegramId, myPlanets, onUnlist, visible = true, maxSlots = 2 }: Props) {
  const [rows, setRows] = useState<ServerMarketListing[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const slotsFull = farmSlotUsedCount(myPlanets) >= maxSlots;

  const reload = useCallback(async () => {
    if (!telegramId) {
      setRows([]);
      setLoaded(true);
      return;
    }
    const list = await fetchMyMarketListings(telegramId);
    setRows(list);
    setLoaded(true);
  }, [telegramId]);

  useEffect(() => {
    if (!visible) return;
    void reload();
    const onRefresh = () => { void reload(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    const id = window.setInterval(() => { void reload(); }, 12_000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("zoom-data-refresh", onRefresh);
    };
  }, [visible, reload]);

  const extraLocal = myPlanets.filter((p) => {
    if (!p.isListedInMarket) return false;
    return !rows.some((r) => r.id === p.serverListingId || r.planetId === p.id);
  });

  useEffect(() => {
    if (!visible || (rows.length === 0 && extraLocal.length === 0)) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [visible, rows.length, extraLocal.length]);

  void tick;

  if (!telegramId) return null;

  const empty = loaded && rows.length === 0 && extraLocal.length === 0;

  const handleReactivate = async (listingId: number) => {
    if (!telegramId || busyId != null) return;
    setBusyId(listingId);
    const res = await reactivateMarketListing(telegramId, listingId);
    setBusyId(null);
    if (res.ok) {
      setMsg(res.feeZoom ? `Reactivated (−${res.feeZoom} $ZOOM)` : "Reactivated");
      await reload();
    } else {
      setMsg(res.error || "Reactivate failed");
    }
    window.setTimeout(() => setMsg(null), 2800);
  };

  const handleDelist = (listing: ServerMarketListing) => {
    if (slotsFull) {
      setMsg("Farm slots full — free a slot before removing from Market");
      window.setTimeout(() => setMsg(null), 2800);
      return;
    }
    const planetId =
      listing.planetId
      ?? myPlanets.find((p) => p.serverListingId === listing.id)?.id;
    if (!planetId) return;
    onUnlist(planetId);
    window.setTimeout(() => { void reload(); }, 600);
  };

  return (
    <section className="pb-4" data-testid="my-market-listings-widget">
      <div className="mb-3">
        <h3 className="font-black text-base" style={{ color: "#E8ECF4" }}>My List</h3>
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
          Only you see this. Shelf lasts 1h — then pay a small $ZOOM fee to go online again.
        </p>
      </div>

      {msg && (
        <div className="mb-3 rounded-xl px-3 py-2 text-center text-xs font-bold" style={{ background: "rgba(158,197,232,0.1)", color: "#9EC5E8" }}>
          {msg}
        </div>
      )}

      {empty ? (
        <p className="text-xs text-center py-8" style={{ color: "rgba(255,255,255,0.35)" }}>
          No models listed yet. List one from Farm.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {extraLocal.map((planet) => {
          const activated = (planet.marketListedAt && planet.marketListedAt > 0)
            ? planet.marketListedAt
            : (planet.pausedAt && planet.pausedAt > 0 ? planet.pausedAt : 0);
          const liveRemain = activated > 0 ? Math.max(0, activated + 3_600_000 - Date.now()) : 3_600_000;
          const expired = activated > 0 && liveRemain <= 0;
          return (
            <div key={`local-${planet.id}`} className="relative">
              <FarmInventoryCard
                planet={planet}
                variant="grid"
                suspendGl={!visible}
                eagerThumb={visible}
                hideActions
                onUnlist={() => onUnlist(planet.id)}
              />
              <div className="mt-2 flex flex-col gap-1.5">
                <div
                  className="text-center text-[10px] font-black uppercase"
                  style={{ color: expired ? "#ff8a80" : "#69f0ae" }}
                >
                  {expired ? "Offline · 1h expired" : `Online ${Math.floor(liveRemain / 60000)}:${String(Math.floor((liveRemain % 60000) / 1000)).padStart(2, "0")}`}
                </div>
                <button
                  type="button"
                  disabled={slotsFull}
                  onClick={() => onUnlist(planet.id)}
                  className="w-full py-2 rounded-xl text-[11px] font-black uppercase"
                  style={{
                    background: slotsFull ? "rgba(255,255,255,0.04)" : "rgba(255,82,82,0.12)",
                    color: slotsFull ? "rgba(255,255,255,0.28)" : "#ff8a80",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  data-testid={`btn-delist-local-${planet.id}`}
                >
                  {slotsFull ? "Slots full" : "Remove"}
                </button>
              </div>
            </div>
          );
        })}
        {rows.map((listing) => {
          const planet =
            myPlanets.find((p) => p.serverListingId === listing.id)
            ?? myPlanets.find((p) => p.id === listing.planetId);
          const cardPlanet = planetFromListing(listing, planet);
          const activated = listing.lastActivatedAt
            ? new Date(listing.lastActivatedAt).getTime()
            : listing.createdAt
              ? new Date(listing.createdAt).getTime()
              : 0;
          const liveRemain = Math.max(0, activated + 3_600_000 - Date.now());
          const expired = listing.expired || liveRemain <= 0;

          return (
            <div key={listing.id} className="relative">
              <FarmInventoryCard
                planet={cardPlanet}
                variant="grid"
                suspendGl={!visible}
                eagerThumb={visible}
                hideActions
                onUnlist={expired || slotsFull ? undefined : () => handleDelist(listing)}
              />
              <div className="mt-2 flex flex-col gap-1.5">
                <div
                  className="text-center text-[10px] font-black uppercase"
                  style={{ color: expired ? "#ff8a80" : "#69f0ae" }}
                >
                  {expired ? "Offline · 1h expired" : `Online ${Math.floor(liveRemain / 60000)}:${String(Math.floor((liveRemain % 60000) / 1000)).padStart(2, "0")}`}
                </div>
                {expired ? (
                  <button
                    type="button"
                    disabled={busyId === listing.id}
                    onClick={() => void handleReactivate(listing.id)}
                    className="w-full py-2 rounded-xl text-[11px] font-black uppercase"
                    style={{
                      background: "linear-gradient(135deg,#F2F5FA,#9EC5E8)",
                      color: "#0a1220",
                      opacity: busyId === listing.id ? 0.6 : 1,
                    }}
                    data-testid={`btn-reactivate-listing-${listing.id}`}
                  >
                    {busyId === listing.id ? "…" : "Reactivate"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={slotsFull}
                    onClick={() => handleDelist(listing)}
                    className="w-full py-2 rounded-xl text-[11px] font-black uppercase"
                    style={{
                      background: slotsFull ? "rgba(255,255,255,0.04)" : "rgba(255,82,82,0.12)",
                      color: slotsFull ? "rgba(255,255,255,0.28)" : "#ff8a80",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                    data-testid={`btn-delist-listing-${listing.id}`}
                  >
                    {slotsFull ? "Slots full" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
