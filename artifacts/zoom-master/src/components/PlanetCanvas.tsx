import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { MysteryModel3D, type ForgeMeshHandle } from "./MysteryModel3D";
import { FORGE_CLAY_HEX, FORGE_SPHERE_SHAPE_ID, getMeshParts, resolveLabForgeShapeId, LAB_ZOOM_COLORS, LAB_STARDUST_COLORS, isLabZoomShapeId, resolveLabStardustShapeId } from "@workspace/game-models";
import type { Planet } from "../hooks/useGameState";
import { PLANET_CONFIG } from "../hooks/useGameState";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";
import { useT } from "../i18n/LanguageContext";

export type ForgePhase = "idle" | "wheel" | "flash" | "waiting" | "revealed";

interface PlanetCanvasProps {
  onPunch?: () => void;
  /** Bumped on each craft tap to fire particles. */
  tapSignal?: number;
  /** Softer, slower particles (auto-tap and calm manual craft). */
  tapRelaxed?: boolean;
  progress: number;
  goal: number;
  accentColor?: string;
  pendingPlanet?: Planet | null;
  forgePlanetBuild?: boolean;
  craftRarity?: Planet["name"] | null;
  forgePhase: ForgePhase;
  forgeRolling?: boolean;
  /** Full-bleed backdrop layer (Lab forge behind UI). */
  backdrop?: boolean;
  /** Bottom inset for progress bar when backdrop overlays nav chrome. */
  chromeBottomOffset?: string;
  /** Hide built-in progress bar (e.g. Lab renders it in the bottom chrome stack). */
  suppressProgressBar?: boolean;
  /** Pause forge WebGL when Lab tab is hidden. */
  visible?: boolean;
  /** Lab shape override — null = default grey sphere (e.g. "pizza" for GLB test). */
  labForgeShapeId?: string | null;
  /** Active lab dual-forge path (zoom / stardust). */
  labForgePath?: import("@workspace/game-models").LabForgePath | null;
}

function labForgePaint(shapeId: string): { color: string; glowColor: string } {
  if (isLabZoomShapeId(shapeId)) return LAB_ZOOM_COLORS[shapeId];
  const sd = resolveLabStardustShapeId(shapeId);
  if (sd) return LAB_STARDUST_COLORS[sd];
  return { color: "#e8e4dc", glowColor: "#c8c4bc" };
}

const DEFAULT_ACCENT = "#8892b0";
const CLAY_COLORS = ["#b8b8b8", "#d0d0d0", "#a0a0a0", "#c8c8c8", "#909090"];
const SPARK_COLORS = ["#ffffff", "#e8f4ff", "#fff8e0", "#d4e8ff"];
const CALM_COLORS = ["#9ec5e8", "#b8d4f0", "#c4b8e8", "#d0e8f8", "#e4eef8", "#b0c8e0"];
const MAX_FRAGMENTS = 36;
const CENTER_DEAD_RATIO = 0.32;

interface ParticleTarget {
  x: number;
  y: number;
}

function ringTargets(half: number, count: number): ParticleTarget[] {
  const out: ParticleTarget[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = half * (0.38 + Math.random() * 0.24);
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

function awayFromCenter(x: number, y: number, half: number): { x: number; y: number } | null {
  const dead = half * CENTER_DEAD_RATIO;
  const d = Math.hypot(x, y);
  if (d >= dead) return { x, y };
  const a = Math.random() * Math.PI * 2;
  const r = dead + Math.random() * half * 0.18;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export const ForgeProgressBar = memo(function ForgeProgressBar({
  progress,
  goal,
  pct,
  displayAccent,
  label,
  bottomOffset,
  inline = false,
}: {
  progress: number;
  goal: number;
  pct: number;
  displayAccent: string;
  label: string;
  bottomOffset?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={inline ? "relative w-full px-1 pt-1 z-10" : "absolute left-0 right-0 px-6 pb-2 pt-4 z-10"}
      style={inline ? undefined : (bottomOffset ? { bottom: bottomOffset } : { bottom: 0 })}
    >
      <div className="flex justify-between text-xs mb-1.5">
        <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </span>
        <span className="font-bold" style={{ color: displayAccent }}>
          {progress}/{goal}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${pct * 100}%`,
            background: displayAccent,
            transform: "translateZ(0)",
          }}
        />
      </div>
    </div>
  );
});

const VOXEL_PIXEL_MS = 520;

interface VoxelPixelTarget {
  x: number;
  y: number;
  color: string;
  sizePx: number;
}

function spawnVoxelPixelParticle(
  layer: HTMLDivElement,
  half: number,
  target: VoxelPixelTarget,
  fragIdRef: { current: number },
  relaxed = false,
) {
  while (layer.childElementCount >= MAX_FRAGMENTS) {
    layer.firstElementChild?.remove();
  }

  const { x: tx, y: ty } = target;
  const spawnAngle = Math.atan2(ty, tx) + Math.PI + (Math.random() - 0.5) * 0.45;
  const spawnDist = half * (relaxed ? 0.92 : 1.02);
  const fx = Math.cos(spawnAngle) * spawnDist;
  const fy = Math.sin(spawnAngle) * spawnDist;
  const ball = Math.max(4, Math.min(8, target.sizePx * 0.38 + (Math.random() * 1.5)));

  const dot = document.createElement("div");
  dot.className = relaxed ? "lab-fragment--pixel lab-fragment--pixel-calm" : "lab-fragment--pixel";
  dot.dataset["fid"] = `p-${fragIdRef.current++}`;

  const s = dot.style;
  s.position = "absolute";
  s.left = "50%";
  s.top = "50%";
  s.width = `${ball}px`;
  s.height = `${ball}px`;
  s.borderRadius = "50%";
  s.background = FORGE_CLAY_HEX;
  s.boxShadow = "0 0 5px rgba(200,200,200,0.65), 0 0 1px rgba(220,220,220,0.8)";
  s.pointerEvents = "none";
  s.contain = "strict";
  s.setProperty("--fx", `${fx}px`);
  s.setProperty("--fy", `${fy}px`);
  s.setProperty("--tx", `${tx}px`);
  s.setProperty("--ty", `${ty}px`);
  s.setProperty("--dur", relaxed ? "900ms" : `${VOXEL_PIXEL_MS}ms`);
  s.transform = `translate(calc(-50% + ${fx}px), calc(-50% + ${fy}px)) scale(0.4)`;
  s.opacity = "0";

  layer.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove(), { once: true });

  if (!relaxed && Math.random() > 0.5) {
    const trail = document.createElement("div");
    trail.className = "lab-fragment--pixel-trail";
    trail.dataset["fid"] = `p-${fragIdRef.current++}`;
    const trailBall = Math.max(3, ball * 0.65);
    const ts = trail.style;
    ts.position = "absolute";
    ts.left = "50%";
    ts.top = "50%";
    ts.width = `${trailBall}px`;
    ts.height = `${trailBall}px`;
    ts.borderRadius = "50%";
    ts.background = FORGE_CLAY_HEX;
    ts.opacity = "0";
    ts.pointerEvents = "none";
    ts.setProperty("--fx", `${fx * 0.9}px`);
    ts.setProperty("--fy", `${fy * 0.9}px`);
    ts.setProperty("--tx", `${tx}px`);
    ts.setProperty("--ty", `${ty}px`);
    ts.setProperty("--dur", `${VOXEL_PIXEL_MS + 80}ms`);
    ts.setProperty("--delay", "35ms");
    ts.transform = `translate(calc(-50% + ${fx * 0.9}px), calc(-50% + ${fy * 0.9}px)) scale(0.35)`;
    layer.appendChild(trail);
    trail.addEventListener("animationend", () => trail.remove(), { once: true });
  }
}

function spawnForgeParticles(
  layer: HTMLDivElement,
  half: number,
  targets: ParticleTarget[],
  fragIdRef: { current: number },
  relaxed = false,
) {
  if (targets.length === 0) return;

  while (layer.childElementCount >= MAX_FRAGMENTS) {
    layer.firstElementChild?.remove();
  }

  const count = relaxed ? 4 : 10;
  let spawned = 0;

  for (let i = 0; spawned < count && i < count * 3; i++) {
    const raw = targets[i % targets.length]!;
    const jittered = awayFromCenter(
      raw.x + (Math.random() - 0.5) * (relaxed ? 5 : 8),
      raw.y + (Math.random() - 0.5) * (relaxed ? 5 : 8),
      half,
    );
    if (!jittered) continue;
    const tx = jittered.x;
    const ty = jittered.y;

    const baseAngle = Math.atan2(ty, tx) + Math.PI;
    const angle = baseAngle + (spawned - count / 2) * (relaxed ? 0.28 : 0.45) + (Math.random() - 0.5) * 0.2;
    const dist = relaxed ? 0.72 + Math.random() * 0.18 : 0.6 + Math.random() * 0.3;
    const fx = Math.cos(angle) * dist * half;
    const fy = Math.sin(angle) * dist * half;
    const mx = fx * (relaxed ? 0.5 : 0.35) + tx * (relaxed ? 0.5 : 0.65);
    const my = fy * (relaxed ? 0.5 : 0.35) + ty * (relaxed ? 0.5 : 0.65);

    const isSpark = !relaxed && Math.random() > 0.92;
    const isChip = !relaxed && !isSpark && (Math.random() > 0.35);
    const clay = relaxed
      ? (CALM_COLORS[spawned % CALM_COLORS.length] ?? "#b0c8e0")
      : (CLAY_COLORS[spawned % CLAY_COLORS.length] ?? "#b0b0b0");

    const dot = document.createElement("div");
    dot.className = relaxed
      ? "lab-fragment lab-fragment--calm"
      : isSpark
        ? "lab-fragment lab-fragment--spark"
        : isChip
          ? "lab-fragment lab-fragment--chip"
          : "lab-fragment";
    dot.dataset["fid"] = `f-${fragIdRef.current++}`;

    const dotSize = relaxed
      ? Math.max(3, half * 0.016 + Math.random() * 2.5)
      : Math.max(4, half * 0.022 + Math.random() * 3);
    const s = dot.style;
    s.position = "absolute";
    s.left = "50%";
    s.top = "50%";
    s.width = isChip ? `${dotSize * 1.25}px` : `${dotSize}px`;
    s.height = isChip ? `${dotSize * 0.65}px` : `${dotSize}px`;
    s.borderRadius = isChip ? "1px" : "50%";
    s.background = isSpark ? (SPARK_COLORS[spawned % SPARK_COLORS.length] ?? "#fff") : clay;
    s.pointerEvents = "none";
    s.contain = "strict";
    s.setProperty("--fx", `${fx}px`);
    s.setProperty("--fy", `${fy}px`);
    s.setProperty("--mx", `${mx}px`);
    s.setProperty("--my", `${my}px`);
    s.setProperty("--tx", `${tx}px`);
    s.setProperty("--ty", `${ty}px`);
    s.setProperty("--rot", `${Math.floor(Math.random() * 360)}deg`);
    s.setProperty("--fs", relaxed ? `${0.55 + Math.random() * 0.25}` : `${0.85 + Math.random() * 0.25}`);
    s.setProperty("--peak", relaxed ? "0.42" : "0.9");
    s.setProperty("--delay", `${spawned * (relaxed ? 40 : 22)}ms`);
    s.setProperty("--dur", relaxed ? "1500ms" : "580ms");
    if (relaxed) {
      s.setProperty("--spark", "rgba(160,200,255,0.35)");
    }
    // Start at outer spawn — left/top 50% alone would flash a center dot before animation runs.
    s.transform = `translate(calc(-50% + ${fx}px), calc(-50% + ${fy}px)) rotate(var(--rot)) scale(var(--fs))`;
    s.opacity = "0";

    layer.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
    spawned++;
  }
}

function spawnForgeBurst(
  layer: HTMLDivElement,
  half: number,
  accentColor: string,
  primaryColor: string,
  fragIdRef: { current: number },
) {
  while (layer.childElementCount >= MAX_FRAGMENTS) {
    layer.firstElementChild?.remove();
  }

  const burstColors = [accentColor, primaryColor, "#ffffff", "#e8f4ff", "#fff8e0"];
  const count = 28;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = half * (0.55 + Math.random() * 0.42);
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const isSpark = i % 5 === 0;
    const dotSize = isSpark
      ? Math.max(5, half * 0.028 + Math.random() * 4)
      : Math.max(4, half * 0.02 + Math.random() * 3);

    const dot = document.createElement("div");
    dot.className = isSpark ? "lab-fragment lab-fragment--burst lab-fragment--spark" : "lab-fragment lab-fragment--burst";
    dot.dataset["fid"] = `b-${fragIdRef.current++}`;

    const s = dot.style;
    s.position = "absolute";
    s.left = "50%";
    s.top = "50%";
    s.width = `${dotSize}px`;
    s.height = `${dotSize}px`;
    s.borderRadius = isSpark ? "50%" : "1px";
    s.background = isSpark ? "#ffffff" : (burstColors[i % burstColors.length] ?? accentColor);
    s.pointerEvents = "none";
    s.contain = "strict";
    s.setProperty("--tx", `${tx}px`);
    s.setProperty("--ty", `${ty}px`);
    s.setProperty("--delay", `${i * 8}ms`);
    s.setProperty("--dur", `${420 + Math.random() * 180}ms`);
    if (isSpark) s.setProperty("--spark", `${accentColor}cc`);
    s.transform = "translate(-50%, -50%) scale(0.15)";
    s.opacity = "0";

    layer.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
  }
}

export function PlanetCanvas({
  onPunch,
  tapSignal = 0,
  tapRelaxed = false,
  progress,
  goal,
  accentColor,
  pendingPlanet = null,
  forgePlanetBuild = false,
  craftRarity = null,
  forgePhase,
  forgeRolling = false,
  backdrop = false,
  chromeBottomOffset,
  suppressProgressBar = false,
  visible = true,
  labForgeShapeId = null,
  labForgePath = null,
}: PlanetCanvasProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<ForgeMeshHandle>(null);
  const fragIdRef = useRef(0);
  const tapPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapSignalRef = useRef(tapSignal);
  const burstSpawnedRef = useRef<string | null>(null);
  const [size, setSize] = useState(280);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [forgeGlSession, setForgeGlSession] = useState<string | null>(null);
  const sizeRef = useRef(280);
  const viewportRef = useRef({ w: 0, h: 0 });
  const craftSizeLockRef = useRef<number | null>(null);

  const livePlanet = pendingPlanet || (craftRarity ? {
    id: "forge-preview",
    name: craftRarity,
    rate: PLANET_CONFIG[craftRarity].rate,
    color: PLANET_CONFIG[craftRarity].color,
    glowColor: PLANET_CONFIG[craftRarity].glowColor,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
    craftCost: PLANET_CONFIG[craftRarity].craftCost,
    float: 0.5,
    shapeId: forgePlanetBuild ? FORGE_SPHERE_SHAPE_ID : undefined,
  } as Planet : null);
  const isActiveCraft = forgePhase === "idle" && !forgeRolling && !!forgePlanetBuild
    && (!!labForgePath || !!craftRarity) && !pendingPlanet;
  const isCrafting = isActiveCraft;
  /** Keep lab GLB shape for the whole pending-claim sequence (waiting → wheel → flash). */
  const labForgeRevealActive = !!pendingPlanet && !!labForgeShapeId;
  /** Grey voxels while tapping; stay visible through reveal except during wheel. */
  const showForgeBuildMesh = (isCrafting && forgePlanetBuild)
    || (labForgeRevealActive && forgePhase !== "wheel" && forgePhase !== "flash" && forgePhase !== "revealed");
  const showCompletedForgeMesh = showForgeBuildMesh;
  const hideForgeCanvasDuringWheel = labForgeRevealActive;
  const forgeRarity = pendingPlanet?.name ?? craftRarity;
  const showVoxelLayer = showForgeBuildMesh;
  /** Lab backdrop — keep WebGL alive for the full Lab session (idle, forge, reveal, claim). */
  const keepForgeGl = backdrop;
  const labViewportReady = !backdrop || (viewport.w > 1 && viewport.h > 1);
  const showLabBackdrop = keepForgeGl && visible;
  const showPlanetOrb = false;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const buildProgress = isCrafting ? pct : 1;
  const isForging = isCrafting;
  /** Never drop to 0 after forge complete — progress=0 wipes placed voxels in WebGL. */
  const forgeDisplayProgress = isCrafting ? buildProgress : (!!pendingPlanet || showVoxelLayer ? 1 : 0);
  const labIdleAmbient = !!(backdrop && visible && forgePhase === "idle" && !pendingPlanet && !labForgePath && !isActiveCraft && !forgeRolling);
  const forgeRevealPhase: ForgePhase = pendingPlanet
    ? (forgePhase === "flash" || forgePhase === "revealed" ? forgePhase : "idle")
    : "idle";
  const displayAccent = DEFAULT_ACCENT;
  const forgeDisplayFloat = livePlanet && isFloatablePlanet(livePlanet)
    ? getDisplayFloat(livePlanet)
    : undefined;

  const useCustomLabShape = !!labForgeShapeId && ((isCrafting && forgePlanetBuild) || labForgeRevealActive);
  const activeLabShapeId = useCustomLabShape
    ? resolveLabForgeShapeId(labForgeShapeId)
    : FORGE_SPHERE_SHAPE_ID;
  const forgePaint = labForgePaint(activeLabShapeId);
  const meshPrimary = forgePaint.color;
  const meshAccent = forgePaint.glowColor;
  const isLabSphereForge = activeLabShapeId === FORGE_SPHERE_SHAPE_ID;
  const forgeShapeId = showLabBackdrop || showVoxelLayer ? activeLabShapeId : undefined;
  const objectParts = useMemo(() => {
    if (!(showLabBackdrop || showVoxelLayer)) return undefined;
    if (isLabSphereForge) return [];
    return getMeshParts(activeLabShapeId, meshPrimary, meshAccent);
  }, [showLabBackdrop, showVoxelLayer, isLabSphereForge, activeLabShapeId, meshPrimary, meshAccent]);

  /** One WebGL session for the Lab backdrop — released when forge ends, not on tab switch. */
  useEffect(() => {
    if (keepForgeGl && labViewportReady && !forgeGlSession) {
      setForgeGlSession(`forge-${Date.now()}`);
    } else if (!keepForgeGl && forgeGlSession) {
      setForgeGlSession(null);
    }
  }, [keepForgeGl, labViewportReady, forgeGlSession]);

  const handleLabGlError = useCallback(() => {
    if (!keepForgeGl || pendingPlanet) return;
    // Debounce — context-loss storms during forge reveal used to remount in a loop.
    const w = window as unknown as { __zoomForgeGlRecoverAt?: number };
    const now = Date.now();
    if (w.__zoomForgeGlRecoverAt && now - w.__zoomForgeGlRecoverAt < 1200) return;
    w.__zoomForgeGlRecoverAt = now;
    setForgeGlSession(`forge-recover-${now}`);
  }, [keepForgeGl, pendingPlanet]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      if (w <= 1 || h <= 1) return;
      if (backdrop) {
        if (isActiveCraft || pendingPlanet || forgePhase === "wheel") return;
        if (viewportRef.current.w !== w || viewportRef.current.h !== h) {
          viewportRef.current = { w, h };
          setViewport({ w, h });
        }
        if (craftSizeLockRef.current != null) return;
        const next = Math.round(Math.min(w, h));
        if (Math.abs(next - sizeRef.current) < 1) return;
        sizeRef.current = next;
        setSize(next);
        return;
      }
      if (craftSizeLockRef.current != null) return;
      const next = Math.round(Math.min(w * 0.88, h * 0.82, 380));
      if (Math.abs(next - sizeRef.current) < 1) return;
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [backdrop, isActiveCraft, pendingPlanet, forgePhase]);

  useLayoutEffect(() => {
    if (isActiveCraft || pendingPlanet || forgePhase === "wheel") {
      if (craftSizeLockRef.current == null) {
        craftSizeLockRef.current = sizeRef.current;
      }
    } else if (forgePhase === "idle" && !pendingPlanet) {
      craftSizeLockRef.current = null;
    }
  }, [isActiveCraft, pendingPlanet, forgePhase]);

  const layoutSize = craftSizeLockRef.current ?? size;
  const modelCanvasSize = backdrop ? layoutSize : Math.round(layoutSize * 0.88);

  const spawnParticles = useCallback((relaxed = tapRelaxed) => {
    if (!isActiveCraft || showVoxelLayer) return;
    const layer = fragmentLayerRef.current;
    const half = modelCanvasSize / 2;
    if (!layer || half <= 0) return;

    const incoming = meshRef.current?.getIncomingVoxelTarget?.() ?? null;
    if (incoming) {
      spawnVoxelPixelParticle(layer, half, incoming, fragIdRef, relaxed);
      return;
    }

    const fromMesh = (meshRef.current?.getPartScreenTargets(6) ?? [])
      .map((t) => awayFromCenter(t.x, t.y, half))
      .filter((t): t is ParticleTarget => t !== null);
    const targets = fromMesh.length > 0 ? fromMesh : ringTargets(half, 6);

    const emit = () => spawnForgeParticles(layer, half, targets, fragIdRef, relaxed);
    emit();
    if (fromMesh.length === 0) requestAnimationFrame(emit);
  }, [isActiveCraft, showVoxelLayer, modelCanvasSize, tapRelaxed]);

  const handleModelTap = useCallback((point?: { x: number; y: number }) => {
    tapPointRef.current = point ?? null;
    onPunch?.();
  }, [onPunch]);

  useLayoutEffect(() => {
    if (tapSignal === lastTapSignalRef.current) return;
    lastTapSignalRef.current = tapSignal;
    if (tapSignal <= 0) return;
    if (showVoxelLayer) {
      meshRef.current?.queueForgeTapPlacement?.(tapPointRef.current ?? undefined);
      tapPointRef.current = null;
      return;
    }
    spawnParticles(tapRelaxed);
  }, [tapSignal, tapRelaxed, spawnParticles, showVoxelLayer]);

  useEffect(() => {
    if (!pendingPlanet) burstSpawnedRef.current = null;
  }, [pendingPlanet]);

  const progressLabel = forgeRolling
    ? t("planetCanvas.forgingMass")
    : pct < 0.04
      ? t("planetCanvas.primordial")
      : showVoxelLayer
        ? t("planetCanvas.forming")
        : t("planetCanvas.assembling");

  return (
    <div
      ref={containerRef}
      className={backdrop ? "absolute inset-0 overflow-hidden" : "relative w-full h-full flex flex-col items-center justify-center overflow-hidden"}
    >
      <div
        className={backdrop ? "absolute inset-0 flex items-center justify-center" : "flex items-center justify-center"}
        style={{
          width: backdrop ? "100%" : size,
          height: backdrop ? "100%" : size,
          cursor: onPunch && isForging && !forgeRolling ? "pointer" : "grab",
          touchAction: onPunch ? "manipulation" : "none",
          position: "relative",
          background: "transparent",
          overflow: "visible",
          contain: backdrop ? "none" : "layout style",
          zIndex: backdrop ? 0 : undefined,
          pointerEvents: backdrop ? "none" : undefined,
        }}
        data-testid="planet-wrap"
      >
        {keepForgeGl && labViewportReady && forgeGlSession && (
          <div
            className="absolute inset-0"
            style={{
              lineHeight: 0,
              visibility: visible && !hideForgeCanvasDuringWheel ? "visible" : "hidden",
              pointerEvents: (showVoxelLayer || labIdleAmbient) && visible ? "auto" : "none",
            }}
          >
            <MysteryModel3D
              ref={meshRef}
              key={`planet-voxel-${forgeGlSession}`}
              parts={objectParts ?? []}
              shapeId={forgeShapeId}
              primaryColor={meshPrimary}
              accentColor={meshAccent}
              progress={forgeDisplayProgress}
              revealed={false}
              planetRarity={forgeRarity ?? "BASIC"}
              displayFloat={forgeDisplayFloat}
              planetId={livePlanet?.id ?? "lab-forge-idle"}
              size={modelCanvasSize}
              viewportWidth={viewport.w}
              viewportHeight={viewport.h}
              onTap={onPunch && showVoxelLayer && isForging && !forgeRolling ? handleModelTap : undefined}
              autoSpin
              interactive={(isForging && !forgeRolling) || (labForgeRevealActive && forgePhase !== "wheel" && forgePhase !== "flash" && forgePhase !== "revealed")}
              forgeVoxelBuild={true}
              forgeRevealPhase={forgeRevealPhase}
              forgeTapRelaxed={tapRelaxed}
              performanceMode={false}
              labForgeBackdrop={true}
              labIdleAmbient={labIdleAmbient}
              sceneActive={visible}
              onGlFailed={handleLabGlError}
              onGlContextLost={handleLabGlError}
            />
          </div>
        )}

        {(showVoxelLayer && livePlanet) && !backdrop && (
          <div
            style={{
              position: "relative",
              width: modelCanvasSize,
              height: modelCanvasSize,
              pointerEvents: isForging && !forgeRolling ? "auto" : "none",
            }}
          >
            {forgeGlSession && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  lineHeight: 0,
                  pointerEvents: isForging && !forgeRolling ? "auto" : "none",
                }}
              >
                <MysteryModel3D
                  ref={meshRef}
                  key={`planet-voxel-${forgeGlSession}`}
                  parts={objectParts ?? []}
                  shapeId={forgeShapeId}
                  primaryColor={meshPrimary}
                  accentColor={meshAccent}
                  progress={isCrafting ? buildProgress : 1}
                  revealed={false}
                  planetRarity={forgeRarity ?? undefined}
                  displayFloat={forgeDisplayFloat}
                  planetId={livePlanet?.id}
                  size={modelCanvasSize}
                  onTap={onPunch && isForging && !forgeRolling ? handleModelTap : undefined}
                  autoSpin
                  forgeVoxelBuild={true}
                  forgeRevealPhase={forgeRevealPhase}
                  forgeTapRelaxed={tapRelaxed}
                  performanceMode={false}
                  onGlFailed={handleLabGlError}
                  onGlContextLost={handleLabGlError}
                />
              </div>
            )}
          </div>
        )}

        {(isActiveCraft || !!pendingPlanet) && !showVoxelLayer && (
          <div
            ref={fragmentLayerRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: modelCanvasSize,
              height: modelCanvasSize,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 12,
              contain: "strict",
              overflow: "visible",
            }}
          />
        )}
      </div>

      {isForging && !suppressProgressBar && (
        <ForgeProgressBar
          progress={progress}
          goal={goal}
          pct={pct}
          displayAccent={displayAccent}
          label={progressLabel}
          bottomOffset={backdrop ? chromeBottomOffset : undefined}
        />
      )}
    </div>
  );
}
