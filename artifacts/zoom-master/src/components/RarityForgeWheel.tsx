/**
 * Lab forge rarity wheel — white Fortune-style spinner (reference UI).
 * Segments are white; rarity colors live on labels only. Outcome is preset.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  color: string;
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
    return {
      type,
      label: type === "V1" ? "V1" : cfg.label.toUpperCase(),
      color: cfg.color,
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

function labelFontSize(span: number): number {
  if (span >= 120) return 26;
  if (span >= 60) return 20;
  if (span >= 28) return 15;
  if (span >= 14) return 12;
  if (span >= 7) return 10;
  if (span >= 3.5) return 8;
  return 0;
}

function labelRadius(span: number, r: number): number {
  if (span >= 120) return r * 0.58;
  if (span >= 40) return r * 0.62;
  return r * 0.68;
}

const SPIN_MS = 3500;

interface Props {
  targetRarity: PlanetType;
  onComplete: () => void;
  size?: number;
}

export const RarityForgeWheel = memo(function RarityForgeWheel({
  targetRarity,
  onComplete,
  size = 340,
}: Props) {
  const segments = useMemo(() => buildRarityWheelSegments(), []);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const doneRef = useRef(false);

  const cx = size / 2;
  const r = size / 2 - 14;
  const ringR = r + 8;

  useEffect(() => {
    if (doneRef.current) return;
    const seg = segments.find((s) => s.type === targetRarity) ?? segments[0];
    const landOn = 360 - seg.midDeg;
    const extraSpins = 3 + Math.floor(Math.random() * 2);
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
    window.setTimeout(() => onComplete(), 650);
  };

  const targetSeg = segments.find((s) => s.type === targetRarity);

  return (
    <div
      className="rarity-forge-wheel-wrap flex flex-col items-center"
      style={{ width: size + 24, maxWidth: "94vw" }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.2em",
          color: landed ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.42)",
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        {landed ? "Rarity locked" : "Spinning…"}
      </div>

      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          filter: spinning && !landed ? "drop-shadow(0 0 28px rgba(255,255,255,0.22))" : "drop-shadow(0 8px 32px rgba(0,0,0,0.55))",
          transition: "filter 0.4s ease",
        }}
      >
        {/* Spinning white wheel */}
        <div
          className={spinning && !landed ? "rarity-wheel-spinning" : undefined}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.84, 0.28, 1)`
              : "none",
            willChange: "transform",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
            {/* Outer white ring */}
            <circle
              cx={cx}
              cy={cx}
              r={ringR}
              fill="none"
              stroke="#ffffff"
              strokeWidth={10}
            />
            <circle
              cx={cx}
              cy={cx}
              r={r + 2}
              fill="#0a0c12"
            />

            {segments.map((s) => {
              const span = s.endDeg - s.startDeg;
              const fs = labelFontSize(span);
              const labelR = labelRadius(span, r);
              const lp = polar(cx, cx, s.midDeg, labelR);
              const flip = s.midDeg > 90 && s.midDeg < 270;
              const textRot = s.midDeg + (flip ? 180 : 0);

              return (
                <g key={s.type}>
                  <path
                    d={segmentPath(cx, cx, r, s.startDeg, s.endDeg)}
                    fill="#f7f7f8"
                    stroke="#d8d8dc"
                    strokeWidth={1.2}
                  />
                  {fs > 0 && (
                    <text
                      x={lp.x}
                      y={lp.y}
                      fill={s.color}
                      fontSize={fs}
                      fontWeight="900"
                      fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${textRot}, ${lp.x}, ${lp.y})`}
                      style={{
                        letterSpacing: span >= 40 ? "0.14em" : "0.06em",
                        paintOrder: "stroke fill",
                        stroke: "rgba(255,255,255,0.85)",
                        strokeWidth: span >= 14 ? 3 : 2,
                      }}
                    >
                      {s.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Inner thin ring */}
            <circle
              cx={cx}
              cy={cx}
              r={r * 0.12}
              fill="none"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
            />
          </svg>
        </div>

        {/* Fixed center pointer — black teardrop (reference) */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 6,
          }}
        >
          <circle cx={cx} cy={cx} r={r * 0.11} fill="#ffffff" stroke="#e0e0e0" strokeWidth={1.5} />
          <path
            d={`M ${cx} ${cx - r * 0.34}
               C ${cx + r * 0.11} ${cx - r * 0.12}, ${cx + r * 0.09} ${cx + r * 0.06}, ${cx} ${cx + r * 0.14}
               C ${cx - r * 0.09} ${cx + r * 0.06}, ${cx - r * 0.11} ${cx - r * 0.12}, ${cx} ${cx - r * 0.34} Z`}
            fill="#111111"
          />
          <circle cx={cx} cy={cx - r * 0.06} r={r * 0.028} fill="#ffffff" opacity={0.35} />
        </svg>
      </div>

      {landed && targetSeg && (
        <div
          className="forge-claim-fade-in"
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(8,10,16,0.88)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 900, color: targetSeg.color, letterSpacing: "0.14em" }}>
            {targetSeg.label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 10 }}>
            {(targetSeg.chance * 100).toFixed(targetSeg.chance < 0.001 ? 3 : 2)}%
          </span>
        </div>
      )}
    </div>
  );
});
