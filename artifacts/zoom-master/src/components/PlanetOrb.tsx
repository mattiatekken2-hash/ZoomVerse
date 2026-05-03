import { memo } from "react";
import type { Planet } from "../hooks/useGameState";
import { FLOAT_PLANET_TYPES } from "../utils/planetFloat";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
  /**
   * Optional cosmetic Float in [0,1] that drives a continuous visual
   * grading of the orb (CS:GO-style). Only honored for floatable rarities
   * (BASIC/RARE/EPIC/GOLD/V1) — V1_NFT keeps its dedicated chrome look.
   *
   * Stages, but every 0.01 step nudges params continuously:
   *   0.00–0.20  battle-scarred — desaturated, dim, dark crack overlay
   *   0.20–0.50  well-worn      — clean but muted
   *   0.50–0.80  field-tested   — vivid, small glossy reflections appear
   *   0.80–1.00  pristine       — saturated, strong outer glow
   *   ≥0.99      perfect        — adds 2 sparkles + faster rotation
   */
  displayFloat?: number;
}

// Convert a numeric multiplier to a 2-digit hex alpha for "#rrggbbAA"
// shorthand. Used to scale the existing planet colour glows by the float
// without rewriting every gradient stop.
const alphaHex = (mult: number, base: number): string => {
  const v = Math.max(0, Math.min(255, Math.round(base * mult)));
  return v.toString(16).padStart(2, "0");
};

const PLANET_GRADIENTS: Record<string, { stops: string[]; glowAlpha: number }> = {
  BASIC: {
    stops: ["#d0d4e0", "#b0b8cc", "#8892b0", "#6b7394", "#4a5270"],
    glowAlpha: 0.5,
  },
  RARE: {
    stops: ["#e0f0ff", "#a0d4ff", "#4facfe", "#2d8bdb", "#1a5fa0"],
    glowAlpha: 0.6,
  },
  EPIC: {
    stops: ["#f0d4ff", "#d898f0", "#c471ed", "#a050cc", "#7a30a0"],
    glowAlpha: 0.6,
  },
  GOLD: {
    stops: ["#fff8e1", "#ffe082", "#ffd700", "#e6b800", "#b8860b"],
    glowAlpha: 0.7,
  },
  // V1 — bright moon-white. Crater overlay is rendered separately below.
  V1: {
    stops: ["#ffffff", "#fbfdff", "#eef3fa", "#c8d0dc", "#9098a8"],
    glowAlpha: 0.75,
  },
  // V1 NFT Platinum Edition — bluish-platinum gradient, leggermente più
  // saturo del V1 normale per renderlo riconoscibile. Glow extra + badge
  // "NFT" sopra l'orbita (vedi sezione render dedicata).
  V1_NFT: {
    stops: ["#ffffff", "#eaf4ff", "#c5dcff", "#7ea8e0", "#3a5780"],
    glowAlpha: 0.9,
  },
  WHITE1: {
    stops: ["#ffffff", "#fafbff", "#eef0f7", "#cdd2e0", "#9ea3b8"],
    glowAlpha: 0.55,
  },
  WHITE2: {
    stops: ["#ffffff", "#f4f7ff", "#e2e8f5", "#bcc3d9", "#8c93ad"],
    glowAlpha: 0.55,
  },
  WHITE3: {
    stops: ["#ffffff", "#f0f4ff", "#dde3f5", "#b3bcd6", "#7d85a3"],
    glowAlpha: 0.6,
  },
  WHITE4: {
    stops: ["#ffffff", "#eaf0ff", "#d2dbf2", "#a5afcc", "#6c7596"],
    glowAlpha: 0.65,
  },
  // EARTH planets — blue oceans + green continents palette. Continent overlay
  // is rendered separately below (planet.name === "EARTH*") to give them the
  // characteristic earth look without a flat texture.
  EARTH1: {
    stops: ["#bfdbfe", "#60a5fa", "#3b82f6", "#1d4ed8", "#0c2d72"],
    glowAlpha: 0.65,
  },
  EARTH2: {
    stops: ["#bbf7d0", "#4ade80", "#22c55e", "#15803d", "#0a4823"],
    glowAlpha: 0.65,
  },
  EARTH3: {
    stops: ["#bae6fd", "#38bdf8", "#0ea5e9", "#0369a1", "#0a3a66"],
    glowAlpha: 0.65,
  },
  EARTH4: {
    stops: ["#86efac", "#22c55e", "#16a34a", "#166534", "#0a3a1e"],
    glowAlpha: 0.65,
  },
};

const DEFAULT_GRADIENT = PLANET_GRADIENTS.BASIC;

function PlanetOrbImpl({ planet, size = 60, animate = true, displayFloat }: PlanetOrbProps) {
  const c = planet.color;
  const grad = PLANET_GRADIENTS[planet.name] || DEFAULT_GRADIENT;
  const [s0, s1, s2, s3, s4] = grad.stops;

  // ── Float-driven cosmetic grading ────────────────────────────────────
  // Only floatable rarities react to the float; V1_NFT has its own
  // premium look and we don't want to flatten that. Earth/White/SUN are
  // not floatable so they never receive a value.
  const isFloatGraded =
    typeof displayFloat === "number" &&
    Number.isFinite(displayFloat) &&
    planet.name !== "V1_NFT" &&
    FLOAT_PLANET_TYPES.has(planet.name);
  const f = isFloatGraded ? Math.max(0, Math.min(1, displayFloat as number)) : null;

  // Continuous filter (every 0.01 nudges the look slightly):
  //   f=0  → sat 0.55 / br 0.70 / con 0.88 (dim, washed-out veteran)
  //   f=1  → sat 1.20 / br 1.15 / con 1.10 (vivid, lively)
  const bodyFilter = f !== null
    ? `saturate(${(0.55 + 0.65 * f).toFixed(3)}) brightness(${(0.70 + 0.45 * f).toFixed(3)}) contrast(${(0.88 + 0.22 * f).toFixed(3)})`
    : undefined;

  // Outer halo intensity also rides the float — soft at low values,
  // bigger and brighter near 1.0.
  const haloMult = f !== null ? 0.35 + 1.05 * f : 1;
  const haloInnerAlpha = alphaHex(haloMult, 0x55);
  const haloMidAlpha = alphaHex(haloMult, 0x20);
  const haloScale = f !== null ? 1.6 + 0.7 * f : 2.2;

  // Box-shadow glow scaling for the orb body. Same multiplier so the
  // change feels coherent across the breathing halo and the rim glow.
  const shadowMult = haloMult;

  // Stage 1 (cracks/dark spots): only when f < 0.25, fades out to 0 at
  // 0.25. Six dark radial blobs, opacity scaled by stage strength.
  const crackStrength = f !== null && f < 0.25 ? (0.25 - f) / 0.25 : 0;

  // Stage 3 (glossy reflections): two small white highlights that fade
  // in past 0.5, max around 0.9. Skipped for V1 (already has craters)
  // because the highlights would clash with the moon texture.
  const reflectStrength = f !== null && f > 0.5 && planet.name !== "V1"
    ? Math.min(1, (f - 0.5) / 0.4)
    : 0;

  // Stage 4 (perfect): full sparkle + faster spin when essentially 1.000.
  const isPerfect = f !== null && f >= 0.99;
  const rotateDuration = isPerfect ? 7 : 10;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: size * haloScale,
          height: size * haloScale,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c}${haloInnerAlpha} 0%, ${c}${haloMidAlpha} 40%, transparent 70%)`,
          filter: `blur(${size * 0.2}px)`,
          animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          position: "relative",
          overflow: "hidden",
          // V1_NFT uses a richer multi-stop "chrome" radial gradient with
          // a pure-white hot-spot to mimic platinum reflections; the other
          // planets keep their existing 5-stop palette.
          background: planet.name === "V1_NFT"
            ? `
              radial-gradient(circle at 30% 25%, #ffffff 0%, #ffffff 6%, ${s1} 18%, ${s2} 38%, ${s3} 62%, ${s4} 88%, #1f2c46 100%),
              radial-gradient(circle at 70% 75%, rgba(255,255,255,0.55) 0%, transparent 35%)
            `
            : `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
          backgroundBlendMode: planet.name === "V1_NFT" ? "screen, normal" : undefined,
          boxShadow: planet.name === "V1_NFT"
            ? `
              0 0 ${size * 0.5}px rgba(220,232,255,0.85),
              0 0 ${size * 1.0}px rgba(150,190,255,0.45),
              0 0 ${size * 1.6}px rgba(80,140,220,0.20),
              inset -${size * 0.06}px -${size * 0.04}px ${size * 0.14}px rgba(0,0,0,0.30),
              inset ${size * 0.05}px ${size * 0.04}px ${size * 0.10}px rgba(255,255,255,0.55)
            `
            : `
              0 0 ${size * 0.4}px ${c}${alphaHex(shadowMult, 0x99)},
              0 0 ${size * 0.8}px ${c}${alphaHex(shadowMult, 0x44)},
              0 0 ${size * 1.3}px ${c}${alphaHex(shadowMult, 0x18)},
              inset -${size * 0.06}px -${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.25)
            `,
          animation: animate ? `planet-rotate ${rotateDuration}s linear infinite` : "none",
          filter: bodyFilter,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "8%",
            left: "12%",
            width: "38%",
            height: "38%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 50%, transparent 75%)",
            filter: `blur(${size * 0.03}px)`,
            pointerEvents: "none",
          }}
        />
        {/* Stage 1 (low-float "battle-scarred") dark cracks/spots overlay.
            Only rendered for floatable rarities at f < 0.25; opacity is
            modulated continuously by `crackStrength` so a 0.05 vs 0.18
            float feels visibly different. Six fixed positions, scaled by
            orb size so the texture stays consistent across pages. */}
        {crackStrength > 0 && (
          <>
            {[
              { top: "20%", left: "55%", w: "20%", h: "22%" },
              { top: "50%", left: "18%", w: "26%", h: "20%" },
              { top: "65%", left: "60%", w: "16%", h: "18%" },
              { top: "30%", left: "30%", w: "12%", h: "12%" },
              { top: "75%", left: "40%", w: "10%", h: "10%" },
              { top: "15%", left: "75%", w: "9%",  h: "9%"  },
            ].map((cr, i) => (
              <div
                key={`crack-${i}`}
                style={{
                  position: "absolute",
                  top: cr.top,
                  left: cr.left,
                  width: cr.w,
                  height: cr.h,
                  borderRadius: "50%",
                  background: `radial-gradient(circle at 40% 40%, rgba(0,0,0,${(0.55 * crackStrength).toFixed(3)}) 0%, rgba(0,0,0,${(0.30 * crackStrength).toFixed(3)}) 55%, transparent 80%)`,
                  filter: `blur(${size * 0.012}px)`,
                  pointerEvents: "none",
                }}
              />
            ))}
          </>
        )}
        {/* Stage 3 (high-float "field-tested+") glossy reflections. Two
            small bright spots fade in past 0.5; opacity continuous via
            `reflectStrength`. Skipped on V1 (already moon-textured). */}
        {reflectStrength > 0 && (
          <>
            <div
              style={{
                position: "absolute",
                top: "55%",
                left: "60%",
                width: "22%",
                height: "16%",
                borderRadius: "50%",
                background: `radial-gradient(ellipse at 50% 50%, rgba(255,255,255,${(0.55 * reflectStrength).toFixed(3)}) 0%, rgba(255,255,255,${(0.18 * reflectStrength).toFixed(3)}) 50%, transparent 80%)`,
                filter: `blur(${size * 0.02}px)`,
                pointerEvents: "none",
                transform: "rotate(25deg)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "30%",
                left: "62%",
                width: "12%",
                height: "12%",
                borderRadius: "50%",
                background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,${(0.65 * reflectStrength).toFixed(3)}) 0%, transparent 70%)`,
                filter: `blur(${size * 0.015}px)`,
                pointerEvents: "none",
              }}
            />
          </>
        )}
        {/* V1 — moon-like crater spots overlay. Only rendered for V1 so the
            other planets keep their clean orb look. The craters are subtle
            grey radial blobs at fixed positions, scaled with the orb size
            so the texture stays consistent across the lab/farm/market. */}
        {planet.name === "V1" && (
          <>
            {[
              { top: "22%", left: "55%", w: "18%", h: "18%", op: 0.45 },
              { top: "48%", left: "20%", w: "22%", h: "22%", op: 0.40 },
              { top: "62%", left: "60%", w: "14%", h: "14%", op: 0.50 },
              { top: "30%", left: "30%", w: "10%", h: "10%", op: 0.35 },
              { top: "70%", left: "38%", w: "9%",  h: "9%",  op: 0.42 },
              { top: "18%", left: "78%", w: "8%",  h: "8%",  op: 0.32 },
            ].map((c, i) => (
              <div
                key={`v1c-${i}`}
                style={{
                  position: "absolute",
                  top: c.top,
                  left: c.left,
                  width: c.w,
                  height: c.h,
                  borderRadius: "50%",
                  background: `radial-gradient(circle at 40% 40%, rgba(120,128,148,${c.op}) 0%, rgba(150,158,178,${c.op * 0.6}) 55%, transparent 80%)`,
                  filter: `blur(${size * 0.012}px)`,
                  pointerEvents: "none",
                }}
              />
            ))}
          </>
        )}
      </div>
      {/* V1 NFT Platinum — chip "NFT" appoggiato sopra l'orbita per
          marcarlo come oggetto unico anche in lista farm. Posizionato
          assoluto fuori dal cerchio così non viene tagliato dall'overflow
          hidden del corpo del pianeta. */}
      {planet.name === "V1_NFT" && (
        <div
          style={{
            position: "absolute",
            top: -size * 0.18,
            left: "50%",
            transform: "translateX(-50%)",
            padding: `${Math.max(2, size * 0.04)}px ${Math.max(4, size * 0.1)}px`,
            borderRadius: 999,
            background: "linear-gradient(135deg, #cfe4ff, #7ea8e0)",
            color: "#0a1a3d",
            fontWeight: 900,
            fontSize: Math.max(8, size * 0.16),
            letterSpacing: 1,
            boxShadow: "0 2px 8px rgba(126,168,224,0.55)",
            border: "1px solid rgba(255,255,255,0.7)",
            pointerEvents: "none",
            lineHeight: 1,
            zIndex: 3,
          }}
        >
          NFT
        </div>
      )}
      {/* V1 NFT Platinum — sparkle particles. Four ★ glyphs at fixed
          relative positions around the orb fade in/out on staggered
          schedules so the planet always feels alive without ever
          showing more than ~2 sparkles at once. Pure CSS, GPU-friendly,
          pointer-events:none so they don't block the rename tap. */}
      {/* Stage 4 (perfect, f ≥ 0.99) — two small ★ sparkles around the
          orb. Lighter than the V1_NFT four-sparkle treatment so the
          chrome NFT still feels in a class of its own. */}
      {isPerfect && animate && planet.name !== "V1_NFT" && (
        <>
          {[
            { top: "-6%", left: "70%", size: 0.18, anim: "nft-sparkle-1 2.8s ease-in-out infinite", delay: "0s"   },
            { top: "70%", left: "-4%", size: 0.16, anim: "nft-sparkle-3 3.1s ease-in-out infinite", delay: "1.1s" },
          ].map((sp, i) => (
            <div
              key={`perfect-sp-${i}`}
              style={{
                position: "absolute",
                top: sp.top,
                left: sp.left,
                width: size * sp.size,
                height: size * sp.size,
                pointerEvents: "none",
                color: "#ffffff",
                fontSize: size * sp.size,
                lineHeight: 1,
                textShadow: `0 0 6px ${c}cc, 0 0 12px ${c}66`,
                animation: sp.anim,
                animationDelay: sp.delay,
                zIndex: 2,
                fontWeight: 900,
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              ★
            </div>
          ))}
        </>
      )}
      {planet.name === "V1_NFT" && animate && (
        <>
          {[
            { top: "-8%",  left: "12%",  size: 0.22, anim: "nft-sparkle-1 2.8s ease-in-out infinite",          delay: "0s"   },
            { top: "10%",  left: "85%",  size: 0.18, anim: "nft-sparkle-2 3.4s ease-in-out infinite",          delay: "0.7s" },
            { top: "62%",  left: "-6%",  size: 0.16, anim: "nft-sparkle-3 3.1s ease-in-out infinite",          delay: "1.4s" },
            { top: "78%",  left: "70%",  size: 0.20, anim: "nft-sparkle-4 3.6s ease-in-out infinite",          delay: "0.3s" },
          ].map((sp, i) => (
            <div
              key={`nft-sp-${i}`}
              style={{
                position: "absolute",
                top: sp.top,
                left: sp.left,
                width: size * sp.size,
                height: size * sp.size,
                pointerEvents: "none",
                color: "#ffffff",
                fontSize: size * sp.size,
                lineHeight: 1,
                textShadow: "0 0 6px rgba(220,232,255,0.95), 0 0 12px rgba(180,210,255,0.65)",
                animation: sp.anim,
                animationDelay: sp.delay,
                zIndex: 2,
                fontWeight: 900,
                userSelect: "none",
              }}
              aria-hidden="true"
            >
              ★
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Memoized: PlanetOrb is rendered inside PlanetCanvas which re-renders on every
// tap (progress prop changes). Without memo, the heavy radial-gradient + glow
// box-shadow would re-evaluate ~10× per second during fast tapping. We compare
// the visual props that actually affect rendering (planet name/color, size, animate).
export const PlanetOrb = memo(PlanetOrbImpl, (prev, next) =>
  prev.size === next.size &&
  prev.animate === next.animate &&
  prev.planet.name === next.planet.name &&
  prev.planet.color === next.planet.color &&
  prev.displayFloat === next.displayFloat
);
