import { memo } from "react";
import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
}

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
  // COMET — vivid yellow comet body, slightly more saturated than GOLD so it
  // reads as a distinct rarity at a glance. The stardust/24h yield (not ZOOM)
  // is what visually justifies the punchier glow.
  COMET: {
    stops: ["#ffffff", "#fffae8", "#fff176", "#ffd54f", "#bf9000"],
    glowAlpha: 0.9,
  },
  // V1 — bright moon-white. Crater overlay is rendered separately below.
  V1: {
    stops: ["#ffffff", "#fbfdff", "#eef3fa", "#c8d0dc", "#9098a8"],
    glowAlpha: 0.75,
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

function PlanetOrbImpl({ planet, size = 60, animate = true }: PlanetOrbProps) {
  const c = planet.color;
  const grad = PLANET_GRADIENTS[planet.name] || DEFAULT_GRADIENT;
  const [s0, s1, s2, s3, s4] = grad.stops;

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
          width: size * 2.2,
          height: size * 2.2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c}55 0%, ${c}20 40%, transparent 70%)`,
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
          background: `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
          boxShadow: `
            0 0 ${size * 0.4}px ${c}99,
            0 0 ${size * 0.8}px ${c}44,
            0 0 ${size * 1.3}px ${c}18,
            inset -${size * 0.06}px -${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.25)
          `,
          animation: animate ? "planet-rotate 10s linear infinite" : "none",
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
        {/* COMET — energy fissures overlay. Thin jagged paths drawn inside the
            rotating orb so the cracks track the planet surface. The pulse
            animation is purely opacity + drop-shadow so the orb's own rotation
            is unaffected. The cracks read as channels of stardust energy
            "breathing" across the comet body. */}
        {planet.name === "COMET" && (
          <svg
            viewBox="0 0 100 100"
            className="comet-cracks"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <g
              stroke="#ffffff"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <path d="M 28 22 L 38 34 L 32 48 L 44 60 L 38 74" />
              <path d="M 70 24 L 60 38 L 70 52 L 62 66" />
              <path d="M 38 34 L 52 40 L 64 36" />
              <path d="M 44 60 L 58 58 L 70 52" />
              <path d="M 32 48 L 22 54 L 26 68" />
              <path d="M 60 38 L 78 44" />
            </g>
          </svg>
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
  prev.planet.color === next.planet.color
);
