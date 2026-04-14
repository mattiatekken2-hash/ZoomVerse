import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
}

export function PlanetOrb({ planet, size = 60, animate = true }: PlanetOrbProps) {
  const alpha15 = planet.color + "26";
  const alpha08 = planet.color + "14";
  const alpha50 = planet.color + "80";

  return (
    <div
      style={{ width: size, height: size, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <div
        style={{
          position: "absolute",
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha15} 0%, ${alpha08} 50%, transparent 70%)`,
          filter: "blur(12px)",
          animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
        }}
      />
      <div
        className="planet-sphere"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.2) 0%, ${planet.color}cc 25%, ${planet.color}88 55%, ${planet.color}44 80%, ${planet.color}22 100%)`,
          boxShadow: `0 0 ${size * 0.5}px ${alpha50}, inset -${size * 0.12}px -${size * 0.06}px ${size * 0.2}px rgba(0,0,0,0.5)`,
          animationDuration: animate ? "8s" : "0s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "12%", left: "16%",
            width: "32%", height: "32%",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.22)",
            filter: "blur(4px)",
          }}
        />
      </div>
    </div>
  );
}
