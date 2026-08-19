import { useState, useEffect } from "react";
import {
  ITEM_CONFIG,
  ITEM_RARITY_COLOR,
  ITEM_RARITY_LABEL,
  type ItemType,
} from "../utils/collectibleConfig";
import { MarketPlanetCard, type MarketPlanetListingView } from "../components/MarketPlanetCard";
import { ObjectThumb } from "../components/MysteryModel3D";
import { getModelById } from "@workspace/game-models";
import { PLANET_CONFIG, getRarityColorsForModel } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { buyFromMarket, shareListing, openMarketActivityStream, type ServerMarketListing, type MarketSale } from "../utils/api";
import { useGlobalStore, pushMarketSale, refreshMarketListings } from "../store/globalStore";
import { PlanetFloatBar } from "../components/PlanetFloatBar";
import { getListingDisplayFloat, FLOAT_PLANET_TYPES } from "../utils/planetFloat";
import { getPlanetDisplayName, deterministicNameFromId } from "../utils/planetNames";
import { useT } from "../i18n/LanguageContext";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_RARITY_INFO,
  PixelEquipmentIcon,
  type EquipmentCategory,
  type EquipmentRarity,
} from "../utils/equipmentConfig";


type MarketFilter = PlanetType | "ALL" | "EQUIPMENT" | "ITEMS";
const RARITY_FILTERS: MarketFilter[] = ["ALL", "ITEMS", "EQUIPMENT", "BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1", "V1_NFT"];
const EQUIPMENT_FILTER_COLOR = "#7fd4ff";
const ITEMS_FILTER_COLOR = "#c471ed";

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

interface MarketPageProps {
  depositBalance: number;
  // Earned balance (tonBalance). Buyers pay marketplace listings 50% from
  // deposit_balance and 50% from earned_balance, so both are needed to gate.
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
  // Equipment marketplace — buy/unlist for ServerMarketListing rows
  // whose `kind === 'equipment'`. Wired from useGameState.
  onBuyEquipment: (listing: ServerMarketListing) => Promise<{ success: boolean; reason?: string }>;
  onUnlistEquipment: (equipmentId: string) => void;
  // Collectible items marketplace.
  onBuyItem: (listing: ServerMarketListing) => Promise<{ success: boolean; reason?: string }>;
  onUnlistItem: (itemId: string) => void;
  // When the app is opened via a `mkt_<id>` deep link, the listing's server id
  // is passed here so the page scrolls to and highlights that card on mount.
  focusListingId?: number | null;
  // Called once the focus has been consumed so it isn't re-applied on re-render.
  onFocusConsumed?: () => void;
  visible?: boolean;
}

interface Toast { text: string; ok: boolean }

export function MarketPage({ depositBalance, earnedBalance, myListings, maxSlots, telegramId, onBuy, onUnlist, onServerBuyComplete, onBuyEquipment, onUnlistEquipment, onBuyItem, onUnlistItem, focusListingId, onFocusConsumed, visible = true }: MarketPageProps) {
  const { t } = useT();
  const [filter, setFilter] = useState<MarketFilter>("ALL");
  // Float sort widget for the marketplace (▲ = low→high, ▼ = high→low,
  // null = natural order). Floatable planets sort by their actual float;
  // non-floatable listings always trail the floatable ones in a stable
  // fashion so a player searching for "highest float" can scan the top
  // of the list without picking up irrelevant rarities.
  const [floatSort, setFloatSort] = useState<"asc" | "desc" | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const serverListings = useGlobalStore((s) => s.marketListings);
  const sales = useGlobalStore((s) => s.marketSales);
  const initialized = useGlobalStore((s) => s.initialized);
  const loading = !initialized && serverListings.length === 0;
  const [tab, setTab] = useState<"listings" | "activity">("listings");
  const [pulseId, setPulseId] = useState<number | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  // Listings currently being shared (server id) — disables the 🔗 button and
  // shows a spinner-ish state while the bot posts to the group.
  const [sharingId, setSharingId] = useState<number | null>(null);
  // Server id of the listing to visually highlight (deep-link focus).
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const handleShare = async (serverId: number) => {
    if (!telegramId || sharingId != null) return;
    setSharingId(serverId);
    try {
      const res = await shareListing(telegramId, serverId);
      if (res.ok) {
        showToast(t("market.shareSuccess"), true);
      } else {
        showToast(t("market.shareFailed"), false);
      }
    } finally {
      setSharingId(null);
    }
  };

  // Deep-link focus: when opened via `mkt_<id>`, ensure the listings tab is
  // active, scroll the card into view, and pulse a highlight ring on it.
  useEffect(() => {
    if (focusListingId == null) return;
    setTab("listings");
    setFilter("ALL");
    setHighlightId(focusListingId);
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const el = document.getElementById(`listing-card-${focusListingId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempt < 10) {
        setTimeout(() => tryScroll(attempt + 1), 300);
      }
    };
    tryScroll(0);
    // Clear the highlight (and tell the parent to drop the focus id) only after
    // the scroll/pulse has run, so nulling the prop doesn't cancel it mid-flight.
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

  const userListings: MarketListing[] = myListings
    .filter((p) => p.isListedInMarket && p.marketPrice)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.marketPrice!,
      seller: "you",
      rate: p.rate,
      // Carry the planet's stored cosmetics through to the listing card
      // so the user sees the same name + float they had in the Lab.
      // Use the SAME procedural-name fallback the Lab uses, so the
      // marketplace card matches what the seller sees in their
      // inventory even when they never paid for a custom rename.
      displayName: getPlanetDisplayName(p),
      planetFloat: typeof p.float === "number" ? p.float : null,
      farmDurationHours: (p.farmDurationHours ?? 1) > 1 ? p.farmDurationHours : null,
      modelId: p.modelId ?? null,
      shapeId: p.shapeId ?? null,
    }));

  // Equipment listings are rendered in their own section (different card
  // shape — pixel icon, no float bar, no planet config) and so must be
  // excluded from the planet-grid pipeline below. Legacy rows have
  // `kind === null` and are treated as planets for backwards compat.
  const equipmentListings = serverListings.filter((l) => l.kind === "equipment");
  const itemListings = serverListings.filter((l) => l.kind === "item");
  const planetServerListings = serverListings.filter((l) => l.kind !== "equipment" && l.kind !== "item");

  const otherListings = planetServerListings.filter(
    (l) => l.sellerTelegramId !== telegramId
  );

  // Build a quick lookup: planet.id → serverListingId so local listings
  // carry their server-assigned id (needed for the share button + focus).
  const localServerIdMap = Object.fromEntries(
    myListings
      .filter((p) => p.isListedInMarket && typeof p.serverListingId === "number")
      .map((p) => [p.id, p.serverListingId as number])
  );

  const allDisplayListings = [
    ...userListings.map((l) => ({
      ...l,
      isLocal: true as const,
      serverId: localServerIdMap[l.id],
      // userListings already carries planetFloat + displayName from the
      // seller's local Planet (built above), so nothing to re-fill here.
    })),
    ...otherListings.map((l) => ({
      id: `server-${l.id}`,
      name: (l.planetType ?? "BASIC") as PlanetType,
      price: l.price,
      seller: l.sellerName || `Player ${l.sellerTelegramId.slice(-4)}`,
      rate: l.planetRate ?? 0,
      isLocal: false as const,
      serverId: l.id,
      planetFloat: l.planetFloat ?? null,
      // Same fallback rule as for the seller's own listings: if the
      // server didn't snapshot a custom name (planet was never paid-
      // renamed, or it's a legacy listing), derive the deterministic
      // procedural name from the planet id so buyers see the SAME
      // string the seller sees in their Lab. Legacy listings without
      // a planetId fall back to the listing id as a stable seed.
      displayName: l.planetDisplayName
        ?? deterministicNameFromId(l.planetId || `listing-${l.id}`),
      farmDurationHours: (l.planetFarmDurationHours ?? 1) > 1 ? l.planetFarmDurationHours : null,
      modelId: l.modelId ?? null,
      shapeId: l.shapeId ?? null,
    })),
  ];

  // When the EQUIPMENT or ITEMS filter is active, hide every planet listing.
  // ALL shows planets + equipment + items; any rarity filter shows only matching planets.
  const filteredBase = filter === "ALL"
    ? allDisplayListings
    : filter === "EQUIPMENT" || filter === "ITEMS"
      ? []
      : allDisplayListings.filter((l) => l.name === filter);

  // Apply float sort. Listings of non-floatable rarities are pushed to
  // the end (stable) so a "high float" search surfaces real candidates
  // first. The displayed value uses `getListingDisplayFloat` — the same
  // helper rendered inside the card — so the sort matches what the user
  // sees on the float bar (no off-by-one between display and order).
  const filtered = (() => {
    if (!floatSort) return filteredBase;
    const withKey = filteredBase.map((l) => {
      const isFloatable = FLOAT_PLANET_TYPES.has(l.name);
      const f = isFloatable
        ? getListingDisplayFloat({
            id: l.serverId ?? l.id,
            planetFloat: l.planetFloat,
          })
        : null;
      return { l, isFloatable, f };
    });
    withKey.sort((a, b) => {
      // Non-floatable rarities trail the floatable ones regardless of dir.
      if (a.isFloatable !== b.isFloatable) return a.isFloatable ? -1 : 1;
      if (!a.isFloatable) return 0;
      const fa = a.f ?? 0;
      const fb = b.f ?? 0;
      return floatSort === "asc" ? fa - fb : fb - fa;
    });
    return withKey.map((x) => x.l);
  })();

  const handleBuyServer = async (
    serverId: number,
    planetType: PlanetType,
    planetRate: number,
    price: number,
    planetFloat: number | null,
    model?: { modelId?: string | null; shapeId?: string | null; modelName?: string | null } | null,
  ) => {
    if (!telegramId) return;
    // P2P TON marketplace: buyer pays 50% from deposit_balance and 50% from
    // earned_balance. Both wallets must cover their half.
    if (depositBalance < price * 0.5 || earnedBalance < price * 0.5) {
      showToast("Insufficient balance: need 50% deposit + 50% earned", false);
      return;
    }
    // Listed planets still occupy a slot (they remain in the farm grid as
     // LISTED), so we must count ALL owned planets — not just the non-listed
     // ones — otherwise a 3/3 farm with 1 listing would erroneously allow
     // another buy and overflow to 4/3.
    if (myListings.length >= maxSlots) {
      showToast("No free slots available", false);
      return;
    }
    const result = await buyFromMarket(telegramId, serverId);
    if (result.ok) {
      // Prefer the server-echoed float (authoritative — exactly what
      // the listing carried); fall back to the listing snapshot we
      // sent in (matches the marketplace card the buyer just clicked).
      const finalFloat = typeof result.planetFloat === "number" ? result.planetFloat : planetFloat;
      const modelMeta = {
        modelId: result.modelId ?? model?.modelId,
        shapeId: result.shapeId ?? model?.shapeId,
        modelName: result.modelName ?? model?.modelName,
      };
      onServerBuyComplete(planetType, planetRate, price, finalFloat, modelMeta);
      void refreshMarketListings();
      const label = modelMeta.modelName || PLANET_CONFIG[planetType].label;
      showToast(`${label} added to your farm!`, true);
    } else {
      showToast(result.error ?? "Purchase failed", false);
    }
  };

  const handleBuyLocal = (listing: MarketListing) => {
    const result = onBuy(listing);
    if (result.success) {
      showToast(`${PLANET_CONFIG[listing.name].label} planet added to your farm!`, true);
    } else {
      showToast(result.reason ?? "Purchase failed", false);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">{t("market.title")}</h2>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setTab("listings")}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
            style={{
              borderColor: tab === "listings" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)",
              background: tab === "listings" ? "rgba(255,255,255,0.08)" : "transparent",
              color: tab === "listings" ? "#E8ECF4" : "rgba(255,255,255,0.35)",
            }}
            data-testid="tab-listings"
          >
            LISTINGS
          </button>
          <button
            onClick={() => setTab("activity")}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all relative"
            style={{
              borderColor: tab === "activity" ? "rgba(0,230,118,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === "activity" ? "rgba(0,230,118,0.08)" : "transparent",
              color: tab === "activity" ? "#00e676" : "rgba(255,255,255,0.35)",
            }}
            data-testid="tab-activity"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: "#00e676", boxShadow: "0 0 8px #00e676", animation: "pulse 1.5s infinite" }} />
            Live Activity
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {tab === "activity" ? (
          <div className="flex flex-col gap-2 mt-2">
            {sales.length === 0 && (
              <div className="text-center py-10 flex flex-col items-center gap-2">
                <div style={{ fontSize: 32, opacity: 0.15 }}>📡</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Waiting for the next sale...
                </div>
              </div>
            )}
          <div className="grid grid-cols-2 gap-3 mt-2">
            {sales.map((s) => {
              const cfg = PLANET_CONFIG[s.planetType as PlanetType];
              if (!cfg) return null;
              const ago = Math.max(0, Math.floor((Date.now() - s.soldAt) / 1000));
              const agoLabel = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
              const isPulsing = pulseId === s.id;
              const view: MarketPlanetListingView = {
                id: `sale-${s.id}`,
                name: s.planetType as PlanetType,
                price: s.price,
                rate: s.planetRate,
                seller: s.sellerName,
                isOwn: false,
                planetFloat: s.planetFloat,
                displayName: deterministicNameFromId(`sale-${s.id}`),
                modelId: (s as MarketSale & { modelId?: string | null }).modelId ?? null,
                shapeId: (s as MarketSale & { shapeId?: string | null }).shapeId ?? null,
              };
              return (
                <MarketPlanetCard
                  key={s.id}
                  listing={view}
                  canBuy={false}
                  highlighted={isPulsing}
                  suspendGl={!visible}
                  onBuy={() => {}}
                  onUnlist={() => {}}
                  statusText={`${s.buyerName} bought · ${agoLabel}`}
                />
              );
            })}
          </div>
          </div>
        ) : (
        <div className="flex flex-col gap-3">

          {/* Filter rows: rarity pills now span the full width on their
              own line so the new MYTHIC tier (and any future ones) fit
              without being hidden behind the FLOAT widget. The widget
              moved to its own row, right-aligned. A subtle fade on the
              right edge of the rarity row hints that the list scrolls. */}
          <div
            className="flex gap-2 overflow-x-auto -mx-1 px-1"
            style={{
              scrollbarWidth: "none",
              WebkitMaskImage: "linear-gradient(to right, #000 0, #000 calc(100% - 18px), transparent 100%)",
              maskImage: "linear-gradient(to right, #000 0, #000 calc(100% - 18px), transparent 100%)",
            }}
          >
            {RARITY_FILTERS.map((f) => {
              const accent = f === "ALL"
                ? "#E8ECF4"
                : f === "EQUIPMENT"
                  ? EQUIPMENT_FILTER_COLOR
                  : f === "ITEMS"
                    ? ITEMS_FILTER_COLOR
                    : RARITY_COLORS[f] ?? "#8892b0";
              const label = f === "ALL"
                ? "All"
                : f === "EQUIPMENT"
                  ? "Equipment"
                  : f === "ITEMS"
                    ? "Items"
                    : f === "V1_NFT"
                      ? "V1 NFT"
                      : PLANET_CONFIG[f].label;
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider border transition-all"
                  style={{
                    borderColor: isActive ? accent + "66" : "rgba(255,255,255,0.08)",
                    background: isActive ? accent + "12" : "transparent",
                    color: isActive ? accent : "rgba(255,255,255,0.35)",
                  }}
                  data-testid={`filter-${f.toLowerCase()}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              data-testid="market-float-sort"
            >
              <span
                className="text-[9px] font-bold tracking-wider"
                style={{ color: "rgba(255,255,255,0.4)", marginRight: 2 }}
              >
                FLOAT
              </span>
              <button
                type="button"
                onClick={() => setFloatSort((d) => (d === "asc" ? null : "asc"))}
                aria-label="Sort by Float low to high"
                aria-pressed={floatSort === "asc"}
                data-testid="market-sort-float-asc"
                className="flex items-center justify-center"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: floatSort === "asc" ? "rgba(158,197,232,0.20)" : "transparent",
                  border: floatSort === "asc" ? "1px solid rgba(158,197,232,0.45)" : "1px solid transparent",
                  color: floatSort === "asc" ? "#9EC5E8" : "rgba(255,255,255,0.45)",
                  fontSize: 11, lineHeight: 1, fontWeight: 900,
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setFloatSort((d) => (d === "desc" ? null : "desc"))}
                aria-label="Sort by Float high to low"
                aria-pressed={floatSort === "desc"}
                data-testid="market-sort-float-desc"
                className="flex items-center justify-center"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: floatSort === "desc" ? "rgba(158,197,232,0.20)" : "transparent",
                  border: floatSort === "desc" ? "1px solid rgba(158,197,232,0.45)" : "1px solid transparent",
                  color: floatSort === "desc" ? "#9EC5E8" : "rgba(255,255,255,0.45)",
                  fontSize: 11, lineHeight: 1, fontWeight: 900,
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                ▼
              </button>
            </div>
          </div>

          {loading && serverListings.length === 0 && filtered.length === 0 && (
            <div className="text-center py-10 flex flex-col items-center gap-2">
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Loading marketplace...</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
          {filtered.map((listing) => {
            const cfg = PLANET_CONFIG[listing.name];
            if (!cfg) return null;
            const isOwn = listing.isLocal;
            const canBuy = !isOwn && depositBalance >= listing.price * 0.5 && earnedBalance >= listing.price * 0.5 && myListings.filter((p) => !p.isListedInMarket).length < maxSlots;
            const isFocused = listing.serverId != null && highlightId === listing.serverId;
            const view: MarketPlanetListingView = {
              id: listing.id,
              name: listing.name,
              price: listing.price,
              rate: listing.rate,
              seller: isOwn ? "you" : listing.seller,
              isOwn,
              serverId: listing.serverId,
              planetFloat: listing.planetFloat,
              displayName: listing.displayName,
              farmDurationHours: listing.farmDurationHours,
              modelId: listing.modelId,
              shapeId: listing.shapeId,
            };
            return (
              <MarketPlanetCard
                key={listing.id}
                listing={view}
                canBuy={canBuy}
                highlighted={isFocused}
                suspendGl={!visible}
                sharing={sharingId === listing.serverId}
                onBuy={() => {
                  if (listing.serverId) {
                    handleBuyServer(
                      listing.serverId,
                      listing.name,
                      listing.rate,
                      listing.price,
                      listing.planetFloat ?? null,
                      {
                        modelId: listing.modelId,
                        shapeId: listing.shapeId,
                        modelName: listing.displayName,
                      },
                    );
                  } else {
                    handleBuyLocal(listing as MarketListing);
                  }
                }}
                onUnlist={() => onUnlist(listing.id)}
                onShare={listing.serverId != null && isOwn ? () => handleShare(listing.serverId as number) : undefined}
              />
            );
          })}
          </div>

          {/* Collectible item listings — shown when filter is ALL or ITEMS. */}
          {(filter === "ALL" || filter === "ITEMS") && itemListings.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="text-[10px] font-black tracking-widest px-1" style={{ color: "rgba(220,235,255,0.5)" }}>
                ITEMS
              </div>
              {itemListings.map((l) => {
                const itemType = l.equipmentCategory as ItemType | null;
                const cfg = itemType ? ITEM_CONFIG[itemType] : null;
                if (!cfg) return null;
                const rarityColor = cfg.rarity ? ITEM_RARITY_COLOR[cfg.rarity as keyof typeof ITEM_RARITY_COLOR] : "#8892b0";
                const rarityLabel = cfg.rarity ? ITEM_RARITY_LABEL[cfg.rarity as keyof typeof ITEM_RARITY_LABEL] : cfg.rarity;
                const isOwn = l.sellerTelegramId === telegramId;
                const canBuy = !isOwn && depositBalance >= l.price * 0.5 && earnedBalance >= l.price * 0.5;
                const bokehColor = cfg.glowColor ?? `rgba(180,140,255,0.5)`;
                return (
                  <div
                    key={`item-${l.id}`}
                    className="rounded-2xl border overflow-hidden"
                    style={{
                      borderColor: `${rarityColor}33`,
                      background: `linear-gradient(135deg, ${rarityColor}10 0%, rgba(6,8,16,0.65) 100%)`,
                    }}
                    data-testid={`item-listing-${l.id}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Emoji orb with bokeh glow */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                        style={{
                          background: `radial-gradient(circle at 40% 35%, ${rarityColor}44 0%, ${rarityColor}18 60%, rgba(6,8,16,0.8) 100%)`,
                          boxShadow: `0 0 16px ${bokehColor}`,
                          fontSize: 28,
                        }}
                      >
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm tracking-wide" style={{ color: rarityColor }}>
                          {cfg.label}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded-full border"
                            style={{
                              color: rarityColor, borderColor: `${rarityColor}33`,
                              background: `${rarityColor}10`,
                            }}
                          >
                            {rarityLabel}
                          </span>
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded-full border"
                            style={{
                              color: isOwn ? "#C9D6E8" : "#E8ECF4",
                              borderColor: isOwn ? "rgba(201,214,232,0.28)" : "rgba(255,255,255,0.12)",
                              background: isOwn ? "rgba(201,214,232,0.08)" : "rgba(255,255,255,0.04)",
                            }}
                          >
                            {isOwn ? "👤 you" : `👤 ${l.sellerName ?? `Player ${l.sellerTelegramId.slice(-4)}`}`}
                          </span>
                        </div>
                        <div className="text-xs font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                          +{(l.equipmentRate ?? cfg.rate ?? 0).toLocaleString()} $ZOOM/hr · always active
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="font-black text-sm" style={{ color: rarityColor }}>
                          {l.price.toLocaleString()} TON
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-3" style={{ borderTop: `1px solid ${rarityColor}12` }}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>P2P TON</div>
                        {isOwn ? (
                          <button
                            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                            style={{ borderColor: "rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                            onClick={() => { if (l.equipmentId) onUnlistItem(l.equipmentId); }}
                            data-testid={`btn-item-unlist-${l.id}`}
                          >
                            Delist
                          </button>
                        ) : (
                          <button
                            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                            disabled={!canBuy}
                            style={{
                              borderColor: canBuy ? "rgba(0,230,118,0.3)" : "rgba(255,255,255,0.06)",
                              background: canBuy ? "rgba(0,230,118,0.08)" : "transparent",
                              color: canBuy ? "#00e676" : "rgba(255,255,255,0.15)",
                              cursor: canBuy ? "pointer" : "not-allowed",
                            }}
                            onClick={async () => {
                              const res = await onBuyItem(l);
                              if (res.success) {
                                showToast(`${cfg.emoji} ${cfg.label} added to your inventory!`, true);
                              } else {
                                showToast(res.reason ?? "Purchase failed", false);
                              }
                            }}
                            data-testid={`btn-item-buy-${l.id}`}
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Equipment listings — same listings tab, distinct card. Shown
              when the filter is ALL (planets + equipment) or EQUIPMENT
              (gear only). Any planet-rarity filter hides this block. */}
          {(filter === "ALL" || filter === "EQUIPMENT") && equipmentListings.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <div
                className="text-[10px] font-black tracking-widest px-1"
                style={{ color: "rgba(220,235,255,0.5)" }}
              >
                EQUIPMENT
              </div>
              {equipmentListings.map((l) => {
                const cat = l.equipmentCategory as EquipmentCategory | null;
                const rar = l.equipmentRarity as EquipmentRarity | null;
                if (!cat || !rar || !EQUIPMENT_CATEGORIES[cat] || !EQUIPMENT_RARITY_INFO[rar]) {
                  return null;
                }
                const info = EQUIPMENT_CATEGORIES[cat];
                const r = EQUIPMENT_RARITY_INFO[rar];
                const isOwn = l.sellerTelegramId === telegramId;
                const canBuy = !isOwn && depositBalance >= l.price * 0.5 && earnedBalance >= l.price * 0.5;
                return (
                  <div
                    key={`eq-${l.id}`}
                    className="rounded-2xl border overflow-hidden"
                    style={{
                      borderColor: `${r.color}33`,
                      background: `linear-gradient(135deg, ${r.color}10 0%, rgba(6,8,16,0.65) 100%)`,
                    }}
                    data-testid={`eq-listing-${l.id}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: `radial-gradient(circle at 35% 30%, ${r.color}cc 0%, ${r.color}44 60%, rgba(6,8,16,0.9) 100%)`,
                          boxShadow: `0 0 14px ${r.glowColor}`,
                        }}
                      >
                        <PixelEquipmentIcon category={cat} color={r.color} size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm tracking-wide" style={{ color: r.color }}>
                          {r.label} {info.label.slice(0, -1)}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded-full border"
                            style={{
                              color: isOwn ? "#C9D6E8" : "#E8ECF4",
                              borderColor: isOwn ? "rgba(201,214,232,0.28)" : "rgba(255,255,255,0.12)",
                              background: isOwn ? "rgba(201,214,232,0.08)" : "rgba(255,255,255,0.04)",
                            }}
                          >
                            {isOwn ? "👤 you" : `👤 ${l.sellerName ?? `Player ${l.sellerTelegramId.slice(-4)}`}`}
                          </span>
                        </div>
                        <div className="text-xs font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                          +{(l.equipmentRate ?? 0).toLocaleString()} $ZOOM/hr · 24h cycle
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="font-black text-sm" style={{ color: r.color }}>
                          {l.price.toLocaleString()} TON
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-3" style={{ borderTop: `1px solid ${r.color}12` }}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                          P2P TON
                        </div>
                        {isOwn ? (
                          <button
                            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                            style={{ borderColor: "rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                            onClick={() => {
                              if (l.equipmentId) onUnlistEquipment(l.equipmentId);
                            }}
                            data-testid={`btn-eq-unlist-${l.id}`}
                          >
                            Delist
                          </button>
                        ) : (
                          <button
                            className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                            disabled={!canBuy}
                            style={{
                              borderColor: canBuy ? "rgba(0,230,118,0.3)" : "rgba(255,255,255,0.06)",
                              background: canBuy ? "rgba(0,230,118,0.08)" : "transparent",
                              color: canBuy ? "#00e676" : "rgba(255,255,255,0.15)",
                              cursor: canBuy ? "pointer" : "not-allowed",
                            }}
                            onClick={async () => {
                              const res = await onBuyEquipment(l);
                              if (res.success) {
                                showToast(`${r.label} ${info.label.slice(0, -1)} added to your inventory!`, true);
                              } else {
                                showToast(res.reason ?? "Purchase failed", false);
                              }
                            }}
                            data-testid={`btn-eq-buy-${l.id}`}
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filtered.length === 0 && equipmentListings.length === 0 && itemListings.length === 0 && (
            <div className="text-center py-10 flex flex-col items-center gap-2">
              <div style={{ fontSize: 32, opacity: 0.15 }}>◌</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                No listings yet — list a planet from your Farm
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {toast && (
        <div
          className="absolute bottom-4 left-4 right-4 z-50 rounded-2xl px-4 py-3 flex items-center gap-3 font-bold text-sm slot-enter"
          style={{
            background: toast.ok ? "rgba(0,230,118,0.15)" : "rgba(255,65,108,0.15)",
            border: `1px solid ${toast.ok ? "rgba(0,230,118,0.3)" : "rgba(255,65,108,0.3)"}`,
            color: toast.ok ? "#00e676" : "#ff416c",
          }}
          data-testid="market-toast"
        >
          <span style={{ fontSize: 18 }}>{toast.ok ? "✓" : "✕"}</span>
          {toast.text}
        </div>
      )}
    </div>
  );
}
