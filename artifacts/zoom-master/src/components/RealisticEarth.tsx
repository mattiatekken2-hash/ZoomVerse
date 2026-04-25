import { memo, useId } from "react";

interface RealisticEarthProps {
  size?: number;
  spin?: boolean;
  showAtmosphere?: boolean;
  glow?: boolean;
}

const CONTINENT_PATHS = [
  "M 10,17 Q 16,12 26,13 L 36,15 L 44,20 Q 48,24 47,30 L 44,36 L 38,40 L 30,42 Q 24,42 20,38 L 16,32 L 12,26 Z",
  "M 38,38 L 42,42 L 44,46 L 42,50 L 38,46 Z",
  "M 42,50 Q 47,50 50,55 L 53,64 Q 53,72 49,78 L 44,82 Q 39,80 37,73 L 35,64 L 36,57 Z",
  "M 70,9 Q 78,8 82,13 L 81,18 L 76,22 L 71,20 Z",
  "M 86,17 L 96,16 Q 102,18 102,23 L 100,28 L 92,29 L 87,26 Z",
  "M 92,32 Q 100,30 108,32 L 112,35 L 116,40 L 116,48 L 113,58 L 108,66 L 102,72 L 96,68 L 92,60 L 90,50 L 90,40 Z",
  "M 110,30 L 116,30 L 120,34 L 119,40 L 113,40 Z",
  "M 110,12 Q 130,9 150,12 L 168,15 Q 178,19 180,26 L 176,34 L 165,38 L 150,38 L 134,34 L 122,30 L 116,24 Z",
  "M 137,38 L 144,38 L 146,46 L 142,52 L 138,46 Z",
  "M 152,42 Q 162,40 170,44 L 174,48 L 170,52 L 161,53 L 154,51 Z",
  "M 175,52 L 181,51 L 182,55 L 176,55 Z",
  "M 168,60 Q 180,58 190,62 L 194,68 L 188,72 L 178,72 L 170,68 Z",
  "M 196,68 L 199,67 L 199,72 L 196,72 Z",
] as const;

function ContinentLayer({ offsetX }: { offsetX: number }) {
  return (
    <g transform={`translate(${offsetX} 0)`}>
      {CONTINENT_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}

function RealisticEarthBase({
  size = 80,
  spin = true,
  showAtmosphere = true,
  glow = true,
}: RealisticEarthProps) {
  const rid = useId().replace(/[:]/g, "");
  const oceanId = `ocean-${rid}`;
  const hiId = `hi-${rid}`;
  const shId = `sh-${rid}`;
  const glowId = `glow-${rid}`;
  const clipId = `clip-${rid}`;
  const continentGradId = `cg-${rid}`;

  const dur = `${Math.max(28, Math.round(size * 0.55))}s`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={oceanId} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#a8d0ff" />
          <stop offset="30%" stopColor="#3b82f6" />
          <stop offset="68%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#08153f" />
        </radialGradient>
        <linearGradient id={continentGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2bb265" />
          <stop offset="55%" stopColor="#1e8a4a" />
          <stop offset="100%" stopColor="#155f33" />
        </linearGradient>
        <radialGradient id={hiId} cx="28%" cy="22%" r="55%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id={shId} cx="78%" cy="82%" r="85%">
          <stop offset="38%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(2,4,18,0.78)" />
        </radialGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="86%" stopColor="rgba(120,170,255,0)" />
          <stop offset="92%" stopColor="rgba(120,170,255,0.55)" />
          <stop offset="100%" stopColor="rgba(120,170,255,0)" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="49" />
        </clipPath>
      </defs>

      {/* Atmosphere halo (outside the clip so it bleeds past the disc) */}
      {glow && (
        <circle cx="50" cy="50" r="50" fill={`url(#${glowId})`} />
      )}

      <g clipPath={`url(#${clipId})`}>
        {/* Ocean base */}
        <circle cx="50" cy="50" r="49" fill={`url(#${oceanId})`} />

        {/* Continents — a 200-wide strip drawn twice, animated to translate
            -100 over `dur` seconds for a seamless rotation. The visible
            window (the circle, ~100 wide) always shows real continents
            sliding past, like a globe spinning. */}
        <g fill={`url(#${continentGradId})`}>
          <g>
            <ContinentLayer offsetX={-100} />
            <ContinentLayer offsetX={0} />
            <ContinentLayer offsetX={100} />
            {spin && (
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to="-100 0"
                dur={dur}
                repeatCount="indefinite"
              />
            )}
          </g>
        </g>

        {/* Polar ice caps (static, on top of continents) */}
        <path d="M 0,0 L 100,0 L 100,9 Q 50,13 0,9 Z" fill="rgba(245,250,255,0.85)" />
        <path d="M 0,92 Q 50,88 100,92 L 100,100 L 0,100 Z" fill="rgba(235,245,255,0.78)" />

        {/* Subtle cloud bands */}
        <ellipse cx="38" cy="22" rx="30" ry="2.6" fill="rgba(255,255,255,0.42)" />
        <ellipse cx="64" cy="74" rx="22" ry="2.2" fill="rgba(255,255,255,0.38)" />

        {/* Sphere highlight */}
        <circle cx="50" cy="50" r="49" fill={`url(#${hiId})`} />
        {/* Terminator / shadow */}
        <circle cx="50" cy="50" r="49" fill={`url(#${shId})`} />
      </g>

      {/* Crisp atmospheric rim */}
      {showAtmosphere && (
        <circle
          cx="50"
          cy="50"
          r="49.4"
          fill="none"
          stroke="rgba(160,200,255,0.7)"
          strokeWidth="0.55"
        />
      )}
    </svg>
  );
}

export const RealisticEarth = memo(RealisticEarthBase);
