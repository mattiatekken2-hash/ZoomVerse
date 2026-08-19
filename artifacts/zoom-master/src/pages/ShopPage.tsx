import { useState, useEffect, useRef } from "react";
import { createStarsInvoice, confirmStarsPurchase, buyShopItemFromStardust, fetchSunStock, pollTxnUntilFinal, fetchHomeState, fetchSlotPrice, fetchStardustMarketPrice, type SunStock, type HomeState, type SlotPriceInfo } from "../utils/api";
import { stardustShopPrice } from "../utils/stardustMarket";
import { useT } from "../i18n/LanguageContext";
import { V1NftWidget } from "../components/V1NftWidget";
import { HallOfFameWidget } from "../components/HallOfFameWidget";
import { LabRankWidget } from "../components/LabRankWidget";
import { ExchangeWidget } from "../components/ExchangeWidget";
import { ZoomStoreWidget } from "../components/ZoomStoreWidget";
import { patchShopPrefetch, readShopPrefetch } from "../utils/shopPrefetch";

const CYAN = "#9EC5E8";
const SHOP_TABS = [
  { id: "exclusive" as const, label: "Exclusive", short: "EXCL.", color: "#ffb347", icon: "☀" },
  { id: "bundles" as const, label: "Bundles", short: "PACK", color: CYAN, icon: "◈" },
  { id: "items" as const, label: "Items", short: "ITEM", color: "#c471ed", icon: "◇" },
  { id: "resources" as const, label: "Stardust", short: "RES.", color: "#ffd740", icon: "★" },
  { id: "lab" as const, label: "Lab", short: "LAB", color: "#a855f7", icon: "⚗" },
  { id: "hub" as const, label: "Hub", short: "HUB", color: "#00d4ff", icon: "◎" },
];

interface ShopItem {
  id: string;
  title: string;
  desc: string;
  starsPrice: number;
  tonPrice: number;
  zoomAmount?: number;
  color: string;
  icon: string;
  type: "bundle" | "sun" | "slot" | "stardust";
}


// Extra Slot is rendered as its own card with a dynamic price
// (escalates per slot already owned, capped at 3 TON).
const EXTRA_SLOT_ITEM: ShopItem = {
  id: "extra_slot", title: "Extra Slot", desc: "Unlock 1 additional planet slot",
  starsPrice: 0, tonPrice: 0.25, color: "#ff3355", icon: "+", type: "slot",
};

// Stardust top-up bundles — paid in Stars or TON via the same shop pay-mode
// toggle. Rendered in their own card group above the existing stardust items
// (Computer/Plant) so players who lack stardust can buy it instantly.
const STARDUST_BUNDLES: ShopItem[] = [
  { id: "stardust_100", title: "Stardust Pack — 100", desc: "Instant top-up · 100 stardust", starsPrice: 100, tonPrice: 1, zoomAmount: 100, color: "#ffd740", icon: "★", type: "stardust" },
  { id: "stardust_500", title: "Stardust Pack — 500", desc: "Instant top-up · 500 stardust", starsPrice: 500, tonPrice: 5, zoomAmount: 500, color: "#ffd740", icon: "★", type: "stardust" },
];

interface StockInfo { sold: number; remaining: number; max: number; }

// Collection bundles — moved into the SHOP (BUNDLES tab). Paid in Stars or TON
// via the same pay-mode toggle as the SUN, both routed through the shop's
// Stars-invoice / TON-deposit flow. `id` matches the backend STARS_CATALOG
// itemType so handleStarsBuy/handleTonBuy work unchanged. `priceStars` mirrors
// the backend STARS_CATALOG (100 Stars = 1 TON ratio, with earth's override).
const COLLECTIONS = [
  { key: "white", id: "white_collection", titleKey: "whiteColl.title", color: "#39ff7e", color2: "#0fd9ff", priceTon: 20, priceStars: 2000, requiresSun: true, userCap: 10, stockEndpoint: "api/white-collection/stock", tags: ["4 exclusive slots", "3.3 GRAM/month", "Requires SUN", "Limited edition"] },
  { key: "earth", id: "earth_collection", titleKey: "earthColl.title", color: "#3b82f6", color2: "#22c55e", priceTon: 5, priceStars: 700, requiresSun: true, userCap: 0, stockEndpoint: "api/earth-collection/stock", tags: ["4 earth slots", "~0.51 GRAM/mo", "Requires SUN", "Public GRAM payout"] },
  { key: "black", id: "black_collection", titleKey: "blackColl.title", color: "#7b2fff", color2: "#c084fc", priceTon: 40, priceStars: 4000, requiresSun: false, userCap: 0, stockEndpoint: "api/black-collection/stock", tags: ["4 black slots", "10 GRAM/month", "On-chain payout", "No SUN required"] },
  { key: "supernova", id: "supernova_collection", titleKey: "supernovaColl.title", color: "#ffd700", color2: "#fde047", priceTon: 12, priceStars: 1200, requiresSun: false, userCap: 0, stockEndpoint: "api/supernova-collection/stock", tags: ["4 yellow stars", "1.5 GRAM/30d", "Limited 50 bundles", "No SUN required"] },
] as const;

interface ShopPageProps {
  balance: number;
  stardustBalance?: number;
  // DEPOSIT TON balance. Shop TON-priced items are paid EXCLUSIVELY from this
  // (never from the earned/withdrawable balance, never via per-item TonConnect
  // signing). External deposits → /shop/buy-deposit → entitlements.
  depositBalance: number;
  hasSun: boolean;
  telegramId?: string | null;
  sunCount: number;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  stellaRossaCollectionUnlocked?: boolean;
  stellaRossaCollectionBundles?: number;
  stellaLastClaimAt?: number;
  onStellaClaimDaily?: (newRedStarBalance: number) => void;
}

export function ShopPage({
  balance,
  stardustBalance: stardustBalanceProp = 0,
  depositBalance,
  hasSun: _hasSun,
  telegramId,
  sunCount,
  whiteCollectionUnlocked,
  whiteCollectionBundles,
  earthCollectionUnlocked,
  earthCollectionBundles,
  blackCollectionUnlocked,
  blackCollectionBundles,
  supernovaCollectionUnlocked,
  supernovaCollectionBundles,
  stellaRossaCollectionUnlocked = false,
  stellaRossaCollectionBundles = 0,
  stellaLastClaimAt = 0,
  onStellaClaimDaily,
}: ShopPageProps) {
  const { t } = useT();
  const shopPrefetch = readShopPrefetch(telegramId);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"stars" | "stardust">("stars");
  const [stardustIndex, setStardustIndex] = useState(shopPrefetch?.stardustIndex ?? 1);
  const [liveStardustBalance, setLiveStardustBalance] = useState(stardustBalanceProp);
  const [sunStock, setSunStock] = useState<SunStock | null>(shopPrefetch?.sunStock ?? null);
  const [slotPrice, setSlotPrice] = useState<SlotPriceInfo | null>(shopPrefetch?.slotPrice ?? null);
  const [collStocks, setCollStocks] = useState<Record<string, StockInfo | null>>(shopPrefetch?.collStocks ?? {});
  const [home, setHome] = useState<HomeState | null>(shopPrefetch?.home ?? null);
  // Shop categories: tabs per organizzare i prodotti.
  // - exclusive: SUN (e in futuro altri NFT/limited shop items)
  // - items: bundle pacchetti + extra slot (consumabili "in-game")
  // - resources: stardust top-ups + computer/plant (currency e item stardust)
  const [shopTab, setShopTab] = useState<"exclusive" | "bundles" | "items" | "resources" | "lab" | "hub">("exclusive");

  useEffect(() => {
    setLiveStardustBalance(stardustBalanceProp);
  }, [stardustBalanceProp]);

  useEffect(() => {
    const load = () => {
      void fetchStardustMarketPrice().then((p) => {
        if (p && Number.isFinite(p.index)) setStardustIndex(p.index);
      });
    };
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const applyCache = () => {
      const cached = readShopPrefetch(telegramId);
      if (!cached) return;
      if (cached.sunStock) setSunStock(cached.sunStock);
      if (cached.slotPrice) setSlotPrice(cached.slotPrice);
      if (cached.home) setHome(cached.home);
      if (Object.keys(cached.collStocks).length > 0) setCollStocks(cached.collStocks);
      if (Number.isFinite(cached.stardustIndex)) setStardustIndex(cached.stardustIndex);
    };
    applyCache();
    window.addEventListener("zoom-shop-prefetch", applyCache);
    return () => window.removeEventListener("zoom-shop-prefetch", applyCache);
  }, [telegramId]);

  const gramPriceForItem = (item: ShopItem) =>
    item.id === "extra_slot" ? (slotPrice?.nextPriceTon ?? item.tonPrice) : item.tonPrice;

  const stardustPriceForItem = (item: ShopItem) =>
    stardustShopPrice(gramPriceForItem(item), stardustIndex);
  const refreshCollStocks = async () => {
    const entries = await Promise.all(
      COLLECTIONS.map(async (c) => {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}${c.stockEndpoint}`);
          if (r.ok) return [c.key, (await r.json()) as StockInfo] as const;
        } catch { /* ignore */ }
        return [c.key, null] as const;
      }),
    );
    setCollStocks(Object.fromEntries(entries));
    patchShopPrefetch(telegramId, { collStocks: Object.fromEntries(entries) });
  };
  // Ownership map for the BUNDLES tab badges and per-user caps.
  const collOwned: Record<string, { unlocked: boolean; bundles: number }> = {
    white: { unlocked: whiteCollectionUnlocked, bundles: whiteCollectionBundles },
    earth: { unlocked: earthCollectionUnlocked, bundles: earthCollectionBundles },
    black: { unlocked: blackCollectionUnlocked, bundles: blackCollectionBundles },
    supernova: { unlocked: supernovaCollectionUnlocked, bundles: supernovaCollectionBundles },
  };

  const refreshSunStock = async () => {
    if (!telegramId) return;
    const stock = await fetchSunStock(telegramId);
    setSunStock(stock);
    patchShopPrefetch(telegramId, { sunStock: stock });
  };
  const refreshSlotPrice = async () => {
    if (!telegramId) return;
    const p = await fetchSlotPrice(telegramId);
    if (p) {
      setSlotPrice(p);
      patchShopPrefetch(telegramId, { slotPrice: p });
    }
  };
  // Sequence guard so an older in-flight `/home/state` response can't
  // overwrite a newer one (e.g. interval tick racing the post-purchase
  // refresh and momentarily flipping `computer.owned` back to false).
  const homeSeqRef = useRef(0);
  const refreshHome = async () => {
    if (!telegramId) return;
    const mySeq = ++homeSeqRef.current;
    const h = await fetchHomeState(telegramId);
    if (mySeq !== homeSeqRef.current) return;
    setHome(h);
    patchShopPrefetch(telegramId, { home: h });
  };

  useEffect(() => {
    refreshSunStock();
    refreshHome();
    refreshSlotPrice();
    refreshCollStocks();
    const id = setInterval(() => {
      if (document.hidden) return;
      refreshSunStock();
      refreshHome();
      refreshSlotPrice();
      refreshCollStocks();
    }, 20000);
    const onRefresh = () => { refreshHome(); refreshSlotPrice(); refreshCollStocks(); };
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("zoom-data-refresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const sunSoldOut = !!sunStock && sunStock.remaining <= 0;
  const sunUserMaxed = !!sunStock && sunStock.userCount >= sunStock.maxPerUser;
  const sunDisabled = sunSoldOut || sunUserMaxed;

  // Track pending refresh timers so we can cancel them on unmount and
  // avoid background network traffic if the user navigates away.
  const refreshTimersRef = useRef<number[]>([]);
  useEffect(() => {
    return () => {
      refreshTimersRef.current.forEach((id) => clearTimeout(id));
      refreshTimersRef.current = [];
    };
  }, []);

  // Fire a refresh now and again later so any late server-side credit
  // (slow Stars webhook, slow TON on-chain verification, brief network
  // hiccup on /grants right after the credit) is still picked up by the
  // UI without the user having to reopen the app. Cheap, safe, idempotent.
  const scheduleRefresh = (delayMs: number) => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("zoom-data-refresh"));
      refreshTimersRef.current = refreshTimersRef.current.filter((x) => x !== id);
    }, delayMs);
    refreshTimersRef.current.push(id);
  };
  const triggerDataRefresh = () => {
    window.dispatchEvent(new Event("zoom-data-refresh"));
    scheduleRefresh(4_000);
    scheduleRefresh(15_000);
    scheduleRefresh(45_000);
  };

  const handleStarsBuy = async (item: ShopItem) => {
    if (!telegramId) { setMessage(t("shop.telegramIdMissing")); return; }
    setBuying(item.id);
    try {
      const result = await createStarsInvoice(telegramId, item.id);
      if (result.error) {
        setMessage(result.error);
        setBuying(null);
        return;
      }
      if (result.invoiceUrl) {
        const webApp = (window as unknown as { Telegram?: { WebApp?: { openInvoice?: (url: string, cb?: (status: string) => void) => void } } }).Telegram?.WebApp;
        if (webApp?.openInvoice) {
          webApp.openInvoice(result.invoiceUrl, async (status) => {
            if (status === "paid" && result.txnId) {
              setMessage(t("shop.confirmingPayment"));
              // Webhook is the only path that credits; poll until it does.
              const final = await pollTxnUntilFinal(result.txnId, { maxMs: 60_000, intervalMs: 2_000 });
              if (final?.status === "completed") {
                setMessage(`${item.title} purchased!`);
                triggerDataRefresh();
              } else if (final?.status === "failed") {
                setMessage("Payment failed");
              } else {
                // Final fallback — call confirm to get latest known status.
                const c = await confirmStarsPurchase(result.txnId, telegramId);
                if (c.ok) {
                  setMessage(`${item.title} purchased!`);
                  triggerDataRefresh();
                } else {
                  // Webhook may still arrive — keep refreshing so the UI
                  // updates as soon as the credit lands server-side.
                  setMessage("Awaiting confirmation… item will appear automatically.");
                  triggerDataRefresh();
                }
              }
            } else if (status === "cancelled") {
              setMessage("Payment cancelled");
            } else if (status === "failed") {
              setMessage("Payment failed");
            }
            setBuying(null);
          });
        } else {
          window.open(result.invoiceUrl, "_blank");
          setBuying(null);
        }
      }
    } catch {
      setMessage("Payment error");
      setBuying(null);
    }
  };

  // TON purchases removed — shop accepts Telegram Stars or in-game STARDUST.
  const handleStardustBuy = async (item: ShopItem) => {
    if (!telegramId) { setMessage(t("shop.telegramIdMissing")); return; }
    const cost = stardustPriceForItem(item);
    if (liveStardustBalance < cost) {
      setMessage(`Insufficient STARDUST (need ${cost.toLocaleString()} ★). Earn stardust in Lab or buy a top-up below.`);
      return;
    }
    setBuying(item.id);
    const res = await buyShopItemFromStardust(telegramId, item.id);
    setBuying(null);
    if (res.ok) {
      setMessage(`${item.title} purchased! (−${(res.stardustSpent ?? cost).toLocaleString()} ★)`);
      setLiveStardustBalance((b) => Math.max(0, b - (res.stardustSpent ?? cost)));
      triggerDataRefresh();
      window.dispatchEvent(new CustomEvent("stardust-refresh"));
      if (item.id === "extra_slot") refreshSlotPrice();
    } else {
      setMessage(res.error || "Purchase failed");
    }
  };

  const purchaseItem = async (item: ShopItem) => {
    if (payMode === "stars") await handleStarsBuy(item);
    else await handleStardustBuy(item);
  };

  const payColor = payMode === "stars" ? "#ffd700" : "#ffd740";
  const formatItemPrice = (item: ShopItem) => {
    if (payMode === "stars") return `⭐ ${item.starsPrice.toLocaleString()}`;
    return `★ ${stardustPriceForItem(item).toLocaleString()}`;
  };
  const formatBuyLabel = (item: ShopItem) => {
    if (payMode === "stars") return `BUY — ⭐ ${item.starsPrice.toLocaleString()}`;
    return `BUY — ★ ${stardustPriceForItem(item).toLocaleString()}`;
  };
  const priceUnit = payMode === "stars" ? "Stars" : "Stardust";

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: "linear-gradient(180deg, #060810 0%, #0a0e18 100%)" }}>
      {message && (
        <div
          className="absolute top-3 left-4 right-4 z-50 py-2.5 px-4 rounded-xl text-sm font-bold text-center border"
          style={{
            color: CYAN,
            background: "rgba(158,197,232,0.10)",
            borderColor: "rgba(158,197,232,0.25)",
            backdropFilter: "blur(12px)",
          }}
        >
          {message}
        </div>
      )}

      <div
        className="flex-shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: "1px solid rgba(158,197,232,0.12)", background: "rgba(6,8,16,0.92)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-black text-lg tracking-widest" style={{ color: CYAN, textShadow: "0 0 12px rgba(158,197,232,0.35)" }}>
              {t("shop.title")}
            </div>
            <div className="text-[10px] font-bold tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {t("shop.subtitle")}
            </div>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-black border"
            style={{
              color: "#ffd740",
              background: "rgba(255,215,64,0.08)",
              borderColor: "rgba(255,215,64,0.22)",
            }}
          >
            ★ {liveStardustBalance.toLocaleString()}
          </div>
        </div>

        <div className="flex gap-2 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(158,197,232,0.10)" }}>
          <button
            onClick={() => setPayMode("stars")}
            className="flex-1 py-2.5 rounded-lg text-xs font-black tracking-wider transition-all active:scale-[0.98]"
            style={{
              background: payMode === "stars" ? "linear-gradient(135deg, rgba(255,215,0,0.22), rgba(255,179,71,0.12))" : "transparent",
              color: payMode === "stars" ? "#ffd700" : "rgba(255,255,255,0.35)",
              border: payMode === "stars" ? "1px solid rgba(255,215,0,0.30)" : "1px solid transparent",
              boxShadow: payMode === "stars" ? "0 0 14px rgba(255,215,0,0.12)" : "none",
            }}
          >
            {t("shop.payStars")}
          </button>
          <button
            onClick={() => setPayMode("stardust")}
            className="flex-1 py-2.5 rounded-lg text-xs font-black tracking-wider transition-all active:scale-[0.98]"
            style={{
              background: payMode === "stardust" ? "linear-gradient(135deg, rgba(255,215,64,0.20), rgba(158,197,232,0.08))" : "transparent",
              color: payMode === "stardust" ? "#ffd740" : "rgba(255,255,255,0.35)",
              border: payMode === "stardust" ? "1px solid rgba(255,215,64,0.28)" : "1px solid transparent",
              boxShadow: payMode === "stardust" ? "0 0 14px rgba(255,215,64,0.10)" : "none",
            }}
          >
            {t("shop.payStardust")}
          </button>
        </div>
        {payMode === "stardust" && (
          <div className="mt-2 text-[10px] font-bold text-center" style={{ color: "rgba(158,197,232,0.55)" }}>
            {t("shop.stardustIndexNote", { n: stardustIndex.toFixed(3) })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 overflow-x-auto" style={{ background: "rgba(6,8,16,0.55)" }}>
        <div className="flex gap-2 min-w-max">
          {SHOP_TABS.map((tab) => {
            const active = shopTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setShopTab(tab.id)}
                className="px-3 py-2 rounded-xl text-[11px] font-black tracking-wider transition-all active:scale-95 flex items-center gap-1.5"
                style={{
                  background: active ? `${tab.color}18` : "rgba(255,255,255,0.03)",
                  color: active ? tab.color : "rgba(255,255,255,0.40)",
                  border: active ? `1px solid ${tab.color}55` : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: active ? `0 0 16px ${tab.color}22` : "none",
                }}
                data-testid={`tab-shop-${tab.id}`}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{tab.icon}</span>
                <span>{tab.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {shopTab === "exclusive" && (<>
          <div
            className="rounded-2xl p-5 border relative overflow-hidden"
            style={{
              borderColor: "rgba(255,179,71,0.3)",
              background: "linear-gradient(135deg, rgba(255,179,71,0.08) 0%, rgba(255,140,0,0.04) 100%)",
              boxShadow: "0 0 32px rgba(255,179,71,0.1)",
            }}
          >
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,179,71,0.15) 0%, transparent 70%)", filter: "blur(20px)", transform: "translate(30%, -30%)" }} />
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-black text-xl tracking-wide" style={{ color: "#ffb347" }}>SUN</div>
                <div className="text-xs mt-1" style={{ color: "rgba(255,179,71,0.6)" }}>
                  Limited Edition · {sunStock ? `${sunStock.remaining}/${sunStock.max} left` : "Exclusive"}
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "rgba(255,179,71,0.15)", color: "#ffb347", border: "1px solid rgba(255,179,71,0.3)" }}>
                {sunStock ? `OWNED ${sunStock.userCount}/${sunStock.maxPerUser}` : "EXCLUSIVE"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {["Not tradeable", "Max yield", "1,000/hr each", `Max ${sunStock?.maxPerUser ?? 5}/user`].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,179,71,0.08)", color: "rgba(255,179,71,0.7)", border: "1px solid rgba(255,179,71,0.15)" }}>
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={async () => {
                if (sunDisabled) return;
                const sunItem: ShopItem = { id: "the_sun", title: "SUN", desc: "Exclusive", starsPrice: 1000, tonPrice: 10, color: "#ffb347", icon: "☀", type: "sun" };
                if (payMode === "stars") await handleStarsBuy(sunItem);
                else await handleStardustBuy(sunItem);
                refreshSunStock();
              }}
              disabled={sunDisabled || buying === "the_sun"}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center transition-all active:scale-95"
              style={{
                background: sunDisabled ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, rgba(255,179,71,0.2), rgba(255,140,0,0.15))",
                color: sunDisabled ? "rgba(255,255,255,0.2)" : "#ffb347",
                boxShadow: sunDisabled ? "none" : "0 0 20px rgba(255,179,71,0.2)",
                border: `1px solid ${sunDisabled ? "rgba(255,255,255,0.06)" : "rgba(255,179,71,0.3)"}`,
                cursor: sunDisabled ? "not-allowed" : "pointer",
                opacity: buying === "the_sun" ? 0.6 : 1,
              }}
            >
              {sunSoldOut ? "Sold Out" : sunUserMaxed ? `Max ${sunStock?.maxPerUser ?? 5} Reached` : buying === "the_sun" ? "Processing..." : formatBuyLabel({ id: "the_sun", title: "SUN", desc: "", starsPrice: 1000, tonPrice: 10, color: "#ffb347", icon: "☀", type: "sun" })}
            </button>
          </div>
          </>)}

          {shopTab === "bundles" && (<>
          <div
            className="rounded-2xl p-8 border relative overflow-hidden flex flex-col items-center justify-center text-center"
            style={{
              borderColor: "rgba(158,197,232,0.22)",
              background: "linear-gradient(160deg, rgba(8,12,20,0.92), rgba(4,6,12,0.98))",
              minHeight: 280,
              boxShadow: "inset 0 0 48px rgba(0,0,0,0.45)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
            />
            <div className="relative z-10 flex flex-col items-center gap-3 px-4">
              <div style={{ fontSize: 40, lineHeight: 1, opacity: 0.85 }}>◈</div>
              <div className="font-black text-xl tracking-widest uppercase" style={{ color: CYAN }}>
                {t("shop.comingSoon")}
              </div>
              <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.42)", maxWidth: 280, lineHeight: 1.5 }}>
                {t("shop.comingSoonHint")}
              </div>
            </div>
          </div>
          </>)}

          {shopTab === "lab" && (<>
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("shop.section.labMerch")}
          </div>
          <V1NftWidget telegramId={telegramId ?? null} shopMode />
          <ZoomStoreWidget shopMode />
          </>)}

          {shopTab === "hub" && (<>
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Rankings & exchange
          </div>
          <ExchangeWidget balance={balance} sunCount={sunCount} shopMode />
          <LabRankWidget telegramId={telegramId ?? null} sunCount={sunCount} balance={balance} shopMode />
          <HallOfFameWidget telegramId={telegramId ?? null} shopMode />
          </>)}

          {shopTab === "resources" && (<>
          {/* Stardust top-up bundles — pay in Stars or TON to instantly
              get stardust. Sits above the stardust-priced items so a player
              who's short on stardust can fix that first, then keep shopping. */}
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Buy Stardust
          </div>
          {STARDUST_BUNDLES.map(item => (
            <div
              key={item.id}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: item.color + "40", background: item.color + "08" }}
            >
              <div className="flex items-center gap-4 p-4">
                <div
                  className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-xl"
                  style={{ background: item.color + "18", color: item.color, border: `1px solid ${item.color}40` }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm" style={{ color: item.color }}>{item.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{item.desc}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="font-black text-base" style={{ color: payColor }}>
                    {formatItemPrice(item)}
                  </div>
                  <div className="text-xs opacity-70" style={{ color: payColor }}>
                    {priceUnit}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${item.color}20` }}>
                <button
                  onClick={() => { void purchaseItem(item); }}
                  disabled={buying === item.id}
                  className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                  style={{
                    background: item.color + "12",
                    color: item.color,
                    opacity: buying === item.id ? 0.6 : 1,
                  }}
                >
                  {buying === item.id ? "Processing..." : formatBuyLabel(item)}
                </button>
              </div>
            </div>
          ))}

          </>)}

          {shopTab === "items" && (<>
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("shop.section.packsItems")}
          </div>

          {/* Extra Slot only — Stars or Stardust via pay-mode toggle. */}
          {(() => {
            const item = EXTRA_SLOT_ITEM;
            const gramPrice = slotPrice?.nextPriceTon ?? item.tonPrice;
            const slotShopItem: ShopItem = { ...item, tonPrice: gramPrice };
            const owned = slotPrice?.bonusSlots ?? 0;
            const maxPrice = slotPrice?.maxPriceTon ?? 1;
            const atCap = gramPrice >= maxPrice;
            return (
              <div
                key={item.id}
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: item.color + "30", background: item.color + "06" }}
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-lg"
                    style={{ background: item.color + "18", color: item.color, border: `1px solid ${item.color}30` }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm" style={{ color: item.color }}>{item.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {item.desc}
                    </div>
                    <div className="text-[10px] mt-1 font-bold tracking-wider" style={{ color: "rgba(255,51,85,0.7)" }}>
                      {owned > 0 ? `Extra slots owned: ${owned}` : "First extra slot"}
                      {atCap ? " · max price" : ""}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-black text-base" style={{ color: payColor }}>{formatItemPrice(slotShopItem)}</div>
                    <div className="text-xs opacity-70" style={{ color: payColor }}>{priceUnit}</div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${item.color}15` }}>
                  <button
                    onClick={() => { void purchaseItem(slotShopItem); }}
                    disabled={buying === item.id || !slotPrice}
                    className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                    style={{
                      background: item.color + "10",
                      color: item.color,
                      opacity: buying === item.id || !slotPrice ? 0.6 : 1,
                    }}
                  >
                    {buying === item.id
                      ? "Processing..."
                      : !slotPrice
                      ? "Loading..."
                      : formatBuyLabel(slotShopItem)}
                  </button>
                </div>
              </div>
            );
          })()}
          </>)}
        </div>
      </div>
    </div>
  );
}
