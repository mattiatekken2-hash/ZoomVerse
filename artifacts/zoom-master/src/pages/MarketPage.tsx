import { useState, useEffect } from "react";
import { PlanetOrb } from "../components/PlanetOrb";
import { PLANET_CONFIG } from "../hooks/useGameState";
import type { PlanetType, Planet, MarketListing } from "../hooks/useGameState";
import { fetchMarketListings, buyFromMarket, fetchMarketSales, openMarketActivityStream, fetchMyListings, reactivateListing, type ServerMarketListing, type MarketSale, type MyListing } from "../utils/api";


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
  const [sales, setSales] = useState<MarketSale[]>([]);
  const [tab, setTab] = useState<"listings" | "activity" | "mine">("listings");
  const [pulseId, setPulseId] = useState<number | null>(null);
  const [mine, setMine] = useState<MyListing[]>([]);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const refreshMyListings = async () => {
    if (!telegramId) return;
    const list = await fetchMyListings(telegramId);
    setMine(list);
  };

  useEffect(() => {
    if (!telegramId) return;
    refreshMyListings();
    const interval = setInterval(refreshMyListings, 30_000);
    const onRefresh = () => refreshMyListings();
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => { clearInterval(interval); window.removeEventListener("zoom-data-refresh", onRefresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  useEffect(() => {
    const i = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const handleReactivate = async (l: MyListing) => {
    if (!telegramId) return;
    if (balance < l.reactivationFee) {
      showToast(`Need ${l.reactivationFee} $ZOOM to reactivate`, false);
      return;
    }
    setReactivatingId(l.id);
    const r = await reactivateListing(telegramId, l.id);
    setReactivatingId(null);
    if (r.ok) {
      showToast(`Listing reactivated · -${r.fee} $ZOOM`, true);
      await refreshMyListings();
      const fresh = await fetchMarketListings();
      setServerListings(fresh);
      window.dispatchEvent(new CustomEvent("zoom-credit-local", { detail: { amount: -(r.fee ?? 0) } }));
    } else {
      showToast(r.error ?? "Reactivation failed", false);
    }
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

  useEffect(() => {
    let cancelled = false;
    fetchMarketSales().then((s) => { if (!cancelled) setSales(s); });
    const close = openMarketActivityStream((sale) => {
      setSales((prev) => {
        if (prev.some((p) => p.id === sale.id)) return prev;
        return [sale, ...prev].slice(0, 20);
      });
      setPulseId(sale.id);
      setTimeout(() => setPulseId((id) => (id === sale.id ? null : id)), 2200);
    });
    return () => { cancelled = true; close(); };
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
      seller: l.sellerName || (l.sellerTelegramId ? `Player ${String(l.sellerTelegramId).slice(-4)}` : "Anon"),
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
            Live
          </button>
          <button
            onClick={() => setTab("mine")}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all relative"
            style={{
              borderColor: tab === "mine" ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === "mine" ? "rgba(255,215,0,0.08)" : "transparent",
              color: tab === "mine" ? "#ffd700" : "rgba(255,255,255,0.35)",
            }}
            data-testid="tab-mine"
          >
            ⚡ Mine
            {mine.some((m) => m.expired) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: "#ff5252", boxShadow: "0 0 6px #ff5252", animation: "pulse 1.2s infinite" }} />
            )}
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
                  <PlanetOrb planet={fakePlanet} size={42} animate={false} />
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
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{agoLabel}</div>
                  </div>
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
        ) : tab === "mine" ? (
          <div className="flex flex-col gap-2 mt-2">
            {!telegramId && (
              <div className="text-center py-10 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                Open in Telegram to manage your listings
              </div>
            )}
            {telegramId && mine.length === 0 && (
              <div className="text-center py-10 flex flex-col items-center gap-2">
                <div style={{ fontSize: 32, opacity: 0.15 }}>📦</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  No active listings yet
                </div>
                <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Listings stay online for 24h, then need reactivation
                </div>
              </div>
            )}
            {mine.map((l) => {
              const cfg = PLANET_CONFIG[l.planetType as PlanetType];
              if (!cfg) return null;
              const rarityColor = RARITY_COLORS[l.planetType] ?? "#8892b0";
              const fakePlanet = {
                id: `mine-${l.id}`,
                name: l.planetType as PlanetType,
                color: cfg.color,
                glowColor: cfg.glowColor,
                rate: l.planetRate,
                craftCost: 0,
                createdAt: 0,
                farmStartedAt: 0,
                lastCollectedAt: 0,
                isListedInMarket: false,
                isFarmingActive: false,
              } as Planet;
              const remaining = Math.max(0, l.lastActivatedAt + 24 * 60 * 60 * 1000 - Date.now());
              const hLeft = Math.floor(remaining / 3600000);
              const mLeft = Math.floor((remaining % 3600000) / 60000);
              const canAfford = balance >= l.reactivationFee;
              return (
                <div
                  key={l.id}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: l.expired ? "rgba(255,82,82,0.4)" : rarityColor + "33",
                    background: l.expired
                      ? "linear-gradient(135deg, rgba(255,82,82,0.06) 0%, rgba(6,8,16,0.6) 100%)"
                      : `linear-gradient(135deg, ${rarityColor}06 0%, rgba(6,8,16,0.55) 100%)`,
                  }}
                  data-testid={`mine-${l.id}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <PlanetOrb planet={fakePlanet} size={48} animate={!l.expired} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ color: rarityColor, background: rarityColor + "14", border: `1px solid ${rarityColor}33` }}>
                          {cfg.label}
                        </span>
                        {l.expired ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color: "#ff5252", background: "rgba(255,82,82,0.12)", border: "1px solid rgba(255,82,82,0.4)" }}>
                            ⏱ EXPIRED · OFFLINE
                          </span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color: "#00e676", background: "rgba(0,230,118,0.12)", border: "1px solid rgba(0,230,118,0.4)" }}>
                            ● ONLINE · {hLeft}h {mLeft}m left
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-bold mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {l.price.toLocaleString()} <span style={{ color: "rgba(255,255,255,0.3)" }}>$ZOOM · +{l.planetRate.toLocaleString()}/hr</span>
                      </div>
                    </div>
                  </div>
                  {l.expired ? (
                    <button
                      className="w-full py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all active:scale-95"
                      disabled={!canAfford || reactivatingId === l.id}
                      onClick={() => handleReactivate(l)}
                      style={{
                        background: canAfford
                          ? `linear-gradient(135deg, ${rarityColor}cc, ${rarityColor}88)`
                          : "rgba(255,82,82,0.1)",
                        color: canAfford ? "#060810" : "#ff6b6b",
                        boxShadow: canAfford ? `0 0 18px ${rarityColor}44` : "none",
                        border: canAfford ? "none" : "1px solid rgba(255,82,82,0.3)",
                        cursor: canAfford ? "pointer" : "not-allowed",
                        opacity: reactivatingId === l.id ? 0.6 : 1,
                      }}
                      data-testid={`btn-reactivate-listing-${l.id}`}
                    >
                      {reactivatingId === l.id ? "REACTIVATING..." : `🔄 REACTIVATE · ${l.reactivationFee} $ZOOM`}
                    </button>
                  ) : (
                    <div className="text-[10px] text-center py-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Visible to buyers · auto-expires in 24h
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
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
