import { memo } from "react";
import type { ReactNode } from "react";
import type { Planet } from "../hooks/useGameState";
import { PlanetOrb } from "./PlanetOrb";

interface ItemOrbProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
  /** Accepted for signature parity with PlanetOrb; items are not float-graded. */
  displayFloat?: number;
}

// ─────────────────────────────────────────────────────────────────
// 20 LAB-item glyphs. Each is the inner geometry of a 24×24 viewBox,
// drawn as white strokes/fills so it reads on top of the rarity-tinted
// disc below. The disc itself (color + glow) comes from the planet's
// rarity, so an item inherits the exact palette of its rarity — only
// this glyph distinguishes it from a plain planet.
// ─────────────────────────────────────────────────────────────────
const W = "#ffffff";
const GLYPHS: Record<string, ReactNode> = {
  cat: (
    <>
      <path d="M5.5 9 L4.5 4 L9 7" />
      <path d="M18.5 9 L19.5 4 L15 7" />
      <circle cx="12" cy="13" r="6.4" />
      <circle cx="9.6" cy="12" r="0.7" fill={W} stroke="none" />
      <circle cx="14.4" cy="12" r="0.7" fill={W} stroke="none" />
      <path d="M12 14 v1.4" />
      <path d="M12 15.4 q-1.4 1 -2.8 0 M12 15.4 q1.4 1 2.8 0" />
      <path d="M4 12.5 h3 M17 12.5 h3 M4.3 14.5 h2.8 M16.9 14.5 h2.8" />
    </>
  ),
  dog: (
    <>
      <path d="M7 6.5 L4.5 12" />
      <path d="M17 6.5 L19.5 12" />
      <path d="M6.5 8 q5.5 -3.5 11 0 q1.8 6 -2 9 q-3.5 2.6 -7 0 q-3.8 -3 -2 -9 Z" />
      <circle cx="10" cy="12" r="0.8" fill={W} stroke="none" />
      <circle cx="14" cy="12" r="0.8" fill={W} stroke="none" />
      <ellipse cx="12" cy="15.4" rx="1.3" ry="1" fill={W} stroke="none" />
      <path d="M12 16.4 v1.4" />
    </>
  ),
  ufo: (
    <>
      <ellipse cx="12" cy="13" rx="9" ry="3" />
      <path d="M7.8 11.2 a4.4 3.2 0 0 1 8.4 0" />
      <circle cx="8" cy="13" r="0.6" fill={W} stroke="none" />
      <circle cx="12" cy="13.4" r="0.6" fill={W} stroke="none" />
      <circle cx="16" cy="13" r="0.6" fill={W} stroke="none" />
      <path d="M9 16 L7 21 M15 16 L17 21 M12 16.4 L12 21.5" />
    </>
  ),
  spaceship: (
    <>
      <path d="M12 2 C15 5 16 9 16 13 L8 13 C8 9 9 5 12 2 Z" />
      <circle cx="12" cy="8" r="1.7" fill={W} stroke="none" />
      <path d="M8 13 L5 17.5 L8 16.2 M16 13 L19 17.5 L16 16.2" />
      <path d="M10 16.5 q2 4.5 4 0" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.2" />
      <path d="M3 13 h18" />
      <path d="M9 20 h6 M12 16 v4" />
    </>
  ),
  helmet: (
    <>
      <circle cx="12" cy="12" r="8" />
      <rect x="6.5" y="9" width="11" height="6.5" rx="3.25" fill={W} stroke="none" opacity="0.85" />
      <path d="M12 4 V1.6 M12 1.6 h2" />
      <circle cx="14" cy="1.6" r="0.8" fill={W} stroke="none" />
    </>
  ),
  boot: (
    <>
      <path d="M9 3 L9 12.5 C9 14.5 8 15.5 6 15.5 L4 15.5 L4 19 L18.5 19 L18.5 16 C14 16 13 14.5 13 12.5 L13 3 Z" />
      <path d="M4 17 L18.5 17" />
    </>
  ),
  flag: (
    <>
      <path d="M7 3 v18" />
      <path d="M7 4 L18 4 L15 8 L18 12 L7 12 Z" />
    </>
  ),
  backpack: (
    <>
      <rect x="5.5" y="7" width="13" height="14" rx="3.5" />
      <path d="M9 7 V6 a3 3 0 0 1 6 0 V7" />
      <rect x="8.5" y="12" width="7" height="5.5" rx="1.2" fill={W} stroke="none" opacity="0.85" />
      <path d="M12 12 v5.5" stroke={planetStrokeContrast()} />
    </>
  ),
  glove: (
    <>
      <path d="M7 21 L7 11.5 a3 3 0 0 1 6 0 L13 13 q3.2 0 3.2 3.2 L16.2 21 Z" />
      <path d="M7 14 q-2.2 0 -2.2 2.1 q0 2.1 2.2 2.1" />
      <path d="M7.5 21 h8.7" />
    </>
  ),
  radar: (
    <>
      <ellipse cx="13.5" cy="9" rx="6" ry="3.4" transform="rotate(-38 13.5 9)" />
      <circle cx="13.5" cy="9" r="1" fill={W} stroke="none" />
      <path d="M11.5 11 L7 20 M16 20 H8" />
    </>
  ),
  satellite: (
    <>
      <rect x="10" y="9" width="4" height="6" rx="0.6" />
      <rect x="2.5" y="10" width="6" height="4" />
      <rect x="15.5" y="10" width="6" height="4" />
      <path d="M14 9.5 L17.5 6" />
      <circle cx="18" cy="5.5" r="1.1" fill={W} stroke="none" />
    </>
  ),
  telescope: (
    <>
      <rect x="8" y="5" width="11" height="4" rx="2" transform="rotate(32 13.5 7)" />
      <path d="M10.5 10 L8.5 20 M11.5 10.4 L13.5 20.4" />
      <path d="M7 20 h8" />
    </>
  ),
  lighthouse: (
    <>
      <path d="M9 8 L8 20 L16 20 L15 8 Z" />
      <rect x="8.3" y="5" width="7.4" height="3" />
      <path d="M9.3 2.5 h5.4 L13.5 5 H10.5 Z" />
      <path d="M8.7 12 h6.6 M8.4 16 h7.2" />
      <path d="M15.5 6 L19 5 M8.5 6 L5 5" />
    </>
  ),
  happyplanet: (
    <>
      <circle cx="12" cy="12" r="6.3" />
      <ellipse cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-20 12 12)" />
      <circle cx="10" cy="11" r="0.7" fill={W} stroke="none" />
      <circle cx="14" cy="11" r="0.7" fill={W} stroke="none" />
      <path d="M9.5 13.8 q2.5 2.6 5 0" />
    </>
  ),
  starmap: (
    <>
      <path d="M3 6 L9 4 L15 6 L21 4 L21 18 L15 20 L9 18 L3 20 Z" />
      <path d="M9 4 V18 M15 6 V20" />
      <path d="M6 9 v2 M5 10 h2 M16.5 13 v2 M15.5 14 h2" />
    </>
  ),
  alien: (
    <>
      <path d="M12 3 C7 3 5 7 5 11 C5 16 8 20 12 21 C16 20 19 16 19 11 C19 7 17 3 12 3 Z" />
      <ellipse cx="9.2" cy="11" rx="1.7" ry="2.5" fill={W} stroke="none" transform="rotate(22 9.2 11)" />
      <ellipse cx="14.8" cy="11" rx="1.7" ry="2.5" fill={W} stroke="none" transform="rotate(-22 14.8 11)" />
    </>
  ),
  human_male: (
    <>
      <circle cx="12" cy="5" r="2.6" />
      <path d="M12 7.6 v7 M12 9 L7 12 M12 9 L17 12 M12 14.6 L8.5 21 M12 14.6 L15.5 21" />
    </>
  ),
  human_female: (
    <>
      <circle cx="12" cy="5" r="2.6" />
      <path d="M12 7.6 L8 16 L16 16 Z" />
      <path d="M9.6 9 L6 12 M14.4 9 L18 12" />
      <path d="M10 16 L9 21 M14 16 L15 21" />
    </>
  ),
  dragon: (
    <>
      <path d="M4 16 C4 10 9 8 13 9 L16 5.5 L16.5 9 C19.5 10 20.5 13.5 18 16.5 L19 19.5 L15 18.2 C11.5 19.2 7 19 4 16 Z" />
      <circle cx="13" cy="12" r="0.8" fill={W} stroke="none" />
      <path d="M16 5.5 L17.5 3.5 L18.2 6.5" />
      <path d="M6 16.5 L4 18.5 M8 17.4 L7 20" />
    </>
  ),
};

// Tiny helper so the backpack pocket divider strokes in a translucent dark
// tone (keeps the pocket readable against the white fill) without importing
// a color util just for one line.
function planetStrokeContrast(): string {
  return "rgba(0,0,0,0.28)";
}

function ItemOrbImpl({ planet, size = 60, animate = true }: ItemOrbProps) {
  const c = planet.color;
  const glow = planet.glowColor || c;
  const glyph = GLYPHS[planet.itemKind ?? ""] ?? GLYPHS.cat;
  const glyphSize = size * 0.56;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Soft outer halo, rarity-tinted (mirrors PlanetOrb breathing glow). */}
      <div
        style={{
          position: "absolute",
          width: size * 1.9,
          height: size * 1.9,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c}55 0%, ${c}20 42%, transparent 70%)`,
          filter: `blur(${size * 0.2}px)`,
          animation: animate ? "planet-breathe 3s ease-in-out infinite alternate" : "none",
          pointerEvents: "none",
        }}
      />
      {/* Rarity-colored disc with rim glow. */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 38% 30%, ${c} 0%, ${c} 32%, rgba(0,0,0,0.34) 100%)`,
          boxShadow: `
            0 0 ${size * 0.34}px ${glow}99,
            0 0 ${size * 0.7}px ${glow}44,
            inset -${size * 0.06}px -${size * 0.05}px ${size * 0.12}px rgba(0,0,0,0.32),
            inset ${size * 0.05}px ${size * 0.04}px ${size * 0.1}px rgba(255,255,255,0.35)
          `,
        }}
      >
        {/* glossy top-left highlight */}
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: "13%",
            width: "36%",
            height: "36%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 55%, transparent 78%)",
            filter: `blur(${size * 0.03}px)`,
            pointerEvents: "none",
          }}
        />
        <svg
          viewBox="0 0 24 24"
          width={glyphSize}
          height={glyphSize}
          fill="none"
          stroke={W}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "relative", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" }}
        >
          {glyph}
        </svg>
      </div>
    </div>
  );
}

export const ItemOrb = memo(ItemOrbImpl, (prev, next) =>
  prev.size === next.size &&
  prev.animate === next.animate &&
  prev.planet.itemKind === next.planet.itemKind &&
  prev.planet.color === next.planet.color &&
  prev.planet.glowColor === next.planet.glowColor &&
  prev.planet.id === next.planet.id
);

// ─────────────────────────────────────────────────────────────────
// OrbDisplay — single entry point that routes a Planet to the right
// renderer: an ItemOrb when the planet carries a cosmetic `itemKind`,
// otherwise the normal PlanetOrb. Drop-in for every PlanetOrb usage
// (Lab reveal, Farm cards, Market cards + feed) so items render with
// their glyph everywhere a planet would.
// ─────────────────────────────────────────────────────────────────
interface OrbDisplayProps {
  planet: Planet;
  size?: number;
  animate?: boolean;
  displayFloat?: number;
}

export function OrbDisplay({ planet, size, animate, displayFloat }: OrbDisplayProps) {
  if (planet.itemKind) {
    return <ItemOrb planet={planet} size={size} animate={animate} />;
  }
  return <PlanetOrb planet={planet} size={size} animate={animate} displayFloat={displayFloat} />;
}
