import { useMemo, useRef, useState } from "react";
import { type Planet, type PlanetType, PLANET_CONFIG } from "../hooks/useGameState";
import { AlienScrapper3D } from "./AlienScrapper3D";
import { useT } from "../i18n/LanguageContext";

interface Props {
  planets: Planet[];
  onScrap: (planetId: string, planetType: string) => Promise<{ ok: boolean; reward?: number; reason?: string }>;
  onBurnPlanet: (id: string, stardustReward?: number) => void;
}

type View = "idle" | "confirm" | "scrapping" | "result";

const SCRAP_ANIMATION_MS = 1500;

const REWARD_MAP: Record<string, number> = {
  BASIC: 1,
  RARE: 2,
  EPIC: 5,
  GOLD: 10,
  MYTHIC: 20,
  PLASMA: 35,
  V1: 50,
};

const GREEN_ACCENT = "#00ff88";
const GREEN_ACCENT_RGB = "0,255,136";

/** Permanent Lab scrapper — left dock, always available. */
export function MerchantPopup({ planets, onScrap, onBurnPlanet }: Props) {
  const { t } = useT();
  const [view, setView] = useState<View>("idle");
  const [selected, setSelected] = useState<Planet | null>(null);
  const [resultReward, setResultReward] = useState<number | null>(null);
  const [resultType, setResultType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const inFlightRef = useRef(false);

  const eligible = useMemo(
    () => planets.filter((p) => !p.isFarmingActive && !p.isListedInMarket),
    [planets],
  );

  const startScrap = async () => {
    if (!selected || inFlightRef.current) return;

    inFlightRef.current = true;
    setError(null);
    setView("scrapping");

    const anim = new Promise<void>((r) => setTimeout(r, SCRAP_ANIMATION_MS));
    const scrap = onScrap(selected.id, selected.name);
    const [, res] = await Promise.all([anim, scrap]);

    if (!res.ok) {
      setError(res.reason ?? t("merchant.scrapFailed"));
      setView("idle");
      inFlightRef.current = false;
      return;
    }

    onBurnPlanet(selected.id);
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
    setView("idle");
  };

  const shaking = view === "scrapping";

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: "absolute",
        left: 8,
        bottom: 88,
        zIndex: 35,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? t("merchant.closeAria") : t("merchant.openAria")}
        style={{
          width: 76,
          height: 76,
          borderRadius: 18,
          background: "linear-gradient(145deg, rgba(8,32,20,0.92) 0%, rgba(4,18,12,0.96) 100%)",
          border: `1.5px solid rgba(${GREEN_ACCENT_RGB},0.55)`,
          padding: 0,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 18px rgba(${GREEN_ACCENT_RGB},0.35), inset 0 0 12px rgba(${GREEN_ACCENT_RGB},0.08)`,
        }}
        data-testid="button-space-merchant"
      >
        <AlienScrapper3D size={68} shaking={shaking} />
      </button>

      <div
        style={{
          fontSize: 8,
          fontWeight: 800,
          letterSpacing: "0.12em",
          color: GREEN_ACCENT,
          textShadow: `0 0 8px rgba(${GREEN_ACCENT_RGB},0.5)`,
          paddingLeft: 4,
        }}
      >
        {t("merchant.title")}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label={t("merchant.title")}
          style={{
            width: 248,
            borderRadius: 16,
            background: "linear-gradient(180deg,#1a1708 0%,#0f0d04 100%)",
            border: `1px solid rgba(${GREEN_ACCENT_RGB},0.55)`,
            boxShadow: `0 0 28px rgba(${GREEN_ACCENT_RGB},0.35), inset 0 0 18px rgba(${GREEN_ACCENT_RGB},0.1)`,
            padding: 12,
            color: "#fff8d6",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <AlienScrapper3D size={80} shaking={shaking} />
          </div>

          <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: "0.08em", fontSize: 11, color: GREEN_ACCENT }}>
            {t("merchant.title")}
          </div>

          <div style={{ marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.65)", textAlign: "center" }}>
            Scrap planets → Stardust ★
          </div>

          {view === "idle" && (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
              {error && (
                <div style={{ marginBottom: 6, fontSize: 9, color: "#ff8080", textAlign: "center" }}>{error}</div>
              )}
              {eligible.length === 0 ? (
                <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>
                  {t("merchant.noPlanets")}
                  <br />
                  {t("merchant.unfarmFirst")}
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
                        <div style={{ fontSize: 10, fontWeight: 900, color: GREEN_ACCENT, whiteSpace: "nowrap" }}>
                          +{reward} ★
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={() => setIsOpen(false)} style={ghostBtnStyle}>
                {t("common.close")}
              </button>
            </div>
          )}

          {view === "confirm" && selected && (
            <div style={{ marginTop: 10 }}>
              <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,248,214,0.9)", marginBottom: 8 }}>
                {t("merchant.scrapConfirm", { kind: PLANET_CONFIG[selected.name]?.label ?? selected.name })}
              </div>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: GREEN_ACCENT, marginBottom: 12 }}>
                {t("merchant.scrapReward", { n: REWARD_MAP[selected.name] ?? 0 })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" onClick={() => { setSelected(null); setView("idle"); }} style={ghostBtnStyle}>
                  {t("common.cancel")}
                </button>
                <button type="button" onClick={() => { void startScrap(); }} style={primaryBtnStyle}>
                  SCRAP
                </button>
              </div>
            </div>
          )}

          {view === "scrapping" && (
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: GREEN_ACCENT, letterSpacing: "0.1em", fontWeight: 800 }}>
                {t("merchant.scrapping")}
              </div>
              <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,255,255,0.55)" }}>
                {t("merchant.scrappingHint")}
              </div>
            </div>
          )}

          {view === "result" && resultReward != null && resultType && (
            <div style={{ marginTop: 8, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", color: GREEN_ACCENT }}>
                {t("merchant.result.title", { n: resultReward })}
              </div>
              <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,248,214,0.85)", lineHeight: 1.35 }}>
                {t("merchant.result.body", {
                  kind: (PLANET_CONFIG as Record<string, { label?: string }>)[resultType]?.label ?? resultType,
                })}
              </div>
              <button type="button" onClick={dismissResult} style={primaryBtnStyle}>
                OK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
  background: `linear-gradient(180deg, rgba(${GREEN_ACCENT_RGB},0.4), rgba(0,60,30,0.6))`,
  border: `1px solid rgba(${GREEN_ACCENT_RGB},0.7)`,
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.08em",
  cursor: "pointer",
  boxShadow: `0 0 18px rgba(${GREEN_ACCENT_RGB},0.45)`,
};
