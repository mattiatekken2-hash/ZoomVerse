import { useEffect, useState, memo, useRef } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import {
  fetchV1NftPlatinumStock,
  confirmTonPurchase,
  pollTxnUntilFinal,
  fetchV1NftStardustStatus,
  claimV1NftStardust,
  type V1NftPlatinumStock,
  type V1NftStardustStatus,
} from "../utils/api";

// Format a seconds-to-ready countdown as "Xh Ym" (or "Ym" under an hour).
function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

// V1 NFT Platinum Edition — widget quadrato sul LAB (right:12, top:410),
// sotto il trofeo Hall of Fame (top:340 + h:60 = 400). Stesso stile pixel
// di MysteryBoxWidget/HallOfFameWidget: bottone 60×60 con glow animato.
// Apre un modal informativo con stock live e CTA "BUY — 20 GRAM" che usa
// lo stesso flusso TonConnect di ShopPage. SOLO TON (server rifiuta Stars).
//
// Stock: GET /api/v1-nft-platinum/stock ogni 20s + on-demand all'apertura.
// Su acquisto riuscito triggera "zoom-data-refresh" così useGameState
// ri-fetcha grants e materializza il pianeta V1_NFT in inventory.

const WALLET = "UQB7vku7fJS196hYJa86PjQW9rq0Q7hzyqH97Ki5hJHesIdr";

interface Props {
  telegramId: string | null;
  shopMode?: boolean;
}

function V1NftWidgetBase({ telegramId, shopMode = false }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [stock, setStock] = useState<V1NftPlatinumStock | null>(null);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sdStatus, setSdStatus] = useState<V1NftStardustStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const aliveRef = useRef(true);

  const refreshSdStatus = async () => {
    if (!telegramId) return;
    const s = await fetchV1NftStardustStatus(telegramId);
    if (aliveRef.current) setSdStatus(s);
  };

  useEffect(() => {
    aliveRef.current = true;
    const refresh = async () => {
      const s = await fetchV1NftPlatinumStock();
      if (aliveRef.current) setStock(s);
    };
    refresh();
    refreshSdStatus();
    const id = setInterval(() => {
      if (document.hidden) return;
      refresh();
      refreshSdStatus();
    }, 20000);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  const handleClaimStardust = async () => {
    if (!telegramId || claiming) return;
    setClaiming(true);
    const r = await claimV1NftStardust(telegramId);
    if (r.ok) {
      setMessage(`+${r.reward ?? 25} Stardust claimed!`);
      window.dispatchEvent(new Event("stardust-refresh"));
    } else if (r.error === "NOT_READY") {
      setMessage(`Next claim in ${fmtCountdown(r.secondsToReady ?? 0)}`);
    } else if (r.error === "NOT_OWNED") {
      setMessage("You don't own the V1 NFT planet");
    } else {
      setMessage("Claim failed, try again");
    }
    await refreshSdStatus();
    if (aliveRef.current) setClaiming(false);
  };

  // Refresh stock anche quando si apre il modal (utente vuole il dato fresco).
  useEffect(() => {
    if (!open) return;
    void fetchV1NftPlatinumStock().then(s => { if (aliveRef.current) setStock(s); });
    void refreshSdStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(id);
  }, [message]);

  const soldOut = !!stock && stock.remaining <= 0;
  const disabled = soldOut || buying || !telegramId;

  const handleBuy = async () => {
    if (disabled) return;
    if (!telegramId) { setMessage("Telegram ID missing"); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage("Connect your wallet first");
      return;
    }
    setBuying(true);
    try {
      const tonPrice = 20;
      const nanotons = BigInt(Math.round(tonPrice * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      const confirmResult = await confirmTonPurchase(telegramId, "v1_nft_platinum", connectedAddress, tonPrice, boc);
      if (confirmResult.alreadyCredited) {
        setMessage("V1 NFT purchased!");
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else if (confirmResult.pending && confirmResult.txnId) {
        setMessage("Verifying payment on-chain…");
        const final = await pollTxnUntilFinal(confirmResult.txnId);
        if (final?.status === "completed") {
          setMessage("V1 NFT purchased!");
          window.dispatchEvent(new Event("zoom-data-refresh"));
        } else if (final?.status === "failed") {
          setMessage("Payment not detected. Contact support if GRAM was sent.");
        } else {
          setMessage("Awaiting confirmation. The NFT will appear once verified.");
          window.dispatchEvent(new Event("zoom-data-refresh"));
          setTimeout(() => window.dispatchEvent(new Event("zoom-data-refresh")), 90_000);
          setTimeout(() => window.dispatchEvent(new Event("zoom-data-refresh")), 150_000);
        }
      } else if (confirmResult.ok) {
        setMessage("V1 NFT purchased!");
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else {
        setMessage(confirmResult.error || "Credit failed");
      }
      // refresh stock after attempt
      const s = await fetchV1NftPlatinumStock();
      if (aliveRef.current) setStock(s);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage("Payment cancelled");
      } else {
        setMessage("GRAM payment failed");
        console.error("[v1nft] sendTransaction error:", err);
      }
    }
    if (aliveRef.current) setBuying(false);
  };

  return (
    <>
      <style>{`
        @keyframes v1nft-glow {
          0%,100% { box-shadow: 0 0 14px rgba(126,168,224,0.55), inset 0 0 6px rgba(202,225,255,0.10); }
          50%     { box-shadow: 0 0 24px rgba(202,225,255,0.85), inset 0 0 12px rgba(202,225,255,0.18); }
        }
        @keyframes v1nft-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        .v1nft-pixel { image-rendering: pixelated; }
      `}</style>

      {shopMode ? (
        /* Inline shop card */
        <div
          onClick={() => setOpen(true)}
          style={{
            borderRadius: 14,
            background: "rgba(8,12,28,0.88)",
            border: "1px solid rgba(202,225,255,0.44)",
            overflow: "hidden",
            cursor: "pointer",
          }}
          data-testid="button-v1-nft"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
            <div style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <PixelDiamond size={40} />
              <div style={{ position: "absolute", top: -4, right: -8, background: "linear-gradient(135deg, #cfe4ff, #7ea8e0)", color: "#0a1a3d", fontSize: 7, fontWeight: 900, padding: "1px 3px", borderRadius: 3 }}>NFT</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: "#cfe4ff", fontSize: 14, letterSpacing: "0.04em" }}>V1 NFT PLATINUM</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                {stock ? `${stock.remaining}/${stock.max} left · ` : ""}20 GRAM · 275 $ZOOM/h
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(202,225,255,0.22)", padding: "10px 16px", textAlign: "center", fontWeight: 900, color: "#cfe4ff", fontSize: 12, letterSpacing: "0.06em" }}>
            BUY — 20 GRAM →
          </div>
        </div>
      ) : (
        /* Fixed floating button on the LAB page */
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            top: 90,
            left: 218,
            width: 60,
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            borderRadius: 14,
            background: "rgba(8,12,28,0.78)",
            border: "1.5px solid rgba(202,225,255,0.55)",
            animation: "v1nft-glow 2.4s ease-in-out infinite",
            color: "#fff",
            zIndex: 35,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
          data-testid="button-v1-nft"
          aria-label="V1 NFT Platinum Edition"
        >
          <div style={{ animation: "v1nft-float 2.4s ease-in-out infinite", position: "relative" }}>
            <PixelDiamond size={40} />
            <div style={{
              position: "absolute", top: -8, right: -10,
              background: "linear-gradient(135deg, #cfe4ff, #7ea8e0)",
              color: "#0a1a3d",
              fontSize: 8, fontWeight: 900, letterSpacing: 0.5,
              padding: "1px 4px", borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.7)",
            }}>NFT</div>
          </div>
        </button>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,8,16,0.88)",
            zIndex: 110,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "180px 20px 20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(20,32,64,0.98), rgba(8,14,32,0.98))",
              border: "1.5px solid rgba(202,225,255,0.55)",
              borderRadius: 20,
              padding: 22,
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 0 48px rgba(126,168,224,0.30)",
              textAlign: "center",
              maxHeight: "82vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <PixelDiamond size={64} />
            </div>
            <div className="font-black text-lg tracking-wider" style={{ color: "#cfe4ff", marginBottom: 4 }}>
              V1 NFT Platinum Edition
            </div>
            <div className="text-xs" style={{ color: "rgba(202,225,255,0.7)", marginBottom: 14 }}>
              Exclusive · Only 5 worldwide · 275 $ZOOM/h
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8,
              marginBottom: 14,
            }}>
              {[
                { label: "Yield", value: "275 $ZOOM/h" },
                { label: "Price", value: "20 GRAM" },
                { label: "Global stock", value: stock ? `${stock.remaining}/${stock.max}` : "5/5" },
                { label: "Per-user", value: "Unlimited" },
              ].map((row) => (
                <div key={row.label} style={{
                  padding: "8px 10px", borderRadius: 10,
                  background: "rgba(202,225,255,0.05)",
                  border: "1px solid rgba(202,225,255,0.18)",
                  textAlign: "left",
                }}>
                  <div style={{ color: "rgba(202,225,255,0.55)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                    {row.label.toUpperCase()}
                  </div>
                  <div style={{ color: "#cfe4ff", fontSize: 13, fontWeight: 800 }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            {message && (
              <div style={{
                padding: "8px 10px", borderRadius: 8,
                background: "rgba(126,168,224,0.10)",
                border: "1px solid rgba(126,168,224,0.30)",
                color: "#cfe4ff", fontSize: 11, fontWeight: 600,
                marginBottom: 10,
              }}>
                {message}
              </div>
            )}

            {/* Owners: passive stardust claim — 25 stardust every 24h. */}
            {sdStatus?.owned && (
              <div style={{
                marginBottom: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(255,215,64,0.10), rgba(255,184,77,0.06))",
                border: "1px solid rgba(255,215,64,0.35)",
              }}>
                <div style={{ color: "rgba(255,235,150,0.85)", fontSize: 11, fontWeight: 700, marginBottom: 8, letterSpacing: 0.4 }}>
                  ⭐ PASSIVE STARDUST · +{sdStatus.rewardPerClaim} / 24h
                </div>
                <button
                  onClick={handleClaimStardust}
                  disabled={claiming || !sdStatus.claimable}
                  className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
                  style={{
                    background: (claiming || !sdStatus.claimable)
                      ? "rgba(255,255,255,0.04)"
                      : "linear-gradient(135deg, rgba(255,215,64,0.28), rgba(255,184,77,0.20))",
                    color: (claiming || !sdStatus.claimable) ? "rgba(255,255,255,0.30)" : "#ffe98a",
                    border: `1px solid ${(claiming || !sdStatus.claimable) ? "rgba(255,255,255,0.10)" : "rgba(255,215,64,0.5)"}`,
                    cursor: (claiming || !sdStatus.claimable) ? "not-allowed" : "pointer",
                  }}
                  data-testid="button-v1-nft-claim-stardust"
                >
                  {claiming
                    ? "CLAIMING…"
                    : sdStatus.claimable
                    ? `CLAIM ${sdStatus.rewardPerClaim} STARDUST`
                    : `NEXT IN ${fmtCountdown(sdStatus.secondsToReady)}`}
                </button>
              </div>
            )}

            <button
              onClick={handleBuy}
              disabled={disabled}
              className="w-full py-3 rounded-xl font-black text-base tracking-wider active:scale-95"
              style={{
                background: disabled
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, rgba(202,225,255,0.20), rgba(126,168,224,0.16))",
                color: disabled ? "rgba(255,255,255,0.30)" : "#cfe4ff",
                border: `1px solid ${disabled ? "rgba(255,255,255,0.10)" : "rgba(202,225,255,0.45)"}`,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              data-testid="button-v1-nft-buy"
            >
              {soldOut ? "SOLD OUT" : buying ? "PROCESSING…" : "BUY — 20 GRAM"}
            </button>

            <button
              onClick={() => setOpen(false)}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                marginTop: 10,
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              data-testid="button-v1-nft-close"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Pixel-art platinum diamond/NFT badge (16×16). Stesso stile di PixelTrophy
 *  e PixelCrate per uniformità visiva con gli altri widget del LAB. */
function PixelDiamond({ size }: { size: number }) {
  const grid = 16;
  const light = "#ffffff";
  const ice = "#e9f4ff";
  const blue = "#7ea8e0";
  const dark = "#3d5a8c";
  const shadow = "#1a2a4a";

  // Letters: l=light, i=ice, b=blue, d=dark, s=shadow, .=empty
  const map = [
    "................",
    "................",
    "....ddddddddd...",
    "...didddddddid..",
    "..dilbbbbbbblid.",
    ".dilbiibbbiibild",
    "dilbililbililbid",
    "dlbililbililbild",
    "dbililbbbililbid",
    "sdilbbbbbbbblids",
    ".sdilbbbbbbbids.",
    "..sdilbbbbbids..",
    "...sdilbbbids...",
    "....sdilbids....",
    ".....sdibds.....",
    "......sds.......",
  ];

  const colorOf: Record<string, string> = {
    l: light, i: ice, b: blue, d: dark, s: shadow,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      className="v1nft-pixel"
      shapeRendering="crispEdges"
      style={{ filter: "drop-shadow(0 0 8px rgba(202,225,255,0.65))" }}
    >
      {map.map((row, y) =>
        [...row].map((c, x) => {
          if (c === ".") return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colorOf[c] || "#fff"} />;
        }),
      )}
    </svg>
  );
}

export const V1NftWidget = memo(V1NftWidgetBase);
