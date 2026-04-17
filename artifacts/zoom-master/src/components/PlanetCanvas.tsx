import { useEffect, useRef, useState } from "react";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  isRevealing?: boolean;
}

const DEFAULT_COLOR = "#4facfe";
const GREY = "#8892b0";

const LAB_GRADIENTS: Record<string, string[]> = {
  "#8892b0": ["#d0d4e0", "#b0b8cc", "#8892b0", "#6b7394", "#4a5270"],
  "#4facfe": ["#e0f0ff", "#a0d4ff", "#4facfe", "#2d8bdb", "#1a5fa0"],
  "#c471ed": ["#f0d4ff", "#d898f0", "#c471ed", "#a050cc", "#7a30a0"],
  "#ffd700": ["#fff8e1", "#ffe082", "#ffd700", "#e6b800", "#b8860b"],
};

function getLabStops(color: string): string[] {
  return LAB_GRADIENTS[color] || [
    lighten(color, 0.5), lighten(color, 0.25), color, darken(color, 0.2), darken(color, 0.4)
  ];
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

interface Fragment {
  id: number;
  startX: number;
  startY: number;
  size: number;
  color: string;
  duration: number;
}

interface CrackPath {
  d: string;
  delay: number;
  duration: number;
}

function generateCracks(seed: number): CrackPath[] {
  const rng = (() => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();
  const paths: CrackPath[] = [];
  const lineCount = 7;
  for (let i = 0; i < lineCount; i++) {
    const cx = 50, cy = 50;
    const angle = (i / lineCount) * Math.PI * 2 + rng() * 0.6;
    let x = cx + Math.cos(angle) * (8 + rng() * 6);
    let y = cy + Math.sin(angle) * (8 + rng() * 6);
    let d = `M ${cx + Math.cos(angle) * 4} ${cy + Math.sin(angle) * 4} L ${x} ${y}`;
    const segs = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < segs; s++) {
      const branchAngle = angle + (rng() - 0.5) * 1.4;
      const len = 6 + rng() * 8;
      const nx = x + Math.cos(branchAngle) * len;
      const ny = y + Math.sin(branchAngle) * len;
      // Clamp inside circle
      const dist = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);
      if (dist > 46) break;
      d += ` L ${nx} ${ny}`;
      x = nx; y = ny;
    }
    paths.push({ d, delay: rng() * 0.6, duration: 1.2 + rng() * 0.8 });
  }
  return paths;
}

const CRACK_PATHS = generateCracks(42);

function Planet({
  color,
  size,
  pct,
  fractured,
  fragments,
  bumpKey,
}: {
  color: string;
  size: number;
  pct: number;
  fractured: boolean;
  fragments: Fragment[];
  bumpKey: number;
}) {
  const [s0, s1, s2, s3, s4] = getLabStops(color);
  const planetSize = size * (0.14 + pct * 0.86);
  const showNebula = pct < 0.04 && !fractured;
  const showPlanet = pct > 0 || fractured;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Primordial Nebula (only at start) */}
      {showNebula && (
        <>
          <div
            style={{
              position: "absolute",
              width: size * 0.95,
              height: size * 0.95,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(200,210,255,0.35) 0%, rgba(140,160,220,0.18) 30%, rgba(80,100,180,0.06) 55%, transparent 75%)",
              filter: `blur(${size * 0.06}px)`,
              animation: "nebulaPulse 2.6s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(220,230,255,0.7) 0%, rgba(170,190,240,0.25) 40%, transparent 75%)",
              filter: `blur(${size * 0.04}px)`,
              animation: "nebulaPulse 1.8s ease-in-out infinite reverse",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: size * 0.16,
              height: size * 0.16,
              borderRadius: "50%",
              background: "radial-gradient(circle, #ffffff 0%, rgba(220,230,255,0.7) 40%, transparent 70%)",
              filter: `blur(${size * 0.012}px)`,
              animation: "primordialCore 1.4s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          {/* Drifting sparks */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "#cfd8ff",
                boxShadow: "0 0 8px #cfd8ff",
                opacity: 0.7,
                animation: `nebSpark${i % 3} ${2.4 + (i % 3) * 0.6}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
                pointerEvents: "none",
              }}
            />
          ))}
        </>
      )}

      {/* Planet (Farm style) */}
      {showPlanet && (
        <div
          key={`planet-${bumpKey}`}
          style={{
            position: "absolute",
            width: planetSize,
            height: planetSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            animation: "planetBump 0.32s ease-out",
          }}
        >
          {/* Outer glow */}
          <div
            style={{
              position: "absolute",
              width: planetSize * 2.2,
              height: planetSize * 2.2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}55 0%, ${color}20 40%, transparent 70%)`,
              filter: `blur(${planetSize * 0.2}px)`,
              animation: "planet-breathe 3s ease-in-out infinite alternate",
              pointerEvents: "none",
              opacity: Math.min(1, 0.3 + pct),
            }}
          />
          {/* Main sphere — matches PlanetOrb */}
          <div
            style={{
              width: planetSize,
              height: planetSize,
              borderRadius: "50%",
              position: "relative",
              overflow: "hidden",
              background: `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
              boxShadow: `
                0 0 ${planetSize * 0.4}px ${color}99,
                0 0 ${planetSize * 0.8}px ${color}44,
                0 0 ${planetSize * 1.3}px ${color}18,
                inset -${planetSize * 0.06}px -${planetSize * 0.04}px ${planetSize * 0.12}px rgba(0,0,0,0.25)
              `,
              animation: "planet-rotate 10s linear infinite",
            }}
          >
            {/* Highlight */}
            <div
              style={{
                position: "absolute",
                top: "8%",
                left: "12%",
                width: "38%",
                height: "38%",
                borderRadius: "50%",
                background: "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 50%, transparent 75%)",
                filter: `blur(${planetSize * 0.03}px)`,
                pointerEvents: "none",
              }}
            />

            {/* Fracture cracks (SVG overlay) */}
            {fractured && (
              <svg
                viewBox="0 0 100 100"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  mixBlendMode: "screen",
                  pointerEvents: "none",
                }}
              >
                <defs>
                  <radialGradient id="crackMask" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="white" stopOpacity="1" />
                    <stop offset="80%" stopColor="white" stopOpacity="1" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                  <mask id="circleMask">
                    <circle cx="50" cy="50" r="50" fill="url(#crackMask)" />
                  </mask>
                </defs>
                <g mask="url(#circleMask)">
                  {CRACK_PATHS.map((p, i) => (
                    <path
                      key={i}
                      d={p.d}
                      stroke={color}
                      strokeWidth={0.7}
                      fill="none"
                      strokeLinecap="round"
                      style={{
                        filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 4px ${color})`,
                        animation: `crackFlicker ${p.duration}s ease-in-out infinite`,
                        animationDelay: `${p.delay}s`,
                      }}
                    />
                  ))}
                </g>
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Fragments (incoming particles) */}
      {fragments.map((f) => (
        <div
          key={f.id}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: f.size,
            height: f.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${f.color} 0%, ${f.color}aa 50%, transparent 80%)`,
            boxShadow: `0 0 ${f.size * 1.5}px ${f.color}, 0 0 ${f.size * 3}px ${f.color}66`,
            transform: `translate(${f.startX}px, ${f.startY}px)`,
            animation: `fragmentFly ${f.duration}s cubic-bezier(0.5, 0, 0.85, 0.3) forwards`,
            pointerEvents: "none",
            ["--fx" as never]: `${f.startX}px`,
            ["--fy" as never]: `${f.startY}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function PlanetCanvas({ onPunch, progress, goal, planetColor, isRevealing = false }: PlanetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(260);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [bumpKey, setBumpKey] = useState(0);
  const lastProgressRef = useRef(progress);
  const fragIdRef = useRef(0);

  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const isPrimordial = pct < 0.04 && !isRevealing;
  const isFractured = pct >= 0.999 || isRevealing;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      setSize(Math.min(w * 0.78, h * 0.78, 340));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spawn fragments + bump on tap (progress increments)
  useEffect(() => {
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;
    if (delta <= 0) return;

    const burst = 5;
    const newFrags: Fragment[] = [];
    for (let i = 0; i < burst; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = size * (0.32 + Math.random() * 0.18);
      newFrags.push({
        id: ++fragIdRef.current,
        startX: Math.cos(angle) * dist - 4,
        startY: Math.sin(angle) * dist - 4,
        size: 6 + Math.random() * 4,
        color,
        duration: 0.45 + Math.random() * 0.2,
      });
    }
    setFragments((prev) => [...prev, ...newFrags]);
    setBumpKey((k) => k + 1);

    const maxDur = Math.max(...newFrags.map((f) => f.duration)) * 1000 + 50;
    const ids = new Set(newFrags.map((f) => f.id));
    const t = setTimeout(() => {
      setFragments((prev) => prev.filter((f) => !ids.has(f.id)));
    }, maxDur);
    return () => clearTimeout(t);
  }, [progress, size, color]);

  const accent = isFractured ? color : isPrimordial ? "rgba(180,200,255,0.85)" : color;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
        className="flex items-center justify-center"
        onClick={onPunch}
        style={{ width: size, height: size, cursor: onPunch ? "pointer" : "default", touchAction: "manipulation" }}
        data-testid="planet-wrap"
      >
        <Planet
          color={color === GREY ? "#8892b0" : color}
          size={size}
          pct={pct}
          fractured={isFractured}
          fragments={fragments}
          bumpKey={bumpKey}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            {isPrimordial ? "Primordial Light" : isFractured ? "Core Fractured" : "Forging Mass"}
          </span>
          <span className="font-bold" style={{ color: accent, textShadow: isFractured ? `0 0 10px ${color}` : "none" }}>
            {progress}/{goal}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${pct * 100}%`,
              background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 0 10px ${accent}`,
              transition: "width 0.25s ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
