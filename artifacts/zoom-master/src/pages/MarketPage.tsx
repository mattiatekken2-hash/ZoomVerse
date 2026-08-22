import { useState, useEffect, useMemo } from "react";
import { MarketPlanetCard, type MarketPlanetListingView } from "../components/MarketPlanetCard";
import { MyMarketListingsWidget } from "../components/MyMarketListingsWidget";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { buyFromMarket, shareListing, openMarketActivityStream, fetchMyMarketListings, type MarketSale, type ServerMarketListing } from "../utils/api";
import { useGlobalStore, pushMarketSale, refreshMarketListings, upsertMarketListing } from "../store/globalStore";
import { isPlanetBurned } from "../utils/removedPlanets";
import { getPlanetDisplayName, deterministicNameFromId } from "../utils/planetNames";
import { useT } from "../i18n/LanguageContext";
import {
  labMarketPathForPlanet,
  labModelDisplayName,
  parseMarketPriceCurrency,
  resolveLabShapeIdFromPlanet,
  type LabMarketPath,
} from "@workspace/game-models";

type MarketFilter = "all" | LabMarketPath;

interface MarketPageProps {
  depositBalance: number;
  earnedBalance: number;
  zoomBalance?: number;
  stardustBalance?: number;
  myListings: Planet[];
  maxSlots: number;
  telegramId: string | null;
  onBuy: (listing: MarketListing) => { success: boolean; reason?: string };
  onUnlist: (id: string) => void;
  onServerBuyComplete: (
    planetType: PlanetType,
    planetRate: number,
    pricePaid: number,
    planetFloat?: number | null,
    model?: { modelId?: string | null; shapeId?: string | null; modelName?: string | null } | null,
    opts?: { currency?: "gram" | "zoom" | "stardust"; listingId?: number },
  ) => void;
  /** @deprecated Lab market no longer lists equipment */
  onBuyEquipment?: (listing: unknown) => Promise<{ success: boolean; reason?: string }>;
  onUnlistEquipment?: (equipmentId: string) => void;
  /** @deprecated Lab market no longer lists items */
  onBuyItem?: (listing: unknown) => Promise<{ success: boolean; reason?: string }>;
  onUnlistItem?: (itemId: string) => void;
  focusListingId?: number | null;
  onFocusConsumed?: () => void;
  visible?: boolean;
  /** Bumped after SELL so Listings + All open on the new card. */
  revealKey?: number;
}

interface Toast { text: string; ok: boolean }

const FILTERS: { id: MarketFilter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Everything" },
  { id: "zoom", label: "$ZOOM", hint: "Farm ZOOM" },
  { id: "stardust", label: "★ Stardust", hint: "Farm ★" },
];

function sameTelegram(a?: string | null, b?: string | null): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  return x.length > 0 && x === y;
}

function classifyListing(
  raw: {
    shapeId?: string | null;
    displayName?: string | null;
    rate?: number | string | null;
  },
  local?: Planet,
): { shapeId: string | null; displayName: string; rate: number; marketPath: LabMarketPath } {
  const shapeId = resolveLabShapeIdFromPlanet({
    shapeId: raw.shapeId || local?.shapeId,
    displayName: raw.displayName || local?.displayName,
  }) ?? raw.shapeId ?? local?.shapeId ?? null;
  const displayName = (
    labModelDisplayName({ shapeId, displayName: raw.displayName || local?.displayName })
    || raw.displayName
    || local?.displayName
    || (local ? getPlanetDisplayName(local) : "")
    || ""
  ).trim();
  const rate = Number(raw.rate ?? local?.rate ?? 0);
  return {
    shapeId,
    displayName: displayName || (local ? getPlanetDisplayName(local) : "Model"),
    rate: Number.isFinite(rate) ? rate : 0,
    marketPath: labMarketPathForPlanet({ shapeId, displayName, rate }),
  };
}

export function MarketPage({
  depositBalance,
  earnedBalance,
  zoomBalance = 0,
  stardustBalance = 0,
  myListings,
  maxSlots,
  telegramId,
  onBuy,
  onUnlist,
  onServerBuyComplete,
  focusListingId,
  onFocusConsumed,
  visible = true,
  revealKey = 0,
}: MarketPageProps) {
  const { t } = useT();
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const serverListings = useGlobalStore((s) => s.marketListings);
  const sales = useGlobalStore((s) => s.marketSales);
  const initialized = useGlobalStore((s) => s.initialized);
  const [tab, setTab] = useState<"listings" | "mine" | "activity">("listings");
  const [pulseId, setPulseId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [myServerListings, setMyServerListings] = useState<ServerMarketListing[]>([]);
  const loading = !initialized && serverListings.length === 0 && myServerListings.length === 0;

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const handleShare = async (serverId: number) => {
    if (!telegramId || sharingId != null) return;
    setSharingId(serverId);
    try {
      const res = await shareListing(telegramId, serverId);
      showToast(res.ok ? t("market.shareSuccess") : t("market.shareFailed"), res.ok);
    } finally {
      setSharingId(null);
    }
  };

  useEffect(() => {
    if (focusListingId == null) return;
    setTab("listings");
    setFilter("all");
    setHighlightId(focusListingId);
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const el = document.getElementById(`listing-card-${focusListingId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (attempt < 10) setTimeout(() => tryScroll(attempt + 1), 300);
    };
    tryScroll(0);
    const clearTimer = setTimeout(() => { setHighlightId(null); onFocusConsumed?.(); }, 3200);
    return () => { cancelled = true; clearTimeout(clearTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusListingId]);

  useEffect(() => {
    if (!revealKey) return;
    setTab("listings");
    setFilter("all");
    const newest = [...myListings]
      .filter((p) => p.isListedInMarket)
      .sort((a, b) => (b.marketListedAt ?? 0) - (a.marketListedAt ?? 0))[0];
    if (!newest) return;
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const el = document.querySelector(`[data-testid="listing-${newest.id}"]`)
        || (newest.serverListingId != null
          ? document.getElementById(`listing-card-${newest.serverListingId}`)
          : null);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (attempt < 12) setTimeout(() => tryScroll(attempt + 1), 200);
    };
    tryScroll(0);
    return () => { cancelled = true; };
    // Newest listed planet is already in this render's myListings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  useEffect(() => {
    if (!visible || !telegramId) return;
    let cancelled = false;
    const loadMine = async () => {
      const mine = await fetchMyMarketListings(telegramId);
      if (cancelled) return;
      setMyServerListings(mine);
      for (const row of mine) upsertMarketListing(row);
    };
    void loadMine();
    const timer = window.setInterval(() => { void loadMine(); }, 8000);
    const onRefresh = () => { void loadMine(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("zoom-data-refresh", onRefresh);
    };
  }, [visible, telegramId, revealKey]);

  useEffect(() => {
    if (!visible) return;
    void refreshMarketListings(telegramId);
    const close = openMarketActivityStream((sale) => {
      pushMarketSale(sale);
      setPulseId(sale.id);
      setTimeout(() => setPulseId((id) => (id === sale.id ? null : id)), 2200);
    });
    return () => { close(); };
  }, [visible, telegramId]);

  const allDisplayListings = useMemo(() => {
    const localByPlanet = new Map(myListings.map((p) => [p.id, p]));
    const listedPlanets = myListings.filter((p) => p.isListedInMarket);
    const views: MarketPlanetListingView[] = [];
    const seenServer = new Set<number>();
    const seenPlanet = new Set<string>();

    const pushFromServer = (l: ServerMarketListing, forceOwn: boolean) => {
      if (l.kind === "equipment" || l.kind === "item") return;
      if (l.planetId && isPlanetBurned(telegramId, l.planetId)) return;
      const id = Number(l.id);
      if (!Number.isFinite(id) || seenServer.has(id)) return;
      if (l.planetId && seenPlanet.has(l.planetId)) return;
      const local = (l.planetId ? localByPlanet.get(l.planetId) : undefined)
        ?? myListings.find((p) => p.serverListingId === id);
      const isOwn = forceOwn
        || sameTelegram(l.sellerTelegramId, telegramId)
        || !!local
        || listedPlanets.some((p) => p.id === l.planetId);
      const classified = classifyListing({
        shapeId: l.shapeId ?? local?.shapeId ?? null,
        displayName: l.planetDisplayName ?? local?.displayName ?? null,
        rate: l.planetRate ?? local?.rate ?? 0,
      }, local);
      seenServer.add(id);
      if (l.planetId) seenPlanet.add(l.planetId);
      views.push({
        id: isOwn ? `server-own-${id}` : `server-${id}`,
        price: l.price,
        seller: isOwn ? "you" : (l.sellerName || `Player ${String(l.sellerTelegramId || "").slice(-4)}`),
        rate: classified.rate,
        isOwn,
        serverId: id,
        displayName: classified.displayName
          || l.planetDisplayName
          || deterministicNameFromId(l.planetId || `listing-${id}`),
        farmDurationHours: (l.planetFarmDurationHours ?? 1) > 1 ? l.planetFarmDurationHours : null,
        shapeId: classified.shapeId,
        planetType: l.planetType,
        priceCurrency: parseMarketPriceCurrency(l.priceCurrency),
        marketPath: classified.marketPath,
        planetId: l.planetId ?? local?.id ?? null,
      });
    };

    for (const row of myServerListings) pushFromServer(row, true);

    for (const p of listedPlanets) {
      if (seenPlanet.has(p.id)) continue;
      if (typeof p.serverListingId === "number" && seenServer.has(p.serverListingId)) continue;
      const classified = classifyListing({
        shapeId: p.shapeId ?? null,
        displayName: p.displayName || getPlanetDisplayName(p),
        rate: p.rate,
      }, p);
      seenPlanet.add(p.id);
      if (typeof p.serverListingId === "number") seenServer.add(p.serverListingId);
      views.push({
        id: p.id,
        price: p.marketPrice ?? 0,
        seller: "you",
        rate: classified.rate,
        isOwn: true,
        serverId: typeof p.serverListingId === "number" && p.serverListingId > 0 ? p.serverListingId : undefined,
        displayName: classified.displayName,
        farmDurationHours: (p.farmDurationHours ?? 1) > 1 ? p.farmDurationHours : null,
        shapeId: classified.shapeId,
        planetType: p.name,
        priceCurrency: p.marketCurrency ?? "gram",
        marketPath: classified.marketPath,
        planetId: p.id,
      });
    }

    for (const row of serverListings) pushFromServer(row, false);

    return views;
  }, [myListings, serverListings, myServerListings, telegramId]);

  const filtered = useMemo(() => {
    if (filter === "all") return allDisplayListings;
    return allDisplayListings.filter((l) => {
      const path = l.marketPath ?? labMarketPathForPlanet({
        shapeId: resolveLabShapeIdFromPlanet({
          shapeId: l.shapeId,
          displayName: l.displayName,
        }) ?? l.shapeId,
        displayName: l.displayName,
        rate: l.rate,
      });
      return path === filter;
    });
  }, [allDisplayListings, filter]);

  const handleBuyServer = async (
    serverId: number,
    planetType: PlanetType,
    planetRate: number,
    price: number,
    planetFloat: number | null,
    model?: { modelId?: string | null; shapeId?: string | null; modelName?: string | null } | null,
  ) => {
    if (!telegramId) return;
    const currency = parseMarketPriceCurrency(
      allDisplayListings.find((l) => l.serverId === serverId)?.priceCurrency,
    );
    if (currency === "gram") {
      if (depositBalance + earnedBalance < price) {
        showToast("Not enough GRAM", false);
        return;
      }
    } else if (currency === "zoom") {
      if (zoomBalance < price) {
        showToast("Not enough $ZOOM", false);
        return;
      }
    } else if (stardustBalance < price) {
      showToast("Not enough ★ Stardust", false);
      return;
    }
    if (myListings.filter((p) => !p.isListedInMarket).length >= maxSlots) {
      showToast("No free farm slots", false);
      return;
    }
    const result = await buyFromMarket(telegramId, serverId);
    if (result.ok) {
      const finalFloat = typeof result.planetFloat === "number" ? result.planetFloat : planetFloat;
      const modelMeta = {
        modelId: result.modelId ?? model?.modelId,
        shapeId: result.shapeId ?? model?.shapeId,
        modelName: result.modelName ?? model?.modelName,
      };
      const boughtType = (result.planetType as PlanetType) || planetType;
      const boughtRate = typeof result.planetRate === "number" ? result.planetRate : planetRate;
      onServerBuyComplete(boughtType, boughtRate, result.pricePaid ?? price, finalFloat, modelMeta, {
        currency,
        listingId: serverId,
      });
      void refreshMarketListings();
      showToast(`${modelMeta.modelName || "Model"} added to Farm`, true);
    } else {
      showToast(result.error ?? "Purchase failed", false);
    }
  };

  const handleBuyLocal = (listing: MarketListing) => {
    const result = onBuy(listing);
    showToast(
      result.success ? "Added to your Farm" : (result.reason ?? "Purchase failed"),
      result.success,
    );
  };

  const activityViews: MarketPlanetListingView[] = sales
    .filter((s) => labMarketPathForPlanet({
      shapeId: (s as MarketSale & { shapeId?: string | null }).shapeId,
      displayName: (s as MarketSale & { planetDisplayName?: string | null }).planetDisplayName,
    }))
    .map((s) => {
      const ago = Math.max(0, Math.floor((Date.now() - s.soldAt) / 1000));
      const agoLabel = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
      return {
        id: `sale-${s.id}`,
        price: s.price,
        rate: s.planetRate,
        seller: s.sellerName,
        isOwn: false,
        displayName: deterministicNameFromId(`sale-${s.id}`),
        shapeId: (s as MarketSale & { shapeId?: string | null }).shapeId ?? null,
        _status: `${s.buyerName} bought · ${agoLabel}`,
        _pulse: pulseId === s.id,
        _saleId: s.id,
      } as MarketPlanetListingView & { _status: string; _pulse: boolean; _saleId: number };
    });

  return (
    <div className="lab-market flex flex-col h-full relative">
      <header className="lab-market__header px-5 pt-4 pb-3 flex-shrink-0">
        <p className="lab-market__kicker">P2P · Generators</p>
        <h2 className="lab-market__title">{t("market.title")}</h2>
        <p className="lab-market__sub">Buy or sell Lab models that farm $ZOOM or ★ Stardust.</p>

        <div className="lab-market__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "listings"}
            onClick={() => setTab("listings")}
            className={`lab-market__tab${tab === "listings" ? " is-active" : ""}`}
            data-testid="tab-listings"
          >
            Listings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            onClick={() => setTab("mine")}
            className={`lab-market__tab${tab === "mine" ? " is-active" : ""}`}
            data-testid="tab-my-list"
          >
            My List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            onClick={() => setTab("activity")}
            className={`lab-market__tab lab-market__tab--live${tab === "activity" ? " is-active" : ""}`}
            data-testid="tab-activity"
          >
            <span className="lab-market__live-dot" aria-hidden />
            Live
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-5 lab-market__scroll">
        {tab === "mine" ? (
          <MyMarketListingsWidget
            telegramId={telegramId}
            myPlanets={myListings}
            onUnlist={onUnlist}
            visible={visible}
            maxSlots={maxSlots}
          />
        ) : tab === "activity" ? (
          <div className="lab-market__grid">
            {activityViews.length === 0 && (
              <div className="lab-market__empty">
                <p>Waiting for the next sale…</p>
              </div>
            )}
            {activityViews.map((view) => {
              const extra = view as MarketPlanetListingView & { _status: string; _pulse: boolean; _saleId: number };
              return (
                <MarketPlanetCard
                  key={extra._saleId}
                  listing={view}
                  canBuy={false}
                  highlighted={extra._pulse}
                  suspendGl={!visible}
                  onBuy={() => {}}
                  onUnlist={() => {}}
                  statusText={extra._status}
                />
              );
            })}
          </div>
        ) : (
          <>
            <div className="lab-market__filters" role="tablist" aria-label="Market path">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`lab-market__filter lab-market__filter--${f.id}${filter === f.id ? " is-active" : ""}`}
                  data-testid={`filter-${f.id}`}
                >
                  <span className="lab-market__filter-label">{f.label}</span>
                  <span className="lab-market__filter-hint">{f.hint}</span>
                </button>
              ))}
            </div>

            {loading && filtered.length === 0 && (
              <div className="lab-market__empty"><p>Loading marketplace…</p></div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="lab-market__empty">
                <p>No {filter === "all" ? "" : filter === "zoom" ? "$ZOOM " : "★ Stardust "}listings yet.</p>
                <p className="lab-market__empty-hint">Forge in the Lab, then list from Farm.</p>
              </div>
            )}

            <div className="lab-market__grid">
              {filtered.map((listing) => {
                const currency = parseMarketPriceCurrency(listing.priceCurrency);
                const canAfford =
                  currency === "gram"
                    ? depositBalance + earnedBalance >= listing.price
                    : currency === "zoom"
                      ? zoomBalance >= listing.price
                      : stardustBalance >= listing.price;
                const canBuy =
                  !listing.isOwn &&
                  canAfford &&
                  myListings.filter((p) => !p.isListedInMarket).length < maxSlots;
                const isFocused = listing.serverId != null && highlightId === listing.serverId;
                return (
                  <MarketPlanetCard
                    key={listing.id}
                    listing={listing}
                    canBuy={canBuy}
                    highlighted={isFocused}
                    suspendGl={!visible}
                    sharing={sharingId === listing.serverId}
                    onBuy={() => {
                      if (listing.serverId) {
                        handleBuyServer(
                          listing.serverId,
                          (listing.planetType as PlanetType) || "BASIC",
                          listing.rate,
                          listing.price,
                          null,
                          {
                            shapeId: listing.shapeId,
                            modelName: listing.displayName,
                          },
                        );
                      } else {
                        handleBuyLocal({
                          id: listing.id,
                          name: "BASIC",
                          price: listing.price,
                          seller: listing.seller,
                          rate: listing.rate,
                          displayName: listing.displayName,
                          shapeId: listing.shapeId,
                        } as MarketListing);
                      }
                    }}
                    onUnlist={
                      listing.isOwn
                        ? () => {
                            const planetId = listing.planetId
                              || myListings.find((p) => p.serverListingId === listing.serverId)?.id
                              || myListings.find((p) => p.id === listing.id)?.id;
                            if (planetId) onUnlist(planetId);
                          }
                        : undefined
                    }
                    onShare={
                      listing.serverId != null && listing.isOwn
                        ? () => handleShare(listing.serverId as number)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`lab-market__toast${toast.ok ? " is-ok" : " is-err"}`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
