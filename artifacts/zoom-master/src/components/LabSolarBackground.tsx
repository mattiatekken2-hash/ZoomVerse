import { memo, useMemo } from "react";
import type { Planet } from "../hooks/useGameState";

interface Props {
  planets: Planet[];
  whitePlanets?: Planet[];
  earthPlanets?: Planet[];
  blackPlanets?: Planet[];
  sunCount?: number;
}

// Compact mini-system: 3 orbits, max 15 visible planets. Small enough to
// fit in the top-left corner without disturbing the LAB UI and cheap to
// animate (only CSS transforms — no per-frame JS).
const ORBIT_CAPACITIES = [3, 5, 7];
const ORBIT_RADII = [13, 22, 31];
const ORBIT_PERIODS = [22, 34, 48];
const PLANET_SIZES = [4, 4, 3];

const BOX = 76;
const CENTER = BOX / 2;

interface Placement {
  planet: Planet;
  orbit: number;
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
    const size = PLANET_SIZES[o]!;
    const reverse = o % 2 === 1;
    const taken = Math.min(cap, all.length - cursor);
    for (let i = 0; i < taken; i++) {
      out.push({
        planet: all[cursor + i]!,
        orbit: o,
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
        left: CENTER,
        top: CENTER,
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
          background: `radial-gradient(circle at 32% 30%, #fff 0%, ${c} 55%, rgba(0,0,0,0.5) 100%)`,
          boxShadow: `0 0 ${p.size}px ${g}aa`,
        }}
      />
    </div>
  );
}

function LabSolarBackgroundImpl({ planets, whitePlanets = [], earthPlanets = [], blackPlanets = [], sunCount = 0 }: Props) {
  const all = useMemo(() => {
    const merged = [...planets, ...whitePlanets, ...earthPlanets, ...blackPlanets].filter(
      (p) => !p.isListedInMarket,
    );
    return merged.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [planets, whitePlanets, earthPlanets, blackPlanets]);

  const placements = useMemo(() => distribute(all), [all]);
  const visibleOrbits = placements.length === 0 ? 0 : (placements[placements.length - 1]!.orbit + 1);

  const keyframes = useMemo(
    () =>
      ORBIT_PERIODS.map(
        (_, i) =>
          `@keyframes lsbOrbit${i} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`,
      ).join("\n"),
    [],
  );

  const sunSize = sunCount > 0 ? 9 : 8;
  const sunGlow = sunCount > 0 ? "#ffd95a" : "#ffb347";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "50%",
        top: 102,
        width: BOX,
        height: BOX,
        marginLeft: -BOX / 2,
        zIndex: 1,
        pointerEvents: "none",
        opacity: 0.85,
      }}
    >
      <style>{`
        ${keyframes}
        @keyframes lsbSunPulseMini {
          0%, 100% { box-shadow: 0 0 6px ${sunGlow}cc, 0 0 12px ${sunGlow}55; }
          50%      { box-shadow: 0 0 9px ${sunGlow}ee, 0 0 18px ${sunGlow}77; }
        }
      `}</style>

      {/* Dashed orbits — pure SVG, no per-frame animation, very cheap. */}
      {visibleOrbits > 0 && (
        <svg
          width={BOX}
          height={BOX}
          style={{ position: "absolute", left: 0, top: 0, opacity: 0.5 }}
        >
          {ORBIT_RADII.slice(0, visibleOrbits).map((r, i) => (
            <circle
              key={i}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke={i % 2 === 0 ? "#7fa9ff" : "#b58cff"}
              strokeWidth={0.6}
              strokeDasharray="2 3"
            />
          ))}
        </svg>
      )}

      {/* Sun */}
      <div
        style={{
          position: "absolute",
          left: CENTER - sunSize / 2,
          top: CENTER - sunSize / 2,
          width: sunSize,
          height: sunSize,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #fff7c0 0%, #ffd95a 45%, #ff9a2b 80%, #c54a05 100%)`,
          animation: "lsbSunPulseMini 4.2s ease-in-out infinite",
        }}
      />

      {placements.map((p) => (
        <PlanetDot key={p.planet.id} p={p} />
      ))}
    </div>
  );
}

export const LabSolarBackground = memo(LabSolarBackgroundImpl);
