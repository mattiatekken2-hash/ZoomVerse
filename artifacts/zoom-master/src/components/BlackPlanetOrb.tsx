/**
 * BlackPlanetOrb — luna nera realistica con bagliore viola.
 * Componente condiviso usato in:
 *   - BlackCollectionWidget (bottone tile + modale)
 *   - PixelAvatar (slot della Black Collection Farm + inventario)
 *
 * Props:
 *   - size: lato del pianeta in px
 *   - nebula: se true mostra una nebulosa viola che vortica attorno al
 *             pianeta (wrapper 1.55x). Per spazi compatti (slot piccoli,
 *             tile barra laterale) usare false così non sfora il contenitore
 *   - spin:   se true il pianeta ruota su sé stesso (feedback "farming attivo")
 */
import { memo } from "react";

const VOID_PURPLE = "#7b2fff";
const DEEP_PURPLE = "#4a0e8f";
const ACCENT = "#c084fc";

interface Props {
  size: number;
  nebula?: boolean;
  spin?: boolean;
}

function BlackPlanetOrbBase({ size, nebula = true, spin = false }: Props) {
  const wrap = nebula ? size * 1.55 : size;
  const planetId = `bp-${size}-${nebula ? "n" : "x"}`;
  return (
    <div
      style={{
        width: wrap,
        height: wrap,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {nebula && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(from 0deg, ${DEEP_PURPLE}00 0deg, ${VOID_PURPLE}cc 40deg, ${ACCENT}66 90deg, ${DEEP_PURPLE}00 150deg, ${VOID_PURPLE}aa 220deg, ${ACCENT}55 270deg, ${DEEP_PURPLE}00 360deg)`,
            filter: `blur(${size * 0.07}px)`,
            WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,1) 32%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0) 72%)",
            maskImage: "radial-gradient(circle, rgba(0,0,0,1) 32%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0) 72%)",
            animation: "blackNebulaSwirl 24s linear infinite",
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{
          position: "relative",
          zIndex: 1,
          filter: `drop-shadow(0 0 ${size * 0.18}px ${VOID_PURPLE}aa) drop-shadow(0 0 ${size * 0.06}px ${ACCENT}55)`,
          animation: spin ? "blackPlanetSelfSpin 8s linear infinite" : undefined,
          transformOrigin: "50% 50%",
        }}
      >
        <defs>
          <radialGradient id={`${planetId}-body`} cx="35%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#3a3340" />
            <stop offset="22%" stopColor="#1a1620" />
            <stop offset="55%" stopColor="#08060c" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <radialGradient id={`${planetId}-rim`} cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor={VOID_PURPLE} stopOpacity="0" />
            <stop offset="96%" stopColor={ACCENT} stopOpacity="0.55" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${planetId}-shade`} cx="78%" cy="62%" r="62%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={`url(#${planetId}-body)`} />
        {/* Crateri / dettagli di superficie */}
        <ellipse cx="38" cy="36" rx="6" ry="4" fill="#000" opacity="0.45" />
        <ellipse cx="62" cy="42" rx="3.5" ry="2.6" fill="#000" opacity="0.5" />
        <ellipse cx="44" cy="58" rx="4.5" ry="3.2" fill="#000" opacity="0.4" />
        <ellipse cx="68" cy="64" rx="5.5" ry="3.8" fill="#000" opacity="0.55" />
        <ellipse cx="32" cy="68" rx="3" ry="2.2" fill="#000" opacity="0.45" />
        <ellipse cx="56" cy="74" rx="4" ry="2.6" fill="#000" opacity="0.4" />
        <ellipse cx="72" cy="30" rx="3" ry="2" fill="#000" opacity="0.5" />
        <ellipse cx="34" cy="30" rx="10" ry="6" fill="#fff" opacity="0.05" />
        <circle cx="50" cy="50" r="48" fill={`url(#${planetId}-shade)`} />
        <circle cx="50" cy="50" r="48" fill={`url(#${planetId}-rim)`} />
      </svg>
    </div>
  );
}

export const BlackPlanetOrb = memo(BlackPlanetOrbBase);

/**
 * Iniettato una sola volta a livello App, espone i due keyframes globali
 * usati dal componente. Va renderizzato in alto nell'albero (es. App.tsx).
 */
export function BlackPlanetOrbStyles() {
  return (
    <style>{`
      @keyframes blackNebulaSwirl {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      @keyframes blackPlanetSelfSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
  );
}
