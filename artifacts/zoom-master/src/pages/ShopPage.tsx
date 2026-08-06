import { useState, useEffect, useRef } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { createStarsInvoice, confirmStarsPurchase, buyShopItemFromDeposit, fetchSunStock, pollTxnUntilFinal, fetchHomeState, buyComputer, buyPlantSeed, fetchSlotPrice, type SunStock, type HomeState, type SlotPriceInfo } from "../utils/api";
import { PixelPlant } from "../components/PixelPlant";
import { useT } from "../i18n/LanguageContext";
import { LottoStellareWidget } from "../components/LottoStellareWidget";
import { LabTicketWidget } from "../components/LabTicketWidget";
import { MysteryBoxWidget } from "../components/MysteryBoxWidget";
import { V1NftWidget } from "../components/V1NftWidget";

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

const SHOP_ITEMS: ShopItem[] = [
  { id: "starter_pack", title: "Starter Pack", desc: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, tonPrice: 0.5, zoomAmount: 2000, color: "#8892b0", icon: "◇", type: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", desc: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, tonPrice: 1.5, zoomAmount: 8000, color: "#4facfe", icon: "◈", type: "bundle" },
  { id: "legend_pack", title: "Legend Pack", desc: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, tonPrice: 4.0, zoomAmount: 25000, color: "#c471ed", icon: "⬡", type: "bundle" },
];

// Extra Slot is rendered as its own TON-only card with a dynamic price
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
}

export function ShopPage({
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
}: ShopPageProps) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"stars" | "ton">("stars");
  const [sunStock, setSunStock] = useState<SunStock | null>(null);
  const [slotPrice, setSlotPrice] = useState<SlotPriceInfo | null>(null);
  // Shop categories: tabs per organizzare i prodotti.
  // - exclusive: SUN (e in futuro altri NFT/limited shop items)
  // - items: bundle pacchetti + extra slot (consumabili "in-game")
  // - resources: stardust top-ups + computer/plant (currency e item stardust)
  const [shopTab, setShopTab] = useState<"exclusive" | "bundles" | "items" | "resources" | "lab">("exclusive");
  // Live stock for each collection bundle (api/<key>-collection/stock).
  const [collStocks, setCollStocks] = useState<Record<string, StockInfo | null>>({});
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
  };
  // Ownership map for the BUNDLES tab badges and per-user caps.
  const collOwned: Record<string, { unlocked: boolean; bundles: number }> = {
    white: { unlocked: whiteCollectionUnlocked, bundles: whiteCollectionBundles },
    earth: { unlocked: earthCollectionUnlocked, bundles: earthCollectionBundles },
    black: { unlocked: blackCollectionUnlocked, bundles: blackCollectionBundles },
    supernova: { unlocked: supernovaCollectionUnlocked, bundles: supernovaCollectionBundles },
  };
  // Stardust shop section reads `/home/state` because that single endpoint
  // already returns both the live stardust balance AND whether the user
  // owns the COMPUTER (so we can hide the buy button after purchase). One
  // less round-trip than splitting into two fetches.
  const [home, setHome] = useState<HomeState | null>(null);

  const refreshSunStock = async () => {
    if (!telegramId) return;
    const stock = await fetchSunStock(telegramId);
    setSunStock(stock);
  };
  const refreshSlotPrice = async () => {
    if (!telegramId) return;
    const p = await fetchSlotPrice(telegramId);
    if (p) setSlotPrice(p);
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
    if (!telegramId) { setMessage("Telegram ID missing"); return; }
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
              setMessage("Confirming payment…");
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

  // TON purchases are paid from the user's in-game DEPOSIT balance (credited
  // by external TonConnect deposits via the TON Wallet widget). No on-chain
  // signature per item — one deposit, many shop purchases.
  const handleTonBuy = async (item: ShopItem) => {
    if (!telegramId) { setMessage("Telegram ID missing"); return; }

    // Dynamic price for extra_slot (server is the source of truth; this is
    // just for the client-side balance gate — the endpoint re-derives it).
    const effectiveTonPrice = item.id === "extra_slot"
      ? (slotPrice?.nextPriceTon ?? item.tonPrice)
      : item.tonPrice;

    if (depositBalance < effectiveTonPrice) {
      setMessage(`Insufficient deposit balance (${effectiveTonPrice} GRAM). Deposit GRAM from your wallet to buy.`);
      return;
    }

    setBuying(item.id);
    const res = await buyShopItemFromDeposit(telegramId, item.id);
    setBuying(null);
    if (res.ok) {
      setMessage(`${item.title} purchased!`);
      triggerDataRefresh();
      if (item.id === "extra_slot") refreshSlotPrice();
    } else {
      setMessage(res.error || "Purchase failed");
    }
  };

  const handleConnectWallet = () => {
    tonConnectUI.openModal();
  };

  // ─── COMPUTER (stardust-priced item that lives in the HOME) ──────────
  // Independent of the Stars/TON pay mode toggle above — this is the only
  // item priced in stardust right now. After a successful buy we trigger
  // a global refresh so the HOME page picks up the new ownership state.
  const computerOwned = !!home?.computer.owned;
  const computerCost = home?.computer.cost ?? 5000;
  const stardustBalance = home?.stardustBalance ?? 0;
  const canBuyComputer = !!telegramId && !computerOwned && stardustBalance >= computerCost;

  const handleBuyComputer = async () => {
    if (!telegramId || !canBuyComputer) return;
    setBuying("computer");
    const r = await buyComputer(telegramId);
    setBuying(null);
    if (r.ok) {
      setMessage("COMPUTER purchased!");
      window.dispatchEvent(new Event("zoom-data-refresh"));
      refreshHome();
    } else if (r.error === "NOT_ENOUGH_STARDUST") {
      setMessage(`Need ${r.need?.toLocaleString()} stardust (have ${r.have?.toLocaleString()})`);
    } else if (r.error === "ALREADY_OWNED") {
      setMessage("You already own the COMPUTER");
      refreshHome();
    } else {
      setMessage("Purchase failed");
    }
  };

  // ─── PLANT SEED (stardust-priced) ───────────────────────────────────
  // Same flow as the computer: a one-time buy that the player then places
  // in a HOME slot. Hidden buy-button after purchase. The plant is grown
  // through 10 levels of watering on the HOME page itself.
  const plantOwned = !!home?.plant.owned;
  const plantSeedCost = home?.plant.seedCost ?? 10000;
  const canBuyPlant = !!telegramId && !plantOwned && stardustBalance >= plantSeedCost;
  const handleBuyPlant = async () => {
    if (!telegramId || !canBuyPlant) return;
    setBuying("plant");
    const r = await buyPlantSeed(telegramId);
    setBuying(null);
    if (r.ok) {
      setMessage("PLANT SEED purchased!");
      window.dispatchEvent(new Event("zoom-data-refresh"));
      refreshHome();
    } else if (r.error === "NOT_ENOUGH_STARDUST") {
      setMessage(`Need ${r.need?.toLocaleString()} stardust (have ${r.have?.toLocaleString()})`);
    } else if (r.error === "ALREADY_OWNED") {
      setMessage("You already own a PLANT");
      refreshHome();
    } else {
      setMessage("Purchase failed");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {message && (
        <div
          className="absolute top-2 left-4 right-4 z-50 py-2 px-4 rounded-xl text-sm font-bold text-center"
          style={{ background: "rgba(255,51,85,0.15)", color: "#ff3355", border: "1px solid rgba(255,51,85,0.3)", backdropFilter: "blur(12px)" }}
        >
          {message}
        </div>
      )}

      <div className="flex-shrink-0 px-4 py-3" style={{ background: "rgba(6,8,16,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="font-black text-sm tracking-widest neon-text">SHOP</div>
          <div className="flex-1" />
          {connectedAddress ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#00e676", boxShadow: "0 0 6px #00e676" }} />
              <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
              </span>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={{ background: "rgba(0,136,255,0.15)", color: "#0088ff", border: "1px solid rgba(0,136,255,0.3)" }}
            >
              Connect Wallet
            </button>
          )}
        </div>

        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          <button
            onClick={() => setPayMode("stars")}
            className="flex-1 py-2 rounded-md text-xs font-bold tracking-wider transition-all"
            style={{
              background: payMode === "stars" ? "rgba(255,215,0,0.15)" : "transparent",
              color: payMode === "stars" ? "#ffd700" : "rgba(255,255,255,0.3)",
              border: payMode === "stars" ? "1px solid rgba(255,215,0,0.25)" : "1px solid transparent",
            }}
          >
            STARS
          </button>
          <button
            onClick={() => setPayMode("ton")}
            className="flex-1 py-2 rounded-md text-xs font-bold tracking-wider transition-all"
            style={{
              background: payMode === "ton" ? "rgba(0,136,255,0.15)" : "transparent",
              color: payMode === "ton" ? "#0088ff" : "rgba(255,255,255,0.3)",
              border: payMode === "ton" ? "1px solid rgba(0,136,255,0.25)" : "1px solid transparent",
            }}
          >
            GRAM
          </button>
        </div>
      </div>

      {/* Shop category tabs — Exclusive / Items / Resources.
          Sticky sotto l'header pay-mode così la categoria attiva è
          sempre visibile mentre lo shop scrolla. */}
      <div className="px-4 pb-3" style={{ background: "rgba(6,8,16,0.4)" }}>
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          {([
            { id: "exclusive", label: "EXCL.", color: "#ffb347" },
            { id: "bundles", label: "BUNDLES", color: "#ff3355" },
            { id: "lab", label: "LAB", color: "#a855f7" },
            { id: "items", label: "ITEMS", color: "#c471ed" },
            { id: "resources", label: "RES.", color: "#ffd740" },
          ] as const).map(tab => {
            const active = shopTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setShopTab(tab.id)}
                className="flex-1 py-2 rounded-md text-xs font-black tracking-wider transition-all"
                style={{
                  background: active ? `${tab.color}20` : "transparent",
                  color: active ? tab.color : "rgba(255,255,255,0.35)",
                  border: active ? `1px solid ${tab.color}45` : "1px solid transparent",
                  textShadow: active ? `0 0 8px ${tab.color}80` : "none",
                }}
                data-testid={`tab-shop-${tab.id}`}
              >
                {tab.label}
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
                else await handleTonBuy(sunItem);
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
              {sunSoldOut ? "Sold Out" : sunUserMaxed ? `Max ${sunStock?.maxPerUser ?? 5} Reached` : buying === "the_sun" ? "Processing..." : payMode === "stars" ? "BUY — ⭐ 1,000 Stars" : "BUY — 10 GRAM"}
            </button>
          </div>
          </>)}

          {shopTab === "bundles" && (<>
          {/* Collection bundles — moved here from the old BUNDLES nav page.
              Paid in Stars or TON via the shared pay-mode toggle (like the SUN):
              Stars → createStarsInvoice; TON → in-game deposit balance. */}
          {COLLECTIONS.map((col) => {
            const stock = collStocks[col.key];
            const owned = collOwned[col.key];
            const c = col.color;
            const c2 = col.color2;
            const soldOut = !!stock && stock.remaining <= 0;
            const sunLocked = col.requiresSun && sunCount < 1;
            const atUserCap = col.userCap > 0 && owned.bundles >= col.userCap;
            const disabled = soldOut || sunLocked || atUserCap || buying === col.id;
            const onBuy = async () => {
              if (disabled) return;
              const shopItem: ShopItem = {
                id: col.id,
                title: t(col.titleKey as Parameters<typeof t>[0]),
                desc: "",
                starsPrice: col.priceStars,
                tonPrice: col.priceTon,
                color: c,
                icon: "",
                type: "bundle",
              };
              if (payMode === "stars") await handleStarsBuy(shopItem);
              else await handleTonBuy(shopItem);
              refreshCollStocks();
            };
            return (
              <div
                key={col.key}
                className="rounded-2xl p-5 border relative overflow-hidden"
                style={{
                  borderColor: `${c}4d`,
                  background: `linear-gradient(135deg, ${c}14 0%, ${c2}0a 100%)`,
                  boxShadow: `0 0 32px ${c}1a`,
                }}
              >
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${c}26 0%, transparent 70%)`, filter: "blur(20px)", transform: "translate(30%, -30%)" }} />
                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div>
                    <div className="font-black text-xl tracking-wide" style={{ color: c }}>
                      {t(col.titleKey as Parameters<typeof t>[0])}
                    </div>
                    <div className="text-xs mt-1" style={{ color: `${c}99` }}>
                      {stock ? `${stock.remaining}/${stock.max} left` : "Limited Edition"}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: `${c}26`, color: c, border: `1px solid ${c}4d` }}>
                    {owned.unlocked ? `OWNED ${owned.bundles}${col.key === "white" ? "/10" : ""}` : "LOCKED"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4 relative z-10">
                  {col.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${c}14`, color: `${c}b3`, border: `1px solid ${c}26` }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={onBuy}
                  disabled={disabled}
                  className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center transition-all active:scale-95 relative z-10"
                  style={{
                    background: disabled ? "rgba(255,255,255,0.04)" : `linear-gradient(135deg, ${c}33, ${c2}26)`,
                    color: disabled ? "rgba(255,255,255,0.2)" : c,
                    boxShadow: disabled ? "none" : `0 0 20px ${c}33`,
                    border: `1px solid ${disabled ? "rgba(255,255,255,0.06)" : `${c}4d`}`,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: buying === col.id ? 0.6 : 1,
                  }}
                >
                  {soldOut
                    ? "Sold Out"
                    : atUserCap
                    ? `MAX OWNED (${col.userCap}/${col.userCap})`
                    : sunLocked
                    ? "🔒 SUN REQUIRED"
                    : buying === col.id
                    ? "Processing..."
                    : payMode === "stars"
                    ? `BUY — ⭐ ${col.priceStars.toLocaleString()} Stars`
                    : `BUY — ${col.priceTon} GRAM`}
                </button>
              </div>
            );
          })}
          </>)}

          {shopTab === "lab" && (<>
          {/* LAB shop items — previously floating buttons on the LAB page,
              now accessible here so players can buy them from the Shop. */}
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            LAB Items
          </div>
          <LottoStellareWidget telegramId={telegramId ?? null} shopMode />
          <LabTicketWidget
            telegramId={telegramId ?? null}
            depositBalance={depositBalance}
            shopMode
          />
          <MysteryBoxWidget telegramId={telegramId ?? null} shopMode />
          <V1NftWidget telegramId={telegramId ?? null} shopMode />
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
                  <div className="font-black text-base" style={{ color: payMode === "stars" ? "#ffd700" : "#0088ff" }}>
                    {payMode === "stars" ? `⭐ ${item.starsPrice}` : `${item.tonPrice}`}
                  </div>
                  <div className="text-xs opacity-70" style={{ color: payMode === "stars" ? "#ffd700" : "#0088ff" }}>
                    {payMode === "stars" ? "Stars" : "GRAM"}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${item.color}20` }}>
                <button
                  onClick={() => payMode === "stars" ? handleStarsBuy(item) : handleTonBuy(item)}
                  disabled={buying === item.id}
                  className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                  style={{
                    background: item.color + "12",
                    color: item.color,
                    opacity: buying === item.id ? 0.6 : 1,
                  }}
                >
                  {buying === item.id ? "Processing..." : payMode === "stars" ? `BUY — ⭐ ${item.starsPrice}` : `BUY — ${item.tonPrice} GRAM`}
                </button>
              </div>
            </div>
          ))}

          {/* Stardust-priced items (Computer / Plant): use stardust as
              currency to buy in-game items. */}
          <div className="font-black text-sm tracking-widest uppercase mb-1 mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            Stardust Items
          </div>
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "rgba(255,215,64,0.25)", background: "rgba(255,215,64,0.04)" }}
          >
            <div className="flex items-center gap-4 p-4">
              <div
                className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                style={{ background: "rgba(255,215,64,0.12)", border: "1px solid rgba(255,215,64,0.3)" }}
              >
                <svg viewBox="0 0 16 12" width={28} height={21} style={{ imageRendering: "pixelated" }}>
                  <rect x="1" y="1" width="14" height="9" fill="#cfd6e6" />
                  <rect x="2" y="2" width="12" height="7" fill={computerOwned ? "#0a1a3d" : "#ffd740"} />
                  {!computerOwned && <rect x="6" y="4" width="4" height="3" fill="#fff7c2" />}
                  <rect x="6" y="10" width="4" height="1" fill="#cfd6e6" />
                  <rect x="4" y="11" width="8" height="1" fill="#cfd6e6" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm" style={{ color: "#ffd740" }}>{t("shop.computer")}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Place it in your HOME · produces 25 stardust every 24h
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="font-black text-base" style={{ color: "#ffd740" }}>★ {computerCost.toLocaleString()}</div>
                <div className="text-xs opacity-70" style={{ color: "#ffd740" }}>{t("shop.stardust")}</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,215,64,0.15)" }}>
              <button
                onClick={handleBuyComputer}
                disabled={!canBuyComputer || buying === "computer"}
                className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                style={{
                  background: "rgba(255,215,64,0.10)",
                  color: canBuyComputer ? "#ffd740" : "rgba(255,215,64,0.35)",
                  cursor: canBuyComputer ? "pointer" : "not-allowed",
                  opacity: buying === "computer" ? 0.6 : 1,
                }}
              >
                {computerOwned
                  ? "OWNED — PLACE IT IN YOUR HOME"
                  : buying === "computer"
                  ? "Processing..."
                  : stardustBalance < computerCost
                  ? `Need ${(computerCost - stardustBalance).toLocaleString()} more stardust`
                  : `BUY — ★ ${computerCost.toLocaleString()} STARDUST`}
              </button>
            </div>
          </div>

          {/* PLANT SEED — second stardust item. Same card pattern as the
              computer; the player then grows it on the HOME page through
              10 levels of watering until it produces 10 TON / 30 days. */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "rgba(0,230,118,0.30)", background: "rgba(0,230,118,0.04)" }}
          >
            <div className="flex items-center gap-4 p-4">
              <div
                className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                style={{ background: "rgba(0,230,118,0.12)", border: "1px solid rgba(0,230,118,0.30)" }}
              >
                {/* Show a level-1 seed in the pot when not owned, full
                    grown level-9 plant when owned (preview of progress). */}
                <PixelPlant level={plantOwned ? 9 : 1} size={36} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm" style={{ color: "#00e676" }}>{t("shop.plantSeed")}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Grow a plant in your HOME · 10 levels · matures into 10 GRAM every 30 days
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="font-black text-base" style={{ color: "#00e676" }}>★ {plantSeedCost.toLocaleString()}</div>
                <div className="text-xs opacity-70" style={{ color: "#00e676" }}>{t("shop.stardust")}</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(0,230,118,0.20)" }}>
              <button
                onClick={handleBuyPlant}
                disabled={!canBuyPlant || buying === "plant"}
                className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                style={{
                  background: "rgba(0,230,118,0.10)",
                  color: canBuyPlant ? "#00e676" : "rgba(0,230,118,0.40)",
                  cursor: canBuyPlant ? "pointer" : "not-allowed",
                  opacity: buying === "plant" ? 0.6 : 1,
                }}
              >
                {plantOwned
                  ? "OWNED — PLACE IT IN YOUR HOME"
                  : buying === "plant"
                  ? "Processing..."
                  : stardustBalance < plantSeedCost
                  ? `Need ${(plantSeedCost - stardustBalance).toLocaleString()} more stardust`
                  : `BUY — ★ ${plantSeedCost.toLocaleString()} STARDUST`}
              </button>
            </div>
          </div>
          </>)}

          {shopTab === "items" && (<>
          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Packs & Items
          </div>

          {/* Extra Slot — TON-only, prezzo fisso 0.25 TON per ogni slot
              acquistato (nessuna escalation). Il pagamento in Stars è
              disabilitato lato server e nascosto qui. */}
          {(() => {
            const item = EXTRA_SLOT_ITEM;
            const price = slotPrice?.nextPriceTon ?? item.tonPrice;
            const owned = slotPrice?.bonusSlots ?? 0;
            const maxPrice = slotPrice?.maxPriceTon ?? 1;
            const atCap = price >= maxPrice;
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
                    <div className="font-black text-base" style={{ color: "#0088ff" }}>{price}</div>
                    <div className="text-xs opacity-70" style={{ color: "#0088ff" }}>GRAM</div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${item.color}15` }}>
                  <button
                    onClick={() => handleTonBuy(item)}
                    disabled={buying === item.id || !slotPrice}
                    className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                    style={{
                      background: item.color + "10",
                      color: item.color,
                      opacity: buying === item.id || !slotPrice ? 0.6 : 1,
                    }}
                  >
                    {buying === item.id ? "Processing..." : !slotPrice ? "Loading..." : `BUY — ${price} GRAM`}
                  </button>
                </div>
              </div>
            );
          })()}

          {SHOP_ITEMS.map(item => (
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
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{item.desc}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="font-black text-base" style={{ color: payMode === "stars" ? "#ffd700" : "#0088ff" }}>
                    {payMode === "stars" ? `⭐ ${item.starsPrice}` : `${item.tonPrice}`}
                  </div>
                  <div className="text-xs opacity-70" style={{ color: payMode === "stars" ? "#ffd700" : "#0088ff" }}>
                    {payMode === "stars" ? "Stars" : "GRAM"}
                  </div>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${item.color}15` }}>
                <button
                  onClick={() => payMode === "stars" ? handleStarsBuy(item) : handleTonBuy(item)}
                  disabled={buying === item.id}
                  className="w-full py-3 font-black text-sm tracking-wider uppercase transition-all active:scale-95"
                  style={{
                    background: item.color + "10",
                    color: item.color,
                    opacity: buying === item.id ? 0.6 : 1,
                  }}
                >
                  {buying === item.id ? "Processing..." : payMode === "stars" ? `BUY — ⭐ ${item.starsPrice}` : `BUY — ${item.tonPrice} TON`}
                </button>
              </div>
            </div>
          ))}
          </>)}
        </div>
      </div>
    </div>
  );
}
