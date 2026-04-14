import { useState } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";

const INITIAL_MOCK: MarketListing[] = [
  { id: "m1", name: "GOLD", price: 3200, seller: "cosmicwolf", rate: 2000 },
  { id: "m2", name: "EPIC", price: 840, seller: "stardust99", rate: 400 },
  { id: "m3", name: "RARE", price: 280, seller: "deepspace42", rate: 80 },
  { id: "m4", name: "BASIC", price: 45, seller: "nebula_k", rate: 10 },
  { id: "m5", name: "EPIC", price: 920, seller: "astrox", rate: 400 },
  { id: "m6", name: "RARE", price: 310, seller: "galaxis", rate: 80 },
];

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
  onBuy: (listing: MarketListing) => { success: boolean; reason?: string };
  onUnlist: (id: string) => void;
}

interface Toast { text: string; ok: boolean }

export function MarketPage({ balance, myListings, maxSlots, onBuy, onUnlist }: MarketPageProps) {
  const [filter, setFilter] = useState<PlanetType | "ALL">("ALL");
  const [mockListings, setMockListings] = useState<MarketListing[]>(INITIAL_MOCK);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const userListings: MarketListing[] = myListings
    .filter((p) => p.isListedInMarket && p.marketPrice)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.marketPrice!,
      seller: "you",
      rate: p.rate,
    }));

  const allListings = [...userListings, ...mockListings];
  const filtered = filter === "ALL" ? allListings : allListings.filter((l) => l.name === filter);

  const handleBuy = (listing: MarketListing) => {
    const result = onBuy(listing);
    if (result.success) {
      setMockListings((prev) => prev.filter((m) => m.id !== listing.id));
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

      <div className="px-4 pb-3 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
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

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {filtered.map((listing) => {
            const cfg = PLANET_CONFIG[listing.name];
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
            const isOwn = listing.seller === "you";
            const canBuy = !isOwn && balance >= total && myListings.length < maxSlots;

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
                        style={{
                          color: rarityColor,
                          borderColor: rarityColor + "44",
                          background: rarityColor + "12",
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border font-bold"
                        style={{
                          color: isOwn ? "#ffd700" : "rgba(255,255,255,0.4)",
                          borderColor: isOwn ? "rgba(255,215,0,0.25)" : "rgba(255,255,255,0.08)",
                          background: isOwn ? "rgba(255,215,0,0.06)" : "transparent",
                        }}
                      >
                        {isOwn ? "👤 you" : `@${listing.seller}`}
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

                <div
                  className="px-4 pb-3"
                  style={{ borderTop: `1px solid ${rarityColor}12` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                      Total: {total.toLocaleString()} $ZOOM
                    </div>
                    {isOwn ? (
                      <button
                        className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                        style={{
                          borderColor: "rgba(255,215,0,0.3)",
                          background: "rgba(255,215,0,0.07)",
                          color: "#ffd700",
                        }}
                        onClick={() => onUnlist(listing.id)}
                        data-testid={`btn-unlist-${listing.id}`}
                      >
                        Delist
                      </button>
                    ) : (
                      <button
                        className="px-5 py-1.5 rounded-xl text-xs font-black tracking-wider transition-all active:scale-95"
                        disabled={!canBuy}
                        onClick={() => handleBuy(listing)}
                        style={{
                          background: canBuy ? `linear-gradient(135deg, ${rarityColor}cc, ${rarityColor}88)` : "rgba(255,255,255,0.05)",
                          color: canBuy ? "#060810" : "rgba(255,255,255,0.2)",
                          boxShadow: canBuy ? `0 0 16px ${rarityColor}40` : "none",
                          cursor: canBuy ? "pointer" : "not-allowed",
                        }}
                        data-testid={`btn-buy-${listing.id}`}
                      >
                        {myListings.length >= maxSlots
                          ? "FULL"
                          : balance < total
                          ? "LOW $ZOOM"
                          : "BUY NOW"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              No listings for this rarity
            </div>
          )}
        </div>
      </div>

      {/* TOAST */}
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
