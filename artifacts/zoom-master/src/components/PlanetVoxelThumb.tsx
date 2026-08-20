import { useCallback, useEffect, useRef, useState } from "react";
import type { Planet } from "../hooks/useGameState";
import { getPlanetDisplayColors } from "../hooks/useGameState";
import { FORGE_SPHERE_SHAPE_ID, isLabForgeGeneratorPlanet, labForgeShapeHasGlbReveal } from "@workspace/game-models";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";
import { ObjectThumb } from "./MysteryModel3D";
import { LabGlbViewer } from "./LabGlbViewer";
import { FARM_GLB_SPIN_RATE, LAB_GLB_SPIN_RATE } from "../utils/labGlbScene";

function SunVoxelPlaceholder({ size }: { size: number }) {
  const cube = size * 0.52;
  return (
    <div
      className="sun-voxel-placeholder"
      style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: cube * 1.35,
          height: cube * 1.35,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 42%, #fffef055 0%, #ffee5844 38%, #ef6c0022 62%, transparent 78%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: cube * 0.82,
          height: cube * 0.82,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 1,
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            style={{
              background: i % 2 === 0 ? "#ffee58" : "#ffb300",
              borderRadius: 1,
              opacity: 0.72 + (i % 3) * 0.08,
              boxShadow: i === 4 ? "0 0 8px #fff8c0" : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function VoxelPlanetPlaceholder({
  size,
  color,
  accent,
  isSun = false,
}: {
  size: number;
  color: string;
  accent: string;
  isSun?: boolean;
}) {
  if (isSun) return <SunVoxelPlaceholder size={size} />;
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

import { planetThumbGlBudget } from "../utils/deviceTier";

const PLANET_THUMB_GL_MAX = planetThumbGlBudget();
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
  /** Hi-fi internal supersampling (auto when size ≥ 80 if omitted). */
  hiQuality?: boolean;
  /** Stagger WebGL mount (Farm grid) to avoid GPU spikes. */
  glDelayMs?: number;
  /** Lab forge GLB: show forge space grid (detail modal). Off in farm slot cards. */
  showLabForgeGrid?: boolean;
  /** Lab forge GLB: drag to orbit (detail modal). */
  labGlbInteractive?: boolean;
}

/** Voxel planet preview — same forge-sphere mesh as Lab, for Farm/Market cards. */
export function PlanetVoxelThumb({
  planet,
  size,
  animate = true,
  suspendGl = false,
  eager = false,
  hiQuality,
  glDelayMs = 0,
  showLabForgeGrid = false,
  labGlbInteractive = false,
}: PlanetVoxelThumbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSlotRef = useRef(false);
  const [inView, setInView] = useState(false);
  const [hasSlot, setHasSlot] = useState(false);
  const [delayReady, setDelayReady] = useState(glDelayMs <= 0);

  const [glGen, setGlGen] = useState(0);
  const [glbFailed, setGlbFailed] = useState(false);

  const displayColors = getPlanetDisplayColors(planet);
  const displayFloat = isFloatablePlanet(planet) ? getDisplayFloat(planet) : undefined;

  useEffect(() => {
    setGlbFailed(false);
  }, [planet.id, planet.shapeId]);

  useEffect(() => {
    if (eager) {
      setInView(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { rootMargin: "180px 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  /** Tabs mount on demand — re-check layout when GL resumes after tab switch. */
  useEffect(() => {
    if (suspendGl || eager) return;
    const el = rootRef.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
        setInView(true);
      }
    };
    check();
    const raf = requestAnimationFrame(check);
    const t = window.setTimeout(check, 64);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [suspendGl, eager]);

  useEffect(() => {
    const onTab = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab === "farm") {
        setInView(true);
        setGlGen((g) => g + 1);
      }
    };
    window.addEventListener("zoom-tab-active", onTab);
    return () => window.removeEventListener("zoom-tab-active", onTab);
  }, []);

  useEffect(() => {
    if (!inView || glDelayMs <= 0) {
      setDelayReady(true);
      return;
    }
    setDelayReady(false);
    const t = window.setTimeout(() => setDelayReady(true), glDelayMs);
    return () => window.clearTimeout(t);
  }, [inView, glDelayMs]);

  const releaseSlot = useCallback(() => {
    if (!hasSlotRef.current) return;
    hasSlotRef.current = false;
    setHasSlot(false);
    releasePlanetThumbGl();
  }, []);

  useEffect(() => {
    if (suspendGl || !inView || !delayReady) {
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
      if (cancelled || hasSlotRef.current || suspendGl || !inView || !delayReady) return;
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
  }, [suspendGl, inView, delayReady, releaseSlot]);

  const handleGlError = useCallback(() => {
    if (isLabForgeGeneratorPlanet(planet) && labForgeShapeHasGlbReveal(planet.shapeId)) {
      setGlGen((g) => g + 1);
      return;
    }
    releaseSlot();
    setGlbFailed(true);
    setGlGen((g) => g + 1);
  }, [releaseSlot, planet]);

  const showGl = !suspendGl && inView && delayReady && hasSlot;
  const useHiQuality = hiQuality ?? size >= 80;
  const thumbShapeId = planet.shapeId && planet.shapeId.length > 0
    ? planet.shapeId
    : FORGE_SPHERE_SHAPE_ID;
  const hasLabGlb = labForgeShapeHasGlbReveal(thumbShapeId);
  const labGen = isLabForgeGeneratorPlanet(planet);
  const useLabGlb = hasLabGlb && (labGen || !glbFailed);

  return (
    <div
      ref={rootRef}
      className={`planet-voxel-thumb${useHiQuality && !useLabGlb ? " planet-voxel-thumb--hifi" : ""}`}
      style={{ width: size, height: size, flexShrink: 0, position: "relative" }}
      data-testid="planet-voxel-thumb"
    >
      {showGl ? (
        useLabGlb ? (
          <LabGlbViewer
            key={`${planet.id}-${thumbShapeId}-${glGen}`}
            shapeId={thumbShapeId}
            size={size}
            autoSpin={animate}
            chrome="none"
            showGrid={showLabForgeGrid}
            interactive={labGlbInteractive}
            spinRate={showLabForgeGrid ? LAB_GLB_SPIN_RATE : FARM_GLB_SPIN_RATE}
            onGlFailed={handleGlError}
          />
        ) : (
          <ObjectThumb
            key={`${planet.id}-vox-${glGen}`}
            shapeId={thumbShapeId}
            primaryColor={displayColors.color}
            accentColor={displayColors.accentHex}
            planetRarity={planet.name}
            displayFloat={displayFloat}
            planetId={planet.id}
            size={size}
            autoSpin={animate}
            performanceMode
            hiQuality={useHiQuality && size >= 96}
            onGlFailed={handleGlError}
            onGlContextLost={handleGlError}
          />
        )
      ) : (
        <VoxelPlanetPlaceholder
          size={size}
          color={displayColors.color}
          accent={displayColors.glowColor || displayColors.accentHex}
          isSun={(planet.name as string) === "SUN"}
        />
      )}
    </div>
  );
}
