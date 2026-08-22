import { memo, useState, useCallback } from "react";
import { haptic } from "../utils/haptic";
import { ZoomCubeIcon } from "./ZoomCubeIcon";

const STORE_GOLD = "#ffd700";
const STORE_GLOW = "#ffe44d";
const STORE_DARK = "rgba(18,14,0,0.92)";

/* ─── Catalogue ─────────────────────────────────────────────── */
const PRODUCTS = [
  {
    id: "polo",
    name: "ZOOM Polo Shirt",
    tag: "OFFICIAL DROP",
    desc: "Premium black polo with the iconic ZOOM logo embroidered on the chest. Web3-powered merch.",
    price: 12_500_000,
    emoji: "👕",
  },
  {
    id: "mug",
    name: "ZOOM Mug",
    tag: "LIMITED EDITION",
    desc: "Matte black ceramic mug. Start every morning with the ZOOM universe.",
    price: 8_000_000,
    emoji: "☕",
  },
  {
    id: "cap",
    name: "ZOOM Cap",
    tag: "EXCLUSIVE",
    desc: "Snapback cap with 3D embroidered ZOOM cube logo. One size fits all.",
    price: 10_750_000,
    emoji: "🧢",
  },
];

function fmtZoom(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

/* ─── "Coming soon" overlay ──────────────────────────────────── */
function ComingSoonOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2100,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 360,
          background: `linear-gradient(160deg, rgba(28,22,0,0.98), rgba(10,8,0,0.99))`,
          border: `1.5px solid ${STORE_GOLD}55`,
          boxShadow: `0 0 60px ${STORE_GOLD}22`,
          borderRadius: 20, padding: 32, textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <ZoomCubeIcon size={56} />
        </div>
        <div style={{
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          fontSize: 20, fontWeight: 900, letterSpacing: "0.16em",
          color: STORE_GOLD, textShadow: `0 0 18px ${STORE_GLOW}88`,
          marginBottom: 8,
        }}>
          COMING SOON
        </div>
        <div style={{
          fontSize: 12, color: "rgba(255,220,80,0.6)",
          lineHeight: 1.6, marginBottom: 24,
        }}>
          Il pagamento con $ZOOM arriverà presto.{"\n"}
          Grazie per supportare il movimento!
        </div>
        <div style={{
          fontSize: 10, letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.25)", marginBottom: 22,
        }}>
          STORE.ZOOM.APP · POWERED BY WEB3
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "10px 32px", borderRadius: 10,
            fontWeight: 800, fontSize: 12, letterSpacing: "0.1em",
            background: `linear-gradient(135deg, ${STORE_GOLD}cc, #e6a800cc)`,
            border: `1px solid ${STORE_GLOW}88`,
            color: "#1a1000", cursor: "pointer",
            boxShadow: `0 0 18px ${STORE_GOLD}44`,
          }}
        >
          OK, MI AVVISI!
        </button>
      </div>
    </div>
  );
}

/* ─── Main widget ────────────────────────────────────────────── */
function ZoomStoreWidgetBase({ shopMode = false }: { shopMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  // qty per product id
  const [cart, setCart] = useState<Record<string, number>>({});
  // brief "added" flash per product
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const cartTotal = Object.values(cart).reduce((a, b) => a + b, 0);

  const totalZoom = PRODUCTS.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.price, 0);

  const handleAddToCart = useCallback((id: string) => {
    haptic();
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    setAdded((a) => ({ ...a, [id]: true }));
    setTimeout(() => setAdded((a) => ({ ...a, [id]: false })), 1400);
  }, []);

  const handleRemove = useCallback((id: string) => {
    haptic();
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) > 1) next[id]--;
      else delete next[id];
      return next;
    });
  }, []);

  const handleCheckout = () => {
    haptic();
    setComingSoon(true);
  };

  return (
    <>
      <style>{`
        @keyframes zsFloat {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-3px) scale(1.02); }
        }
        @keyframes zsGlow {
          0%,100% { box-shadow: 0 0 12px ${STORE_GOLD}88, 0 0 22px ${STORE_GOLD}33; }
          50%      { box-shadow: 0 0 22px ${STORE_GLOW}cc, 0 0 40px ${STORE_GOLD}55; }
        }
        @keyframes zsAddedPop {
          0%   { transform: scale(0.8); opacity: 0; }
          40%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .zs-btn-tile { animation: zsGlow 2.8s ease-in-out infinite; }
        .zs-btn-icon { animation: zsFloat 3.4s ease-in-out infinite; }
        .zs-added    { animation: zsAddedPop 0.3s ease-out forwards; }
      `}</style>

      {/* ── Floating button ── */}
      <button
        onClick={() => { /* coming soon */ }}
        aria-label="ZOOM Store coming soon"
        className="zs-btn-tile"
        style={shopMode ? {
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(18,14,0,0.88)",
          border: `1px solid ${STORE_GOLD}55`,
          cursor: "default",
          position: "relative",
          overflow: "hidden",
          textAlign: "left" as const,
        } : {
          position: "fixed",
          left: 12,
          top: 320,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(18,14,0,0.88)",
          border: `1.5px solid ${STORE_GOLD}66`,
          padding: 4,
          cursor: "default",
          zIndex: 40,
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-zoom-store"
      >
        <div
          className="zs-btn-icon"
          style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 1, position: "relative",
          }}
        >
          {/* Shopping bag pixel-art SVG */}
          <svg width={24} height={24} viewBox="0 0 12 14" shapeRendering="crispEdges"
            style={{ filter: `drop-shadow(0 0 6px ${STORE_GOLD}cc)` }}>
            <rect x="3" y="0" width="1" height="3" fill={STORE_GOLD} />
            <rect x="8" y="0" width="1" height="3" fill={STORE_GOLD} />
            <rect x="4" y="0" width="4" height="1" fill={STORE_GOLD} />
            <rect x="1" y="3" width="10" height="9" fill={STORE_DARK} />
            <rect x="1" y="3" width="10" height="1"  fill={STORE_GOLD} />
            <rect x="1" y="11" width="10" height="1" fill={STORE_GOLD} />
            <rect x="1" y="3"  width="1" height="9"  fill={STORE_GOLD} />
            <rect x="10" y="3" width="1" height="9"  fill={STORE_GOLD} />
            <rect x="3" y="5" width="6" height="1" fill={STORE_GLOW} />
            <rect x="7" y="6" width="1" height="1" fill={STORE_GLOW} />
            <rect x="6" y="7" width="1" height="1" fill={STORE_GLOW} />
            <rect x="5" y="8" width="1" height="1" fill={STORE_GLOW} />
            <rect x="4" y="9" width="1" height="1" fill={STORE_GLOW} />
            <rect x="3" y="10" width="6" height="1" fill={STORE_GLOW} />
          </svg>

          <span style={{
            fontSize: 6, fontWeight: 900, color: STORE_GOLD,
            letterSpacing: "0.04em", lineHeight: 1, marginTop: -1,
          }}>STORE</span>

          {/* Cart badge */}
          {cartTotal > 0 && (
            <div style={{
              position: "absolute", top: -2, right: -2,
              width: 14, height: 14, borderRadius: "50%",
              background: "#ff2244", border: "1.5px solid #1a0000",
              fontSize: 7, fontWeight: 900, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{cartTotal > 9 ? "9+" : cartTotal}</div>
          )}
        </div>
        {shopMode && (
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: "0.08em", color: STORE_GOLD }}>ZOOM STORE</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Official merch · $ZOOM</div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(6,4,0,0.72)",
            backdropFilter: "blur(2px)",
            pointerEvents: "auto",
            gap: 6,
          }}
        >
          <ZoomCubeIcon size={22} />
          <span style={{
            fontFamily: "'Orbitron', 'Inter', sans-serif",
            fontSize: shopMode ? 11 : 7,
            fontWeight: 900,
            letterSpacing: "0.14em",
            color: STORE_GOLD,
          }}>COMING SOON</span>
        </div>
      </button>

      {/* ── Store modal — outer overlay scrolls ── */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "calc(env(safe-area-inset-top, 0px) + 56px) 14px calc(env(safe-area-inset-bottom, 0px) + 24px)",
          }}
        >
          {/* Inner card — no overflow:hidden so it can grow */}
          <div style={{
            position: "relative", width: "100%", maxWidth: 440,
            margin: "0 auto",
            background: `linear-gradient(180deg, rgba(20,16,0,0.98), rgba(8,6,0,0.99))`,
            border: `1px solid ${STORE_GOLD}44`,
            boxShadow: `0 0 50px ${STORE_GOLD}22`,
            borderRadius: 20, color: "#fff",
            paddingBottom: 24,
          }}>

            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute", top: 12, right: 12, zIndex: 10,
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >✕</button>

            {/* Hero banner */}
            <div style={{
              position: "relative", width: "100%", aspectRatio: "2/1",
              overflow: "hidden", borderRadius: "20px 20px 0 0",
            }}>
              <img
                src={`${import.meta.env.BASE_URL}zoom-merch.png`}
                alt="ZOOM Merch"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
              />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 30%, rgba(8,6,0,0.96) 100%)",
              }} />
              <div style={{ position: "absolute", bottom: 14, left: 18 }}>
                <div style={{
                  fontFamily: "'Orbitron', 'Inter', sans-serif",
                  fontSize: 18, fontWeight: 900, letterSpacing: "0.2em",
                  color: STORE_GOLD, textShadow: `0 0 20px ${STORE_GOLD}99`,
                }}>ZOOM STORE</div>
                <div style={{ fontSize: 9, color: "rgba(255,220,80,0.6)", letterSpacing: "0.12em", marginTop: 2 }}>
                  OFFICIAL MERCH · PAY IN $ZOOM
                </div>
              </div>
            </div>

            {/* Subtitle strip */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
              padding: "10px 18px", borderBottom: `1px solid ${STORE_GOLD}22`,
            }}>
              {[
                { icon: "🌐", label: "WEB3 POWERED" },
                { icon: "🛒", label: "OFFICIAL STORE" },
                { icon: "💛", label: "PAY WITH ZOOM" },
              ].map(({ icon, label }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.06em", color: "rgba(255,215,0,0.45)" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Product list */}
            <div style={{ padding: "14px 14px 0" }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.14em", fontWeight: 800,
                color: "rgba(255,215,0,0.45)", marginBottom: 12, textAlign: "center",
              }}>
                ── OFFICIAL MERCH DROP ──
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {PRODUCTS.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  const isAdded = added[p.id] ?? false;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex", gap: 12, alignItems: "stretch",
                        background: qty > 0 ? `${STORE_GOLD}08` : "rgba(255,215,0,0.04)",
                        border: `1px solid ${qty > 0 ? STORE_GOLD + "44" : STORE_GOLD + "22"}`,
                        borderRadius: 14, padding: "12px 14px",
                        transition: "border-color 0.25s, background 0.25s",
                      }}
                    >
                      {/* Emoji */}
                      <div style={{
                        width: 52, height: 52, borderRadius: 10, flexShrink: 0,
                        background: "rgba(255,215,0,0.07)",
                        border: `1px solid ${STORE_GOLD}33`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 28, position: "relative",
                      }}>
                        {p.emoji}
                        {qty > 0 && (
                          <div style={{
                            position: "absolute", top: -5, right: -5,
                            width: 16, height: 16, borderRadius: "50%",
                            background: "#ff2244", border: "1.5px solid #1a0000",
                            fontSize: 8, fontWeight: 900, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{qty}</div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: "inline-block", fontSize: 7, fontWeight: 900,
                          letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 4,
                          background: `${STORE_GOLD}22`, border: `1px solid ${STORE_GOLD}44`,
                          color: STORE_GOLD, marginBottom: 4,
                        }}>
                          {p.tag}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 3 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                          {p.desc}
                        </div>
                      </div>

                      {/* Price + controls */}
                      <div style={{
                        display: "flex", flexDirection: "column",
                        alignItems: "flex-end", justifyContent: "space-between",
                        flexShrink: 0, gap: 6,
                      }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{
                            fontSize: 13, fontWeight: 900, color: STORE_GOLD,
                            textShadow: `0 0 8px ${STORE_GOLD}66`,
                          }}>
                            {fmtZoom(p.price)}
                          </div>
                          <div style={{ fontSize: 8, color: "rgba(255,215,0,0.4)", marginTop: 1 }}>$ZOOM</div>
                        </div>

                        {/* Qty controls when in cart */}
                        {qty > 0 ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                              onClick={() => handleRemove(p.id)}
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.15)",
                                color: "#fff", cursor: "pointer",
                                fontSize: 13, fontWeight: 900,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >−</button>
                            <span style={{ fontSize: 11, fontWeight: 900, color: STORE_GOLD, minWidth: 14, textAlign: "center" }}>{qty}</span>
                            <button
                              onClick={() => handleAddToCart(p.id)}
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                background: `${STORE_GOLD}33`,
                                border: `1px solid ${STORE_GOLD}66`,
                                color: STORE_GOLD, cursor: "pointer",
                                fontSize: 13, fontWeight: 900,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >+</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddToCart(p.id)}
                            className={isAdded ? "zs-added" : ""}
                            style={{
                              padding: "6px 10px", borderRadius: 8,
                              fontWeight: 800, fontSize: 9, letterSpacing: "0.06em",
                              background: isAdded
                                ? "rgba(50,200,50,0.25)"
                                : `linear-gradient(135deg, ${STORE_GOLD}cc, #e6a800cc)`,
                              border: `1px solid ${isAdded ? "#44ff6688" : STORE_GLOW + "88"}`,
                              color: isAdded ? "#44ff88" : "#1a1000",
                              cursor: "pointer",
                              boxShadow: isAdded ? "none" : `0 0 12px ${STORE_GOLD}33`,
                              whiteSpace: "nowrap",
                              transition: "all 0.2s",
                            }}
                          >
                            {isAdded ? "✓ AGGIUNTO" : "🛒 AGGIUNGI"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cart summary + checkout */}
              {cartTotal > 0 && (
                <div style={{
                  marginTop: 16,
                  background: "rgba(255,215,0,0.06)",
                  border: `1px solid ${STORE_GOLD}44`,
                  borderRadius: 14, padding: "14px 16px",
                }}>
                  {/* Line items */}
                  <div style={{ marginBottom: 10 }}>
                    {PRODUCTS.filter((p) => (cart[p.id] ?? 0) > 0).map((p) => (
                      <div key={p.id} style={{
                        display: "flex", justifyContent: "space-between",
                        fontSize: 10, color: "rgba(255,255,255,0.65)",
                        marginBottom: 4,
                      }}>
                        <span>{p.emoji} {p.name} × {cart[p.id]}</span>
                        <span style={{ color: STORE_GOLD, fontWeight: 700 }}>
                          {fmtZoom((cart[p.id] ?? 0) * p.price)} $ZOOM
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: `1px solid ${STORE_GOLD}22`, marginBottom: 10 }} />

                  {/* Total */}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 12,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em" }}>
                      TOTALE ({cartTotal} {cartTotal === 1 ? "articolo" : "articoli"})
                    </span>
                    <span style={{
                      fontSize: 15, fontWeight: 900, color: STORE_GOLD,
                      textShadow: `0 0 10px ${STORE_GOLD}77`,
                    }}>
                      {fmtZoom(totalZoom)} $ZOOM
                    </span>
                  </div>

                  {/* Checkout button */}
                  <button
                    onClick={handleCheckout}
                    style={{
                      width: "100%", padding: "12px 0", borderRadius: 10,
                      fontWeight: 900, fontSize: 13, letterSpacing: "0.1em",
                      background: `linear-gradient(135deg, ${STORE_GOLD}ee, #e6a800dd)`,
                      border: `1px solid ${STORE_GLOW}aa`,
                      color: "#1a1000", cursor: "pointer",
                      boxShadow: `0 0 24px ${STORE_GOLD}44`,
                    }}
                  >
                    💳 PAGA CON $ZOOM
                  </button>
                </div>
              )}

              {/* Footer */}
              <div style={{
                marginTop: 14, textAlign: "center",
                fontSize: 8, color: "rgba(255,215,0,0.25)",
                lineHeight: 1.7, letterSpacing: "0.06em",
              }}>
                🔒 Checkout sicuro · Ordini verificati on-chain{"\n"}
                STORE.ZOOM.APP · GLOBAL COMMUNITY
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coming soon overlay */}
      {comingSoon && <ComingSoonOverlay onClose={() => setComingSoon(false)} />}
    </>
  );
}

export const ZoomStoreWidget = memo(ZoomStoreWidgetBase);
