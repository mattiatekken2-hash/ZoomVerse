import { useState } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { haptic } from "../utils/haptic";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

const BUNDLES = [
  { id: "b1", name: "Starter Pack", desc: "2,000 $ZOOM + 1 Basic Planet", priceTon: 0.5, zoom: 2000, color: "#8892b0" },
  { id: "b2", name: "Explorer Pack", desc: "8,000 $ZOOM + 1 Rare Planet", priceTon: 1.5, zoom: 8000, color: "#4facfe" },
  { id: "b3", name: "Legend Pack", desc: "25,000 $ZOOM + 1 Epic Planet", priceTon: 4.0, zoom: 25000, color: "#c471ed" },
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const handleCopyWallet = () => {
    haptic();
    navigator.clipboard.writeText(WALLET).catch(() => {});
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
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

  const filtered = filter === "ALL" ? userListings : userListings.filter((l) => l.name === filter);

  const handleBuy = (listing: MarketListing) => {
    haptic();
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

          {/* SHOP WIDGET — top position */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              borderColor: "rgba(255,215,0,0.25)",
              background: "linear-gradient(135deg, rgba(255,215,0,0.07) 0%, rgba(255,140,0,0.03) 100%)",
              boxShadow: "0 0 24px rgba(255,215,0,0.08)",
            }}
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 18 }}>☀️</span>
                <span className="font-black text-sm gold-text tracking-wide">THE SUN</span>
                <span
                  className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(255,215,0,0.12)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.25)" }}
                >
                  EXCLUSIVE
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["Not tradeable", "Max yield", "10,000/hr"].map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,215,0,0.07)", color: "rgba(255,215,0,0.65)", border: "1px solid rgba(255,215,0,0.12)" }}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-xl gold-text">10 TON</div>
                <div
                  className="rounded-xl px-3 py-2 flex items-center justify-between gap-2 border flex-1"
                  style={{ borderColor: "rgba(255,215,0,0.15)", background: "rgba(0,0,0,0.35)" }}
                >
                  <span className="text-xs font-mono truncate" style={{ color: "rgba(255,215,0,0.65)", fontSize: 10 }}>
                    {WALLET}
                  </span>
                  <button
                    onClick={handleCopyWallet}
                    className="flex-shrink-0 px-2.5 py-1 rounded-lg font-bold text-xs transition-all active:scale-95"
                    style={{
                      background: copiedWallet ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.1)",
                      color: copiedWallet ? "#00e676" : "#ffd700",
                      border: `1px solid ${copiedWallet ? "rgba(0,230,118,0.3)" : "rgba(255,215,0,0.2)"}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copiedWallet ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,215,0,0.08)" }}>
              <div className="px-4 py-2 text-xs font-black tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
                Bundles
              </div>
              {BUNDLES.map((bundle, i) => (
                <div
                  key={bundle.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,0.03)" : "none",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-black text-sm"
                    style={{ background: bundle.color + "18", color: bundle.color, border: `1px solid ${bundle.color}25` }}
                  >
                    {bundle.zoom >= 20000 ? "⬡" : bundle.zoom >= 8000 ? "◈" : "◇"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-xs" style={{ color: bundle.color }}>{bundle.name}</div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{bundle.desc}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-black text-sm gold-text">{bundle.priceTon} TON</div>
                  </div>
                </div>
              ))}
              <div className="px-4 pb-3 pt-1 text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                Send TON to the wallet above to receive your bundle
              </div>
            </div>
          </div>

          {/* FILTER PILLS */}
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {RARITY_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => { haptic(5); setFilter(f); }}
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

          {/* USER LISTINGS */}
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
                        style={{ color: rarityColor, borderColor: rarityColor + "44", background: rarityColor + "12" }}
                      >
                        {cfg.label}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border font-bold"
                        style={{ color: "#ffd700", borderColor: "rgba(255,215,0,0.25)", background: "rgba(255,215,0,0.06)" }}
                      >
                        👤 you
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
                    <button
                      className="px-4 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95"
                      style={{ borderColor: "rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.07)", color: "#ffd700" }}
                      onClick={() => { haptic(); onUnlist(listing.id); }}
                      data-testid={`btn-unlist-${listing.id}`}
                    >
                      Delist
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
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
