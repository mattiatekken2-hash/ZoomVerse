import { useEffect, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { useT } from "../i18n/LanguageContext";
import { confirmTonPurchase, pollTxnUntilFinal } from "../utils/api";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

interface CollectionsPageProps {
  telegramId: string | null;
  sunCount: number;
  whiteCollectionUnlocked: boolean;
  whiteCollectionBundles: number;
  earthCollectionUnlocked: boolean;
  earthCollectionBundles: number;
  blackCollectionUnlocked: boolean;
  blackCollectionBundles: number;
  supernovaCollectionUnlocked: boolean;
  supernovaCollectionBundles: number;
  visible?: boolean;
}

interface StockInfo {
  sold: number;
  remaining: number;
  max: number;
}

const COLLECTIONS = [
  {
    key: "white" as const,
    name: "White Collection",
    titleKey: "whiteColl.title",
    descKey: "whiteColl.desc",
    color: "#39ff7e",
    color2: "#0fd9ff",
    priceTon: 20,
    stockEndpoint: "api/white-collection/stock",
    purchaseType: "white_collection" as const,
    tags: ["4 exclusive slots", "~120/hr each", "Requires SUN", "Limited edition"],
  },
  {
    key: "earth" as const,
    name: "Earth Collection",
    titleKey: "earthColl.title",
    descKey: "earthColl.desc",
    color: "#3b82f6",
    color2: "#22c55e",
    priceTon: 5,
    stockEndpoint: "api/earth-collection/stock",
    purchaseType: "earth_collection" as const,
    tags: ["4 earth slots", "Public TON payout", "~0.333 TON/day", "Requires SUN"],
  },
  {
    key: "black" as const,
    name: "Black Collection",
    titleKey: "blackColl.title",
    descKey: "blackColl.desc",
    color: "#7b2fff",
    color2: "#c084fc",
    priceTon: 40,
    stockEndpoint: "api/black-collection/stock",
    purchaseType: "black_collection" as const,
    tags: ["4 black slots", "10 TON/month", "On-chain payout", "No SUN required"],
  },
  {
    key: "supernova" as const,
    name: "Supernova Collection",
    titleKey: "supernovaColl.title",
    descKey: "supernovaColl.desc",
    color: "#ffd700",
    color2: "#fde047",
    priceTon: 12,
    stockEndpoint: "api/supernova-collection/stock",
    purchaseType: "supernova_collection" as const,
    tags: ["4 yellow stars", "1.5 TON/30d", "Limited 50 bundles", "No SUN required"],
  },
] as const;

function useCollectionStock(endpoint: string) {
  const [stock, setStock] = useState<StockInfo | null>(null);
  const fetchStock = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}${endpoint}`);
      if (r.ok) setStock(await r.json());
    } catch { /* ignore */ }
  };
  useEffect(() => {
    fetchStock();
    const onRefresh = () => fetchStock();
    window.addEventListener("zoom-data-refresh", onRefresh);
    return () => window.removeEventListener("zoom-data-refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { stock, refresh: fetchStock };
}

interface CardProps {
  item: typeof COLLECTIONS[number];
  telegramId: string | null;
  unlocked: boolean;
  ownedBundles: number;
  sunCount: number;
}

const CollectionCard = memo(function CollectionCardBase({ item, telegramId, unlocked, ownedBundles, sunCount }: CardProps) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { stock, refresh } = useCollectionStock(item.stockEndpoint);

  const maxBundles = item.key === "white" ? 10 : 6;
  const atUserCap = item.key === "white" && ownedBundles >= maxBundles;
  const soldOut = !!stock && stock.remaining <= 0;
  const sunLocked = item.key !== "black" && item.key !== "supernova" && sunCount < 1;
  const disabled = soldOut || sunLocked || buying || atUserCap;

  const handleBuy = async () => {
    if (!telegramId) { setMessage(t("pay.tgMissing")); return; }
    if (sunLocked) { setMessage(t(item.key === "white" ? "whiteColl.requirementSun" : "earthColl.requirementSun")); return; }
    if (!connectedAddress) { tonConnectUI.openModal(); setMessage(t("pay.connectFirst")); return; }
    setBuying(true);
    try {
      const nanotons = BigInt(Math.round(item.priceTon * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, item.purchaseType, connectedAddress, item.priceTon, boc);
      if (confirmResult.alreadyCredited || confirmResult.ok) {
        setMessage(t(`${item.key}Coll.unlocked` as any));
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage(t("pay.verifying"));
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(t(`${item.key}Coll.unlocked` as any));
          window.dispatchEvent(new Event("zoom-data-refresh"));
        } else {
          setMessage(t("pay.tryAgain"));
        }
      } else {
        setMessage(confirmResult.error || t("pay.tryAgain"));
      }
    } catch {
      setMessage(t("pay.tryAgain"));
    } finally {
      setBuying(false);
      refresh();
    }
  };

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const c = item.color;
  const c2 = item.color2;

  return (
    <div
      className="rounded-2xl p-5 border relative overflow-hidden"
      style={{
        borderColor: `${c}4d`,
        background: `linear-gradient(135deg, ${c}14 0%, ${c2}0a 100%)`,
        boxShadow: `0 0 32px ${c}1a`,
      }}
    >
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${c}26 0%, transparent 70%)`, filter: "blur(20px)", transform: "translate(30%, -30%)" }}
      />
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div>
          <div className="font-black text-xl tracking-wide" style={{ color: c }}>
            {t(item.titleKey as any)}
          </div>
          <div className="text-xs mt-1" style={{ color: `${c}99` }}>
            {stock ? `${stock.remaining}/${stock.max} left` : "Limited Edition"}
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: `${c}26`, color: c, border: `1px solid ${c}4d` }}
        >
          {unlocked ? `OWNED ${ownedBundles}${item.key === "white" ? "/10" : ""}` : "LOCKED"}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4 relative z-10">
        {item.tags.map((tag) => (
          <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${c}14`, color: `${c}b3`, border: `1px solid ${c}26` }}
          >
            {tag}
          </span>
        ))}
      </div>
      {message && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs font-bold text-center relative z-10"
          style={{ background: `${c}1a`, color: c, border: `1px solid ${c}33` }}
        >
          {message}
        </div>
      )}
      <button
        onClick={handleBuy}
        disabled={disabled}
        className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center transition-all active:scale-95 relative z-10"
        style={{
          background: disabled
            ? "rgba(255,255,255,0.04)"
            : `linear-gradient(135deg, ${c}33, ${c2}26)`,
          color: disabled ? "rgba(255,255,255,0.2)" : c,
          boxShadow: disabled ? "none" : `0 0 20px ${c}33`,
          border: `1px solid ${disabled ? "rgba(255,255,255,0.06)" : `${c}4d`}`,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: buying ? 0.6 : 1,
        }}
      >
        {soldOut ? "Sold Out" : atUserCap ? `MAX OWNED (${maxBundles}/${maxBundles})` : sunLocked ? "🔒 SUN REQUIRED" : buying ? "Processing..." : `BUY — ${item.priceTon} TON`}
      </button>
    </div>
  );
});

export function CollectionsPage({
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
  visible = true,
}: CollectionsPageProps) {
  const { t } = useT();
  if (!visible) return null;

  const bundles = {
    white: whiteCollectionBundles,
    earth: earthCollectionBundles,
    black: blackCollectionBundles,
    supernova: supernovaCollectionBundles,
  };

  const unlocked = {
    white: whiteCollectionUnlocked,
    earth: earthCollectionUnlocked,
    black: blackCollectionUnlocked,
    supernova: supernovaCollectionUnlocked,
  };

  return (
    <div className="flex flex-col h-full relative overflow-y-auto" style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-4">
        <div
          className="font-black text-lg tracking-widest"
          style={{ color: "#00f2fe", textShadow: "0 0 12px rgba(0,242,254,0.6)" }}
        >
          {t("bundles.title")}
        </div>
      </div>
      <div className="flex flex-col gap-4 pb-20">
        {COLLECTIONS.map((item) => (
          <CollectionCard
            key={item.key}
            item={item}
            telegramId={telegramId}
            unlocked={unlocked[item.key]}
            ownedBundles={bundles[item.key]}
            sunCount={sunCount}
          />
        ))}
      </div>
    </div>
  );
}
