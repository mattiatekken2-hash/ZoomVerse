import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
}

export function PlanetOrb({ planet, size = 60, animate = true }: PlanetOrbProps) {
  const c = planet.color;

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
          width: size * 2.4,
          height: size * 2.4,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c}55 0%, ${c}22 35%, ${c}08 60%, transparent 78%)`,
          filter: `blur(${size * 0.25}px)`,
          animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: size * 1.7,
          height: size * 1.7,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c}44 0%, ${c}18 40%, transparent 65%)`,
          filter: `blur(${size * 0.1}px)`,
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
              circle at 38% 32%,
              #ffffff88 0%,
              #ffffff44 8%,
              ${c} 22%,
              ${c}dd 40%,
              ${c}88 60%,
              ${c}44 80%,
              ${c}11 100%
            )
          `,
          boxShadow: `
            0 0 ${size * 0.35}px ${c}aa,
            0 0 ${size * 0.7}px ${c}66,
            0 0 ${size * 1.2}px ${c}33,
            0 0 ${size * 1.8}px ${c}18,
            inset -${size * 0.08}px -${size * 0.04}px ${size * 0.15}px ${c}33,
            inset ${size * 0.06}px ${size * 0.05}px ${size * 0.12}px #ffffff22
          `,
          animation: animate ? "planet-rotate 10s linear infinite" : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "6%",
            left: "10%",
            width: "42%",
            height: "42%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 42% 38%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
            filter: `blur(${size * 0.04}px)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle at 65% 65%, ${c}30 0%, transparent 55%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "20%",
            width: "25%",
            height: "12%",
            borderRadius: "50%",
            background: `rgba(255,255,255,0.08)`,
            filter: `blur(${size * 0.03}px)`,
            transform: "rotate(-15deg)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
