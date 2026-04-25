import { memo, useId } from "react";

interface RealisticWhiteProps {
  size?: number;
  glow?: boolean;
}

function RealisticWhiteBase({ size = 80, glow = true }: RealisticWhiteProps) {
  const rid = useId().replace(/[:]/g, "");
  const cls = `rw-${rid}`;
  const spinKey = `rwSpin-${rid}`;
  const glowSize = Math.max(4, Math.round(size * 0.18));
  const innerShadowMain = Math.max(6, Math.round(size * 0.16));
  const innerHighlight = Math.max(4, Math.round(size * 0.12));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: glow ? "drop-shadow(0 0 6px rgba(0,255,200,0.45))" : undefined,
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes ${spinKey} {
          from { background-position:
            0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%, 0% 50%; }
          to   { background-position:
            300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 300% 50%, 0% 50%; }
        }
        .${cls} {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background:
            radial-gradient(ellipse 14% 12% at 22% 38%, rgba(60,65,85,0.55) 0%, rgba(60,65,85,0.25) 55%, transparent 70%),
            radial-gradient(ellipse 9% 8% at 60% 30%, rgba(70,75,95,0.5) 0%, transparent 65%),
            radial-gradient(ellipse 11% 10% at 72% 58%, rgba(55,60,80,0.55) 0%, transparent 65%),
            radial-gradient(ellipse 7% 6% at 38% 65%, rgba(70,75,95,0.55) 0%, transparent 65%),
            radial-gradient(ellipse 6% 5% at 50% 82%, rgba(80,85,105,0.5) 0%, transparent 65%),
            radial-gradient(ellipse 5% 4% at 18% 70%, rgba(70,75,95,0.5) 0%, transparent 65%),
            radial-gradient(ellipse 8% 7% at 82% 22%, rgba(70,75,95,0.5) 0%, transparent 65%),
            radial-gradient(ellipse 4% 3% at 44% 18%, rgba(70,75,95,0.55) 0%, transparent 65%),
            radial-gradient(circle at 30% 28%, #ffffff 0%, #f3f7ff 22%, #cfd8e8 55%, #8a94ad 90%, #5a6478 100%);
          background-size: 100% 100%;
          animation: ${spinKey} 14s linear infinite;
          box-shadow:
            inset -${innerShadowMain}px -${innerShadowMain + 2}px ${innerShadowMain * 2}px rgba(40,50,80,0.55),
            inset ${innerHighlight}px ${innerHighlight + 2}px ${innerHighlight * 2}px rgba(255,255,255,0.85),
            0 0 ${glowSize}px rgba(255,255,255,0.5);
          position: relative;
          overflow: hidden;
        }
        .${cls}::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle at 70% 75%, transparent 55%, rgba(0,0,0,0.45) 100%);
          pointer-events: none;
        }
      `}</style>
      <div className={cls} />
    </div>
  );
}

export const RealisticWhite = memo(RealisticWhiteBase);
