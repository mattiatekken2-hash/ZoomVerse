import { useState, useEffect, useMemo } from "react";
import { MarketPlanetCard, type MarketPlanetListingView } from "../components/MarketPlanetCard";
import { MyMarketListingsWidget } from "../components/MyMarketListingsWidget";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { buyFromMarket, shareListing, openMarketActivityStream, type MarketSale } from "../utils/api";
import { useGlobalStore, pushMarketSale, refreshMarketListings } from "../store/globalStore";
import { getPlanetDisplayName, deterministicNameFromId } from "../utils/planetNames";
import { useT } from "../i18n/LanguageContext";
import {
  labMarketPathForPlanet,
  parseMarketPriceCurrency,
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
}

interface Toast { text: string; ok: boolean }

const FILTERS: { id: MarketFilter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Everything" },
  { id: "zoom", label: "$ZOOM", hint: "Farm ZOOM" },
  { id: "stardust", label: "★ Stardust", hint: "Farm ★" },
];

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
}: MarketPageProps) {
  const { t } = useT();
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const serverListings = useGlobalStore((s) => s.marketListings);
  const sales = useGlobalStore((s) => s.marketSales);
  const initialized = useGlobalStore((s) => s.initialized);
  const loading = !initialized && serverListings.length === 0;
  const [tab, setTab] = useState<"listings" | "mine" | "activity">("listings");
  const [pulseId, setPulseId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

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
    if (!visible) return;
    void refreshMarketListings();
    const close = openMarketActivityStream((sale) => {
      pushMarketSale(sale);
      setPulseId(sale.id);
      setTimeout(() => setPulseId((id) => (id === sale.id ? null : id)), 2200);
    });
    return () => { close(); };
  }, [visible]);

  const allDisplayListings = useMemo(() => {
    const localServerIdMap = Object.fromEntries(
      myListings
        .filter((p) => p.isListedInMarket && typeof p.serverListingId === "number")
        .map((p) => [p.id, p.serverListingId as number]),
    );

    const userListings: MarketPlanetListingView[] = myListings
      .filter((p) => p.isListedInMarket && p.marketPrice)
      .map((p) => ({
        id: p.id,
        price: p.marketPrice!,
        seller: "you",
        rate: p.rate,
        isOwn: true,
        serverId: localServerIdMap[p.id],
        displayName: p.displayName || getPlanetDisplayName(p),
        farmDurationHours: (p.farmDurationHours ?? 1) > 1 ? p.farmDurationHours : null,
        shapeId: p.shapeId ?? null,
        planetType: p.name,
        priceCurrency: p.marketCurrency ?? "gram",
      }));

    const ownLocalServerIds = new Set(
      userListings.map((l) => l.serverId).filter((id): id is number => typeof id === "number"),
    );

    // Also surface the seller's own active shelf rows from the server feed
    // (covers races where local shapeId/list flag hasn't caught up yet).
    const ownFromServer: MarketPlanetListingView[] = serverListings
      .filter((l) => l.kind !== "equipment" && l.kind !== "item")
      .filter((l) => l.sellerTelegramId === telegramId)
      .filter((l) => !ownLocalServerIds.has(l.id))
      .map((l) => ({
        id: `server-own-${l.id}`,
        price: l.price,
        seller: "you",
        rate: l.planetRate ?? 0,
        isOwn: true,
        serverId: l.id,
        displayName: l.planetDisplayName
          ?? deterministicNameFromId(l.planetId || `listing-${l.id}`),
        farmDurationHours: (l.planetFarmDurationHours ?? 1) > 1 ? l.planetFarmDurationHours : null,
        shapeId: l.shapeId ?? null,
        planetType: l.planetType,
        priceCurrency: parseMarketPriceCurrency(l.priceCurrency),
      }));

    const others: MarketPlanetListingView[] = serverListings
      .filter((l) => l.kind !== "equipment" && l.kind !== "item")
      .filter((l) => l.sellerTelegramId !== telegramId)
      .map((l) => ({
        id: `server-${l.id}`,
        price: l.price,
        seller: l.sellerName || `Player ${l.sellerTelegramId.slice(-4)}`,
        rate: l.planetRate ?? 0,
        isOwn: false,
        serverId: l.id,
        displayName: l.planetDisplayName
          ?? deterministicNameFromId(l.planetId || `listing-${l.id}`),
        farmDurationHours: (l.planetFarmDurationHours ?? 1) > 1 ? l.planetFarmDurationHours : null,
        shapeId: l.shapeId ?? null,
        planetType: l.planetType,
        priceCurrency: parseMarketPriceCurrency(l.priceCurrency),
      }));

    return [...userListings, ...ownFromServer, ...others];
  }, [myListings, serverListings, telegramId]);

  const filtered = useMemo(() => {
    if (filter === "all") return allDisplayListings;
    return allDisplayListings.filter((l) => labMarketPathForPlanet({
      shapeId: l.shapeId,
      displayName: l.displayName,
      rate: l.rate,
    }) === filter);
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
                    onUnlist={undefined}
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
