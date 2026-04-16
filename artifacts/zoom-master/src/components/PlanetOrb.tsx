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
};

const DEFAULT_GRADIENT = PLANET_GRADIENTS.BASIC;

export function PlanetOrb({ planet, size = 60, animate = true }: PlanetOrbProps) {
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
      </div>
    </div>
  );
}
