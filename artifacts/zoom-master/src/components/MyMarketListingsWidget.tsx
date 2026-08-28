/**
 * Private seller inventory — listed models stay on Market until sold or removed.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchMyMarketListings,
  type ServerMarketListing,
} from "../utils/api";
import { isPlanetBurned, isPlanetDelisted } from "../utils/removedPlanets";
import { useGlobalStore } from "../store/globalStore";
import { FarmInventoryCard } from "./FarmInventoryCard";
import type { Planet } from "../hooks/useGameState";
import { farmSlotUsedCount } from "../hooks/useGameState";
import {
  labMarketPathForPlanet,
  labModelDisplayName,
  resolveLabShapeIdFromPlanet,
  LAB_ZOOM_COLORS,
  LAB_STARDUST_COLORS,
  isLabZoomShapeId,
  resolveLabStardustShapeId,
  LAB_GLB_FARM_HOURS,
} from "@workspace/game-models";

interface Props {
  telegramId: string | null;
  myPlanets: Planet[];
  onUnlist: (planetId: string) => void;
  visible?: boolean;
  maxSlots?: number;
}

function labelFor(listing: ServerMarketListing): string {
  return labModelDisplayName({
    shapeId: listing.shapeId,
    displayName: listing.planetDisplayName,
  })
    || listing.planetDisplayName
    || listing.shapeId
    || listing.planetType
    || "Model";
}

function planetFromListing(listing: ServerMarketListing, local: Planet | undefined): Planet {
  const path = labMarketPathForPlanet({
    shapeId: listing.shapeId,
    displayName: listing.planetDisplayName,
    rate: listing.planetRate,
  });
  const shapeId = resolveLabShapeIdFromPlanet({
    shapeId: listing.shapeId,
    displayName: listing.planetDisplayName,
  }) ?? listing.shapeId ?? undefined;
  const stardustId = resolveLabStardustShapeId(shapeId);
  const chrome = shapeId && isLabZoomShapeId(shapeId)
    ? LAB_ZOOM_COLORS[shapeId]
    : stardustId
      ? LAB_STARDUST_COLORS[stardustId]
      : path === "stardust"
        ? { color: "#ffd740", glowColor: "#ffc107" }
        : { color: "#7bed9f", glowColor: "#2ed573" };
  if (local) return {
    ...local,
    shapeId: local.shapeId || shapeId,
    isListedInMarket: true,
    marketPrice: listing.price,
    color: local.color || chrome.color,
    glowColor: local.glowColor || chrome.glowColor,
  };
  return {
    id: listing.planetId || `listing-${listing.id}`,
    name: "BASIC",
    displayName: labelFor(listing),
    shapeId,
    rate: Number(listing.planetRate ?? 0),
    color: chrome.color,
    glowColor: chrome.glowColor,
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
    farmDurationHours: LAB_GLB_FARM_HOURS,
    serverListingId: listing.id,
  };
}

export function MyMarketListingsWidget({ telegramId, myPlanets, onUnlist, visible = true, maxSlots = 2 }: Props) {
  const [rows, setRows] = useState<ServerMarketListing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const storeListings = useGlobalStore((s) => s.marketListings);

  const slotsFull = farmSlotUsedCount(myPlanets) >= maxSlots;

  const reload = useCallback(async () => {
    if (!telegramId) {
      setRows([]);
      setLoaded(true);
      return;
    }
    const list = await fetchMyMarketListings(telegramId);
    setRows(list.filter((r) => !r.planetId || !isPlanetDelisted(telegramId, r.planetId)));
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
    if (isPlanetDelisted(telegramId, p.id) || isPlanetBurned(telegramId, p.id)) return false;
    return !rows.some((r) => r.id === p.serverListingId || r.planetId === p.id)
      && !storeListings.some((r) => r.planetId === p.id && r.sellerTelegramId === telegramId);
  });

  const displayRows: ServerMarketListing[] = (() => {
    const byKey = new Map<string, ServerMarketListing>();
    for (const r of rows) {
      if (r.planetId && (isPlanetBurned(telegramId, r.planetId) || isPlanetDelisted(telegramId, r.planetId))) continue;
      byKey.set(String(r.planetId || r.id), r);
    }
    for (const r of storeListings) {
      if (r.sellerTelegramId !== telegramId) continue;
      if (r.kind === "equipment" || r.kind === "item") continue;
      if (r.planetId && (isPlanetBurned(telegramId, r.planetId) || isPlanetDelisted(telegramId, r.planetId))) continue;
      const key = String(r.planetId || r.id);
      if (!byKey.has(key)) byKey.set(key, r);
    }
    return [...byKey.values()];
  })();

  if (!telegramId) return null;

  const empty = loaded && displayRows.length === 0 && extraLocal.length === 0;

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
    setRows((prev) => prev.filter((r) => r.id !== listing.id && r.planetId !== planetId));
  };

  return (
    <section className="pb-4" data-testid="my-market-listings-widget">
      <div className="mb-3">
        <h3 className="font-black text-base" style={{ color: "#E8ECF4" }}>My List</h3>
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
          Your listed models stay on All / $ZOOM / ★ Stardust until someone buys or you remove them.
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

      <div className="lab-market__grid">
        {extraLocal.map((planet) => (
            <FarmInventoryCard
              key={`local-${planet.id}`}
              planet={planet}
              variant="grid"
              suspendGl={!visible}
              eagerThumb={visible}
              onUnlist={slotsFull ? undefined : () => onUnlist(planet.id)}
              listedActionDisabled={slotsFull}
              listedActionLabel={slotsFull ? "Slots full" : "Remove"}
            />
        ))}
        {displayRows.map((listing) => {
          const planet =
            myPlanets.find((p) => p.serverListingId === listing.id)
            ?? myPlanets.find((p) => p.id === listing.planetId);
          const cardPlanet = planetFromListing(listing, planet);

          return (
            <FarmInventoryCard
              key={listing.id}
              planet={cardPlanet}
              variant="grid"
              suspendGl={!visible}
              eagerThumb={visible}
              onUnlist={slotsFull ? undefined : () => handleDelist(listing)}
              listedActionDisabled={slotsFull}
              listedActionLabel={slotsFull ? "Slots full" : "Remove"}
            />
          );
        })}
      </div>
    </section>
  );
}
