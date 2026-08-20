/**
 * Lab dual-forge wheel — two slices: $ZOOM vs ★ Stardust.
 * Outcome is preset from the path chosen at FORGE start.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { LabForgePath } from "@workspace/game-models";
import { useT } from "../i18n/LanguageContext";

const SPIN_MS = 8200;
const SPIN_EASING = "cubic-bezier(0.09, 0.82, 0.14, 1)";

interface PathSegment {
  path: LabForgePath;
  label: string;
  color: string;
  fill: string;
  textColor: string;
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(hex: string, target: { r: number; g: number; b: number }, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(rgb.r + (target.r - rgb.r) * t);
  const g = Math.round(rgb.g + (target.g - rgb.g) * t);
  const b = Math.round(rgb.b + (target.b - rgb.b) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function buildPathSegments(): PathSegment[] {
  const entries: { path: LabForgePath; label: string; color: string }[] = [
    { path: "zoom", label: "$ZOOM", color: "#7bed9f" },
    { path: "stardust", label: "★ STARDUST", color: "#ffd740" },
  ];
  const span = 360 / entries.length;
  const phaseOffset = -span / 2;
  return entries.map(({ path, label, color }, i) => {
    const startDeg = i * span + phaseOffset;
    const endDeg = (i + 1) * span + phaseOffset;
    return {
      path,
      label,
      color,
      fill: mixHex(color, { r: 255, g: 255, b: 255 }, 0.58),
      textColor: mixHex(color, { r: 0, g: 0, b: 0 }, 0.55),
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

function rotationForSegment(midDeg: number, span: number): number {
  const safeHalf = span * 0.22;
  const jitter = (Math.random() - 0.5) * 2 * safeHalf;
  const landAngle = midDeg + jitter;
  const landOn = ((360 - landAngle) % 360 + 360) % 360;
  const extraSpins = 2 + Math.floor(Math.random() * 2);
  return extraSpins * 360 + landOn;
}

interface Props {
  targetPath: LabForgePath;
  onComplete: () => void;
  size?: number;
}

export const ForgePathWheel = memo(function ForgePathWheel({
  targetPath,
  onComplete,
  size = 340,
}: Props) {
  const { t } = useT();
  const segments = useMemo(() => buildPathSegments(), []);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const doneRef = useRef(false);
  const targetRotationRef = useRef(0);

  const cx = size / 2;
  const r = size / 2 - 16;
  const ringR = r + 10;

  useEffect(() => {
    doneRef.current = false;
    setLanded(false);
    setSpinning(false);
    setRotation(0);

    const seg = segments.find((s) => s.path === targetPath) ?? segments[0]!;
    const span = seg.endDeg - seg.startDeg;
    const target = rotationForSegment(seg.midDeg, span);
    targetRotationRef.current = target;

    const t0 = requestAnimationFrame(() => {
      setSpinning(true);
      setRotation(target);
    });
    const fallback = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setRotation(targetRotationRef.current);
      setLanded(true);
      setSpinning(false);
      window.setTimeout(() => onComplete(), 650);
    }, SPIN_MS + 1200);
    return () => {
      cancelAnimationFrame(t0);
      window.clearTimeout(fallback);
    };
  }, [segments, targetPath, onComplete]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (!spinning || doneRef.current) return;
    doneRef.current = true;
    setRotation(targetRotationRef.current);
    setLanded(true);
    try {
      const tg = (window as unknown as {
        Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (s: string) => void } } };
      }).Telegram?.WebApp;
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch { /**/ }
    window.setTimeout(() => onComplete(), 650);
  };

  const targetSeg = segments.find((s) => s.path === targetPath);

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
        {landed ? t("wheel.pathLocked") : t("wheel.spinning")}
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
        <div
          className={spinning && !landed ? "rarity-wheel-spinning" : undefined}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms ${SPIN_EASING}` : "none",
            willChange: "transform",
            transformOrigin: "50% 50%",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
            <circle cx={cx} cy={cx} r={ringR} fill="#ffffff" />
            {segments.map((s) => {
              const span = s.endDeg - s.startDeg;
              const labelR = r * 0.62;
              const lp = polar(cx, cx, s.midDeg, labelR);
              const fs = span >= 120 ? 14 : 12;
              return (
                <g key={s.path}>
                  <path
                    d={segmentPath(cx, cx, r, s.startDeg, s.endDeg)}
                    fill={s.fill}
                    stroke="#ffffff"
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                  />
                  <text
                    x={lp.x}
                    y={lp.y}
                    fill={s.textColor}
                    fontSize={fs}
                    fontWeight="900"
                    fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ letterSpacing: "0.04em" }}
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}
            <circle cx={cx} cy={cx} r={ringR} fill="none" stroke="#ffffff" strokeWidth={11} />
          </svg>
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}
        >
          <circle cx={cx} cy={cx} r={r * 0.13} fill="#ffffff" stroke="#ececec" strokeWidth={2} />
          <path
            d={`M ${cx} ${cx - r * 0.36}
               C ${cx + r * 0.12} ${cx - r * 0.1}, ${cx + r * 0.1} ${cx + r * 0.08}, ${cx} ${cx + r * 0.16}
               C ${cx - r * 0.1} ${cx + r * 0.08}, ${cx - r * 0.12} ${cx - r * 0.1}, ${cx} ${cx - r * 0.36} Z`}
            fill="#111111"
          />
          <circle cx={cx} cy={cx - r * 0.05} r={r * 0.026} fill="#ffffff" opacity={0.4} />
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
          <span style={{ fontSize: 15, fontWeight: 900, color: targetSeg.color, letterSpacing: "0.1em" }}>
            {targetSeg.label}
          </span>
        </div>
      )}
    </div>
  );
});
