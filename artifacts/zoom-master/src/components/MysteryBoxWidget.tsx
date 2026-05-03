import { useEffect, useRef, useState, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import {
  confirmTonPurchase,
  fetchTxnStatus,
  fetchMysteryBoxStock,
  fetchMysteryBoxActivity,
  openMysteryBoxStream,
  type MysteryBoxActivityItem,
  type MysteryBoxStock,
} from "../utils/api";
import { PlanetOrb } from "./PlanetOrb";
import type { Planet } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";

const WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const PRICE_TON = 1.5;

const RARITY_COLORS: Record<string, string> = {
  basic: "#a0aec0",
  rare: "#5b8cff",
  epic: "#c060ff",
  gold: "#ffcc33",
  sun: "#ffae00",
};

const RARITY_GLOW: Record<string, string> = {
  basic: "rgba(160,174,192,0.6)",
  rare: "rgba(91,140,255,0.7)",
  epic: "rgba(192,96,255,0.8)",
  gold: "rgba(255,204,51,0.9)",
  sun: "rgba(255,174,0,1)",
};

// Maps a mystery-box award rarity onto the in-game planet name + color used by
// PlanetOrb so the same on-board planet UI is shown inside the box.
const RARITY_TO_PLANET: Record<string, { name: string; color: string } | null> = {
  basic: { name: "BASIC", color: "#8892b0" },
  rare:  { name: "RARE",  color: "#4facfe" },
  epic:  { name: "EPIC",  color: "#c471ed" },
  gold:  { name: "GOLD",  color: "#ffd700" },
  sun:   null, // SUN keeps its own dedicated visual
};

/** Build a minimal Planet-shaped object good enough for PlanetOrb (which only
 *  reads `name` and `color`). Saves us from constructing the full Planet
 *  type. */
function planetForOrb(name: string, color: string): Planet {
  return { name, color } as unknown as Planet;
}

interface MysteryBoxWidgetProps {
  telegramId: string | null;
}

type Phase = "idle" | "buying" | "verifying" | "shaking" | "revealed";

function MysteryBoxWidgetBase({ telegramId }: MysteryBoxWidgetProps) {
  const { t } = useT();
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [award, setAward] = useState<string | null>(null);
  const [stock, setStock] = useState<MysteryBoxStock | null>(null);
  const [feed, setFeed] = useState<MysteryBoxActivityItem[]>([]);
  const [tickerIdx, setTickerIdx] = useState(0);
  const closeRef = useRef<(() => void) | null>(null);

  // Hydrate stock + feed once on mount; subscribe to live SSE always
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, items] = await Promise.all([fetchMysteryBoxStock(), fetchMysteryBoxActivity(20)]);
      if (!alive) return;
      if (s) setStock(s);
      setFeed(items);
    })();
    const close = openMysteryBoxStream((ev) => {
      setFeed((prev) => [ev, ...prev].slice(0, 20));
      if (ev.award === "sun") {
        setStock((prev) => prev ? { ...prev, sunsAwarded: prev.sunsAwarded + 1, sunsRemaining: Math.max(0, prev.sunsRemaining - 1) } : prev);
      }
    });
    closeRef.current = close;
    return () => { alive = false; close(); };
  }, []);

  // Rotating ticker text on the closed widget (1 latest event at a time)
  useEffect(() => {
    if (feed.length === 0) return;
    const t = setInterval(() => {
      setTickerIdx((i) => (i + 1) % Math.min(feed.length, 5));
    }, 3500);
    return () => clearInterval(t);
  }, [feed.length]);

  // Refresh stock when modal opens
  useEffect(() => {
    if (!open) return;
    void fetchMysteryBoxStock().then((s) => { if (s) setStock(s); });
  }, [open]);

  const resetForReopen = () => {
    setPhase("idle");
    setAward(null);
    setMessage(null);
  };

  const handleOpenClick = () => {
    resetForReopen();
    setOpen(true);
  };

  const handleClose = () => {
    if (phase === "buying" || phase === "verifying" || phase === "shaking") return;
    setOpen(false);
    resetForReopen();
  };

  const handleBuy = async () => {
    if (!telegramId) { setMessage(t("pay.tgMissing")); return; }
    if (!connectedAddress) {
      tonConnectUI.openModal();
      setMessage(t("pay.connectFirst"));
      return;
    }
    setMessage(null);
    setAward(null);
    setPhase("buying");
    try {
      const nanotons = BigInt(Math.round(PRICE_TON * 1e9)).toString();
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: WALLET, amount: nanotons }],
      });
      const boc = txResult.boc || "";
      setPhase("verifying");
      const confirmResult = await confirmTonPurchase(telegramId, "mystery_box", connectedAddress, PRICE_TON, boc);

      let finalAward: string | null = null;

      if (confirmResult.alreadyCredited && confirmResult.txnId) {
        const s = await fetchTxnStatus(confirmResult.txnId, telegramId);
        finalAward = (s?.award as string) ?? null;
      } else if (confirmResult.ok && confirmResult.txnId && !confirmResult.pending) {
        const s = await fetchTxnStatus(confirmResult.txnId, telegramId);
        finalAward = (s?.award as string) ?? null;
      } else if (confirmResult.pending && confirmResult.txnId) {
        // Poll for award
        const start = Date.now();
        while (Date.now() - start < 180_000) {
          await new Promise((r) => setTimeout(r, 3500));
          const s = await fetchTxnStatus(confirmResult.txnId, telegramId);
          if (s?.status === "completed") { finalAward = (s.award as string) ?? null; break; }
          if (s?.status === "failed") { setMessage(t("pay.notDetected")); setPhase("idle"); return; }
        }
        if (!finalAward) { setMessage(t("pay.awaiting")); setPhase("idle"); return; }
      } else {
        setMessage(confirmResult.error || t("pay.creditFailed"));
        setPhase("idle");
        return;
      }

      // Trigger shake animation, then reveal
      setPhase("shaking");
      setTimeout(() => {
        setAward(finalAward);
        setPhase("revealed");
        try {
          const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (s: string) => void } } } }).Telegram?.WebApp;
          tg?.HapticFeedback?.notificationOccurred?.("success");
        } catch { /**/ }
        window.dispatchEvent(new Event("zoom-data-refresh"));
      }, 1400);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("cancel") || errMsg.includes("reject") || errMsg.includes("Interrupted")) {
        setMessage(t("pay.cancelled"));
      } else {
        setMessage(t("pay.failed"));
        console.error("[mystery_box] sendTransaction error:", err);
      }
      setPhase("idle");
    }
  };

  const tickerEvent = feed[tickerIdx];

  return (
    <>
      <style>{`
        @keyframes mb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes mb-shake {
          0%,100% { transform: translate(0,0) rotate(0); }
          10% { transform: translate(-2px,1px) rotate(-3deg); }
          20% { transform: translate(2px,-1px) rotate(3deg); }
          30% { transform: translate(-3px,2px) rotate(-5deg); }
          40% { transform: translate(3px,-2px) rotate(5deg); }
          50% { transform: translate(-4px,1px) rotate(-6deg); }
          60% { transform: translate(4px,-1px) rotate(6deg); }
          70% { transform: translate(-3px,2px) rotate(-4deg); }
          80% { transform: translate(3px,-2px) rotate(4deg); }
          90% { transform: translate(-1px,1px) rotate(-2deg); }
        }
        @keyframes mb-beam {
          0% { opacity: 0; transform: translateX(-50%) scaleY(0); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) scaleY(1.6); }
        }
        @keyframes mb-pop {
          0% { opacity: 0; transform: scale(0.4); }
          60% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes mb-glow {
          0%,100% { box-shadow: 0 0 14px rgba(192,96,255,0.45), inset 0 0 6px rgba(255,255,255,0.05); }
          50% { box-shadow: 0 0 22px rgba(192,96,255,0.7), inset 0 0 10px rgba(255,255,255,0.08); }
        }
        .mb-pixel-crate {
          image-rendering: pixelated;
        }
      `}</style>

      {/* Closed widget — top right, just below the White Collection avatar
          (which sits at right:12 / top:200 with height 60 → bottom 260). */}
      <button
        onClick={handleOpenClick}
        style={{
          position: "fixed",
          top: 270,
          right: 12,
          width: 60,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4,
          borderRadius: 14,
          background: "rgba(8,12,28,0.78)",
          border: "1.5px solid rgba(192,96,255,0.5)",
          animation: "mb-glow 2.4s ease-in-out infinite",
          color: "#fff",
          zIndex: 35,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-mystery-box"
        aria-label={t("mystery.openAria")}
      >
        <PixelCrate size={40} animate />
      </button>

      {/* Live ticker under the widget */}
      {tickerEvent && (
        <div
          style={{
            position: "fixed",
            top: 320,
            right: 12,
            maxWidth: "60%",
            padding: "3px 10px",
            borderRadius: 10,
            background: "rgba(6,8,16,0.7)",
            border: `1px solid ${RARITY_GLOW[tickerEvent.award] || "rgba(255,255,255,0.15)"}`,
            color: "rgba(255,255,255,0.85)",
            fontSize: 10,
            fontWeight: 600,
            zIndex: 35,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            backdropFilter: "blur(6px)",
          }}
          data-testid="mystery-box-ticker"
        >
          <span style={{ color: RARITY_COLORS[tickerEvent.award] || "#fff", fontWeight: 800 }}>
            {tickerEvent.userName}
          </span>{" "}
          {t("mystery.gotShort")} <span style={{ color: RARITY_COLORS[tickerEvent.award] || "#fff" }}>{tickerEvent.awardLabel}</span>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(6,8,16,0.88)",
            backdropFilter: "blur(8px)",
            zIndex: 110, display: "flex",
            alignItems: "flex-start", justifyContent: "center",
            padding: "140px 20px 20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(24,16,46,0.98), rgba(8,6,18,0.98))",
              border: "1.5px solid rgba(192,96,255,0.45)",
              borderRadius: 20, padding: 22,
              maxWidth: 360, width: "100%",
              boxShadow: "0 0 48px rgba(192,96,255,0.3)",
              textAlign: "center",
              maxHeight: "92vh", overflowY: "auto",
            }}
          >
            <div className="font-black text-lg tracking-wider" style={{ color: "#c060ff", marginBottom: 4 }}>
              {t("mystery.title")}
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 14, lineHeight: 1.5 }}>
              {t("mystery.desc")}
            </div>

            {/* Crate stage */}
            <div style={{
              position: "relative",
              width: "100%", height: 180,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              {/* Light beam during shake/reveal */}
              {(phase === "shaking" || phase === "revealed") && (
                <div style={{
                  position: "absolute",
                  bottom: 30, left: "50%",
                  width: 80, height: 180,
                  background: `linear-gradient(to top, ${award ? RARITY_GLOW[award] : "rgba(255,255,255,0.5)"}, transparent)`,
                  filter: "blur(8px)",
                  transformOrigin: "bottom center",
                  animation: "mb-beam 1.4s ease-out forwards",
                  pointerEvents: "none",
                }} />
              )}

              {phase === "revealed" && award ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  animation: "mb-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
                }}>
                  {(() => {
                    const tierPlanet = RARITY_TO_PLANET[award];
                    if (tierPlanet) {
                      // Tier planet (BASIC/RARE/EPIC/GOLD) — render the same
                      // PlanetOrb sphere that the rest of the game uses, so
                      // the box reveal matches the on-board planet visual.
                      return (
                        <div style={{ filter: `drop-shadow(0 0 18px ${RARITY_GLOW[award] || "#fff"})` }}>
                          <PlanetOrb
                            planet={planetForOrb(tierPlanet.name, tierPlanet.color)}
                            size={96}
                            animate
                          />
                        </div>
                      );
                    }
                    // SUN keeps its dedicated emoji
                    return (
                      <div style={{ fontSize: 72, filter: `drop-shadow(0 0 22px ${RARITY_GLOW.sun})` }}>
                        ☀️
                      </div>
                    );
                  })()}
                  <div style={{ color: RARITY_COLORS[award] || "#fff", fontWeight: 900, fontSize: 16, letterSpacing: 1, textTransform: "uppercase" }}>
                    {award === "sun" ? t("mystery.gotSun") : t("mystery.gotPlanet", { kind: award })}
                  </div>
                </div>
              ) : (
                <div style={{ animation: phase === "shaking" ? "mb-shake 0.18s linear infinite" : "mb-float 2.4s ease-in-out infinite" }}>
                  <PixelCrate size={120} animate={false} />
                </div>
              )}
            </div>

            {phase !== "revealed" && (
              <div className="font-black text-2xl" style={{ color: "#fff", marginBottom: 8 }}>{PRICE_TON} TON</div>
            )}

            {/* Possible rewards (no probabilities shown) */}
            {phase === "idle" && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6,
                marginBottom: 14, fontSize: 10, color: "rgba(255,255,255,0.7)",
              }}>
                <Reward label="Rare" color={RARITY_COLORS.rare} />
                <Reward label="Epic" color={RARITY_COLORS.epic} />
                <Reward label="Gold" color={RARITY_COLORS.gold} />
                <Reward label="Basic" color={RARITY_COLORS.basic} />
                <div style={{
                  gridColumn: "1 / -1",
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(255,174,0,0.08)",
                  border: "1px solid rgba(255,174,0,0.35)",
                  color: "#ffae00",
                  fontWeight: 700,
                  textAlign: "center",
                }}>
                  {t("mystery.sunUltra")}
                </div>
              </div>
            )}

            {message && (
              <div className="text-xs" style={{ color: "#c060ff", marginBottom: 10 }}>{message}</div>
            )}

            {phase !== "revealed" ? (
              <button
                onClick={handleBuy}
                disabled={phase !== "idle"}
                className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
                style={{
                  background: phase !== "idle" ? "rgba(192,96,255,0.3)" : "linear-gradient(135deg, #c060ff, #6a30c0)",
                  color: "#fff",
                  border: "none",
                  boxShadow: "0 4px 16px rgba(192,96,255,0.4)",
                  marginBottom: 8,
                  opacity: phase !== "idle" ? 0.7 : 1,
                }}
                data-testid="button-buy-mystery-box"
              >
                {phase === "buying" ? t("mystery.sending")
                  : phase === "verifying" ? t("mystery.verifying")
                  : phase === "shaking" ? t("mystery.opening")
                  : t("mystery.openBtn", { n: PRICE_TON })}
              </button>
            ) : (
              <button
                onClick={() => { resetForReopen(); }}
                className="w-full py-3 rounded-xl font-black text-sm tracking-wider active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #c060ff, #6a30c0)",
                  color: "#fff", border: "none",
                  boxShadow: "0 4px 16px rgba(192,96,255,0.4)",
                  marginBottom: 8,
                }}
                data-testid="button-mystery-open-again"
              >
                {t("mystery.openAgain", { n: PRICE_TON })}
              </button>
            )}

            <button
              onClick={handleClose}
              disabled={phase === "buying" || phase === "verifying" || phase === "shaking"}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
                marginBottom: 14,
              }}
            >
              {t("common.close").toUpperCase()}
            </button>

            {/* Live activity feed */}
            <div style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 12,
              textAlign: "left",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
                color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase",
              }}>
                {t("mystery.live")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                {feed.length === 0 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t("mystery.noOpenings")}</div>
                )}
                {feed.slice(0, 12).map((ev) => (
                  <div key={ev.id} style={{
                    fontSize: 11, color: "rgba(255,255,255,0.85)",
                    padding: "3px 6px", borderRadius: 6,
                    background: "rgba(255,255,255,0.03)",
                    borderLeft: `3px solid ${RARITY_COLORS[ev.award] || "#fff"}`,
                  }}>
                    <span style={{ color: RARITY_COLORS[ev.award] || "#fff", fontWeight: 800 }}>{ev.userName}</span>
                    {" · "}
                    <span style={{ color: RARITY_COLORS[ev.award] || "#fff" }}>{ev.awardLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Reward({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "5px 8px", borderRadius: 8,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}33`,
    }}>
      <span style={{ color, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

/**
 * Pixel-art space crate rendered as inline SVG with hard pixels.
 * Each "pixel" is a 1×1 rect on a 16×16 grid scaled to `size`.
 */
function PixelCrate({ size, animate }: { size: number; animate: boolean }) {
  const grid = 16;
  const px = size / grid;
  // Color palette
  const dark = "#1a0f2e";
  const wood = "#4a2c6a";
  const wood2 = "#6b3e93";
  const trim = "#c060ff";
  const glow = "#e8b8ff";
  const lock = "#ffd23f";
  const lockShadow = "#a87a00";

  // 16x16 pixel map. Letters → palette
  const map = [
    "................",
    "................",
    "..ttttttttttt...",
    "..tggggggggggt..",
    "..tgwwwwwwwgt...",
    "..tgwLLLLLwgt...",
    "..tgwLkkkLwgt...",
    "..tgwLkkkLwgt...",
    "..tgwLLLLLwgt...",
    "..tgwwwwwwwgt...",
    "..tgwwwwwwwgt...",
    "..tgwwwwwwwgt...",
    "..tttttttttt....",
    "..ddddddddd.....",
    "................",
    "................",
  ];

  const colorOf: Record<string, string> = {
    t: trim, g: glow, w: wood2, L: wood, k: lock, d: dark,
  };
  void lockShadow;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${grid} ${grid}`} className="mb-pixel-crate" shapeRendering="crispEdges" style={{ filter: animate ? "drop-shadow(0 0 8px rgba(192,96,255,0.55))" : "none" }}>
      {map.map((row, y) =>
        [...row].map((c, x) => {
          if (c === ".") return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colorOf[c] || "#fff"} />;
        })
      )}
    </svg>
  );
}

export const MysteryBoxWidget = memo(MysteryBoxWidgetBase);
