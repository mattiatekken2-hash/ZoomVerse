import { useState, useEffect, useRef } from "react";
import { createStarsInvoice, confirmStarsPurchase, buyShopItemFromStardust, buyShopItemFromDeposit, fetchSunStock, pollTxnUntilFinal, fetchHomeState, fetchSlotPrice, fetchStardustMarketPrice, type SunStock, type HomeState, type SlotPriceInfo } from "../utils/api";
import { stardustShopPrice } from "../utils/stardustMarket";
import { useT } from "../i18n/LanguageContext";
import { LabRankWidget } from "../components/LabRankWidget";
import { ZoomStoreWidget } from "../components/ZoomStoreWidget";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { patchShopPrefetch, readShopPrefetch } from "../utils/shopPrefetch";

const CYAN = "#9EC5E8";
const SHOP_TABS = [
  { id: "lab" as const, label: "Lab", short: "LAB", color: "#a855f7", icon: "⚗" },
  { id: "hub" as const, label: "Hub", short: "HUB", color: "#00d4ff", icon: "◎" },
  { id: "bundles" as const, label: "Bundles", short: "PACK", color: CYAN, icon: "◈" },
  { id: "items" as const, label: "Items", short: "ITEM", color: "#c471ed", icon: "◇" },
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
  type: "bundle" | "sun" | "slot" | "stardust" | "zoom_pack";
}


// Extra Slot is rendered as its own card with a dynamic price
// (escalates per slot already owned, capped at 3 TON).
const EXTRA_SLOT_ITEM: ShopItem = {
  id: "extra_slot", title: "Extra Slot", desc: "Unlock 1 additional planet slot",
  starsPrice: 0, tonPrice: 0.25, color: "#ff3355", icon: "+", type: "slot",
};

// $ZOOM packs — GRAM / Stars / Stardust. Rate rises with pack size (4k→7k ZOOM/GRAM).
// 500 $ZOOM = 1 Stardust-model forge. Stars = 100★ per GRAM.
const ZOOM_PACKS: ShopItem[] = [
  { id: "zoom_spark",  title: "ZOOM Spark",  desc: "Instant +200 $ZOOM",    starsPrice: 5,   tonPrice: 0.05, zoomAmount: 200,   color: "#9EC5E8", icon: "Z", type: "zoom_pack" },
  { id: "zoom_boost",  title: "ZOOM Boost",  desc: "Instant +500 $ZOOM",    starsPrice: 10,  tonPrice: 0.10, zoomAmount: 500,   color: "#7dd3fc", icon: "Z", type: "zoom_pack" },
  { id: "zoom_pulse",  title: "ZOOM Pulse",  desc: "Instant +1,400 $ZOOM",  starsPrice: 25,  tonPrice: 0.25, zoomAmount: 1400,  color: "#67e8f9", icon: "Z", type: "zoom_pack" },
  { id: "zoom_core",   title: "ZOOM Core",   desc: "Instant +3,000 $ZOOM",  starsPrice: 50,  tonPrice: 0.50, zoomAmount: 3000,  color: "#22d3ee", icon: "Z", type: "zoom_pack" },
  { id: "zoom_nova",   title: "ZOOM Nova",   desc: "Instant +6,500 $ZOOM",  starsPrice: 100, tonPrice: 1.00, zoomAmount: 6500,  color: "#38bdf8", icon: "Z", type: "zoom_pack" },
  { id: "zoom_galaxy", title: "ZOOM Galaxy", desc: "Instant +14,000 $ZOOM", starsPrice: 200, tonPrice: 2.00, zoomAmount: 14000, color: "#818cf8", icon: "Z", type: "zoom_pack" },
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
  /** Earned GRAM — Extra Slot can be paid from deposit + earned. */
  tonBalance?: number;
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
  tonBalance = 0,
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
  const [payMode, setPayMode] = useState<"stars" | "stardust" | "gram">("stars");
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
  const [shopTab, setShopTab] = useState<"bundles" | "items" | "lab" | "hub">("lab");

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
  void sunStock;
  void sunSoldOut;
  void sunUserMaxed;
  void sunDisabled;

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
    if (item.id === "extra_slot") {
      if (!telegramId) { setMessage(t("shop.telegramIdMissing")); return; }
      if (depositBalance + tonBalance < 0.25) {
        setMessage("Need 0.25 GRAM");
        return;
      }
      setBuying(item.id);
      const res = await buyShopItemFromDeposit(telegramId, "extra_slot");
      setBuying(null);
      if (res.ok) {
        setMessage("Extra slot unlocked (−0.25 GRAM)");
        triggerDataRefresh();
        refreshSlotPrice();
      } else {
        setMessage(res.error || "Need 0.25 GRAM");
      }
      return;
    }
    if (item.type === "zoom_pack" && payMode === "gram") {
      if (!telegramId) { setMessage(t("shop.telegramIdMissing")); return; }
      if (depositBalance + tonBalance < item.tonPrice) {
        setMessage(`Need ${item.tonPrice.toFixed(2)} GRAM`);
        return;
      }
      setBuying(item.id);
      const res = await buyShopItemFromDeposit(telegramId, item.id);
      setBuying(null);
      if (res.ok) {
        setMessage(`${item.title} purchased! (−${item.tonPrice.toFixed(2)} GRAM)`);
        triggerDataRefresh();
      } else {
        setMessage(res.error || `Need ${item.tonPrice.toFixed(2)} GRAM`);
      }
      return;
    }
    if (payMode === "stars") await handleStarsBuy(item);
    else await handleStardustBuy(item);
  };

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
            className="flex-1 py-2.5 rounded-lg text-[10px] font-black tracking-wider transition-all active:scale-[0.98]"
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
            onClick={() => setPayMode("gram")}
            className="flex-1 py-2.5 rounded-lg text-[10px] font-black tracking-wider transition-all active:scale-[0.98]"
            style={{
              background: payMode === "gram" ? "linear-gradient(135deg, rgba(158,197,232,0.22), rgba(56,189,248,0.10))" : "transparent",
              color: payMode === "gram" ? CYAN : "rgba(255,255,255,0.35)",
              border: payMode === "gram" ? "1px solid rgba(158,197,232,0.35)" : "1px solid transparent",
              boxShadow: payMode === "gram" ? "0 0 14px rgba(158,197,232,0.12)" : "none",
            }}
          >
            {t("shop.payGram")}
          </button>
          <button
            onClick={() => setPayMode("stardust")}
            className="flex-1 py-2.5 rounded-lg text-[10px] font-black tracking-wider transition-all active:scale-[0.98]"
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
                <span style={{ fontSize: 13, lineHeight: 1, display: "flex" }}>
                  {tab.id === "bundles" ? <ZoomCubeIcon size={14} /> : tab.icon}
                </span>
                <span>{tab.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
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
              <ZoomCubeIcon size={56} />
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
          <ZoomStoreWidget shopMode />
          </>)}

          {shopTab === "hub" && (<>
          <LabRankWidget telegramId={telegramId ?? null} sunCount={sunCount} balance={balance} shopMode />
          </>)}

          {shopTab === "items" && (<>
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("shop.section.packsItems")}
          </div>

          {ZOOM_PACKS.map((item) => {
            const sdCost = stardustPriceForItem(item);
            const priceLabel = payMode === "stars"
              ? `${item.starsPrice} ⭐`
              : payMode === "gram"
                ? `${item.tonPrice.toFixed(2)} GRAM`
                : `${sdCost.toLocaleString()} ★`;
            const priceSub = payMode === "stars" ? "STARS" : payMode === "gram" ? "GRAM" : "STARDUST";
            const priceColor = payMode === "stars" ? "#ffd700" : payMode === "gram" ? CYAN : "#ffd740";
            return (
              <div
                key={item.id}
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: item.color + "30", background: item.color + "06" }}
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ background: item.color + "18", border: `1px solid ${item.color}30` }}
                  >
                    <ZoomCubeIcon size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-sm" style={{ color: item.color }}>{item.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {item.desc}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-black text-base" style={{ color: priceColor }}>
                      {(item.zoomAmount ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs opacity-70" style={{ color: priceColor }}>$ZOOM</div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${item.color}15` }}>
                  <button
                    onClick={() => { void purchaseItem(item); }}
                    disabled={buying === item.id}
                    className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                    style={{
                      background: item.color + "10",
                      color: item.color,
                      opacity: buying === item.id ? 0.6 : 1,
                    }}
                  >
                    {buying === item.id ? t("shop.processing") : `BUY — ${priceLabel}`}
                  </button>
                  <div className="text-[9px] font-bold text-center pb-2 tracking-wider" style={{ color: "rgba(255,255,255,0.28)" }}>
                    {priceSub}
                  </div>
                </div>
              </div>
            );
          })}

          {payMode !== "stars" && (() => {
            const item = EXTRA_SLOT_ITEM;
            const gramPrice = slotPrice?.nextPriceTon ?? item.tonPrice;
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
                      Unlock 1 extra Farm slot · 0.25 GRAM
                    </div>
                    <div className="text-[10px] mt-1 font-bold tracking-wider" style={{ color: "rgba(255,51,85,0.7)" }}>
                      {owned > 0 ? `Extra slots owned: ${owned}` : "First extra slot"}
                      {atCap ? " · max price" : ""}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-black text-base" style={{ color: "#9EC5E8" }}>{gramPrice.toFixed(2)}</div>
                    <div className="text-xs opacity-70" style={{ color: "#9EC5E8" }}>GRAM</div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${item.color}15` }}>
                  <button
                    onClick={() => { void purchaseItem({ ...item, tonPrice: gramPrice }); }}
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
                      : `BUY — ${gramPrice.toFixed(2)} GRAM`}
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
