/**
 * Lab forge rarity wheel — segments sized by PLANET_CONFIG.chance (V1 = tiny slice).
 * Outcome is predetermined (targetRarity); spin is cosmetic drama before model reveal.
 */
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { PLANET_CONFIG, type PlanetType } from "../hooks/useGameState";

/** Lab-forge rarities in wheel order (same as rollRarity cumulative walk). */
export const LAB_FORGE_RARITIES: PlanetType[] = [
  "BASIC",
  "RARE",
  "EPIC",
  "MYTHIC",
  "NOVA",
  "PLASMA",
  "MUSHROOM",
  "GOLD",
  "V1",
];

export interface RarityWheelSegment {
  type: PlanetType;
  label: string;
  shortLabel: string;
  color: string;
  glowColor: string;
  chance: number;
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

export function buildRarityWheelSegments(): RarityWheelSegment[] {
  const entries = LAB_FORGE_RARITIES.map((type) => {
    const cfg = PLANET_CONFIG[type];
    return { type, cfg, chance: cfg.chance };
  }).filter((e) => e.chance > 0);

  const total = entries.reduce((s, e) => s + e.chance, 0);
  let cursor = 0;
  return entries.map(({ type, cfg, chance }) => {
    const span = (chance / total) * 360;
    const startDeg = cursor;
    const endDeg = cursor + span;
    cursor = endDeg;
    const short =
      type === "MUSHROOM" ? "SHRM"
        : type.length <= 5 ? type
        : cfg.label.slice(0, 4).toUpperCase();
    return {
      type,
      label: cfg.label.toUpperCase(),
      shortLabel: short,
      color: cfg.color,
      glowColor: cfg.glowColor,
      chance,
      startDeg,
      endDeg,
      midDeg: startDeg + span / 2,
    };
  });
}

function polar(cx: number, cy: number, angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function segmentPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const span = endDeg - startDeg;
  if (span <= 0) return "";
  const p1 = polar(cx, cy, startDeg, r);
  const p2 = polar(cx, cy, endDeg, r);
  const large = span > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
}

interface Props {
  targetRarity: PlanetType;
  onComplete: () => void;
  size?: number;
}

export const RarityForgeWheel = memo(function RarityForgeWheel({
  targetRarity,
  onComplete,
  size = 300,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const segments = useMemo(() => buildRarityWheelSegments(), []);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const doneRef = useRef(false);

  const cx = size / 2;
  const r = size / 2 - 6;

  useEffect(() => {
    if (doneRef.current) return;
    const seg = segments.find((s) => s.type === targetRarity) ?? segments[0];
    const pointerOffset = 0;
    const landOn = 360 - seg.midDeg + pointerOffset;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const target = extraSpins * 360 + landOn;

    const t0 = requestAnimationFrame(() => {
      setSpinning(true);
      setRotation(target);
    });
    return () => cancelAnimationFrame(t0);
  }, [segments, targetRarity]);

  const handleTransitionEnd = () => {
    if (!spinning || doneRef.current) return;
    doneRef.current = true;
    setLanded(true);
    try {
      const tg = (window as unknown as {
        Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (s: string) => void } } };
      }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch { /**/ }
    window.setTimeout(() => onComplete(), 700);
  };

  const targetSeg = segments.find((s) => s.type === targetRarity);

  return (
    <div
      className="rarity-forge-wheel-wrap flex flex-col items-center"
      style={{ width: size + 40, maxWidth: "92vw" }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.22em",
          color: "rgba(255,215,64,0.55)",
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {landed ? "Rarity locked!" : "Spinning rarity…"}
      </div>

      <div style={{ position: "relative", width: size, height: size + 18 }}>
        {/* Pointer */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "11px solid transparent",
            borderRight: "11px solid transparent",
            borderTop: "22px solid #ffd740",
            filter: "drop-shadow(0 0 8px rgba(255,215,64,0.85))",
            zIndex: 4,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: "12px 0 0 0",
            borderRadius: "50%",
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 4.6s cubic-bezier(0.12, 0.85, 0.18, 1)"
              : "none",
            willChange: "transform",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
            <defs>
              {segments.map((s) => (
                <radialGradient
                  key={s.type}
                  id={`raritySeg-${uid}-${s.type}`}
                  cx="50%"
                  cy="42%"
                  r="78%"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                  <stop offset="55%" stopColor={s.color} stopOpacity="0.82" />
                  <stop offset="100%" stopColor={s.glowColor} stopOpacity="0.55" />
                </radialGradient>
              ))}
              <radialGradient id={`rarityHub-${uid}`} cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#fffef0" />
                <stop offset="45%" stopColor="#ffd740" />
                <stop offset="100%" stopColor="#ff8f00" />
              </radialGradient>
            </defs>

            <circle cx={cx} cy={cx} r={r + 4} fill="#060810" stroke="rgba(255,215,64,0.35)" strokeWidth="2" />

            {segments.map((s) => {
              const span = s.endDeg - s.startDeg;
              const showLabel = span >= 6;
              const labelR = r * 0.62;
              const lp = polar(cx, cx, s.midDeg, labelR);
              return (
                <g key={s.type}>
                  <path
                    d={segmentPath(cx, cx, r, s.startDeg, s.endDeg)}
                    fill={`url(#raritySeg-${uid}-${s.type})`}
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth="0.6"
                  />
                  {showLabel && (
                    <text
                      x={lp.x}
                      y={lp.y}
                      fill="#ffffff"
                      fontSize={span > 20 ? 11 : span > 12 ? 9 : 7}
                      fontWeight="900"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${s.midDeg}, ${lp.x}, ${lp.y})`}
                      style={{ letterSpacing: "0.06em", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                    >
                      {s.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Ultra-rare rim ticks (V1 / GOLD when slice too thin for text) */}
            {segments
              .filter((s) => s.endDeg - s.startDeg < 6)
              .map((s) => {
                const inner = polar(cx, cx, s.midDeg, r * 0.88);
                const outer = polar(cx, cx, s.midDeg, r * 0.98);
                return (
                  <line
                    key={`tick-${s.type}`}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={s.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                );
              })}

            <circle cx={cx} cy={cx} r={r * 0.14} fill={`url(#rarityHub-${uid})`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            <text x={cx} y={cx} textAnchor="middle" dominantBaseline="middle" fontSize={r * 0.11} fontWeight="900" fill="#3a2800">
              ★
            </text>
          </svg>
        </div>
      </div>

      {landed && targetSeg && (
        <div
          className="forge-claim-fade-in"
          style={{
            marginTop: 14,
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${targetSeg.color}66`,
            background: "rgba(6,8,16,0.85)",
            boxShadow: `0 0 24px ${targetSeg.color}44`,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 900, color: targetSeg.color, letterSpacing: "0.12em" }}>
            {targetSeg.label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginLeft: 8 }}>
            {(targetSeg.chance * 100).toFixed(targetSeg.chance < 0.001 ? 3 : 2)}%
          </span>
        </div>
      )}
    </div>
  );
});
