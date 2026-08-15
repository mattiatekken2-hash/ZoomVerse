import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { MysteryModel3D } from "./MysteryModel3D";
import { getMeshParts, getModelById } from "@workspace/game-models";
import type { ZoomModel } from "../hooks/useGameState";
import { getRarityColorsForModel } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";

export type ForgePhase = "idle" | "flash" | "waiting" | "revealed";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  accentColor?: string;
  pendingModel?: ZoomModel | null;
  forgingModel?: ZoomModel | null;
  forgePhase: ForgePhase;
  forgeRolling?: boolean;
}

const DEFAULT_ACCENT = "#8892b0";
const CLAY_COLORS = ["#a8a8a8", "#c5c5c5", "#b0b0b0", "#989898"];
const MAX_FRAGMENTS = 15;

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

function modelTargetPoint(
  half: number,
  tapHint: { x: number; y: number } | null,
  buildPct: number,
  seed: number,
): { x: number; y: number; mx: number; my: number } {
  const rand = (n: number) => {
    const v = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  let x: number;
  let y: number;
  const hasHint = tapHint && Math.hypot(tapHint.x, tapHint.y) > 6;

  if (hasHint) {
    const spread = half * 0.2;
    x = tapHint.x + (rand(1) - 0.5) * spread;
    y = tapHint.y + (rand(2) - 0.5) * spread * 0.9;
  } else {
    const focusAngle = buildPct * Math.PI * 2 + rand(3) * 0.6;
    const radius = half * (0.2 + rand(4) * 0.24);
    x = Math.cos(focusAngle) * radius;
    y = Math.sin(focusAngle) * radius * 0.86;
  }

  const minR = half * 0.16;
  const len = Math.hypot(x, y);
  if (len < minR) {
    const a = len > 0.001 ? Math.atan2(y, x) : rand(5) * Math.PI * 2;
    x = Math.cos(a) * minR;
    y = Math.sin(a) * minR * 0.86;
  }

  const edge = half * 0.44;
  if (Math.hypot(x, y) > edge) {
    const a = Math.atan2(y, x);
    x = Math.cos(a) * edge;
    y = Math.sin(a) * edge * 0.86;
  }

  return { x, y, mx: x * 0.78, my: y * 0.78 };
}

function spawnClayFragments(
  layer: HTMLDivElement,
  half: number,
  tapHint: { x: number; y: number } | null,
  buildPct: number,
  fragIdRef: { current: number },
) {
  while (layer.childElementCount >= MAX_FRAGMENTS) {
    layer.firstElementChild?.remove();
  }

  const count = 3;
  for (let i = 0; i < count; i++) {
    const seed = fragIdRef.current + i;
    const target = modelTargetPoint(half, tapHint, buildPct, seed);
    const spread = (i - (count - 1) / 2) * 0.4;
    const baseAngle = Math.atan2(target.y, target.x) + Math.PI;
    const angle = baseAngle + spread + (Math.random() - 0.5) * 0.3;
    const dist = 0.62 + Math.random() * 0.26;
    const fx = Math.cos(angle) * dist * half;
    const fy = Math.sin(angle) * dist * half;
    const dot = document.createElement("div");
    dot.className = "lab-fragment";
    dot.dataset["fid"] = `f-${fragIdRef.current++}`;
    const clay = CLAY_COLORS[i % CLAY_COLORS.length] ?? "#b0b0b0";
    const dotSize = Math.max(5, half * 0.026 + Math.random() * 3);
    const s = dot.style;
    s.position = "absolute";
    s.left = "50%";
    s.top = "50%";
    s.width = `${dotSize}px`;
    s.height = `${dotSize}px`;
    s.borderRadius = "50%";
    s.background = clay;
    s.pointerEvents = "none";
    s.contain = "strict";
    s.setProperty("--fx", `${fx}px`);
    s.setProperty("--fy", `${fy}px`);
    s.setProperty("--mx", `${target.mx}px`);
    s.setProperty("--my", `${target.my}px`);
    s.setProperty("--delay", `${i * 40}ms`);
    layer.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove(), { once: true });
  }
}

export function PlanetCanvas({
  onPunch,
  progress,
  goal,
  accentColor,
  pendingModel,
  forgingModel = null,
  forgePhase,
  forgeRolling = false,
}: PlanetCanvasProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const planetWrapRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280);
  const sizeRef = useRef(280);
  const fragIdRef = useRef(0);
  const lastTapTargetRef = useRef<{ x: number; y: number } | null>(null);
  const lastProgressRef = useRef(progress);
  const skipNextProgressSpawnRef = useRef(false);
  const buildPctRef = useRef(0);

  const liveModel = pendingModel || forgingModel;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const revealed = forgePhase === "revealed";
  const buildProgress = forgePhase === "idle" ? pct : 1;
  const isForging = forgePhase === "idle";
  const rarityPaint = liveModel ? getRarityColorsForModel(liveModel.rarity) : undefined;
  const displayAccent = revealed
    ? (rarityPaint?.accentHex || liveModel?.accentColor || accentColor || DEFAULT_ACCENT)
    : DEFAULT_ACCENT;
  const displayPrimary = revealed
    ? (rarityPaint?.color || liveModel?.primaryColor || displayAccent)
    : "#c5c5c5";

  const modelDef = liveModel ? getModelById(liveModel.modelId) : undefined;
  const objectParts = useMemo(() => {
    if (!liveModel) return undefined;
    const shapeId = liveModel.shapeId || modelDef?.shapeId;
    if (!shapeId) return undefined;
    return getMeshParts(shapeId, "p", "a");
  }, [liveModel?.modelId, liveModel?.shapeId, modelDef?.shapeId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      if (w <= 1 || h <= 1) return;
      const next = Math.round(Math.min(w * 0.88, h * 0.82, 380));
      if (Math.abs(next - sizeRef.current) < 1) return;
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const modelCanvasSize = Math.round(size * 0.88);
  buildPctRef.current = pct;

  const spawnFragments = useCallback((tapHint: { x: number; y: number } | null) => {
    if (!liveModel || forgePhase !== "idle") return;
    const layer = fragmentLayerRef.current;
    const half = modelCanvasSize / 2;
    if (!layer || half <= 0) return;
    spawnClayFragments(layer, half, tapHint, buildPctRef.current, fragIdRef);
  }, [liveModel, forgePhase, modelCanvasSize]);

  const handleModelTap = useCallback((point?: { x: number; y: number }) => {
    if (point) lastTapTargetRef.current = point;
    spawnFragments(point ?? lastTapTargetRef.current);
    skipNextProgressSpawnRef.current = true;
    onPunch?.();
  }, [onPunch, spawnFragments]);

  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0 || forgePhase !== "idle" || !liveModel) return;
    if (skipNextProgressSpawnRef.current) {
      skipNextProgressSpawnRef.current = false;
      return;
    }
    spawnFragments(lastTapTargetRef.current);
  }, [progress, forgePhase, liveModel, spawnFragments]);

  const convergeKey = forgePhase === "waiting" ? "w" : "i";
  const convergeParticles = useMemo(() => {
    const count = 14;
    const orbitBRadius = size * 0.32;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + (i % 2 ? 12 : 0),
      r: orbitBRadius * 1.15,
      delay: (i % 5) * 80,
    }));
  }, [size]);

  const showModel3D = forgePhase !== "flash";
  const showFlash = forgePhase === "flash";
  const showConverge = forgePhase === "waiting";

  const progressLabel = forgeRolling
    ? t("planetCanvas.forgingMass")
    : pct < 0.04
      ? t("planetCanvas.primordial")
      : liveModel
        ? t("planetCanvas.forming")
        : t("planetCanvas.assembling");

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
        ref={planetWrapRef}
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          cursor: onPunch && isForging && !forgeRolling ? "pointer" : "default",
          touchAction: "manipulation",
          position: "relative",
          background: "transparent",
          overflow: "visible",
          contain: "layout style",
        }}
        data-testid="planet-wrap"
      >
        {showModel3D && liveModel && objectParts && (
          <MysteryModel3D
            key={liveModel.modelId}
            parts={objectParts}
            primaryColor={displayPrimary}
            accentColor={displayAccent}
            progress={buildProgress}
            revealed={revealed}
            size={modelCanvasSize}
            onTap={isForging && !forgeRolling ? handleModelTap : undefined}
            autoSpin
            performanceMode={forgePhase !== "revealed"}
          />
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

        {showConverge && (
          <div
            key={convergeKey}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 0,
              height: 0,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {convergeParticles.map((p) => {
              const dotSize = Math.max(5, size * 0.02);
              return (
                <div
                  key={p.id}
                  className="forge-converge"
                  style={{
                    position: "absolute",
                    width: dotSize,
                    height: dotSize,
                    marginLeft: -dotSize / 2,
                    marginTop: -dotSize / 2,
                    borderRadius: "50%",
                    background: displayAccent,
                    boxShadow: `0 0 10px ${displayAccent}, 0 0 24px ${displayAccent}aa`,
                    ["--angle" as string]: `${p.angle}deg`,
                    ["--r" as string]: `${p.r}px`,
                    animationDelay: `${p.delay}ms`,
                  } as React.CSSProperties}
                />
              );
            })}
          </div>
        )}

        {liveModel && isForging && (
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
            }}
          />
        )}
      </div>

      {isForging && (
        <ForgeProgressBar
          progress={progress}
          goal={goal}
          pct={pct}
          displayAccent={displayAccent}
          label={progressLabel}
        />
      )}
    </div>
  );
}
