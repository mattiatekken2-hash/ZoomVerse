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
const CLAY_COLORS = ["#9a9a9a", "#bdbdbd", "#d4d4d4", "#888888"];
const MAX_FRAGMENTS = 18;

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

function spawnClayFragments(
  layer: HTMLDivElement,
  half: number,
  target: { x: number; y: number },
  fragIdRef: { current: number },
) {
  while (layer.childElementCount >= MAX_FRAGMENTS) {
    layer.firstElementChild?.remove();
  }

  const tx = target.x;
  const ty = target.y;
  const count = 3;
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.35;
    const baseAngle = Math.atan2(ty, tx) + Math.PI;
    const angle = baseAngle + spread + (Math.random() - 0.5) * 0.25;
    const dist = 0.58 + Math.random() * 0.28;
    const fx = Math.cos(angle) * dist * half;
    const fy = Math.sin(angle) * dist * half;
    const dot = document.createElement("div");
    dot.className = "lab-fragment";
    dot.dataset["fid"] = `f-${fragIdRef.current++}`;
    const clay = CLAY_COLORS[i % CLAY_COLORS.length] ?? "#b0b0b0";
    const dotSize = Math.max(4, half * 0.028 + Math.random() * 4);
    const jitter = 6 + Math.random() * 10;
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
    s.setProperty("--tx", `${tx + (Math.random() - 0.5) * jitter}px`);
    s.setProperty("--ty", `${ty + (Math.random() - 0.5) * jitter}px`);
    s.setProperty("--delay", `${i * 50}ms`);
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

  const handleModelTap = useCallback((point?: { x: number; y: number }) => {
    const layer = fragmentLayerRef.current;
    const half = sizeRef.current / 2;
    const target = point ?? lastTapTargetRef.current ?? {
      x: (Math.random() - 0.5) * half * 0.25,
      y: (Math.random() - 0.5) * half * 0.25,
    };
    if (point) lastTapTargetRef.current = point;
    if (layer && half > 0 && forgePhase === "idle") {
      spawnClayFragments(layer, half, target, fragIdRef);
      skipNextProgressSpawnRef.current = true;
    }
    onPunch?.();
  }, [onPunch, forgePhase]);

  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0 || forgePhase !== "idle") return;
    if (skipNextProgressSpawnRef.current) {
      skipNextProgressSpawnRef.current = false;
      return;
    }

    const layer = fragmentLayerRef.current;
    const half = sizeRef.current / 2;
    if (!layer || half <= 0) return;

    const target = lastTapTargetRef.current ?? {
      x: (Math.random() - 0.5) * half * 0.25,
      y: (Math.random() - 0.5) * half * 0.25,
    };
    spawnClayFragments(layer, half, target, fragIdRef);
  }, [progress, forgePhase]);

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
  const modelCanvasSize = Math.round(size * 0.88);

  const progressLabel = forgeRolling
    ? t("planetCanvas.forgingMass")
    : pct < 0.04
      ? t("planetCanvas.primordial")
      : liveModel
        ? "FORMING"
        : "ASSEMBLING";

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

        <div
          ref={fragmentLayerRef}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10, contain: "strict" }}
        />
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
