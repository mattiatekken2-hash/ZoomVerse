import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { MysteryModel3D, type ForgeMeshHandle } from "./MysteryModel3D";
import { getMeshParts, getModelById, FORGE_CLAY_HEX } from "@workspace/game-models";
import type { ZoomModel } from "../hooks/useGameState";
import { getRarityColorsForModel } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";

export type ForgePhase = "idle" | "flash" | "waiting" | "revealed";

interface PlanetCanvasProps {
  onPunch?: () => void;
  /** Bumped on each craft tap to fire particles. */
  tapSignal?: number;
  /** Softer, slower particles (auto-tap and calm manual craft). */
  tapRelaxed?: boolean;
  progress: number;
  goal: number;
  accentColor?: string;
  pendingModel?: ZoomModel | null;
  forgingModel?: ZoomModel | null;
  forgePhase: ForgePhase;
  forgeRolling?: boolean;
  /** Full-bleed backdrop layer (Lab forge behind UI). */
  backdrop?: boolean;
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

const ForgeProgressBar = memo(function ForgeProgressBar({
  progress,
  goal,
  pct,
  displayAccent,
  label,
}: {
  progress: number;
  goal: number;
  pct: number;
  displayAccent: string;
  label: string;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4 z-10">
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

export function PlanetCanvas({
  onPunch,
  tapSignal = 0,
  tapRelaxed = false,
  progress,
  goal,
  accentColor,
  pendingModel,
  forgingModel = null,
  forgePhase,
  forgeRolling = false,
  backdrop = false,
}: PlanetCanvasProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<ForgeMeshHandle>(null);
  const fragIdRef = useRef(0);
  const lastTapSignalRef = useRef(tapSignal);
  const [size, setSize] = useState(280);
  const sizeRef = useRef(280);
  const craftSizeLockRef = useRef<number | null>(null);

  const liveModel = pendingModel || forgingModel;
  const isActiveCraft = forgePhase === "idle" && !!forgingModel && !forgeRolling;
  const isCrafting = forgePhase === "idle" && !!forgingModel && !forgeRolling;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const revealed = forgePhase === "revealed";
  const buildProgress = isCrafting ? pct : liveModel ? 1 : 0;
  const isForging = isCrafting;
  const rarityPaint = liveModel ? getRarityColorsForModel(liveModel.rarity) : undefined;
  const displayAccent = revealed
    ? (rarityPaint?.accentHex || liveModel?.accentColor || accentColor || DEFAULT_ACCENT)
    : DEFAULT_ACCENT;
  const displayPrimary = revealed
    ? (rarityPaint?.color || liveModel?.primaryColor || displayAccent)
    : FORGE_CLAY_HEX;

  const modelDef = liveModel ? getModelById(liveModel.modelId) : undefined;
  const objectParts = useMemo(() => {
    if (!liveModel) return undefined;
    const shapeId = liveModel.shapeId || modelDef?.shapeId;
    if (!shapeId) return undefined;
    const primary = revealed
      ? (liveModel.primaryColor || displayPrimary)
      : liveModel.primaryColor || "#888888";
    const accent = revealed
      ? (liveModel.accentColor || displayAccent)
      : liveModel.accentColor || "#666666";
    return getMeshParts(shapeId, primary, accent);
  }, [liveModel?.modelId, liveModel?.shapeId, liveModel?.primaryColor, liveModel?.accentColor, modelDef?.shapeId, displayPrimary, displayAccent, revealed]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (craftSizeLockRef.current != null) return;
      const h = el.clientHeight;
      const w = el.clientWidth;
      if (w <= 1 || h <= 1) return;
      const next = backdrop
        ? Math.round(Math.min(w, h))
        : Math.round(Math.min(w * 0.88, h * 0.82, 380));
      if (Math.abs(next - sizeRef.current) < 1) return;
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [backdrop]);

  useLayoutEffect(() => {
    if (isActiveCraft) {
      if (craftSizeLockRef.current == null) {
        craftSizeLockRef.current = sizeRef.current;
      }
    } else if (!forgingModel && forgePhase !== "waiting") {
      craftSizeLockRef.current = null;
    }
  }, [isActiveCraft, forgingModel, forgePhase]);

  const layoutSize = craftSizeLockRef.current ?? size;
  const modelCanvasSize = backdrop ? layoutSize : Math.round(layoutSize * 0.88);

  const spawnParticles = useCallback((relaxed = tapRelaxed) => {
    if (!isActiveCraft) return;
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
  }, [isActiveCraft, modelCanvasSize, tapRelaxed]);

  const handleModelTap = useCallback(() => {
    onPunch?.();
  }, [onPunch]);

  useEffect(() => {
    if (tapSignal === lastTapSignalRef.current) return;
    lastTapSignalRef.current = tapSignal;
    if (tapSignal <= 0) return;
    spawnParticles(tapRelaxed);
  }, [tapSignal, tapRelaxed, spawnParticles]);

  const showModel3D = forgePhase !== "flash";
  const showFlash = forgePhase === "flash";

  const progressLabel = forgeRolling
    ? t("planetCanvas.forgingMass")
    : pct < 0.04
      ? t("planetCanvas.primordial")
      : liveModel
        ? t("planetCanvas.forming")
        : t("planetCanvas.assembling");

  return (
    <div
      ref={containerRef}
      className={backdrop ? "absolute inset-0" : "relative w-full h-full flex flex-col items-center justify-center"}
    >
      <div
        className={backdrop ? "absolute inset-0 flex items-center justify-center" : "flex items-center justify-center"}
        style={{
          width: backdrop ? "100%" : size,
          height: backdrop ? "100%" : size,
          cursor: onPunch && isForging && !forgeRolling ? "pointer" : "default",
          touchAction: "manipulation",
          position: "relative",
          background: "transparent",
          overflow: "visible",
          contain: backdrop ? "none" : "layout style",
          zIndex: backdrop ? 0 : undefined,
          pointerEvents: backdrop ? "none" : undefined,
        }}
        data-testid="planet-wrap"
      >
        {showModel3D && liveModel && objectParts && (
          <div
            style={{
              pointerEvents: isForging && !forgeRolling ? "auto" : "none",
              lineHeight: 0,
            }}
          >
            <MysteryModel3D
            ref={meshRef}
            key={liveModel.modelId}
            parts={objectParts}
            primaryColor={displayPrimary}
            accentColor={displayAccent}
            progress={buildProgress}
            revealed={revealed}
            size={modelCanvasSize}
            onTap={isForging && !forgeRolling ? handleModelTap : undefined}
            autoSpin
            forgeVoxelBuild={isCrafting && !revealed}
            forgeTapRelaxed={tapRelaxed}
            performanceMode={false}
          />
          </div>
        )}

        {revealed && rarityPaint && (
          <div
            className="pointer-events-none"
            style={{
              position: "absolute",
              inset: "-8%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${rarityPaint.color}55 0%, ${rarityPaint.color}18 42%, transparent 70%)`,
              boxShadow: `0 0 48px ${rarityPaint.color}44`,
              zIndex: 1,
            }}
          />
        )}

        {showFlash && (
          <div
            className="forge-flash"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.85) 30%, rgba(220,230,255,0.4) 60%, transparent 80%)",
              pointerEvents: "none",
              zIndex: 20,
            }}
          />
        )}

        {isActiveCraft && (
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

      {isForging && (
        <div className="relative z-10 w-full">
          <ForgeProgressBar
            progress={progress}
            goal={goal}
            pct={pct}
            displayAccent={displayAccent}
            label={progressLabel}
          />
        </div>
      )}
    </div>
  );
}
