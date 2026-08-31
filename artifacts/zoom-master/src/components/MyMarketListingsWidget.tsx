/**
 * Seller inventory on Market. Public All hides after 1h; cards stay here
 * with a timer. Relist fee is $ZOOM S3 on My List only — not Farm.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchMyMarketListings,
  reactivateMarketListing,
  MARKET_LISTING_TTL_MS,
  MARKET_RELIST_FEE_ZOOM,
  type ServerMarketListing,
} from "../utils/api";
import { isPlanetBurned, isPlanetDelisted } from "../utils/removedPlanets";
import { useGlobalStore, upsertMarketListing } from "../store/globalStore";
import { FarmInventoryCard } from "./FarmInventoryCard";
import type { Planet } from "../hooks/useGameState";
import { farmSlotUsedCount } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";
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

function listingNumId(id: unknown): number {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 && n < 1_000_000_000 ? n : 0;
}

function listingShape(listing: Pick<ServerMarketListing, "shapeId" | "planetDisplayName">, planet?: Planet | null): string {
  return (
    resolveLabShapeIdFromPlanet({
      shapeId: listing.shapeId || planet?.shapeId,
      displayName: listing.planetDisplayName || planet?.displayName,
    })
    || listing.shapeId
    || planet?.shapeId
    || ""
  ).trim().toLowerCase();
}

function listingName(listing: Pick<ServerMarketListing, "shapeId" | "planetDisplayName">, planet?: Planet | null): string {
  return (
    labModelDisplayName({
      shapeId: listing.shapeId || planet?.shapeId,
      displayName: listing.planetDisplayName || planet?.displayName,
    })
    || listing.planetDisplayName
    || planet?.displayName
    || ""
  ).trim().toLowerCase();
}

function sameListingRef(
  listing: Pick<ServerMarketListing, "id" | "planetId" | "shapeId" | "planetDisplayName">,
  planet: Pick<Planet, "id" | "serverListingId" | "shapeId" | "displayName">,
): boolean {
  const sid = listingNumId(planet.serverListingId);
  const lid = listingNumId(listing.id);
  if (sid > 0 && lid === sid) return true;
  if (listing.planetId && listing.planetId === planet.id) return true;
  const shape = listingShape(listing, planet);
  const name = listingName(listing, planet);
  if (shape && (listing.shapeId || "").trim().toLowerCase() === shape && name) {
    if (listingName(listing) === name) return true;
  }
  return false;
}

function resolveMineListing(
  mine: ServerMarketListing[],
  listing: Partial<ServerMarketListing>,
  planet?: Planet | null,
): ServerMarketListing | undefined {
  const lid = listingNumId(listing.id);
  if (lid > 0) {
    const byId = mine.find((l) => listingNumId(l.id) === lid);
    if (byId) return byId;
  }
  const pid = (listing.planetId || planet?.id || "").trim();
  if (pid) {
    const byPlanet = mine.find((l) => (l.planetId || "") === pid);
    if (byPlanet) return byPlanet;
  }
  const shape = listingShape(listing, planet);
  const name = listingName(listing, planet);
  if (shape) {
    const byShape = mine.filter((l) => (l.shapeId || "").trim().toLowerCase() === shape);
    if (byShape.length === 1) return byShape[0];
    if (name) {
      const named = byShape.filter((l) => listingName(l).toLowerCase() === name);
      if (named.length === 1) return named[0];
    }
  }
  if (name) {
    const named = mine.filter((l) => listingName(l).toLowerCase() === name);
    if (named.length === 1) return named[0];
  }
  return undefined;
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
  const { t } = useT();
  const [rows, setRows] = useState<ServerMarketListing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [holdUntil, setHoldUntil] = useState<Record<string, number>>({});
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
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
      window.removeEventListener("zoom-data-refresh", onRefresh);
    };
  }, [visible, reload]);

  const extraLocal = myPlanets.filter((p) => {
    if (!p.isListedInMarket) return false;
    if (isPlanetDelisted(telegramId, p.id) || isPlanetBurned(telegramId, p.id)) return false;
    const inRows = rows.some((r) => sameListingRef(r, p));
    const inStore = storeListings.some((r) =>
      r.sellerTelegramId === telegramId && sameListingRef(r, p),
    );
    return !inRows && !inStore;
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
    const lid = listingNumId(listing.id);
    const planetId =
      listing.planetId
      ?? myPlanets.find((p) => listingNumId(p.serverListingId) === lid)?.id;
    if (!planetId) return;
    onUnlist(planetId);
    setRows((prev) => prev.filter((r) => listingNumId(r.id) !== lid && r.planetId !== planetId));
  };

  const handleRelist = async (listing: Partial<ServerMarketListing> & { id?: number }, planet?: Planet | null) => {
    if (!telegramId || busyId != null) return;
    const pid = (planet?.id || listing.planetId || "").trim();
    setBusyId(listingNumId(listing.id) || -1);
    const mine = await fetchMyMarketListings(telegramId);
    const resolved = resolveMineListing(mine, listing, planet);
    if (resolved) {
      setRows((prev) => {
        const lid = listingNumId(resolved.id);
        const rest = prev.filter((r) => listingNumId(r.id) !== lid && r.planetId !== resolved.planetId);
        return [resolved, ...rest];
      });
    }
    const listingId = listingNumId(resolved?.id) || listingNumId(listing.id);
    const planetId = (resolved?.planetId || pid || "").trim();
    const shapeId = resolved?.shapeId || listing.shapeId || planet?.shapeId || undefined;
    const displayName = resolved?.planetDisplayName || listing.planetDisplayName || planet?.displayName || undefined;
    const res = await reactivateMarketListing(telegramId, listingId || undefined, planetId || undefined, {
      shapeId,
      displayName,
    });
    setBusyId(null);
    if (!res.ok) {
      setMsg(res.error || t("market.relistFail"));
      window.setTimeout(() => setMsg(null), 2800);
      return;
    }
    const nextExpires = res.expiresAt ?? (Date.now() + MARKET_LISTING_TTL_MS);
    const patchedId = listingId || listingNumId(listing.id);
    if (patchedId > 0 && typeof listing.sellerTelegramId === "string" && listing.sellerTelegramId) {
      upsertMarketListing({
        ...(listing as ServerMarketListing),
        id: patchedId,
        planetId: pid || listing.planetId || null,
        expired: false,
        expiresAt: nextExpires,
        remainingMs: res.remainingMs ?? MARKET_LISTING_TTL_MS,
      });
    }
    if (typeof res.zoomBalance === "number") {
      try {
        window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
          detail: { balance: res.zoomBalance, epoch: res.balanceEpoch ?? 0 },
        }));
      } catch { /**/ }
    }
    try { window.dispatchEvent(new Event("zoom-data-refresh")); } catch { /**/ }
    if (pid) {
      setHoldUntil((prev) => ({ ...prev, [pid]: Date.now() + MARKET_LISTING_TTL_MS }));
    }
    await reload();
  };

  const shelfOf = (listing: ServerMarketListing, listedAt?: number) => {
    const exp = listing.expiresAt && listing.expiresAt > 0
      ? listing.expiresAt
      : (listedAt && listedAt > 0 ? listedAt + MARKET_LISTING_TTL_MS : 0);
    const remaining = exp > 0 ? Math.max(0, exp - now) : Math.max(0, listing.remainingMs ?? 0);
    return { remaining, expired: listing.expired === true || (exp > 0 && now >= exp) };
  };

  return (
    <section className="pb-4" data-testid="my-market-listings-widget">
      <div className="mb-3">
        <h3 className="font-black text-base" style={{ color: "#E8ECF4" }}>My List</h3>
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
          Listed models sit on All for 1 hour. After that they stay here — tap to relist for {MARKET_RELIST_FEE_ZOOM} $ZOOM S3.
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
        {extraLocal.map((planet) => {
          const listedAt = planet.marketListedAt ?? 0;
          const hold = holdUntil[planet.id] ?? 0;
          const remaining = listedAt > 0 || hold > 0
            ? Math.max(0, listedAt + MARKET_LISTING_TTL_MS - now, hold - now)
            : MARKET_LISTING_TTL_MS;
          const expired = remaining <= 0;
          const sid = listingNumId(planet.serverListingId);
          const relist = () => void handleRelist({
            id: sid,
            planetId: planet.id,
            shapeId: planet.shapeId,
            planetDisplayName: planet.displayName,
          }, planet);
          return (
            <FarmInventoryCard
              key={`local-${planet.id}`}
              planet={planet}
              variant="grid"
              suspendGl={!visible}
              eagerThumb={visible}
              onUnlist={slotsFull ? undefined : () => onUnlist(planet.id)}
              listedActionDisabled={slotsFull}
              listedActionLabel={slotsFull ? "Slots full" : "Remove"}
              shelfRemainingMs={remaining}
              shelfExpired={expired}
              onRelist={expired ? relist : undefined}
              relistBusy={busyId != null && (busyId === sid || busyId === -1)}
              relistFeeLabel={t("market.relistFee", { n: MARKET_RELIST_FEE_ZOOM })}
              onCardClick={expired ? relist : undefined}
            />
          );
        })}
        {displayRows.map((listing) => {
          const lid = listingNumId(listing.id);
          const planet =
            myPlanets.find((p) => listingNumId(p.serverListingId) === lid)
            ?? myPlanets.find((p) => p.id === listing.planetId)
            ?? myPlanets.find((p) => sameListingRef(listing, p));
          const cardPlanet = planetFromListing(listing, planet);
          const shelf = shelfOf(listing, planet?.marketListedAt);
          const hold = (listing.planetId && holdUntil[listing.planetId])
            || (planet?.id ? holdUntil[planet.id] : 0)
            || 0;
          const remaining = Math.max(shelf.remaining, hold > now ? hold - now : 0);
          const canRelist = remaining <= 0 && shelf.expired;
          const relist = () => void handleRelist(listing, planet);

          return (
            <FarmInventoryCard
              key={lid || listing.id}
              planet={cardPlanet}
              variant="grid"
              suspendGl={!visible}
              eagerThumb={visible}
              onUnlist={slotsFull ? undefined : () => handleDelist(listing)}
              listedActionDisabled={slotsFull}
              listedActionLabel={slotsFull ? "Slots full" : "Remove"}
              shelfRemainingMs={remaining}
              shelfExpired={canRelist}
              onRelist={canRelist ? relist : undefined}
              relistBusy={busyId != null && (busyId === lid || busyId === -1)}
              relistFeeLabel={t("market.relistFee", { n: MARKET_RELIST_FEE_ZOOM })}
              onCardClick={canRelist ? relist : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
