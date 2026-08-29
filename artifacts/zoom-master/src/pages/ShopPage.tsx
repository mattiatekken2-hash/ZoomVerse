import { useState, useEffect, useRef } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { createStarsInvoice, confirmStarsPurchase, buyShopItemFromStardust, fetchSunStock, pollTxnUntilFinal, fetchHomeState, fetchSlotPrice, fetchStardustMarketPrice, payShopItemWithZmc, type SunStock, type HomeState, type SlotPriceInfo } from "../utils/api";
import { stardustShopPrice } from "../utils/stardustMarket";
import { useT } from "../i18n/LanguageContext";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { patchShopPrefetch, readShopPrefetch } from "../utils/shopPrefetch";
import { useZmcStatus } from "../hooks/useZmcStatus";
import { ZMC_STONFI_BUY, openExternalUrl } from "../utils/zmcToken";
import { VIP_BASE_THRESHOLD, VIP_PRO_THRESHOLD } from "@workspace/game-models";

const CYAN = "#9EC5E8";

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


// Extra Slot — ZMC on-chain to treasury (0.25 GRAM peg × 100 = 25 ZMC).
const EXTRA_SLOT_ITEM: ShopItem = {
  id: "extra_slot", title: "Extra Slot", desc: "Unlock 1 additional planet slot",
  starsPrice: 0, tonPrice: 0.25, color: "#ff3355", icon: "+", type: "slot",
};

// $ZOOM packs — Stars / ZMC (on-chain → treasury) / Stardust.
// ZMC price = GRAM tonPrice × 100 (1 GRAM ≈ 100 ZMC).
const GRAM_TO_ZMC = 100;
const zmcPriceForItem = (item: ShopItem) => Math.round(item.tonPrice * GRAM_TO_ZMC);

const ZOOM_PACKS: ShopItem[] = [
  { id: "zoom_spark",  title: "ZOOM Spark",  desc: "Instant +200 $ZOOM",    starsPrice: 15,  tonPrice: 0.15, zoomAmount: 200,   color: "#9EC5E8", icon: "Z", type: "zoom_pack" },
  { id: "zoom_boost",  title: "ZOOM Boost",  desc: "Instant +500 $ZOOM",    starsPrice: 25,  tonPrice: 0.25, zoomAmount: 500,   color: "#7dd3fc", icon: "Z", type: "zoom_pack" },
  { id: "zoom_pulse",  title: "ZOOM Pulse",  desc: "Instant +1,400 $ZOOM",  starsPrice: 60,  tonPrice: 0.60, zoomAmount: 1400,  color: "#67e8f9", icon: "Z", type: "zoom_pack" },
  { id: "zoom_core",   title: "ZOOM Core",   desc: "Instant +3,000 $ZOOM",  starsPrice: 120, tonPrice: 1.20, zoomAmount: 3000,  color: "#22d3ee", icon: "Z", type: "zoom_pack" },
  { id: "zoom_nova",   title: "ZOOM Nova",   desc: "Instant +6,500 $ZOOM",  starsPrice: 250, tonPrice: 2.50, zoomAmount: 6500,  color: "#38bdf8", icon: "Z", type: "zoom_pack" },
  { id: "zoom_galaxy", title: "ZOOM Galaxy", desc: "Instant +14,000 $ZOOM", starsPrice: 500, tonPrice: 5.00, zoomAmount: 14000, color: "#818cf8", icon: "Z", type: "zoom_pack" },
];

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
  whiteCollectionUnlocked: _whiteCollectionUnlocked,
  whiteCollectionBundles: _whiteCollectionBundles,
  earthCollectionUnlocked: _earthCollectionUnlocked,
  earthCollectionBundles: _earthCollectionBundles,
  blackCollectionUnlocked: _blackCollectionUnlocked,
  blackCollectionBundles: _blackCollectionBundles,
  supernovaCollectionUnlocked: _supernovaCollectionUnlocked,
  supernovaCollectionBundles: _supernovaCollectionBundles,
  stellaRossaCollectionUnlocked: _stellaRossaCollectionUnlocked = false,
  stellaRossaCollectionBundles: _stellaRossaCollectionBundles = 0,
  stellaLastClaimAt: _stellaLastClaimAt = 0,
  onStellaClaimDaily: _onStellaClaimDaily,
}: ShopPageProps) {
  const { t } = useT();
  void sunCount;
  void balance;
  void depositBalance;
  void tonBalance;
  void _whiteCollectionUnlocked;
  void _whiteCollectionBundles;
  void _earthCollectionUnlocked;
  void _earthCollectionBundles;
  void _blackCollectionUnlocked;
  void _blackCollectionBundles;
  void _supernovaCollectionUnlocked;
  void _supernovaCollectionBundles;
  void _stellaRossaCollectionUnlocked;
  void _stellaRossaCollectionBundles;
  void _stellaLastClaimAt;
  void _onStellaClaimDaily;
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { vipLevel, zmcBalance, connected } = useZmcStatus(telegramId ?? null);
  const shopPrefetch = readShopPrefetch(telegramId);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"stars" | "zmc" | "stardust">("stars");
  const [stardustIndex, setStardustIndex] = useState(shopPrefetch?.stardustIndex ?? 1);
  const [liveStardustBalance, setLiveStardustBalance] = useState(stardustBalanceProp);
  const [sunStock, setSunStock] = useState<SunStock | null>(shopPrefetch?.sunStock ?? null);
  const [slotPrice, setSlotPrice] = useState<SlotPriceInfo | null>(shopPrefetch?.slotPrice ?? null);
  const [home, setHome] = useState<HomeState | null>(shopPrefetch?.home ?? null);
  // Shop categories: tabs per organizzare i prodotti.
  // - exclusive: SUN (e in futuro altri NFT/limited shop items)
  // - items: bundle pacchetti + extra slot (consumabili "in-game")
  // - resources: stardust top-ups + computer/plant (currency e item stardust)

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
    const id = setInterval(() => {
      if (document.hidden) return;
      refreshSunStock();
      refreshHome();
      refreshSlotPrice();
    }, 20000);
    const onRefresh = () => { refreshHome(); refreshSlotPrice(); };
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
  void home;

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

  const handleZmcBuy = async (item: ShopItem) => {
    if (!telegramId) { setMessage(t("shop.telegramIdMissing")); return; }
    if (!connected || !walletAddress) {
      setMessage(t("shop.connectWalletForZmc"));
      return;
    }
    const price = zmcPriceForItem(item);
    if (zmcBalance < price) {
      setMessage(t("shop.needZmc", { n: String(price) }));
      return;
    }
    setBuying(item.id);
    try {
      const result = await payShopItemWithZmc({
        telegramId,
        itemId: item.id,
        walletAddress,
        sendTransaction: (tx) => tonConnectUI.sendTransaction(tx),
      });
      if (result.pending) {
        setMessage(t("shop.zmcPending"));
        triggerDataRefresh();
        scheduleRefresh(8_000);
        scheduleRefresh(25_000);
        scheduleRefresh(60_000);
        scheduleRefresh(120_000);
        return;
      }
      if (result.ok) {
        setMessage(`${item.title} purchased! (−${(result.priceZmc ?? price).toLocaleString()} ZMC)`);
        if (typeof result.zoomBalance === "number") {
          window.dispatchEvent(new CustomEvent("zoom-server-balance-snap", {
            detail: { balance: result.zoomBalance, epoch: result.balanceEpoch ?? 0 },
          }));
        } else if (typeof result.zoomAmount === "number" && result.zoomAmount > 0) {
          window.dispatchEvent(new CustomEvent("zoom-credit-local", {
            detail: { amount: result.zoomAmount },
          }));
        }
        triggerDataRefresh();
        if (item.id === "extra_slot") refreshSlotPrice();
      } else {
        setMessage(result.error || t("shop.purchaseFailed"));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("shop.paymentCancelled"));
    } finally {
      setBuying(null);
    }
  };

  const purchaseItem = async (item: ShopItem) => {
    if (item.id === "extra_slot" || (item.type === "zoom_pack" && payMode === "zmc")) {
      await handleZmcBuy(item);
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
            onClick={() => setPayMode("zmc")}
            className="flex-1 py-2.5 rounded-lg text-[10px] font-black tracking-wider transition-all active:scale-[0.98]"
            style={{
              background: payMode === "zmc" ? "linear-gradient(135deg, rgba(158,197,232,0.22), rgba(56,189,248,0.10))" : "transparent",
              color: payMode === "zmc" ? CYAN : "rgba(255,255,255,0.35)",
              border: payMode === "zmc" ? "1px solid rgba(158,197,232,0.35)" : "1px solid transparent",
              boxShadow: payMode === "zmc" ? "0 0 14px rgba(158,197,232,0.12)" : "none",
            }}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <ZoomCubeIcon size={12} />
              {t("shop.payZmc")}
            </span>
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
        {payMode === "zmc" && (
          <div className="mt-2 text-[10px] font-bold text-center" style={{ color: "rgba(158,197,232,0.55)" }}>
            {t("shop.zmcNote")}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            VIP · ZMC
          </div>
          {([
            {
              id: "base" as const,
              title: "VIP Base",
              hold: VIP_BASE_THRESHOLD,
              perk: t("shop.vipBasePerk"),
              active: vipLevel === "BASE" || vipLevel === "PRO",
              buyLabel: t("shop.vipBaseCta"),
              accent: "#c0c8d8",
            },
            {
              id: "pro" as const,
              title: "VIP Pro / Whale",
              hold: VIP_PRO_THRESHOLD,
              perk: t("shop.vipProPerk"),
              active: vipLevel === "PRO",
              buyLabel: t("shop.vipProCta"),
              accent: "#ffd740",
            },
          ]).map((card) => (
            <div
              key={card.id}
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: card.accent + "40", background: card.accent + "08" }}
            >
              <div className="flex items-start gap-4 p-4">
                <div
                  className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black"
                  style={{ background: card.accent + "22", border: `1px solid ${card.accent}55`, color: card.accent }}
                >
                  VIP
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-black text-sm" style={{ color: card.accent }}>{card.title}</div>
                    {card.active && (
                      <span
                        className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(46,213,115,0.18)", color: "#7bed9f", border: "1px solid rgba(46,213,115,0.35)" }}
                      >
                        {t("shop.vipActive")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{card.perk}</div>
                  <div className="text-[10px] mt-1 font-bold" style={{ color: "rgba(255,255,255,0.32)" }}>
                    {card.hold.toLocaleString()} ZMC
                  </div>
                </div>
              </div>
              {!card.active && (
                <button
                  type="button"
                  onClick={() => openExternalUrl(ZMC_STONFI_BUY)}
                  className="w-full py-3 font-black text-xs tracking-wider uppercase"
                  style={{ background: card.accent + "14", color: card.accent, borderTop: `1px solid ${card.accent}22` }}
                >
                  {card.buyLabel}
                </button>
              )}
            </div>
          ))}

          <div className="font-black text-sm tracking-widest uppercase mb-1 mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("shop.section.packsItems")}
          </div>

          {ZOOM_PACKS.map((item) => {
            const sdCost = stardustPriceForItem(item);
            const zmcCost = zmcPriceForItem(item);
            const priceLabel = payMode === "stars"
              ? `${item.starsPrice} ⭐`
              : payMode === "zmc"
                ? `${zmcCost.toLocaleString()} ZMC`
                : `${sdCost.toLocaleString()} ★`;
            const priceSub = payMode === "stars" ? "STARS" : payMode === "zmc" ? "ZMC" : "STARDUST";
            const priceColor = payMode === "stars" ? "#ffd700" : payMode === "zmc" ? CYAN : "#ffd740";
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

          {(() => {
            const item = EXTRA_SLOT_ITEM;
            const gramPrice = slotPrice?.nextPriceTon ?? item.tonPrice;
            const zmcCost = Math.round(gramPrice * GRAM_TO_ZMC);
            const owned = slotPrice?.bonusSlots ?? 0;
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
                      Unlock 1 extra Farm slot · {zmcCost} ZMC
                    </div>
                    <div className="text-[10px] mt-1 font-bold tracking-wider" style={{ color: "rgba(255,51,85,0.7)" }}>
                      {owned > 0 ? `Extra slots owned: ${owned}` : "First extra slot"}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-black text-base" style={{ color: CYAN }}>{zmcCost.toLocaleString()}</div>
                    <div className="text-xs opacity-70" style={{ color: CYAN }}>ZMC</div>
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
                      ? t("shop.processing")
                      : `BUY — ${zmcCost.toLocaleString()} ZMC`}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
