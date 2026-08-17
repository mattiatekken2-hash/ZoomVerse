import { useCallback, useEffect, useRef, useState } from "react";
import type { Planet } from "../hooks/useGameState";
import { getPlanetDisplayColors } from "../hooks/useGameState";
import { FORGE_SPHERE_SHAPE_ID } from "@workspace/game-models";
import { ObjectThumb } from "./MysteryModel3D";

function VoxelPlanetPlaceholder({
  size,
  color,
  accent,
}: {
  size: number;
  color: string;
  accent: string;
}) {
  const cube = size * 0.52;
  return (
    <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: cube * 1.2,
          height: cube * 1.2,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 42%, ${accent}55 0%, ${color}28 45%, transparent 72%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: cube * 0.78,
          height: cube * 0.78,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 1,
          opacity: 0.85,
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            style={{
              background: i % 2 === 0 ? color : accent,
              borderRadius: 1,
              opacity: 0.55 + (i % 3) * 0.12,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const PLANET_THUMB_GL_MAX = 14;
let planetThumbGlActive = 0;
const planetThumbWaiters: Array<() => void> = [];

function acquirePlanetThumbGl(): boolean {
  if (planetThumbGlActive >= PLANET_THUMB_GL_MAX) return false;
  planetThumbGlActive++;
  return true;
}

function releasePlanetThumbGl() {
  planetThumbGlActive = Math.max(0, planetThumbGlActive - 1);
  while (planetThumbGlActive < PLANET_THUMB_GL_MAX && planetThumbWaiters.length > 0) {
    const before = planetThumbGlActive;
    planetThumbWaiters.shift()?.();
    if (planetThumbGlActive > before) break;
  }
}

export interface PlanetVoxelThumbProps {
  planet: Planet;
  size: number;
  animate?: boolean;
  /** Pause WebGL when a modal/detail view owns the GPU budget. */
  suspendGl?: boolean;
  /** Skip viewport throttling — Lab forge canvas uses one active renderer. */
  eager?: boolean;
}

/** Voxel planet preview — same forge-sphere mesh as Lab, for Farm/Market cards. */
export function PlanetVoxelThumb({
  planet,
  size,
  animate = true,
  suspendGl = false,
  eager = false,
}: PlanetVoxelThumbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSlotRef = useRef(false);
  const [inView, setInView] = useState(eager);
  const [hasSlot, setHasSlot] = useState(eager);
  const [glGen, setGlGen] = useState(0);

  const displayColors = getPlanetDisplayColors(planet);

  useEffect(() => {
    if (eager) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { rootMargin: "140px 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  const releaseSlot = useCallback(() => {
    if (!hasSlotRef.current) return;
    hasSlotRef.current = false;
    setHasSlot(false);
    releasePlanetThumbGl();
  }, []);

  useEffect(() => {
    if (eager) {
      hasSlotRef.current = true;
      setHasSlot(true);
      return;
    }
    if (suspendGl || !inView) {
      releaseSlot();
      return;
    }
    if (hasSlotRef.current) return;

    if (acquirePlanetThumbGl()) {
      hasSlotRef.current = true;
      setHasSlot(true);
      return () => releaseSlot();
    }

    let cancelled = false;
    const retry = () => {
      if (cancelled || hasSlotRef.current || suspendGl || !inView) return;
      if (acquirePlanetThumbGl()) {
        hasSlotRef.current = true;
        setHasSlot(true);
      }
    };
    planetThumbWaiters.push(retry);

    return () => {
      cancelled = true;
      const idx = planetThumbWaiters.indexOf(retry);
      if (idx >= 0) planetThumbWaiters.splice(idx, 1);
      releaseSlot();
    };
  }, [eager, suspendGl, inView, releaseSlot]);

  const handleGlError = useCallback(() => {
    releaseSlot();
    setGlGen((g) => g + 1);
  }, [releaseSlot]);

  const showGl = eager || (!suspendGl && inView && hasSlot);

  return (
    <div
      ref={rootRef}
      className="planet-voxel-thumb"
      style={{ width: size, height: size, flexShrink: 0, position: "relative" }}
      data-testid="planet-voxel-thumb"
    >
      {showGl ? (
        <ObjectThumb
          key={`${planet.id}-${glGen}`}
          shapeId={FORGE_SPHERE_SHAPE_ID}
          primaryColor={displayColors.color}
          accentColor={displayColors.glowColor || displayColors.accentHex}
          size={size}
          autoSpin={animate}
          performanceMode
          onGlFailed={handleGlError}
          onGlContextLost={handleGlError}
        />
      ) : (
        <VoxelPlanetPlaceholder
          size={size}
          color={displayColors.color}
          accent={displayColors.glowColor || displayColors.accentHex}
        />
      )}
    </div>
  );
}
