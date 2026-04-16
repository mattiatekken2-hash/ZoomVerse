import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
}

export function PlanetOrb({ planet, size = 60, animate = true }: PlanetOrbProps) {
  const c = planet.color;
  const alpha80 = c + "cc";
  const alpha60 = c + "99";
  const alpha40 = c + "66";
  const alpha30 = c + "4d";
  const alpha20 = c + "33";
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
          width: size * 2,
          height: size * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha40} 0%, ${alpha20} 30%, ${alpha10} 55%, transparent 75%)`,
          filter: `blur(${size * 0.22}px)`,
          animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha30} 0%, transparent 60%)`,
          filter: `blur(${size * 0.12}px)`,
          pointerEvents: "none",
          opacity: 0.7,
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
              circle at 35% 30%,
              rgba(255,255,255,0.35) 0%,
              ${c}ee 15%,
              ${c}cc 32%,
              ${c}99 50%,
              ${c}55 70%,
              ${c}22 90%,
              ${c}11 100%
            )
          `,
          boxShadow: `
            0 0 ${size * 0.5}px ${alpha60},
            0 0 ${size * 0.9}px ${alpha40},
            0 0 ${size * 1.4}px ${alpha20},
            inset -${size * 0.12}px -${size * 0.06}px ${size * 0.2}px rgba(0,0,0,0.5),
            inset ${size * 0.05}px ${size * 0.04}px ${size * 0.1}px rgba(255,255,255,0.12)
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
            background: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0) 65%)",
            filter: `blur(${size * 0.05}px)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            opacity: 0.1,
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
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle at 70% 70%, ${alpha20} 0%, transparent 50%)`,
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
            background: "rgba(0,0,0,0.18)",
            filter: `blur(${size * 0.04}px)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
