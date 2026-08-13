import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { LabPlanet3D } from "./LabPlanet3D";
import type { Planet, PlanetType } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";

export type ForgePhase = "idle" | "flash" | "waiting" | "revealed";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  pendingPlanet?: Planet | null;
  currentCraftRarity?: PlanetType | null;
  forgePhase: ForgePhase;
}

const DEFAULT_COLOR = "#8892b0";

export function PlanetCanvas({
  onPunch,
  progress,
  goal,
  planetColor,
  pendingPlanet,
  forgePhase,
}: PlanetCanvasProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280);
  const sizeRef = useRef(280);
  const fragIdRef = useRef(0);
  const lastProgressRef = useRef(progress);

  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const displayColor = pendingPlanet?.color || color;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      if (w <= 1 || h <= 1) return;
      const next = Math.min(w * 0.88, h * 0.82, 380);
      if (Math.abs(next - sizeRef.current) < 0.5) return;
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0 || forgePhase !== "idle") return;

    const layer = fragmentLayerRef.current;
    if (!layer || sizeRef.current <= 0) return;
    const half = sizeRef.current / 2;
    const dotSize = Math.max(5, sizeRef.current * 0.022);
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.4 + Math.random() * 0.45;
      const fx = Math.cos(angle) * dist * half;
      const fy = Math.sin(angle) * dist * half;
      const dot = document.createElement("div");
      dot.className = "lab-fragment";
      const id = `f-${fragIdRef.current++}`;
      dot.dataset["fid"] = id;
      const s = dot.style;
      s.position = "absolute";
      s.left = "50%";
      s.top = "50%";
      s.width = `${dotSize}px`;
      s.height = `${dotSize}px`;
      s.borderRadius = "50%";
      s.background = displayColor;
      s.boxShadow = `0 0 10px ${displayColor}, 0 0 22px ${displayColor}88`;
      s.pointerEvents = "none";
      s.willChange = "transform, opacity";
      s.setProperty("--fx", `${fx}px`);
      s.setProperty("--fy", `${fy}px`);
      layer.appendChild(dot);
      const cleanup = () => { dot.remove(); };
      dot.addEventListener("animationend", cleanup, { once: true });
      window.setTimeout(cleanup, 900);
    }
  }, [progress, displayColor, forgePhase]);

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

  const showPlanet3D = forgePhase === "idle" || forgePhase === "revealed";
  const showFlash = forgePhase === "flash";
  const showConverge = forgePhase === "waiting";
  const planetCanvasSize = forgePhase === "revealed" ? size * 0.92 : size * 0.88;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.45 }}>
        <div className="lab-stars-a" />
        <div className="lab-stars-b" />
      </div>

      <div
        className={`flex items-center justify-center ${showConverge ? "forge-shake" : ""}`}
        style={{
          width: size,
          height: size,
          cursor: onPunch && forgePhase === "idle" ? "pointer" : "default",
          touchAction: "manipulation",
          position: "relative",
        }}
        data-testid="planet-wrap"
      >
        {showPlanet3D && (
          <LabPlanet3D
            color={displayColor}
            size={planetCanvasSize}
            progress={pct}
            onTap={forgePhase === "idle" ? onPunch : undefined}
            autoSpin
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
                    background: displayColor,
                    boxShadow: `0 0 10px ${displayColor}, 0 0 24px ${displayColor}aa`,
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
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}
        />
      </div>

      {forgePhase === "idle" && (
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4 z-10">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              {pct < 0.04 ? t("planetCanvas.primordial") : t("planetCanvas.forgingMass")}
            </span>
            <span className="font-bold" style={{ color: displayColor }}>
              {progress}/{goal}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${pct * 100}%`,
                background: `linear-gradient(90deg, ${displayColor}, ${displayColor}cc)`,
                boxShadow: `0 0 10px ${displayColor}`,
                transition: "width 0.18s ease-out",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
