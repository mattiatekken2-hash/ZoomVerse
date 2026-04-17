import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PlanetOrb } from "./PlanetOrb";
import type { Planet, PlanetType } from "../hooks/useGameState";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  isRevealing?: boolean;
  pendingPlanet?: Planet | null;
  currentCraftRarity?: PlanetType | null;
}

const DEFAULT_COLOR = "#4facfe";
const GREY = "#8892b0";

const RARITY_FROM_COLOR: Record<string, PlanetType> = {
  "#8892b0": "BASIC",
  "#4facfe": "RARE",
  "#c471ed": "EPIC",
  "#ffd700": "GOLD",
};

const RATE_BY_TYPE: Record<PlanetType, number> = { BASIC: 2, RARE: 15, EPIC: 80, GOLD: 150 };
const GLOW_BY_TYPE: Record<PlanetType, string> = {
  BASIC: "rgba(136,146,176,0.5)",
  RARE: "rgba(79,172,254,0.5)",
  EPIC: "rgba(196,113,237,0.5)",
  GOLD: "rgba(255,215,0,0.5)",
};

interface Fragment {
  id: number;
  startX: number;
  startY: number;
  born: number;
}

function makeOrbPlanet(rarity: PlanetType, color: string): Planet {
  return {
    id: `lab-${rarity}`,
    name: rarity,
    color,
    glowColor: GLOW_BY_TYPE[rarity],
    rate: RATE_BY_TYPE[rarity],
    craftCost: 0,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: false,
    isFarmingActive: false,
  } as Planet;
}

export function PlanetCanvas({
  onPunch,
  progress,
  goal,
  planetColor,
  isRevealing = false,
  pendingPlanet,
  currentCraftRarity,
}: PlanetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const planetWrapRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(280);
  const fragIdRef = useRef(0);
  const lastProgressRef = useRef(progress);
  const sizeRef = useRef(280);

  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const isPrimordial = pct < 0.04 && !isRevealing;
  const isFractured = pct >= 0.999 || isRevealing;

  // Determine which planet to render: pendingPlanet wins, then committed rarity, else use color
  const displayRarity: PlanetType = pendingPlanet
    ? pendingPlanet.name
    : currentCraftRarity
    ? currentCraftRarity
    : RARITY_FROM_COLOR[color] || "BASIC";
  const displayColor = pendingPlanet?.color || color;
  const orbPlanet: Planet = pendingPlanet ?? makeOrbPlanet(displayRarity, displayColor);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      // Ignore zero-size measurements (happens when tab is hidden via display:none).
      // Without this guard, the planet would shrink to 0 and re-animate to full size
      // every time the user re-enters the LAB tab.
      if (w <= 1 || h <= 1) return;
      const next = Math.min(w * 0.78, h * 0.78, 360);
      if (Math.abs(next - sizeRef.current) < 0.5) return;
      sizeRef.current = next;
      setSize(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Imperative bump + fragments on each tap. We deliberately bypass React state
  // for the visual feedback to avoid re-rendering PlanetOrb (heavy conic gradients)
  // on every click — that was the main source of lag during fast tapping.
  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0) return;

    // Restart bump animation imperatively (no key change → no PlanetOrb remount)
    const wrap = planetWrapRef.current;
    if (wrap) {
      wrap.classList.remove("lab-planet-bump");
      // Force reflow so the animation restarts even on rapid taps
      void wrap.offsetWidth;
      wrap.classList.add("lab-planet-bump");
    }

    // Spawn 2 lightweight fragment DOM nodes directly (not via React state)
    const layer = fragmentLayerRef.current;
    if (layer && sizeRef.current > 0) {
      const burst = 2;
      const half = sizeRef.current / 2;
      const dotSize = Math.max(6, sizeRef.current * 0.025);
      for (let i = 0; i < burst; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.55 + Math.random() * 0.35;
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
        s.setProperty("--fx", `${fx}px`);
        s.setProperty("--fy", `${fy}px`);
        layer.appendChild(dot);
        // Self-remove on animation end (fallback timeout if event doesn't fire)
        const cleanup = () => { dot.remove(); };
        dot.addEventListener("animationend", cleanup, { once: true });
        window.setTimeout(cleanup, 900);
      }
    }
  }, [progress, displayColor]);

  const planetSize = size * (0.12 + pct * 0.88);
  const handleClick = () => { if (onPunch) onPunch(); };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Stars / cosmic backdrop */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.45 }}>
        <div className="lab-stars-a" />
        <div className="lab-stars-b" />
      </div>

      <div
        className="flex items-center justify-center"
        onClick={handleClick}
        style={{ width: size, height: size, cursor: onPunch ? "pointer" : "default", touchAction: "manipulation", position: "relative" }}
        data-testid="planet-wrap"
      >
        {/* Primordial nebula — visible only at the very start */}
        {isPrimordial && (
          <>
            <div
              style={{
                position: "absolute",
                width: size * 0.95,
                height: size * 0.95,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(200,210,255,0.55) 0%, rgba(120,140,200,0.2) 40%, transparent 72%)",
                filter: `blur(${size * 0.06}px)`,
                animation: "nebulaPulse 2.4s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: size * 0.55,
                height: size * 0.55,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(230,240,255,0.85) 0%, rgba(160,180,230,0.35) 35%, transparent 70%)",
                filter: `blur(${size * 0.03}px)`,
                animation: "nebulaPulse 1.6s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <div
              className="lab-spark"
              style={{
                position: "absolute",
                width: size * 0.08,
                height: size * 0.08,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.95)",
                boxShadow: "0 0 24px rgba(220,230,255,0.95), 0 0 64px rgba(180,200,255,0.55)",
                pointerEvents: "none",
              }}
            />
          </>
        )}

        {/* The actual planet — same asset as Farm, scaled by progress */}
        {!isPrimordial && (
          <div
            ref={planetWrapRef}
            style={{
              width: planetSize,
              height: planetSize,
              transition: "width 0.28s cubic-bezier(.2,.8,.2,1), height 0.28s cubic-bezier(.2,.8,.2,1)",
              position: "relative",
              filter: isFractured ? `drop-shadow(0 0 ${planetSize * 0.18}px ${displayColor})` : "none",
              willChange: "transform",
            }}
            data-testid="lab-planet-orb"
          >
            <PlanetOrb planet={orbPlanet} size={planetSize} animate={true} />

            {/* Fracture cracks overlay — only at 100% */}
            {isFractured && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  pointerEvents: "none",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: `repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${displayColor} 1.2deg, transparent 2.4deg, transparent 22deg)`,
                    mixBlendMode: "screen",
                    opacity: 0.55,
                    animation: "crackPulse 1.4s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: `repeating-conic-gradient(from 35deg at 48% 52%, transparent 0deg, ${displayColor} 0.8deg, transparent 1.6deg, transparent 38deg)`,
                    mixBlendMode: "screen",
                    opacity: 0.45,
                    animation: "crackPulse 1.9s ease-in-out infinite reverse",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: "10%",
                    borderRadius: "50%",
                    background: `radial-gradient(circle at 50% 50%, ${displayColor}66 0%, transparent 60%)`,
                    mixBlendMode: "screen",
                    animation: "crackPulse 1.1s ease-in-out infinite",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Fragment layer — populated imperatively to avoid React re-renders on rapid taps */}
        <div
          ref={fragmentLayerRef}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            {isPrimordial ? "Primordial Light" : isFractured ? "Core Fractured" : "Forging Mass"}
          </span>
          <span className="font-bold" style={{ color: displayColor, textShadow: isFractured ? `0 0 10px ${displayColor}` : "none" }}>
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
              transition: "width 0.25s ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
