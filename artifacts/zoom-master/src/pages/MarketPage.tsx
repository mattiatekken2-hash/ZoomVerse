import { useState, useEffect } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { buyFromMarket, openMarketActivityStream } from "../utils/api";
import { useGlobalStore, pushMarketSale, refreshMarketListings } from "../store/globalStore";
import { PlanetFloatBar } from "../components/PlanetFloatBar";
import { getListingDisplayFloat, FLOAT_PLANET_TYPES } from "../utils/planetFloat";
import { getPlanetDisplayName, deterministicNameFromId } from "../utils/planetNames";
import { useT } from "../i18n/LanguageContext";


const RARITY_FILTERS: (PlanetType | "ALL")[] = ["ALL", "BASIC", "RARE", "EPIC", "MYTHIC", "GOLD", "V1_NFT"];

const RARITY_COLORS: Record<string, string> = {
  BASIC: "#8892b0",
  V1: "#f5fbff",
  V1_NFT: "#cfe4ff",
  RARE: "#4facfe",
  EPIC: "#c471ed",
  MYTHIC: "#ff4500",
  GOLD: "#ffd700",
};

interface MarketPageProps {
  balance: number;
  myListings: Planet[];
  maxSlots: number;
  telegramId: string | null;
  onBuy: (listing: MarketListing) => { success: boolean; reason?: string };
  onUnlist: (id: string) => void;
  onServerBuyComplete: (planetType: PlanetType, planetRate: number, pricePaid: number, planetFloat?: number | null) => void;
}

interface Toast { text: string; ok: boolean }

export function MarketPage({ balance, myListings, maxSlots, telegramId, onBuy, onUnlist, onServerBuyComplete }: MarketPageProps) {
  const { t } = useT();
  const [filter, setFilter] = useState<PlanetType | "ALL">("ALL");
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

  useEffect(() => {
    const close = openMarketActivityStream((sale) => {
      pushMarketSale(sale);
      setPulseId(sale.id);
      setTimeout(() => setPulseId((id) => (id === sale.id ? null : id)), 2200);
    });
    return () => { close(); };
  }, []);

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
    }));

  const otherListings = serverListings.filter(
    (l) => l.sellerTelegramId !== telegramId
  );

  const allDisplayListings = [
    ...userListings.map((l) => ({
      ...l,
      isLocal: true as const,
      serverId: undefined as number | undefined,
      // userListings already carries planetFloat + displayName from the
      // seller's local Planet (built above), so nothing to re-fill here.
    })),
    ...otherListings.map((l) => ({
      id: `server-${l.id}`,
      name: l.planetType as PlanetType,
      price: l.price,
      seller: l.sellerName || `Player ${l.sellerTelegramId.slice(-4)}`,
      rate: l.planetRate,
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
    })),
  ];

  const filteredBase = filter === "ALL" ? allDisplayListings : allDisplayListings.filter((l) => l.name === filter);

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

  const handleBuyServer = async (serverId: number, planetType: PlanetType, planetRate: number, price: number, planetFloat: number | null) => {
    if (!telegramId) return;
    const fee = Math.floor(price * 0.25);
    const total = price + fee;
    if (balance < total) {
      showToast("Insufficient $ZOOM balance", false);
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
      onServerBuyComplete(planetType, planetRate, total, finalFloat);
      void refreshMarketListings();
      showToast(`${PLANET_CONFIG[planetType].label} planet added to your farm!`, true);
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
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          25% $ZOOM fee · P2P trading · {filtered.length} listings
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setTab("listings")}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
            style={{
              borderColor: tab === "listings" ? "rgba(0,242,254,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === "listings" ? "rgba(0,242,254,0.08)" : "transparent",
              color: tab === "listings" ? "#00f2fe" : "rgba(255,255,255,0.35)",
            }}
            data-testid="tab-listings"
          >
            🛒 Listings
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
            {sales.map((s) => {
              const cfg = PLANET_CONFIG[s.planetType as PlanetType];
              if (!cfg) return null;
              const rarityColor = RARITY_COLORS[s.planetType] ?? "#8892b0";
              const fakePlanet = {
                id: `sale-${s.id}`,
                name: s.planetType as PlanetType,
                color: cfg.color,
                glowColor: cfg.glowColor,
                rate: s.planetRate,
                craftCost: 0,
                createdAt: 0,
                farmStartedAt: 0,
                lastCollectedAt: 0,
                isListedInMarket: false,
                isFarmingActive: false,
              } as Planet;
              const ago = Math.max(0, Math.floor((Date.now() - s.soldAt) / 1000));
              const agoLabel = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
              const isPulsing = pulseId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border flex items-center gap-3 px-3 py-2.5"
                  style={{
                    borderColor: isPulsing ? "#00e676" : rarityColor + "22",
                    background: isPulsing
                      ? "rgba(0,230,118,0.08)"
                      : `linear-gradient(135deg, ${rarityColor}06 0%, rgba(6,8,16,0.55) 100%)`,
                    boxShadow: isPulsing ? "0 0 24px rgba(0,230,118,0.45)" : "none",
                    transition: "all 0.4s ease",
                  }}
                  data-testid={`sale-${s.id}`}
                >
                  {(() => {
                    const saleFloat = FLOAT_PLANET_TYPES.has(s.planetType)
                      ? getListingDisplayFloat({ id: `sale-${s.id}`, planetFloat: s.planetFloat })
                      : undefined;
                    return (
                      <>
                        <PlanetOrb planet={fakePlanet} size={42} animate={false} displayFloat={saleFloat} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ color: rarityColor, background: rarityColor + "14", border: `1px solid ${rarityColor}33` }}>
                              {cfg.label}
                            </span>
                            {isPulsing && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color: "#00e676", background: "rgba(0,230,118,0.15)", border: "1px solid rgba(0,230,118,0.4)" }}>
                                NEW
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                            <span style={{ color: "#ffd700" }}>{s.buyerName}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}> bought from </span>
                            <span style={{ color: "#4facfe" }}>{s.sellerName}</span>
                          </div>
                          {typeof saleFloat === "number" && (
                            <div className="mt-1">
                              <PlanetFloatBar value={saleFloat} compact />
                            </div>
                          )}
                          <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{agoLabel}</div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex flex-col items-end flex-shrink-0">
                    <div className="text-xs font-black" style={{ color: rarityColor }}>
                      {s.price.toLocaleString()}
                    </div>
                    <div className="text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>$ZOOM</div>
                  </div>
                </div>
              );
            })}
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
            {RARITY_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider border transition-all"
                style={{
                  borderColor: filter === f
                    ? (f === "ALL" ? "rgba(0,242,254,0.4)" : RARITY_COLORS[f] + "66")
                    : "rgba(255,255,255,0.08)",
                  background: filter === f
                    ? (f === "ALL" ? "rgba(0,242,254,0.08)" : RARITY_COLORS[f] + "12")
                    : "transparent",
                  color: filter === f
                    ? (f === "ALL" ? "#00f2fe" : RARITY_COLORS[f])
                    : "rgba(255,255,255,0.35)",
                }}
                data-testid={`filter-${f.toLowerCase()}`}
              >
                {f === "ALL" ? "All" : f === "V1_NFT" ? "V1 NFT" : PLANET_CONFIG[f].label}
              </button>
            ))}
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
                  background: floatSort === "asc" ? "rgba(0,242,254,0.20)" : "transparent",
                  border: floatSort === "asc" ? "1px solid rgba(0,242,254,0.55)" : "1px solid transparent",
                  color: floatSort === "asc" ? "#00f2fe" : "rgba(255,255,255,0.45)",
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
                  background: floatSort === "desc" ? "rgba(0,242,254,0.20)" : "transparent",
                  border: floatSort === "desc" ? "1px solid rgba(0,242,254,0.55)" : "1px solid transparent",
                  color: floatSort === "desc" ? "#00f2fe" : "rgba(255,255,255,0.45)",
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

          {filtered.map((listing) => {
            const cfg = PLANET_CONFIG[listing.name];
            if (!cfg) return null;
            const rarityColor = RARITY_COLORS[listing.name];
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
              marketPrice: listing.price,
            } as Planet;

            const fee = Math.floor(listing.price * 0.25);
            const total = listing.price + fee;
            const isOwn = listing.isLocal;
            const canBuy = !isOwn && balance >= total && myListings.filter((p) => !p.isListedInMarket).length < maxSlots;
            const isPlatinumNft = listing.name === "V1_NFT";
            const listingFloat = FLOAT_PLANET_TYPES.has(listing.name)
              ? getListingDisplayFloat({ id: listing.serverId ?? listing.id, planetFloat: listing.planetFloat })
              : undefined;
            const isPerfectFloat = typeof listingFloat === "number" && listingFloat >= 1;

            return (
              <div
                key={listing.id}
                className={`rounded-2xl border overflow-hidden ${isPlatinumNft ? "nft-card-glow" : isPerfectFloat ? "perfect-card-glow" : ""}`}
                style={{
                  borderColor: isPlatinumNft
                    ? "rgba(220,232,255,0.10)"
                    : isPerfectFloat
                    ? "rgba(255,215,0,0.10)"
                    : isOwn ? "rgba(255,215,0,0.3)" : rarityColor + "28",
                  background: isPerfectFloat
                    ? "linear-gradient(135deg, rgba(255,215,0,0.18) 0%, rgba(255,170,40,0.10) 45%, rgba(20,12,4,0.85) 100%)"
                    : `linear-gradient(135deg, ${rarityColor}07 0%, rgba(6,8,16,0.65) 100%)`,
                  boxShadow: isPerfectFloat ? "0 0 22px rgba(255,215,0,0.35)" : undefined,
                }}
                data-testid={`listing-${listing.id}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <PlanetOrb planet={fakePlanet} size={56} animate={isPlatinumNft || isPerfectFloat} displayFloat={listingFloat} />
                    {isPlatinumNft && (
                      <span
                        className="nft-badge absolute"
                        style={{ top: -4, left: -4 }}
                        aria-label="NFT"
                      >
                        NFT
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {listing.displayName && (
                      <div
                        className={`font-black text-base tracking-wide mb-0.5 truncate ${isPlatinumNft ? "nft-platinum-text" : ""}`}
                        style={isPlatinumNft ? undefined : { color: rarityColor }}
                        data-testid={`listing-name-${listing.id}`}
                      >
                        {listing.displayName}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded-full border"
                        style={{ color: rarityColor, borderColor: rarityColor + "44", background: rarityColor + "12", fontSize: 9 }}
                      >
                        {cfg.label.toUpperCase()}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border font-bold"
                        style={{
                          color: isOwn ? "#ffd700" : "#00f2fe",
                          borderColor: isOwn ? "rgba(255,215,0,0.25)" : "rgba(0,242,254,0.25)",
                          background: isOwn ? "rgba(255,215,0,0.06)" : "rgba(0,242,254,0.06)",
                          fontSize: 9,
                        }}
                      >
                        {isOwn ? "👤 you" : `👤 ${listing.seller}`}
                      </span>
                    </div>
                    <div className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
                      +{listing.rate.toLocaleString()} $ZOOM/hr
                    </div>
                    {FLOAT_PLANET_TYPES.has(listing.name) && (
                      <div className="mt-1.5">
                        <PlanetFloatBar
                          value={getListingDisplayFloat({
                            id: listing.serverId ?? listing.id,
                            planetFloat: listing.planetFloat,
                          })}
                          compact
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="font-black text-sm" style={{ color: rarityColor }}>
                      {listing.price.toLocaleString()}
                    </div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                      +{fee.toLocaleString()} fee
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-3" style={{ borderTop: `1px solid ${rarityColor}12` }}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Total: {total.toLocaleString()} $ZOOM
                    </div>
                    {isOwn ? (
                      <button
                        className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                        style={{ borderColor: "rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                        onClick={() => onUnlist(listing.id)}
                        data-testid={`btn-unlist-${listing.id}`}
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
                        onClick={() => {
                          if (listing.serverId) {
                            handleBuyServer(listing.serverId, listing.name, listing.rate, listing.price, listing.planetFloat);
                          } else {
                            handleBuyLocal(listing as MarketListing);
                          }
                        }}
                        data-testid={`btn-buy-${listing.id}`}
                      >
                        Buy
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
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
            backdropFilter: "blur(12px)",
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
