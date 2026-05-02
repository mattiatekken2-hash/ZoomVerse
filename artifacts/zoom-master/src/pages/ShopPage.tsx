import { useState, useEffect, useRef } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { createStarsInvoice, confirmStarsPurchase, confirmTonPurchase, fetchSunStock, fetchWhiteCollectionStock, pollTxnUntilFinal, type SunStock, type CollectionStock } from "../utils/api";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

interface ShopItem {
  id: string;
  title: string;
  desc: string;
  starsPrice: number;
  tonPrice: number;
  zoomAmount?: number;
  color: string;
  icon: string;
  type: "bundle" | "sun" | "slot";
}

const SHOP_ITEMS: ShopItem[] = [
  { id: "starter_pack", title: "Starter Pack", desc: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, tonPrice: 0.5, zoomAmount: 2000, color: "#8892b0", icon: "◇", type: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", desc: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, tonPrice: 1.5, zoomAmount: 8000, color: "#4facfe", icon: "◈", type: "bundle" },
  { id: "legend_pack", title: "Legend Pack", desc: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, tonPrice: 4.0, zoomAmount: 25000, color: "#c471ed", icon: "⬡", type: "bundle" },
  { id: "extra_slot", title: "Extra Slot", desc: "Unlock 1 additional planet slot", starsPrice: 25, tonPrice: 0.25, color: "#00f2fe", icon: "+", type: "slot" },
];

interface ShopPageProps {
  balance: number;
  hasSun: boolean;
  telegramId?: string | null;
}

export function ShopPage({ hasSun: _hasSun, telegramId }: ShopPageProps) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"stars" | "ton">("stars");
  const [sunStock, setSunStock] = useState<SunStock | null>(null);
  const [whiteStock, setWhiteStock] = useState<CollectionStock | null>(null);

  const refreshStocks = async () => {
    if (!telegramId) return;
    const [sun, white] = await Promise.all([
      fetchSunStock(telegramId),
      fetchWhiteCollectionStock(),
    ]);
    setSunStock(sun);
    if (white) setWhiteStock(white);
  };

  useEffect(() => {
    refreshStocks();
    const id = setInterval(() => { if (!document.hidden) refreshStocks(); }, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const sunSoldOut = !!sunStock && sunStock.remaining <= 0;
  const sunUserMaxed = !!sunStock && sunStock.userCount >= sunStock.maxPerUser;
  const sunDisabled = sunSoldOut || sunUserMaxed;

  const whiteSoldOut = !!whiteStock && whiteStock.remaining <= 0;
  const whiteDisabled = whiteSoldOut;

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

  const handleTonBuy = async (item: ShopItem) => {
    if (!telegramId) { setMessage("Telegram ID missing"); return; }

    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage("Connect your wallet first");
      return;
    }

    setBuying(item.id);
    try {
      const nanotons = BigInt(Math.round(item.tonPrice * 1e9)).toString();

      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: WALLET,
            amount: nanotons,
          },
        ],
      });

      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, item.id, connectedAddress, item.tonPrice, boc);
      if (confirmResult.alreadyCredited) {
        setMessage(`${item.title} purchased!`);
        triggerDataRefresh();
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage("Verifying payment on-chain…");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage(`${item.title} purchased!`);
          triggerDataRefresh();
        } else if (final?.status === "failed") {
          setMessage("Payment not detected on-chain. Contact support if TON was sent.");
        } else {
          // Polling timed out before the background TON verifier finished.
          // The credit may still land — keep refreshing for a couple of
          // minutes so the slot/item appears in the UI without the user
          // having to reopen the app.
          setMessage("Still awaiting confirmation. Item will appear automatically once verified.");
          triggerDataRefresh();
          setTimeout(() => window.dispatchEvent(new Event("zoom-data-refresh")), 90_000);
          setTimeout(() => window.dispatchEvent(new Event("zoom-data-refresh")), 150_000);
        }
      } else if (confirmResult.ok) {
        setMessage(`${item.title} purchased!`);
        triggerDataRefresh();
      } else {
        setMessage(confirmResult.error || "Credit failed");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage("Payment cancelled");
      } else {
        setMessage("TON payment failed");
        console.error("[ton] sendTransaction error:", err);
      }
    }
    setBuying(null);
  };

  const handleConnectWallet = () => {
    tonConnectUI.openModal();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {message && (
        <div
          className="absolute top-2 left-4 right-4 z-50 py-2 px-4 rounded-xl text-sm font-bold text-center"
          style={{ background: "rgba(0,242,254,0.15)", color: "#00f2fe", border: "1px solid rgba(0,242,254,0.3)", backdropFilter: "blur(12px)" }}
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
            TON
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
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
                <div className="font-black text-xl tracking-wide" style={{ color: "#ffb347" }}>THE SUN</div>
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
                const sunItem: ShopItem = { id: "the_sun", title: "THE SUN", desc: "Exclusive", starsPrice: 1000, tonPrice: 10, color: "#ffb347", icon: "☀", type: "sun" };
                if (payMode === "stars") await handleStarsBuy(sunItem);
                else await handleTonBuy(sunItem);
                refreshStocks();
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
              {sunSoldOut ? "Sold Out" : sunUserMaxed ? `Max ${sunStock?.maxPerUser ?? 5} Reached` : buying === "the_sun" ? "Processing..." : payMode === "stars" ? "BUY — ⭐ 1,000 Stars" : "BUY — 10 TON"}
            </button>
          </div>

          <div
            className="rounded-2xl p-5 border relative overflow-hidden"
            style={{
              borderColor: "rgba(240,245,255,0.3)",
              background: "linear-gradient(135deg, rgba(240,245,255,0.08) 0%, rgba(200,215,235,0.04) 100%)",
              boxShadow: "0 0 32px rgba(240,245,255,0.1)",
            }}
          >
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(240,245,255,0.15) 0%, transparent 70%)", filter: "blur(20px)", transform: "translate(30%, -30%)" }} />
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-black text-xl tracking-wide" style={{ color: "#f0f5ff" }}>WHITE COLLECTION</div>
                <div className="text-xs mt-1" style={{ color: "rgba(240,245,255,0.6)" }}>
                  Limited Edition · {whiteStock ? `${whiteStock.remaining}/${whiteStock.max} left` : "Exclusive"}
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "rgba(240,245,255,0.15)", color: "#f0f5ff", border: "1px solid rgba(240,245,255,0.3)" }}>
                LIMITED
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {["4 exclusive planets", "0.11 TON / day", "Requires SUN", "Tradable in TON"].map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(240,245,255,0.08)", color: "rgba(240,245,255,0.7)", border: "1px solid rgba(240,245,255,0.15)" }}>
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={async () => {
                if (whiteDisabled) return;
                const whiteItem: ShopItem = { id: "white_collection", title: "White Collection Limited", desc: "Unlock 4 exclusive farm slots. Yield: 0.11 TON / Day. Requires SUN module.", starsPrice: 2000, tonPrice: 30, color: "#f0f5ff", icon: "❄", type: "bundle" };
                if (payMode === "stars") await handleStarsBuy(whiteItem);
                else await handleTonBuy(whiteItem);
                refreshStocks();
              }}
              disabled={whiteDisabled || buying === "white_collection"}
              className="w-full py-4 rounded-xl font-black text-base tracking-wider text-center transition-all active:scale-95"
              style={{
                background: whiteDisabled ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, rgba(240,245,255,0.2), rgba(200,215,235,0.15))",
                color: whiteDisabled ? "rgba(255,255,255,0.2)" : "#f0f5ff",
                boxShadow: whiteDisabled ? "none" : "0 0 20px rgba(240,245,255,0.2)",
                border: `1px solid ${whiteDisabled ? "rgba(255,255,255,0.06)" : "rgba(240,245,255,0.3)"}`,
                cursor: whiteDisabled ? "not-allowed" : "pointer",
                opacity: buying === "white_collection" ? 0.6 : 1,
              }}
            >
              {whiteSoldOut ? "Sold Out" : buying === "white_collection" ? "Processing..." : payMode === "stars" ? "BUY — ⭐ 2,000 Stars" : "BUY — 30 TON"}
            </button>
          </div>

          <div className="font-black text-sm tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Packs & Items
          </div>

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
                    {payMode === "stars" ? "Stars" : "TON"}
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
        </div>
      </div>
    </div>
  );
}
