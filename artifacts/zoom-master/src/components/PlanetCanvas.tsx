import { memo, useCallback, useLayoutEffect, useRef, useState, useMemo } from "react";
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
  const [size, setSize] = useState(280);
  const sizeRef = useRef(280);

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

  const handleModelTap = useCallback(() => {
    onPunch?.();
  }, [onPunch]);

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
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
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
