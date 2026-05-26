import { useEffect, useMemo, useRef, useState } from "react";
import { type Planet, type PlanetType, PLANET_CONFIG } from "../hooks/useGameState";
import alienMerchantImg from "../assets/alien-merchant.png";

interface Props {
  expiresAt: string | null;
  planets: Planet[];
  onScrap: (planetId: string, planetType: string) => Promise<{ ok: boolean; reward?: number; reason?: string }>;
  onBurnPlanet: (id: string, stardustReward?: number) => void;
  onClose: () => void;
}

type View = "idle" | "confirm" | "scrapping" | "result" | "expired";

const SCRAP_ANIMATION_MS = 1500;
const SCRAP_GRACE_MS = 25_000;

const REWARD_MAP: Record<string, number> = {
  BASIC: 1,
  RARE: 2,
  EPIC: 5,
  GOLD: 10,
  MYTHIC: 20,
  PLASMA: 35,
  V1: 50,
};

const GOLD_ACCENT = "#ffd700";
const GOLD_ACCENT_RGB = "255,215,0";

export function MerchantPopup({
  expiresAt,
  planets,
  onScrap,
  onBurnPlanet,
  onClose,
}: Props) {
  const [view, setView] = useState<View>("idle");
  const [selected, setSelected] = useState<Planet | null>(null);
  const [resultReward, setResultReward] = useState<number | null>(null);
  const [resultType, setResultType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isOpen, setIsOpen] = useState(false);

  const expiresMs = useMemo(() => (expiresAt ? new Date(expiresAt).getTime() : 0), [expiresAt]);
  const remaining = Math.max(0, expiresMs - now);
  const remainingSec = Math.ceil(remaining / 1000);

  const inFlightRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (view === "scrapping" || view === "result") return;
    if (remaining <= 0 && view !== "expired") setView("expired");
  }, [remaining, view]);

  useEffect(() => {
    if (view !== "expired") return;
    const id = setTimeout(onClose, 5000);
    return () => clearTimeout(id);
  }, [view, onClose]);

  useEffect(() => {
    if (view === "result" || view === "scrapping") setIsOpen(true);
  }, [view]);

  const tryClose = () => {
    if (inFlightRef.current) return;
    setIsOpen(false);
  };

  const eligible = useMemo(() => {
    return planets.filter((p) => !p.isFarmingActive && !p.isListedInMarket);
  }, [planets]);

  const startScrap = async () => {
    if (!selected) return;
    if (inFlightRef.current) return;
    if (expiresMs > 0 && Date.now() - expiresMs > SCRAP_GRACE_MS) {
      setView("expired");
      return;
    }

    inFlightRef.current = true;
    setError(null);
    setView("scrapping");

    const anim = new Promise<void>((r) => setTimeout(r, SCRAP_ANIMATION_MS));
    const scrap = onScrap(selected.id, selected.name);
    const [, res] = await Promise.all([anim, scrap]);

    if (!res.ok) {
      setError(res.reason ?? "Scrap failed");
      setView("idle");
      inFlightRef.current = false;
      return;
    }

    // Burn locally so inventory updates immediately (credit stardust reward)
    onBurnPlanet(selected.id, res.reward ?? 0);

    setResultReward(res.reward ?? null);
    setResultType(selected.name);
    setSelected(null);
    setView("result");
    inFlightRef.current = false;
  };

  const dismissResult = () => {
    setResultReward(null);
    setResultType(null);
    setError(null);
    if (remaining <= 0) onClose();
    else setView("idle");
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <>
      {/* Vibrating alien tile — yellow theme */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close Stardust Scrapper" : "Open Stardust Scrapper"}
        style={{
          position: "fixed",
          left: 12,
          top: 330,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(32,28,4,0.88)",
          border: `1.5px solid rgba(${GOLD_ACCENT_RGB},0.65)`,
          padding: 0,
          cursor: "pointer",
          zIndex: 40,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          boxShadow: `0 0 14px rgba(${GOLD_ACCENT_RGB},0.45)`,
          animation: "merchant-vibrate 1.2s ease-in-out infinite",
        }}
        data-testid="button-space-merchant"
      >
        <img
          src={alienMerchantImg}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            width: 50,
            height: 50,
            objectFit: "contain",
            imageRendering: "pixelated",
            filter: `drop-shadow(0 0 6px rgba(${GOLD_ACCENT_RGB},0.7)) sepia(1) saturate(5) hue-rotate(-20deg) brightness(1.1)`,
            pointerEvents: "none",
          }}
        />
      </button>

      {/* Countdown badge */}
      {remaining > 0 && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: 78,
            top: 350,
            zIndex: 41,
            minWidth: 22,
            padding: "2px 6px",
            borderRadius: 8,
            background: "rgba(140,0,0,0.92)",
            border: "1px solid rgba(255,60,60,0.7)",
            color: "#ffd0d0",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textAlign: "center",
            boxShadow: "0 0 6px rgba(255,80,80,0.5)",
            pointerEvents: "none",
          }}
        >
          {formatTime(remainingSec)}
        </div>
      )}

      {/* Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Stardust Scrapper"
          style={{
            position: "fixed",
            left: 80,
            top: 330,
            width: 240,
            zIndex: 60,
            borderRadius: 16,
            background: "linear-gradient(180deg,#1a1708 0%,#0f0d04 100%)",
            border: `1px solid rgba(${GOLD_ACCENT_RGB},0.55)`,
            boxShadow: `0 0 28px rgba(${GOLD_ACCENT_RGB},0.35), inset 0 0 18px rgba(${GOLD_ACCENT_RGB},0.1)`,
            padding: 12,
            color: "#fff8d6",
          }}
        >
          {/* Alien character */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <img
              src={alienMerchantImg}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                width: 64,
                height: 64,
                objectFit: "contain",
                imageRendering: "pixelated",
                filter: `drop-shadow(0 0 8px rgba(${GOLD_ACCENT_RGB},0.6)) sepia(1) saturate(5) hue-rotate(-20deg) brightness(1.1)`,
                animation: view === "scrapping" ? "merchant-shake 0.18s linear infinite" : "merchant-bob 2.4s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
          </div>

          <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: "0.08em", fontSize: 11, color: GOLD_ACCENT }}>
            STARDUST SCRAPPER
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.7)" }}>
            <span>Scrap your planets for Stardust</span>
            <span>{formatTime(remainingSec)}</span>
          </div>

          {/* Body switches by view */}
          {view === "idle" && (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
              {error && (
                <div style={{ marginBottom: 6, fontSize: 9, color: "#ff8080", textAlign: "center" }}>{error}</div>
              )}
              {eligible.length === 0 ? (
                <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>
                  No planets available to scrap.
                  <br />
                  Unfarm or unlist a planet first.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {eligible.map((p) => {
                    const reward = REWARD_MAP[p.name] ?? 0;
                    const conf = PLANET_CONFIG[p.name];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelected(p); setView("confirm"); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          cursor: "pointer",
                          textAlign: "left",
                          color: "#fff",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: conf?.color ?? "#333",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 800 }}>{conf?.label ?? p.name}</div>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)" }}>
                            +{p.rate.toLocaleString()} $ZOOM/hr
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 900,
                            color: GOLD_ACCENT,
                            whiteSpace: "nowrap",
                          }}
                        >
                          +{reward} ✦
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={tryClose} style={ghostBtnStyle}>LEAVE</button>
            </div>
          )}

          {view === "confirm" && selected && (
            <div style={{ marginTop: 10 }}>
              <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,248,214,0.9)", marginBottom: 8 }}>
                Scrap this {PLANET_CONFIG[selected.name]?.label ?? selected.name} planet?
              </div>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: GOLD_ACCENT, marginBottom: 12 }}>
                +{REWARD_MAP[selected.name] ?? 0} ✦ Stardust
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" onClick={() => { setSelected(null); setView("idle"); }} style={ghostBtnStyle}>CANCEL</button>
                <button type="button" onClick={startScrap} style={primaryBtnStyle}>SCRAP</button>
              </div>
            </div>
          )}

          {view === "scrapping" && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: GOLD_ACCENT, letterSpacing: "0.1em", fontWeight: 800 }}>SCRAPPING...</div>
              <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,255,255,0.55)" }}>The scrapper feeds on planetary matter.</div>
            </div>
          )}

          {view === "result" && resultReward != null && resultType && (
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", color: GOLD_ACCENT }}>
                +{resultReward} ✦ Stardust!
              </div>
              <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,248,214,0.85)", lineHeight: 1.35 }}>
                Your {(PLANET_CONFIG as Record<string, { label?: string }>)[resultType]?.label ?? resultType} planet was recycled into stardust.
              </div>
              <button type="button" onClick={dismissResult} style={primaryBtnStyle}>OK</button>
            </div>
          )}

          {view === "expired" && (
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_ACCENT, letterSpacing: "0.04em" }}>
                The scrapper left.
              </div>
              <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,248,214,0.8)", lineHeight: 1.35 }}>
                It will return in 4–6 hours.
              </div>
              <button type="button" onClick={onClose} style={primaryBtnStyle}>CLOSE</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes merchant-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes merchant-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
        @keyframes merchant-vibrate {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-1.5px, 1px) rotate(-1.5deg); }
          20% { transform: translate(1.5px, -1px) rotate(1.5deg); }
          30% { transform: translate(-1.5px, -1px) rotate(-1deg); }
          40% { transform: translate(1.5px, 1px) rotate(1deg); }
          50% { transform: translate(-1px, 1.5px) rotate(-1.5deg); }
          60% { transform: translate(1px, -1.5px) rotate(1.5deg); }
          70% { transform: translate(0, 0) rotate(0deg); }
        }
      `}</style>
    </>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 10,
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.7)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.1em",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 22px",
  borderRadius: 10,
  background: `linear-gradient(180deg, rgba(${GOLD_ACCENT_RGB},0.4), rgba(120,100,0,0.6))`,
  border: `1px solid rgba(${GOLD_ACCENT_RGB},0.7)`,
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.08em",
  cursor: "pointer",
  boxShadow: `0 0 18px rgba(${GOLD_ACCENT_RGB},0.45)`,
};
