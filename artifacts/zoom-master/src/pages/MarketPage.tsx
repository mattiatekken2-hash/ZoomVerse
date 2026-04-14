import { useState } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet } from "../hooks/useGameState";

const MOCK_LISTINGS = [
  { id: "m1", name: "GOLD" as PlanetType, price: 3200, seller: "cosmicwolf", rate: 2000 },
  { id: "m2", name: "EPIC" as PlanetType, price: 840, seller: "stardust99", rate: 400 },
  { id: "m3", name: "RARE" as PlanetType, price: 280, seller: "deepspace42", rate: 80 },
  { id: "m4", name: "BASIC" as PlanetType, price: 45, seller: "nebula_k", rate: 10 },
  { id: "m5", name: "EPIC" as PlanetType, price: 920, seller: "astrox", rate: 400 },
  { id: "m6", name: "RARE" as PlanetType, price: 310, seller: "galaxis", rate: 80 },
];

const RARITY_FILTERS: (PlanetType | "ALL")[] = ["ALL", "BASIC", "RARE", "EPIC", "GOLD"];
const RARITY_CLASS: Record<string, string> = {
  BASIC: "rarity-basic",
  RARE: "rarity-rare",
  EPIC: "rarity-epic",
  GOLD: "rarity-gold",
};

interface MarketPageProps {
  balance: number;
  myListings: Planet[];
}

export function MarketPage({ balance, myListings }: MarketPageProps) {
  const [filter, setFilter] = useState<PlanetType | "ALL">("ALL");

  const allListings = [
    ...myListings.filter(p => p.isListedInMarket).map(p => ({
      id: p.id, name: p.name, price: Math.floor(p.craftCost * 2.5), seller: "you", rate: p.rate,
    })),
    ...MOCK_LISTINGS,
  ];

  const filtered = filter === "ALL" ? allListings : allListings.filter(l => l.name === filter);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <h2 className="font-black text-lg tracking-tight">Marketplace</h2>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          25% $ZOOM fee · P2P trading
        </p>
      </div>

      <div className="px-4 pb-3 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {RARITY_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider border transition-all"
            style={{
              borderColor: filter === f ? "rgba(0,242,254,0.4)" : "rgba(255,255,255,0.08)",
              background: filter === f ? "rgba(0,242,254,0.08)" : "transparent",
              color: filter === f ? "#00f2fe" : "rgba(255,255,255,0.35)",
            }}
            data-testid={`filter-${f.toLowerCase()}`}
          >
            {f === "ALL" ? "All" : PLANET_CONFIG[f].label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-2.5">
          {filtered.map(listing => {
            const cfg = PLANET_CONFIG[listing.name];
            const fakePlanet = {
              id: listing.id, name: listing.name, color: cfg.color, glowColor: cfg.glowColor,
              rate: listing.rate, craftCost: 0, createdAt: 0, farmStartedAt: 0,
              lastCollectedAt: 0, isListedInMarket: true,
            } as Planet;
            const fee = Math.floor(listing.price * 0.25);
            const total = listing.price + fee;

            return (
              <div
                key={listing.id}
                className="rounded-2xl border flex items-center gap-3 px-4 py-3"
                style={{
                  borderColor: cfg.color + "25",
                  background: `linear-gradient(135deg, ${cfg.color}06, rgba(6,8,16,0.5))`,
                }}
                data-testid={`listing-${listing.id}`}
              >
                <PlanetOrb planet={fakePlanet} size={52} animate={false} />
                <div className="flex-1 min-w-0">
                  <div className={`font-black text-sm ${RARITY_CLASS[listing.name]}`}>
                    {cfg.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    +{listing.rate.toLocaleString()}/hr · by {listing.seller}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Fee: {fee} · Total: {total} $ZOOM
                  </div>
                </div>
                <button
                  className="flex-shrink-0 px-4 py-2 rounded-xl font-bold text-xs tracking-wider transition-all active:scale-95 border"
                  style={{
                    borderColor: listing.seller === "you" ? "rgba(255,255,255,0.1)" : cfg.color + "44",
                    background: listing.seller === "you" ? "transparent" : cfg.color + "12",
                    color: listing.seller === "you" ? "rgba(255,255,255,0.3)" : cfg.color,
                    cursor: listing.seller === "you" ? "not-allowed" : "pointer",
                  }}
                  disabled={listing.seller === "you" || balance < total}
                  data-testid={`btn-buy-${listing.id}`}
                >
                  {listing.seller === "you" ? "YOURS" : balance < total ? "LOW" : "BUY"}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
              No listings for this rarity
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
