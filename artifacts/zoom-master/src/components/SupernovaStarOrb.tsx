import { memo } from "react";

interface Props {
  size?: number;
  spin?: boolean;
  glow?: boolean;
  color?: string;
}

function SupernovaStarOrbBase({ size = 48, spin = true, glow = true, color: _color }: Props) {
  const px = size;
  const u = px / 24;
  const cx = 12;
  const cy = 12;
  const points: Array<{ x: number; y: number; w: number; h: number; c: string }> = [
    { x: cx,     y: cy - 6, w: 1, h: 2, c: "#fff7c2" },
    { x: cx - 1, y: cy - 5, w: 3, h: 1, c: "#ffd700" },
    { x: cx - 1, y: cy - 4, w: 3, h: 1, c: "#facc15" },
    { x: cx - 5, y: cy,     w: 2, h: 1, c: "#fff7c2" },
    { x: cx - 4, y: cy - 1, w: 1, h: 3, c: "#ffd700" },
    { x: cx - 3, y: cy - 1, w: 1, h: 3, c: "#facc15" },
    { x: cx + 4, y: cy,     w: 2, h: 1, c: "#fff7c2" },
    { x: cx + 3, y: cy - 1, w: 1, h: 3, c: "#ffd700" },
    { x: cx + 2, y: cy - 1, w: 1, h: 3, c: "#facc15" },
    { x: cx,     y: cy + 4, w: 1, h: 2, c: "#fff7c2" },
    { x: cx - 1, y: cy + 3, w: 3, h: 1, c: "#ffd700" },
    { x: cx - 1, y: cy + 2, w: 3, h: 1, c: "#facc15" },
    { x: cx - 1, y: cy - 1, w: 3, h: 3, c: "#fff7c2" },
    { x: cx,     y: cy,     w: 1, h: 1, c: "#ffffff" },
    { x: cx - 2, y: cy - 2, w: 1, h: 1, c: "#fbbf24" },
    { x: cx + 1, y: cy - 2, w: 1, h: 1, c: "#fbbf24" },
    { x: cx - 2, y: cy + 1, w: 1, h: 1, c: "#fbbf24" },
    { x: cx + 1, y: cy + 1, w: 1, h: 1, c: "#fbbf24" },
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        animation: spin ? "supernovaSpin 18s linear infinite" : undefined,
        filter: glow ? "drop-shadow(0 0 2px rgba(255,215,0,0.75))" : undefined,
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes supernovaSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes supernovaTwinkle {
          0%, 100% { opacity: 0.85; }
          50%      { opacity: 1; }
        }
      `}</style>
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        shapeRendering="crispEdges"
        style={{ animation: "supernovaTwinkle 1.6s ease-in-out infinite" }}
      >
        {points.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.c} />
        ))}
      </svg>
      <div style={{ display: "none" }}>{u}</div>
    </div>
  );
}

export const SupernovaStarOrb = memo(SupernovaStarOrbBase);
