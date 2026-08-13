import { memo } from "react";
import type { Planet } from "../hooks/useGameState";
import { Mesh3DPreview } from "../spatial3d/components/Mesh3DPreview";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
  displayFloat?: number;
}

/** Pixel-art mushroom for MUSHROOM-rarity planets. */
function MushroomOrb({ size, animate }: { size: number; animate: boolean }) {
  return (
    <div style={{ width: size, height: size, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{
        position: "absolute",
        width: size * 1.8, height: size * 1.8,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(180,180,180,0.35) 0%, rgba(80,80,80,0.15) 45%, transparent 70%)",
        filter: `blur(${size * 0.22}px)`,
        animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
        pointerEvents: "none",
      }} />
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        shapeRendering="crispEdges"
        style={{ filter: "drop-shadow(0 0 5px rgba(200,200,200,0.6))", position: "relative", zIndex: 1 }}
      >
        <rect x="4" y="0" width="4" height="1" fill="#aaaaaa" />
        <rect x="2" y="1" width="8" height="1" fill="#999999" />
        <rect x="1" y="2" width="10" height="1" fill="#bbbbbb" />
        <rect x="0" y="3" width="12" height="2" fill="#999999" />
        <rect x="1" y="5" width="10" height="1" fill="#888888" />
        <rect x="5" y="1" width="2" height="1" fill="#dddddd" />
        <rect x="2" y="2" width="2" height="2" fill="#ffffff" />
        <rect x="8" y="2" width="2" height="2" fill="#ffffff" />
        <rect x="5" y="4" width="2" height="1" fill="#eeeeee" />
        <rect x="1" y="6" width="10" height="1" fill="#666666" />
        <rect x="4" y="7" width="4" height="2" fill="#cccccc" />
        <rect x="5" y="7" width="1" height="2" fill="#eeeeee" />
        <rect x="3" y="9" width="6" height="1" fill="#aaaaaa" />
        <rect x="2" y="10" width="8" height="1" fill="#888888" />
        <rect x="3" y="11" width="6" height="1" fill="#666666" />
      </svg>
    </div>
  );
}

function PlanetOrbImpl({ planet, size = 60, animate = true }: PlanetOrbProps) {
  if (planet.name === "MUSHROOM") return <MushroomOrb size={size} animate={animate} />;
  return (
    <Mesh3DPreview
      kind="planet"
      planetType={planet.name}
      size={size}
      animate={animate}
    />
  );
}

export const PlanetOrb = memo(PlanetOrbImpl, (prev, next) =>
  prev.size === next.size &&
  prev.animate === next.animate &&
  prev.planet.name === next.planet.name &&
  prev.planet.id === next.planet.id
);
