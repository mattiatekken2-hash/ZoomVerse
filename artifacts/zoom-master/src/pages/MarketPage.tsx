import { useState, useEffect } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { fetchMarketListings, buyFromMarket, type ServerMarketListing } from "../utils/api";


const RARITY_FILTERS: (PlanetType | "ALL")[] = ["ALL", "BASIC", "RARE", "EPIC", "GOLD"];

const RARITY_COLORS: Record<string, string> = {
  BASIC: "#8892b0",
  RARE: "#4facfe",
  EPIC: "#c471ed",
  GOLD: "#ffd700",
};

interface MarketPageProps {
  balance: number;
  myListings: Planet[];
  maxSlots: number;
  telegramId: string | null;
  onBuy: (listing: MarketListing) => { success: boolean; reason?: string };
  onUnlist: (id: string) => void;
  onServerBuyComplete: (planetType: PlanetType, planetRate: number, pricePaid: number) => void;
}

interface Toast { text: string; ok: boolean }

export function MarketPage({ balance, myListings, maxSlots, telegramId, onBuy, onUnlist, onServerBuyComplete }: MarketPageProps) {
  const [filter, setFilter] = useState<PlanetType | "ALL">("ALL");
  const [toast, setToast] = useState<Toast | null>(null);
  const [serverListings, setServerListings] = useState<ServerMarketListing[]>([]);
  const [loading, setLoading] = useState(true);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const listings = await fetchMarketListings();
      if (!cancelled) {
        setServerListings(listings);
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const userListings: MarketListing[] = myListings
    .filter((p) => p.isListedInMarket && p.marketPrice)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.marketPrice!,
      seller: "you",
      rate: p.rate,
    }));

  const otherListings = serverListings.filter(
    (l) => l.sellerTelegramId !== telegramId
  );

  const allDisplayListings = [
    ...userListings.map((l) => ({ ...l, isLocal: true as const, serverId: undefined as number | undefined })),
    ...otherListings.map((l) => ({
      id: `server-${l.id}`,
      name: l.planetType as PlanetType,
      price: l.price,
      seller: l.sellerName || `Player ${l.sellerTelegramId.slice(-4)}`,
      rate: l.planetRate,
      isLocal: false as const,
      serverId: l.id,
    })),
  ];

  const filtered = filter === "ALL" ? allDisplayListings : allDisplayListings.filter((l) => l.name === filter);

  const handleBuyServer = async (serverId: number, planetType: PlanetType, planetRate: number, price: number) => {
    if (!telegramId) return;
    const fee = Math.floor(price * 0.25);
    const total = price + fee;
    if (balance < total) {
      showToast("Insufficient $ZOOM balance", false);
      return;
    }
    if (myListings.filter((p) => !p.isListedInMarket).length >= maxSlots) {
      showToast("No free slots available", false);
      return;
    }
    const result = await buyFromMarket(telegramId, serverId);
    if (result.ok) {
      onServerBuyComplete(planetType, planetRate, total);
      setServerListings((prev) => prev.filter((l) => l.id !== serverId));
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
        <h2 className="font-black text-lg tracking-tight">Marketplace</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          25% $ZOOM fee · P2P trading · {filtered.length} listings
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">

          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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
                {f === "ALL" ? "All" : PLANET_CONFIG[f].label}
              </button>
            ))}
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

            return (
              <div
                key={listing.id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  borderColor: isOwn ? "rgba(255,215,0,0.3)" : rarityColor + "28",
                  background: `linear-gradient(135deg, ${rarityColor}07 0%, rgba(6,8,16,0.65) 100%)`,
                }}
                data-testid={`listing-${listing.id}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <PlanetOrb planet={fakePlanet} size={56} animate={false} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="font-black text-sm px-2.5 py-0.5 rounded-full border"
                        style={{ color: rarityColor, borderColor: rarityColor + "44", background: rarityColor + "12" }}
                      >
                        {cfg.label}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border font-bold"
                        style={{
                          color: isOwn ? "#ffd700" : "#00f2fe",
                          borderColor: isOwn ? "rgba(255,215,0,0.25)" : "rgba(0,242,254,0.25)",
                          background: isOwn ? "rgba(255,215,0,0.06)" : "rgba(0,242,254,0.06)",
                        }}
                      >
                        {isOwn ? "👤 you" : `👤 ${listing.seller}`}
                      </span>
                    </div>
                    <div className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
                      +{listing.rate.toLocaleString()} $ZOOM/hr
                    </div>
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
                            handleBuyServer(listing.serverId, listing.name, listing.rate, listing.price);
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
