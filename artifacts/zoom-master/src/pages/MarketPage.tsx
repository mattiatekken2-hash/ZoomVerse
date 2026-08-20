import { useState, useEffect, useMemo } from "react";
import { MarketPlanetCard, type MarketPlanetListingView } from "../components/MarketPlanetCard";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { buyFromMarket, shareListing, openMarketActivityStream, type MarketSale } from "../utils/api";
import { useGlobalStore, pushMarketSale, refreshMarketListings } from "../store/globalStore";
import { getPlanetDisplayName, deterministicNameFromId } from "../utils/planetNames";
import { useT } from "../i18n/LanguageContext";
import {
  labMarketPathForShapeId,
  type LabMarketPath,
} from "@workspace/game-models";

type MarketFilter = "all" | LabMarketPath;

interface MarketPageProps {
  depositBalance: number;
  earnedBalance: number;
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
  const [tab, setTab] = useState<"listings" | "activity">("listings");
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
      .filter((p) => p.isListedInMarket && p.marketPrice && labMarketPathForShapeId(p.shapeId))
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
      }));

    const others: MarketPlanetListingView[] = serverListings
      .filter((l) => l.kind !== "equipment" && l.kind !== "item")
      .filter((l) => l.sellerTelegramId !== telegramId)
      .filter((l) => labMarketPathForShapeId(l.shapeId))
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
      }));

    return [...userListings, ...others];
  }, [myListings, serverListings, telegramId]);

  const filtered = useMemo(() => {
    if (filter === "all") return allDisplayListings;
    return allDisplayListings.filter((l) => labMarketPathForShapeId(l.shapeId) === filter);
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
    if (depositBalance < price * 0.5 || earnedBalance < price * 0.5) {
      showToast("Need 50% deposit + 50% earned GRAM", false);
      return;
    }
    if (myListings.length >= maxSlots) {
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
      onServerBuyComplete(planetType, planetRate, price, finalFloat, modelMeta);
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
    .filter((s) => labMarketPathForShapeId((s as MarketSale & { shapeId?: string | null }).shapeId))
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
        {tab === "activity" ? (
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
                const canBuy =
                  !listing.isOwn &&
                  depositBalance >= listing.price * 0.5 &&
                  earnedBalance >= listing.price * 0.5 &&
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
                          "BASIC",
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
                    onUnlist={() => onUnlist(listing.id)}
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
