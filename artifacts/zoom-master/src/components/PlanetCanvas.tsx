import { useEffect, useRef, useState, useMemo } from "react";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  isRevealing?: boolean;
}

const DEFAULT_COLOR = "#4facfe";
const PRIMORDIAL_COLOR = "#9aa6c4";
const FRACTURE_THRESHOLD = 0.85;

const LAB_GRADIENTS: Record<string, string[]> = {
  "#8892b0": ["#d0d4e0", "#b0b8cc", "#8892b0", "#6b7394", "#4a5270"],
  "#4facfe": ["#e0f0ff", "#a0d4ff", "#4facfe", "#2d8bdb", "#1a5fa0"],
  "#c471ed": ["#f0d4ff", "#d898f0", "#c471ed", "#a050cc", "#7a30a0"],
  "#ffd700": ["#fff8e1", "#ffe082", "#ffd700", "#e6b800", "#b8860b"],
  "#9aa6c4": ["#dde3f0", "#bcc4dc", "#9aa6c4", "#6e7898", "#3e4660"],
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
  angle: number;
  distance: number;
  size: number;
  duration: number;
}

function PrimordialSpark({ size }: { size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(154,166,196,0.18) 0%, rgba(196,113,237,0.08) 35%, transparent 70%)",
          filter: `blur(${size * 0.18}px)`,
          animation: "primordial-breathe 3.2s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: size * 0.9,
          height: size * 0.9,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(220,225,240,0.35) 0%, rgba(154,166,196,0.18) 30%, rgba(79,172,254,0.08) 55%, transparent 80%)",
          filter: `blur(${size * 0.04}px)`,
          animation: "primordial-breathe 2.4s ease-in-out infinite reverse",
        }}
      />
      <div
        style={{
          position: "relative",
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: "50%",
          background: "radial-gradient(circle, #fff 0%, #d0d8e8 40%, rgba(154,166,196,0.6) 75%, transparent 100%)",
          boxShadow: `0 0 ${size * 0.25}px rgba(255,255,255,0.65), 0 0 ${size * 0.5}px rgba(154,166,196,0.45), 0 0 ${size * 0.9}px rgba(79,172,254,0.18)`,
          animation: "spark-pulse 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function CrackOverlay({ color, intensity }: { color: string; intensity: number }) {
  // 7 lightning-style cracks emanating from center
  const cracks = useMemo(
    () => [
      "M50,50 L82,18 L78,30 L92,10",
      "M50,50 L92,42 L80,46 L98,38",
      "M50,50 L78,82 L72,72 L88,90",
      "M50,50 L20,86 L30,76 L8,94",
      "M50,50 L8,52 L20,46 L2,40",
      "M50,50 L18,18 L28,30 L8,8",
      "M50,50 L52,8 L46,22 L40,2",
    ],
    []
  );
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: intensity,
        mixBlendMode: "screen",
        filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 12px ${color})`,
      }}
    >
      {cracks.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={0.8}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            animation: `crack-pulse 1.6s ease-in-out infinite`,
            animationDelay: `${i * 0.12}s`,
            opacity: 0.9,
          }}
        />
      ))}
    </svg>
  );
}

function DynamicSphere({
  color,
  size,
  scale,
  isRevealing,
  fractureIntensity,
  pulseKey,
}: {
  color: string;
  size: number;
  scale: number;
  isRevealing: boolean;
  fractureIntensity: number;
  pulseKey: number;
}) {
  const [s0, s1, s2, s3, s4] = getLabStops(color);
  const realSize = size * scale;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.18s ease-out",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: realSize * 2.2,
          height: realSize * 2.2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}55 0%, ${color}22 40%, transparent 70%)`,
          filter: `blur(${realSize * 0.15}px)`,
          transition: "all 0.25s ease-out",
        }}
      />
      <div
        key={`pulse-${pulseKey}`}
        className={isRevealing ? "reveal-in" : ""}
        style={{
          position: "relative",
          width: realSize,
          height: realSize,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
          boxShadow: `
            0 0 ${realSize * 0.4}px ${color}99,
            0 0 ${realSize * 0.8}px ${color}44,
            0 0 ${realSize * 1.3}px ${color}18,
            inset -${realSize * 0.06}px -${realSize * 0.04}px ${realSize * 0.12}px rgba(0,0,0,0.25)
          `,
          transition: "width 0.35s cubic-bezier(0.34,1.56,0.64,1), height 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease-out",
          animation: pulseKey > 0 ? "tap-pulse 0.32s ease-out" : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "8%",
            left: "12%",
            width: "38%",
            height: "38%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 50%, transparent 75%)",
            filter: `blur(${realSize * 0.03}px)`,
            pointerEvents: "none",
          }}
        />
        {fractureIntensity > 0 && <CrackOverlay color={color} intensity={fractureIntensity} />}
      </div>
    </div>
  );
}

export function PlanetCanvas({ onPunch, progress, goal, planetColor, isRevealing = false }: PlanetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(220);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [pulseKey, setPulseKey] = useState(0);
  const fragIdRef = useRef(0);
  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      setSize(Math.min(w * 0.72, h * 0.72, 300));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const phase = isRevealing ? "complete" : progress === 0 ? "primordial" : pct >= FRACTURE_THRESHOLD ? "fracturing" : "building";
  const scale = isRevealing ? 1 : 0.12 + pct * 0.88;
  const fractureIntensity = phase === "fracturing"
    ? Math.min(1, (pct - FRACTURE_THRESHOLD) / (1 - FRACTURE_THRESHOLD))
    : phase === "complete"
    ? 0
    : 0;

  const sphereColor = phase === "primordial" ? PRIMORDIAL_COLOR : color;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onPunch) return;
    onPunch();
    setPulseKey((k) => k + 1);
    const newFrags: Fragment[] = Array.from({ length: 6 }, () => {
      fragIdRef.current += 1;
      return {
        id: fragIdRef.current,
        angle: Math.random() * 360,
        distance: 0.55 + Math.random() * 0.35,
        size: 4 + Math.random() * 5,
        duration: 600 + Math.random() * 250,
      };
    });
    setFragments((prev) => [...prev, ...newFrags]);
    const maxDur = Math.max(...newFrags.map((f) => f.duration));
    setTimeout(() => {
      const ids = new Set(newFrags.map((f) => f.id));
      setFragments((prev) => prev.filter((f) => !ids.has(f.id)));
    }, maxDur + 50);
  };

  const phaseLabel = phase === "primordial"
    ? "PRIMORDIAL LIGHT"
    : phase === "fracturing"
    ? "FRACTURING..."
    : phase === "complete"
    ? "MATERIALIZED"
    : "FORGING";

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
        className="flex items-center justify-center cursor-pointer relative"
        onClick={handleClick}
        style={{ width: size, height: size }}
        data-testid="planet-wrap"
      >
        {phase === "primordial" ? (
          <PrimordialSpark size={size} />
        ) : (
          <DynamicSphere
            color={sphereColor}
            size={size}
            scale={scale}
            isRevealing={isRevealing}
            fractureIntensity={fractureIntensity}
            pulseKey={pulseKey}
          />
        )}

        {/* Fragment particles flying inward on tap */}
        {fragments.map((f) => {
          const r = (size / 2) * f.distance;
          const dx = Math.cos((f.angle * Math.PI) / 180) * r;
          const dy = Math.sin((f.angle * Math.PI) / 180) * r;
          return (
            <div
              key={f.id}
              style={{
                position: "absolute",
                width: f.size,
                height: f.size,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color} 0%, ${color}88 50%, transparent 80%)`,
                boxShadow: `0 0 ${f.size * 1.6}px ${color}cc`,
                left: "50%",
                top: "50%",
                transform: `translate(${dx}px, ${dy}px)`,
                animation: `fragment-fly ${f.duration}ms cubic-bezier(0.55,0,0.55,0.95) forwards`,
                ["--dx" as string]: `${dx}px`,
                ["--dy" as string]: `${dy}px`,
                pointerEvents: "none",
              }}
            />
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span
            className="font-semibold tracking-wider uppercase"
            style={{
              color: phase === "primordial"
                ? "rgba(255,255,255,0.32)"
                : phase === "fracturing"
                ? color
                : "rgba(255,255,255,0.4)",
              textShadow: phase === "fracturing" ? `0 0 8px ${color}` : "none",
            }}
          >
            {phaseLabel}
          </span>
          <span className="font-bold" style={{ color: phase === "primordial" ? "rgba(255,255,255,0.4)" : color }}>
            {progress}/{goal}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${pct * 100}%`,
              background: `linear-gradient(90deg, ${sphereColor}, ${sphereColor}cc)`,
              boxShadow: `0 0 10px ${sphereColor}`,
              transition: "width 0.25s ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
