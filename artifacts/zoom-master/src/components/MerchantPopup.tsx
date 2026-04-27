import { useEffect, useMemo, useRef, useState } from "react";
import { type PlanetType, PLANET_CONFIG } from "../hooks/useGameState";
import type { MerchantOutcome, MerchantFuseResult } from "../utils/api";

interface Props {
  expiresAt: string | null;
  fusionsUsed: number;
  maxFusions: number;
  basicCount: number;
  rareCount: number;
  onFuse: (level: 1 | 2) => Promise<MerchantFuseResult>;
  burnTwoOfType: (t: PlanetType) => { ok: boolean; reason?: string };
  addCraftedPlanet: (t: PlanetType) => { ok: boolean; reason?: string };
  onClose: () => void;
}

type View = "idle" | "confirm1" | "confirm2" | "fusing" | "result" | "expired";

const FUSE_ANIMATION_MS = 2000;
// Server already accepts in-flight fusions for 30s past expiry, but we cut UI
// dispatch a hair earlier so a click landing at +29.5s still has headroom.
const FUSE_GRACE_MS = 27_000;

const RESULT_LABEL: Record<MerchantOutcome, string> = {
  EXPLOSION: "Core collapsed!",
  DOWNGRADE: "Insufficient energy!",
  BASIC: "Basic planet acquired",
  RARE: "Rare planet acquired",
  EPIC: "Epic planet acquired",
  GOLD: "Gold planet acquired",
  V1: "V1 LEGENDARY acquired",
};

const RESULT_BODY: Record<MerchantOutcome, string> = {
  EXPLOSION: "Fusion failed and your materials were lost in the void.",
  DOWNGRADE: "Your Rare planets merged into a measly Basic planet.",
  BASIC: "Fusion complete! You got a Basic planet.",
  RARE: "Fusion complete! You got a Rare planet.",
  EPIC: "Fusion complete! You got an Epic planet.",
  GOLD: "Fusion complete! You got a Gold planet.",
  V1: "Fusion complete! You got the legendary V1.",
};

export function MerchantPopup({
  expiresAt,
  fusionsUsed,
  maxFusions,
  basicCount,
  rareCount,
  onFuse,
  burnTwoOfType,
  addCraftedPlanet,
  onClose,
}: Props) {
  const [view, setView] = useState<View>("idle");
  const [result, setResult] = useState<MerchantOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  const tryClose = () => {
    if (inFlightRef.current) return; // protect in-flight fusions
    onClose();
  };

  const startFuse = async (level: 1 | 2) => {
    if (inFlightRef.current) return;
    if (fusionsRemaining <= 0) { setView("expired"); return; }

    // Sanity: never even consider a fusion if the server has clearly given
    // up (>30s past expiry); the request would be rejected anyway.
    if (expiresMs > 0 && Date.now() - expiresMs > FUSE_GRACE_MS) {
      setView("expired");
      return;
    }

    const need: PlanetType = level === 1 ? "BASIC" : "RARE";
    const have = level === 1 ? basicCount : rareCount;
    if (have < 2) {
      setError(`You need 2 idle ${PLANET_CONFIG[need].label} planets`);
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
      setError(burnRes.reason ?? "Burn failed");
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
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: "Slots full — planet lost", ok: false } })); } catch { /**/ }
      }
    } else if (out === "DOWNGRADE") {
      // Level-2 specific: two Rares become a single fresh Basic.
      const add = addCraftedPlanet("BASIC");
      if (!add.ok) {
        try { window.dispatchEvent(new CustomEvent("zoom-toast", { detail: { text: "Slots full — planet lost", ok: false } })); } catch { /**/ }
      }
    }
    // EXPLOSION: nothing to mint, materials already burned.

    setResult(out);
    setView("result");
    inFlightRef.current = false;
  };

  const dismissResult = () => {
    setResult(null);
    setError(null);
    if (fusionsRemaining <= 0 || remaining <= 0) onClose();
    else setView("idle");
  };

  const lvl1Disabled = view === "fusing" || basicCount < 2 || fusionsRemaining <= 0;
  const lvl2Disabled = view === "fusing" || rareCount < 2 || fusionsRemaining <= 0;

  return (
    <>
      {/* Bottom-left countdown — sits next to the EarthCollectionWidget. */}
      {remaining > 0 && view !== "result" && view !== "expired" && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            left: 12,
            bottom: 90,
            zIndex: 60,
            padding: "6px 10px",
            borderRadius: 10,
            background: "rgba(140, 0, 0, 0.85)",
            border: "1px solid rgba(255, 60, 60, 0.65)",
            color: "#ffd0d0",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textShadow: "0 0 6px rgba(255,80,80,0.6)",
            pointerEvents: "none",
          }}
        >
          MERCHANT {remainingSec}s
        </div>
      )}

      <div
        role="dialog"
        aria-label="Space Merchant"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(2,4,12,0.78)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          padding: 16,
        }}
        onClick={tryClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(92vw, 380px)",
            borderRadius: 16,
            background: "linear-gradient(180deg,#0d0a1f 0%,#170a26 100%)",
            border: "1px solid rgba(180, 70, 255, 0.45)",
            boxShadow: "0 0 60px rgba(180,70,255,0.35), inset 0 0 30px rgba(80,0,120,0.4)",
            padding: 20,
            color: "#e9e2ff",
            position: "relative",
          }}
        >
          {/* Alien character */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <div
              aria-hidden
              style={{
                fontSize: 64,
                lineHeight: 1,
                filter: view === "fusing" ? "hue-rotate(120deg) drop-shadow(0 0 14px #b46aff)" : "drop-shadow(0 0 10px rgba(180,70,255,0.6))",
                animation: view === "fusing" ? "merchant-shake 0.18s linear infinite" : "merchant-bob 2.4s ease-in-out infinite",
              }}
            >
              👽
            </div>
          </div>

          <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: "0.1em", fontSize: 13, color: "#caa6ff" }}>
            SPACE MERCHANT
          </div>

          {/* Counters row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <span>Fusions: {fusionsUsed}/{maxFusions}</span>
            <span>{remainingSec}s left</span>
          </div>

          {/* Body switches by view */}
          {view === "idle" && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(230,222,255,0.85)", textAlign: "center", margin: 0 }}>
                Burn two planets to attempt void fusion. Outcome is random — and not always kind.
              </p>
              {error && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#ff8080", textAlign: "center" }}>{error}</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  disabled={lvl1Disabled}
                  onClick={() => setView("confirm1")}
                  style={fusionBtnStyle(lvl1Disabled, "#8892b0")}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>LEVEL 1</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>Burn 2 Basic</div>
                  <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>You have: {basicCount}</div>
                </button>
                <button
                  type="button"
                  disabled={lvl2Disabled}
                  onClick={() => setView("confirm2")}
                  style={fusionBtnStyle(lvl2Disabled, "#4facfe")}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>LEVEL 2</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>Burn 2 Rare</div>
                  <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>You have: {rareCount}</div>
                </button>
              </div>
              <button type="button" onClick={tryClose} style={ghostBtnStyle}>LEAVE</button>
            </div>
          )}

          {(view === "confirm1" || view === "confirm2") && (
            <ConfirmView
              level={view === "confirm1" ? 1 : 2}
              onCancel={() => setView("idle")}
              onConfirm={() => startFuse(view === "confirm1" ? 1 : 2)}
            />
          )}

          {view === "fusing" && (
            <div style={{ marginTop: 18, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#caa6ff", letterSpacing: "0.1em", fontWeight: 800 }}>FUSING…</div>
              <div style={{ fontSize: 10, marginTop: 6, color: "rgba(255,255,255,0.55)" }}>The void hums.</div>
            </div>
          )}

          {view === "result" && result && (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  color: result === "EXPLOSION" ? "#ff6b6b" : result === "DOWNGRADE" ? "#ffb347" : "#8aff8a",
                }}
              >
                {RESULT_LABEL[result]}
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: "rgba(230,222,255,0.85)", lineHeight: 1.4 }}>
                {RESULT_BODY[result]}
              </div>
              <button type="button" onClick={dismissResult} style={primaryBtnStyle}>OK</button>
            </div>
          )}

          {view === "expired" && (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#caa6ff", letterSpacing: "0.06em" }}>
                Too slow, earthling.
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: "rgba(230,222,255,0.8)", lineHeight: 1.4 }}>
                I'll return when you have more courage.
              </div>
              <button type="button" onClick={onClose} style={primaryBtnStyle}>CLOSE</button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes merchant-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes merchant-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
      `}</style>
    </>
  );
}

function ConfirmView({ level, onCancel, onConfirm }: { level: 1 | 2; onCancel: () => void; onConfirm: () => void }) {
  const text = level === 1
    ? "Burn 2 Basic planets. 30% chance the core explodes; 60% Rare; 9% Epic; 1% V1."
    : "Burn 2 Rare planets. 15% explosion; 35% downgrade to Basic; 40% Epic; 9% Gold; 1% V1.";
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(230,222,255,0.9)", textAlign: "center", margin: 0 }}>
        {text}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>CANCEL</button>
        <button type="button" onClick={onConfirm} style={primaryBtnStyle}>CONFIRM</button>
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
