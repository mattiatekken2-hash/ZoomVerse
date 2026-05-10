import { memo, useMemo } from "react";
import type { Planet } from "../hooks/useGameState";

interface Props {
  planets: Planet[];
  whitePlanets?: Planet[];
  earthPlanets?: Planet[];
  blackPlanets?: Planet[];
  sunCount?: number;
}

const ORBIT_CAPACITIES = [4, 6, 8, 10, 12, 14];
const ORBIT_RADII = [78, 122, 168, 216, 266, 318];
const ORBIT_PERIODS = [42, 60, 80, 100, 124, 150];

interface Placement {
  planet: Planet;
  orbit: number;
  index: number;
  capacity: number;
  radius: number;
  period: number;
  size: number;
  startAngle: number;
  reverse: boolean;
}

function distribute(all: Planet[]): Placement[] {
  const out: Placement[] = [];
  let cursor = 0;
  for (let o = 0; o < ORBIT_CAPACITIES.length && cursor < all.length; o++) {
    const cap = ORBIT_CAPACITIES[o]!;
    const radius = ORBIT_RADII[o]!;
    const period = ORBIT_PERIODS[o]!;
    const size = o === 0 ? 22 : o === 1 ? 20 : o <= 3 ? 18 : 16;
    const reverse = o % 2 === 1;
    const taken = Math.min(cap, all.length - cursor);
    for (let i = 0; i < taken; i++) {
      const planet = all[cursor + i]!;
      out.push({
        planet,
        orbit: o,
        index: i,
        capacity: cap,
        radius,
        period,
        size,
        startAngle: (i * 360) / cap,
        reverse,
      });
    }
    cursor += taken;
  }
  return out;
}

function PlanetDot({ p }: { p: Placement }) {
  const c = p.planet.color;
  const g = p.planet.glowColor || c;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        animation: `lsbOrbit${p.orbit} ${p.period}s linear infinite`,
        animationDirection: p.reverse ? "reverse" : "normal",
        animationDelay: `${-(p.startAngle / 360) * p.period}s`,
        willChange: "transform",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: p.radius,
          top: -p.size / 2,
          width: p.size,
          height: p.size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 32% 30%, #fff 0%, ${c} 38%, ${c} 60%, rgba(0,0,0,0.45) 100%)`,
          boxShadow: `0 0 ${Math.round(p.size * 0.55)}px ${g}88, 0 0 ${Math.round(p.size * 0.25)}px ${g}cc inset`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function LabSolarBackgroundImpl({ planets, whitePlanets = [], earthPlanets = [], blackPlanets = [], sunCount = 0 }: Props) {
  // Combine inventories — only "owned" planets (not listed on market) so the
  // background reflects what the user actually has at home.
  const all = useMemo(() => {
    const merged = [...planets, ...whitePlanets, ...earthPlanets, ...blackPlanets].filter(
      (p) => !p.isListedInMarket,
    );
    // Stable order by createdAt so newly crafted planets always land on the
    // outermost free slot instead of reshuffling the whole system.
    return merged.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [planets, whitePlanets, earthPlanets, blackPlanets]);

  const placements = useMemo(() => distribute(all), [all]);
  const visibleOrbits = placements.length === 0 ? 0 : (placements[placements.length - 1]!.orbit + 1);

  // Pre-compute the orbit keyframes inline so each ring spins at its own
  // angular speed without any JS animation loop.
  const keyframes = useMemo(
    () =>
      ORBIT_PERIODS.map(
        (_, i) =>
          `@keyframes lsbOrbit${i} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`,
      ).join("\n"),
    [],
  );

  const sunSize = sunCount > 0 ? 64 : 56;
  const sunGlow = sunCount > 0 ? "#ffd95a" : "#ffb347";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <style>{`
        ${keyframes}
        @keyframes lsbSunPulse {
          0%, 100% { box-shadow: 0 0 28px ${sunGlow}cc, 0 0 56px ${sunGlow}55, 0 0 90px ${sunGlow}33; }
          50%      { box-shadow: 0 0 40px ${sunGlow}ee, 0 0 80px ${sunGlow}77, 0 0 120px ${sunGlow}44; }
        }
        @keyframes lsbDashDrift {
          to { stroke-dashoffset: -40; }
        }
      `}</style>

      {/* Anchor everything around the LAB visual centre. We pull the centre
          slightly above viewport mid-line because the LAB content (anvil,
          progress bar) sits in the upper-mid; the sun goes behind it. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 0,
          height: 0,
        }}
      >
        {/* Dashed orbit rings (SVG) — only render rings that are actually used
            so empty users don't see lonely circles. */}
        {visibleOrbits > 0 && (
          <svg
            width={ORBIT_RADII[Math.min(visibleOrbits - 1, ORBIT_RADII.length - 1)]! * 2 + 40}
            height={ORBIT_RADII[Math.min(visibleOrbits - 1, ORBIT_RADII.length - 1)]! * 2 + 40}
            style={{
              position: "absolute",
              left: -(ORBIT_RADII[Math.min(visibleOrbits - 1, ORBIT_RADII.length - 1)]! + 20),
              top: -(ORBIT_RADII[Math.min(visibleOrbits - 1, ORBIT_RADII.length - 1)]! + 20),
              opacity: 0.35,
            }}
          >
            {ORBIT_RADII.slice(0, visibleOrbits).map((r, i) => (
              <circle
                key={i}
                cx="50%"
                cy="50%"
                r={r}
                fill="none"
                stroke={i % 2 === 0 ? "#7fa9ff" : "#b58cff"}
                strokeWidth={1}
                strokeDasharray="4 6"
                style={{
                  animation: `lsbDashDrift ${30 + i * 8}s linear infinite`,
                  animationDirection: i % 2 === 0 ? "normal" : "reverse",
                }}
              />
            ))}
          </svg>
        )}

        {/* Central sun */}
        <div
          style={{
            position: "absolute",
            left: -sunSize / 2,
            top: -sunSize / 2,
            width: sunSize,
            height: sunSize,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, #fff7c0 0%, #ffd95a 35%, #ff9a2b 70%, #c54a05 100%)`,
            animation: "lsbSunPulse 4.2s ease-in-out infinite",
            opacity: 0.92,
          }}
        />

        {/* Planets on orbits */}
        {placements.map((p) => (
          <PlanetDot key={p.planet.id} p={p} />
        ))}
      </div>
    </div>
  );
}

export const LabSolarBackground = memo(LabSolarBackgroundImpl);
