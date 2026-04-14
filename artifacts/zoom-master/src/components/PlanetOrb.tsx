import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
}

export function PlanetOrb({ planet, size = 60, animate = true }: PlanetOrbProps) {
  const c = planet.color;
  const alpha60 = c + "99";
  const alpha30 = c + "4d";
  const alpha10 = c + "1a";

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
          width: size * 1.5,
          height: size * 1.5,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha30} 0%, ${alpha10} 45%, transparent 70%)`,
          filter: `blur(${size * 0.18}px)`,
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
          background: `
            radial-gradient(
              circle at 32% 28%,
              rgba(255,255,255,0.28) 0%,
              ${c}ee 18%,
              ${c}cc 38%,
              ${c}88 58%,
              ${c}44 78%,
              ${c}11 100%
            )
          `,
          boxShadow: `
            0 0 ${size * 0.55}px ${alpha60},
            0 0 ${size * 1.1}px ${alpha30},
            inset -${size * 0.14}px -${size * 0.07}px ${size * 0.22}px rgba(0,0,0,0.6),
            inset ${size * 0.06}px ${size * 0.04}px ${size * 0.12}px rgba(255,255,255,0.08)
          `,
          animation: animate ? "planet-rotate 10s linear infinite" : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: "14%",
            width: "36%",
            height: "36%",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.26)",
            filter: `blur(${size * 0.06}px)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            opacity: 0.12,
            background: `repeating-linear-gradient(
              -28deg,
              transparent,
              transparent 6px,
              ${alpha10} 6px,
              ${alpha10} 7px
            )`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "14%",
            right: "16%",
            width: "18%",
            height: "10%",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.22)",
            filter: `blur(${size * 0.04}px)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
