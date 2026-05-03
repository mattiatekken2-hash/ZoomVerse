import { useEffect, useMemo, useRef, useState } from "react";
import { type PlanetType, PLANET_CONFIG } from "../hooks/useGameState";
import type { MerchantOutcome, MerchantFuseResult } from "../utils/api";
import alienMerchantImg from "../assets/alien-merchant.png";
import { useT } from "../i18n/LanguageContext";

interface Props {
  expiresAt: string | null;
  fusionsUsed: number;
  maxFusions: number;
  basicCount: number;
  rareCount: number;
  epicCount: number;
  onFuse: (level: 1 | 2 | 3) => Promise<MerchantFuseResult>;
  burnTwoOfType: (t: PlanetType) => { ok: boolean; reason?: string };
  addCraftedPlanet: (t: PlanetType) => { ok: boolean; reason?: string };
  onClose: () => void;
}

type View = "idle" | "confirm1" | "confirm2" | "confirm3" | "fusing" | "result" | "expired";

const FUSE_ANIMATION_MS = 2000;
// Server already accepts in-flight fusions for 30s past expiry, but we cut UI
// dispatch a hair earlier so a click landing at +29.5s still has headroom.
const FUSE_GRACE_MS = 27_000;

const OUTCOME_KEY: Record<MerchantOutcome, string> = {
  EXPLOSION: "explosion",
  DOWNGRADE: "downgrade",
  BASIC: "basic",
  RARE: "rare",
  EPIC: "epic",
  GOLD: "gold",
  V1: "v1",
};

export function MerchantPopup({
  expiresAt,
  fusionsUsed,
  maxFusions,
  basicCount,
  rareCount,
  epicCount,
  onFuse,
  burnTwoOfType,
  addCraftedPlanet,
  onClose,
}: Props) {
  const { t } = useT();
  const [view, setView] = useState<View>("idle");
  const [result, setResult] = useState<MerchantOutcome | null>(null);
  // Tracks which fusion level produced the current `result`. Needed so the
  // DOWNGRADE result body can describe the correct tier transition (L2: Rare→Basic,
  // L3: Epic→Rare). Cleared together with `result` on dismiss.
  const [resultLevel, setResultLevel] = useState<1 | 2 | 3 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The merchant now behaves like the Earth / White Collection widgets:
  // a small vibrating icon docked under the Earth button. The full panel
  // is hidden by default and only opens when the player taps the icon, so
  // it can never ambush the screen mid-game. When a fusion completes, we
  // force `isOpen` true so the player actually sees the result.
  const [isOpen, setIsOpen] = useState(false);

  const expiresMs = useMemo(() => (expiresAt ? new Date(expiresAt).getTime() : 0), [expiresAt]);
  const remaining = Math.max(0, expiresMs - now);
  const remainingSec = Math.ceil(remaining / 1000);

  const inFlightRef = useRef(false);
  const fusionsRemaining = Math.max(0, maxFusions - fusionsUsed);

  // Local 1Hz tick for the bottom-left countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // When expiry hits and we're not in the middle of a fusion, show the
  // farewell line. Then auto-close after 5s so the player never gets
  // stuck staring at a dead popup.
  useEffect(() => {
    if (view === "fusing" || view === "result") return;
    if (remaining <= 0 && view !== "expired") setView("expired");
  }, [remaining, view]);

  useEffect(() => {
    if (view !== "expired") return;
    const id = setTimeout(onClose, 5000);
    return () => clearTimeout(id);
  }, [view, onClose]);

  // LEAVE button now just collapses the panel — the icon stays vibrating
  // so the player can re-open it later without losing the active merchant
  // window. The merchant only fully goes away when its server expiry hits.
  const tryClose = () => {
    if (inFlightRef.current) return; // protect in-flight fusions
    setIsOpen(false);
  };

  // Force the panel open whenever a fusion finishes (success, downgrade or
  // explosion) — the player must see the outcome even if they had collapsed
  // the icon while it was running.
  useEffect(() => {
    if (view === "result" || view === "fusing") setIsOpen(true);
  }, [view]);

  const startFuse = async (level: 1 | 2 | 3) => {
    if (inFlightRef.current) return;
    if (fusionsRemaining <= 0) { setView("expired"); return; }

    // Sanity: never even consider a fusion if the server has clearly given
    // up (>30s past expiry); the request would be rejected anyway.
    if (expiresMs > 0 && Date.now() - expiresMs > FUSE_GRACE_MS) {
      setView("expired");
      return;
    }

    const need: PlanetType = level === 1 ? "BASIC" : level === 2 ? "RARE" : "EPIC";
    const have = level === 1 ? basicCount : level === 2 ? rareCount : epicCount;
    if (have < 2) {
      setError(t("merchant.needTwo", { kind: PLANET_CONFIG[need].label }));
      setView("idle");
      return;
    }

    inFlightRef.current = true;
    setError(null);
    setView("fusing");

    // Burn locally first so the inventory display reflects the cost
    // immediately and the user can't double-spend the same pair.
    const burnRes = burnTwoOfType(need);
    if (!burnRes.ok) {
      inFlightRef.current = false;
      setError(burnRes.reason ?? t("merchant.burnFailed"));
      setView("idle");
      return;
    }

    // Animation timer runs in parallel with the network call so the result
    // never appears before the dramatic ~2s delay.
    const animation = new Promise<void>((r) => setTimeout(r, FUSE_ANIMATION_MS));
    const fuse = onFuse(level);
    const [, res] = await Promise.all([animation, fuse]);

    if (!res.ok || !res.outcome) {
      // The server refused (race with expiry, etc). Treat as explosion in
      // spirit — the materials are gone client-side and we tell the player.
      setResult("EXPLOSION");
      setResultLevel(level);
      setView("result");
      inFlightRef.current = false;
      return;
    }

    // Apply the outcome to local inventory.
    const out = res.outcome;
    if (out === "BASIC" || out === "RARE" || out === "EPIC" || out === "GOLD" || out === "V1") {
      const add = addCraftedPlanet(out);
      if (!add.ok) {
        // Slots full at the moment the result lands — surface it loudly.
        // The server already counted this fusion against the cap, so we
        // don't refund. The player can free a slot next time.
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: t("common.slotsFullPlanetLost"), ok: false } })); } catch { /**/ }
      }
    } else if (out === "DOWNGRADE") {
      // Downgrade mints a single planet one tier below the materials burned:
      //   L2 (2 Rare)  → 1 Basic
      //   L3 (2 Epic)  → 1 Rare
      // (L1 cannot DOWNGRADE; the server never returns it for level 1.)
      const downgradeTo: PlanetType = level === 3 ? "RARE" : "BASIC";
      const add = addCraftedPlanet(downgradeTo);
      if (!add.ok) {
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: t("common.slotsFullPlanetLost"), ok: false } })); } catch { /**/ }
      }
    }
    // EXPLOSION: nothing to mint, materials already burned.

    setResult(out);
    setResultLevel(level);
    setView("result");
    inFlightRef.current = false;
  };

  const dismissResult = () => {
    setResult(null);
    setResultLevel(null);
    setError(null);
    if (fusionsRemaining <= 0 || remaining <= 0) onClose();
    else setView("idle");
  };

  const lvl1Disabled = view === "fusing" || basicCount < 2 || fusionsRemaining <= 0;
  const lvl2Disabled = view === "fusing" || rareCount < 2 || fusionsRemaining <= 0;
  const lvl3Disabled = view === "fusing" || epicCount < 2 || fusionsRemaining <= 0;

  return (
    <>
      {/* Vibrating alien tile — sits directly under the Earth Collection
          button (left:12, top:200, 60x60). It mirrors the look & feel of
          the collection widgets: a small 60x60 chip you can tap to open
          the panel. The vibration draws attention without ambushing the
          screen. The full merchant panel only renders when `isOpen` is
          true, which only happens on tap (or automatically on a fusion
          result so the outcome is never missed). */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? t("merchant.closeAria") : t("merchant.openAria")}
        style={{
          position: "fixed",
          left: 12,
          top: 270,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(20,8,32,0.82)",
          border: "1.5px solid rgba(180,70,255,0.65)",
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
          boxShadow: "0 0 14px rgba(180,70,255,0.45)",
          // Vibrate while merchant is active. Hold still during the
          // fusion animation (the panel takes over the visual focus).
          animation: view === "fusing" ? "none" : "merchant-vibrate 1.2s ease-in-out infinite",
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
            filter: "drop-shadow(0 0 6px rgba(180,70,255,0.7))",
            pointerEvents: "none",
          }}
        />
      </button>

      {/* Tiny countdown badge — sits to the RIGHT of the alien icon
          (the icon is 60x60 at left:12, top:270 → place this just past it
          at left:78, vertically centered). Kept as a separate fixed element
          so it doesn't move with the icon's vibrate animation. */}
      {remaining > 0 && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: 78,
            top: 290, // (270 + 60/2) - badgeHeight/2 ≈ vertical center
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
          {remainingSec}s
        </div>
      )}

      {/* Docked square panel — only visible when the player taps the icon
          OR a fusion result needs to be shown. NO full-screen overlay,
          because in the Telegram WebApp a fullscreen modal would trigger
          the system "Chiudi" swipe-to-close prompt. */}
      {isOpen && (
      <div
        role="dialog"
        aria-label={t("merchant.title")}
        style={{
          position: "fixed",
          left: 80, // sits to the right of the icon so they don't overlap
          top: 270,
          width: 220,
          zIndex: 60,
          borderRadius: 16,
          background: "linear-gradient(180deg,#0d0a1f 0%,#170a26 100%)",
          border: "1px solid rgba(180, 70, 255, 0.55)",
          boxShadow: "0 0 28px rgba(180,70,255,0.35), inset 0 0 18px rgba(80,0,120,0.4)",
          padding: 12,
          color: "#e9e2ff",
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
              filter: view === "fusing" ? "hue-rotate(120deg) drop-shadow(0 0 10px #b46aff)" : "drop-shadow(0 0 8px rgba(180,70,255,0.6))",
              animation: view === "fusing" ? "merchant-shake 0.18s linear infinite" : "merchant-bob 2.4s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        </div>

        <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: "0.08em", fontSize: 11, color: "#caa6ff" }}>
          {t("merchant.title")}
        </div>

        {/* Counters row */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.7)" }}>
          <span>{t("merchant.fusions", { used: fusionsUsed, max: maxFusions })}</span>
          <span>{remainingSec}s</span>
        </div>

        {/* Body switches by view */}
        {view === "idle" && (
          <div style={{ marginTop: 8 }}>
            {error && (
              <div style={{ marginBottom: 6, fontSize: 9, color: "#ff8080", textAlign: "center" }}>{error}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
              <button
                type="button"
                disabled={lvl1Disabled}
                onClick={() => setView("confirm1")}
                style={fusionBtnStyle(lvl1Disabled, "#8892b0")}
                data-testid="button-merchant-lv1"
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em" }}>{t("merchant.lvl", { n: 1 })}</div>
                <div style={{ fontSize: 8, marginTop: 1 }}>2 Basic</div>
                <div style={{ fontSize: 7, marginTop: 2, opacity: 0.7 }}>{t("merchant.have", { n: basicCount })}</div>
              </button>
              <button
                type="button"
                disabled={lvl2Disabled}
                onClick={() => setView("confirm2")}
                style={fusionBtnStyle(lvl2Disabled, "#4facfe")}
                data-testid="button-merchant-lv2"
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em" }}>{t("merchant.lvl", { n: 2 })}</div>
                <div style={{ fontSize: 8, marginTop: 1 }}>2 Rare</div>
                <div style={{ fontSize: 7, marginTop: 2, opacity: 0.7 }}>{t("merchant.have", { n: rareCount })}</div>
              </button>
              <button
                type="button"
                disabled={lvl3Disabled}
                onClick={() => setView("confirm3")}
                style={fusionBtnStyle(lvl3Disabled, "#c47bff")}
                data-testid="button-merchant-lv3"
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em" }}>{t("merchant.lvl", { n: 3 })}</div>
                <div style={{ fontSize: 8, marginTop: 1 }}>2 Epic</div>
                <div style={{ fontSize: 7, marginTop: 2, opacity: 0.7 }}>{t("merchant.have", { n: epicCount })}</div>
              </button>
            </div>
            <button type="button" onClick={tryClose} style={ghostBtnStyle}>{t("common.leave")}</button>
          </div>
        )}

        {(view === "confirm1" || view === "confirm2" || view === "confirm3") && (
          <ConfirmView
            t={t}
            level={view === "confirm1" ? 1 : view === "confirm2" ? 2 : 3}
            onCancel={() => setView("idle")}
            onConfirm={() => startFuse(view === "confirm1" ? 1 : view === "confirm2" ? 2 : 3)}
          />
        )}

        {view === "fusing" && (
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#caa6ff", letterSpacing: "0.1em", fontWeight: 800 }}>{t("merchant.fusing")}</div>
            <div style={{ fontSize: 9, marginTop: 4, color: "rgba(255,255,255,0.55)" }}>{t("merchant.fusingHint")}</div>
          </div>
        )}

        {view === "result" && result && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.04em",
                color: result === "EXPLOSION" ? "#ff6b6b" : result === "DOWNGRADE" ? "#ffb347" : "#8aff8a",
              }}
            >
              {t(`merchant.label.${OUTCOME_KEY[result]}`)}
            </div>
            <div style={{ fontSize: 9, marginTop: 4, color: "rgba(230,222,255,0.85)", lineHeight: 1.35 }}>
              {result === "DOWNGRADE"
                ? (resultLevel === 3
                    ? t("merchant.body.downgradeL3")
                    : resultLevel === 2
                      ? t("merchant.body.downgradeL2")
                      : t("merchant.body.downgrade"))
                : t(`merchant.body.${OUTCOME_KEY[result]}`)}
            </div>
            <button type="button" onClick={dismissResult} style={primaryBtnStyle}>{t("common.ok")}</button>
          </div>
        )}

        {view === "expired" && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#caa6ff", letterSpacing: "0.04em" }}>
              {t("merchant.tooSlow")}
            </div>
            <div style={{ fontSize: 9, marginTop: 4, color: "rgba(230,222,255,0.8)", lineHeight: 1.35 }}>
              {t("merchant.tooSlowHint")}
            </div>
            <button type="button" onClick={onClose} style={primaryBtnStyle}>{t("common.close").toUpperCase()}</button>
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

function ConfirmView({ t, level, onCancel, onConfirm }: { t: (k: string, p?: Record<string, string | number>) => string; level: 1 | 2 | 3; onCancel: () => void; onConfirm: () => void }) {
  const kind = level === 1 ? "Basic" : level === 2 ? "Rare" : "Epic";
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(230,222,255,0.9)", textAlign: "center", margin: 0 }}>
        {t("merchant.burnConfirm", { kind })}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>{t("common.cancel").toUpperCase()}</button>
        <button type="button" onClick={onConfirm} style={primaryBtnStyle}>{t("common.confirm").toUpperCase()}</button>
      </div>
    </div>
  );
}

function fusionBtnStyle(disabled: boolean, accent: string): React.CSSProperties {
  return {
    padding: "12px 8px",
    borderRadius: 12,
    background: disabled ? "rgba(255,255,255,0.04)" : `linear-gradient(180deg, rgba(180,70,255,0.18), rgba(60,0,90,0.4))`,
    border: `1px solid ${disabled ? "rgba(255,255,255,0.1)" : accent}`,
    color: disabled ? "rgba(255,255,255,0.35)" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "center",
    boxShadow: disabled ? "none" : `0 0 18px ${accent}33`,
  };
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
  background: "linear-gradient(180deg, rgba(180,70,255,0.4), rgba(90,0,140,0.6))",
  border: "1px solid rgba(180,70,255,0.7)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.08em",
  cursor: "pointer",
  boxShadow: "0 0 18px rgba(180,70,255,0.45)",
};
