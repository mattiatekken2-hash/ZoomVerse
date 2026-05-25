import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { PlanetOrb } from "./PlanetOrb";
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

const DEFAULT_COLOR = "#4facfe";

const RARITY_FROM_COLOR: Record<string, PlanetType> = {
  "#8892b0": "BASIC",
  "#4facfe": "RARE",
  "#c471ed": "EPIC",
  "#ffd700": "GOLD",
  "#f5fbff": "V1",
};

const RATE_BY_TYPE: Record<PlanetType, number> = {
  BASIC: 2, RARE: 15, EPIC: 80, MYTHIC: 115, PLASMA: 130, GOLD: 150, V1: 400, V1_NFT: 275,
  WHITE1: 0, WHITE2: 0, WHITE3: 0, WHITE4: 0,
  EARTH1: 0, EARTH2: 0, EARTH3: 0, EARTH4: 0,
  BLACK1: 0, BLACK2: 0, BLACK3: 0, BLACK4: 0,
  SUPERNOVA1: 0, SUPERNOVA2: 0, SUPERNOVA3: 0, SUPERNOVA4: 0,
};
const GLOW_BY_TYPE: Record<PlanetType, string> = {
  BASIC: "rgba(136,146,176,0.5)",
  RARE: "rgba(79,172,254,0.5)",
  EPIC: "rgba(196,113,237,0.5)",
  MYTHIC: "rgba(255,69,0,0.7)",
  PLASMA: "rgba(0,230,118,0.7)",
  GOLD: "rgba(255,215,0,0.5)",
  V1: "rgba(245,251,255,0.7)",
  V1_NFT: "rgba(180,220,255,0.85)",
  WHITE1: "rgba(255,255,255,0.5)",
  WHITE2: "rgba(248,250,255,0.5)",
  WHITE3: "rgba(240,244,255,0.5)",
  WHITE4: "rgba(232,238,255,0.5)",
  EARTH1: "rgba(96,165,250,0.55)",
  EARTH2: "rgba(74,222,128,0.55)",
  EARTH3: "rgba(56,189,248,0.55)",
  EARTH4: "rgba(34,197,94,0.55)",
  BLACK1: "rgba(123,47,255,0.75)",
  BLACK2: "rgba(123,47,255,0.75)",
  BLACK3: "rgba(123,47,255,0.75)",
  BLACK4: "rgba(123,47,255,0.75)",
  SUPERNOVA1: "rgba(255,215,0,0.75)",
  SUPERNOVA2: "rgba(252,211,77,0.75)",
  SUPERNOVA3: "rgba(250,204,21,0.75)",
  SUPERNOVA4: "rgba(251,191,36,0.75)",
};

// Number of particles in each orbit ring
const ORBIT_A_COUNT = 6;
const ORBIT_B_COUNT = 4;

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
  pendingPlanet,
  currentCraftRarity,
  forgePhase,
}: PlanetCanvasProps) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const fragmentLayerRef = useRef<HTMLDivElement>(null);
  const orbitARef = useRef<HTMLDivElement>(null);
  const orbitBRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const displayColorRef = useRef<string>(DEFAULT_COLOR);
  // "Spin charge" — bumped on every tap, decays quickly when the user
  // stops tapping. Drives orbit speed so the rings visibly slow to a halt
  // a moment after tapping stops, instead of locking to absolute progress.
  const chargeRef = useRef(0);
  const [size, setSize] = useState(280);
  const sizeRef = useRef(280);
  const fragIdRef = useRef(0);
  const lastProgressRef = useRef(progress);

  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;

  // Determine which planet/color to render
  const displayRarity: PlanetType = pendingPlanet
    ? pendingPlanet.name
    : currentCraftRarity
    ? currentCraftRarity
    : RARITY_FROM_COLOR[color] || "BASIC";
  const displayColor = pendingPlanet?.color || color;
  const orbPlanet: Planet = pendingPlanet ?? makeOrbPlanet(displayRarity, displayColor);

  // Container sizing
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
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

  // Track progress + color in refs so the rAF loop can read them without
  // triggering re-renders. The core's visual state (scale + glow) is then
  // mutated imperatively so taps never cause React reconciliation.
  useEffect(() => {
    progressRef.current = pct;
  }, [pct]);
  useEffect(() => {
    displayColorRef.current = displayColor;
  }, [displayColor]);

  // Single rAF loop drives both orbital rings during the tap-build phase.
  // Speed is driven by `chargeRef` (bumped on each tap, decays over time),
  // so the rings spin up while the user taps and gracefully slow to a stop
  // when they pause. Charge also scales the speed cap by overall progress
  // so a fully-charged ring near 100% spins faster than one near 5%.
  useEffect(() => {
    if (forgePhase !== "idle") return;
    let rafId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let angleA = 0;
    let angleB = 0;
    let last = performance.now();
    let lastAppliedPct = -1;
    let lastAppliedColor = "";

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // Decay charge: ~0.8s from full to zero of inactivity.
      chargeRef.current = Math.max(0, chargeRef.current - dt * 1.25);
      const c = chargeRef.current;
      const p = progressRef.current;
      // Orbit rotation (rings are removed but ref writes are cheap no-ops).
      const baseline = 22;
      const boostCap = 90 + Math.pow(p, 0.85) * 630;
      const speed = baseline + c * boostCap;
      angleA = (angleA + speed * dt) % 360;
      angleB = (angleB - speed * 1.35 * dt) % 360;
      const a = orbitARef.current;
      const b = orbitBRef.current;
      if (a) a.style.transform = `translate(-50%, -50%) rotate(${angleA}deg)`;
      if (b) b.style.transform = `translate(-50%, -50%) rotate(${angleB}deg)`;

      // Core: scale + glow driven imperatively from progress. Only writes
      // when the value changes meaningfully so we don't repaint each frame.
      const core = coreRef.current;
      const col = displayColorRef.current;
      if (core && (Math.abs(p - lastAppliedPct) > 0.005 || col !== lastAppliedColor)) {
        lastAppliedPct = p;
        lastAppliedColor = col;
        // Subtle scale: 1.0 → 1.6 over the build.
        const scale = 1 + p * 0.6;
        core.style.transform = `translate(-50%, -50%) scale(${scale})`;
        // Glow already starts bright and broad (matching the desired
        // "lighthouse" baseline look) and intensifies further on tap.
        const glowR = 50 + p * 30;
        const glowSpread = 22 + p * 16;
        const alpha = Math.floor(150 + p * 80).toString(16).padStart(2, "0");
        const whiteAlpha = (0.55 + p * 0.3).toFixed(2);
        core.style.boxShadow =
          `0 0 ${glowR}px ${glowSpread}px ${col}${alpha}, ` +
          `0 0 ${100 + p * 60}px rgba(255,255,255,${whiteAlpha})`;
      }

      // Battery-saver: stop the rAF loop when fully idle so the GPU/compositor
      // isn't spinning at 60 fps doing nothing. A tiny visual pause (<1s)
      // while the loop restarts on the next tap is imperceptible.
      if (c <= 0 && p <= 0.005) {
        if (!idleTimer) {
          idleTimer = setTimeout(() => { idleTimer = null; }, 800);
        }
      } else {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      }

      // Keep looping only while there's visual work to do.
      if (c > 0 || p > 0.005) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [forgePhase]);

  // Imperative tap fragments — DOM-only, never touch React state, so rapid
  // tapping never re-renders the heavy planet/orbital tree.
  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0) return;
    if (forgePhase !== "idle") return;

    // Each tap bumps the spin charge so the orbits accelerate while tapping
    // and naturally decelerate to a stop when the user pauses.
    chargeRef.current = Math.min(1, chargeRef.current + 0.22 * delta);

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

  // Core has a FIXED rendered size; growth is applied via transform: scale
  // by the rAF loop, which keeps each tap on the GPU compositor (no layout,
  // no repaint of width/height). Final visual size = coreSize * (1 + pct*0.6).
  const coreSize = Math.max(40, Math.min(50, size * 0.16));
  // Orbit radii scale with container so the rings don't crowd the core but
  // also don't escape the canvas on small phones.
  const orbitARadius = Math.max(coreSize * 1.35, size * 0.22);
  const orbitBRadius = Math.max(coreSize * 1.85, size * 0.30);

  const orbitParticles = useMemo(() => {
    const a = Array.from({ length: ORBIT_A_COUNT }, (_, i) => ({
      angle: (360 / ORBIT_A_COUNT) * i,
      r: orbitARadius,
    }));
    const b = Array.from({ length: ORBIT_B_COUNT }, (_, i) => ({
      angle: (360 / ORBIT_B_COUNT) * i + 22,
      r: orbitBRadius,
    }));
    return { a, b };
  }, [orbitARadius, orbitBRadius]);

  // Converging particle positions for the "waiting" phase. Generated fresh
  // each time we enter the phase so the animation key changes and replays.
  const convergeKey = forgePhase === "waiting" ? "w" : "i";
  const convergeParticles = useMemo(() => {
    const count = 14;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + (i % 2 ? 12 : 0),
      r: orbitBRadius * 1.15,
      delay: (i % 5) * 80,
    }));
  }, [orbitBRadius]);

  const handleClick = () => { if (onPunch) onPunch(); };

  const showCoreAndOrbits = forgePhase === "idle";
  const showFlash = forgePhase === "flash";
  const showConverge = forgePhase === "waiting";
  const showPlanet = forgePhase === "revealed";

  // Planet size when revealed — generous but anchored to canvas size.
  const planetSize = size * 0.78;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Stars / cosmic backdrop */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.45 }}>
        <div className="lab-stars-a" />
        <div className="lab-stars-b" />
      </div>

      <div
        className={`flex items-center justify-center ${showConverge ? "forge-shake" : ""}`}
        onClick={handleClick}
        style={{
          width: size,
          height: size,
          cursor: onPunch ? "pointer" : "default",
          touchAction: "manipulation",
          position: "relative",
          willChange: "transform",
        }}
        data-testid="planet-wrap"
      >
        {/* ─── FIXED LIGHT CORE ──────────────────────────────────────────
            Stays a small intense pinpoint of light through the entire
            tap-build phase. Brightness pulses subtly and grows MORE intense
            (not bigger) as charge approaches 100%. */}
        {showCoreAndOrbits && (
          <div
            ref={coreRef}
            className="forge-core"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: coreSize,
              height: coreSize,
              marginLeft: -coreSize / 2,
              marginTop: -coreSize / 2,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(240,245,255,0.95) 35%, rgba(180,200,255,0.6) 70%, transparent 100%)",
              transform: "translate(-50%, -50%) scale(1)",
              // Inline baseline glow so the very first paint (before the rAF
              // loop's first tick) already shows the bright halo.
              boxShadow:
                `0 0 50px 22px ${displayColor}96, ` +
                `0 0 100px rgba(255,255,255,0.55)`,
              willChange: "transform, box-shadow",
              // Glow + scale are then mutated imperatively by the rAF loop
              // so taps never trigger React re-renders or paint thrash.
            }}
            data-testid="forge-core"
          />
        )}

        {/* ─── FLASH (brief white burst at 100%) ─────────────────────── */}
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
              willChange: "opacity, transform",
            }}
          />
        )}

        {/* ─── CONVERGING PARTICLES (during dramatic 2s wait) ───────── */}
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
                    // The keyframe reads --angle and --r to fly each particle
                    // from its assigned outer-ring slot toward the center.
                    ["--angle" as string]: `${p.angle}deg`,
                    ["--r" as string]: `${p.r}px`,
                    animationDelay: `${p.delay}ms`,
                    willChange: "transform, opacity",
                  } as React.CSSProperties}
                />
              );
            })}
          </div>
        )}

        {/* ─── REVEALED PLANET (slow self-rotation, fade-in) ─────────── */}
        {showPlanet && (
          <div
            className="forge-reveal"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: planetSize,
              height: planetSize,
              marginLeft: -planetSize / 2,
              marginTop: -planetSize / 2,
              filter: `drop-shadow(0 0 ${planetSize * 0.18}px ${displayColor})`,
              willChange: "transform, opacity",
            }}
            data-testid="lab-planet-orb"
          >
            <PlanetOrb planet={orbPlanet} size={planetSize} animate={true} />
          </div>
        )}

        {/* Fragment layer — populated imperatively to avoid React re-renders on rapid taps */}
        <div
          ref={fragmentLayerRef}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
      </div>

      {/* Progress label/bar — only meaningful during the build phase */}
      {forgePhase === "idle" && (
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
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
                willChange: "width",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
