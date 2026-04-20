import { useState } from "react";

const D = "#0a0a14";
const H = "#e8ecff";
const V = "#0fd9ff";
const R = "#ffffff";
const S = "#7a8cff";
const _ = "transparent";

const FACE: string[][] = [
  [_, _, _, D, D, D, D, D, D, _, _, _],
  [_, _, D, H, H, H, H, H, H, D, _, _],
  [_, D, H, H, H, H, H, H, H, H, D, _],
  [_, D, H, V, V, V, V, V, V, H, D, _],
  [D, H, V, V, R, R, V, V, V, V, H, D],
  [D, H, V, V, R, V, V, V, V, V, H, D],
  [D, H, V, V, V, V, V, V, V, V, H, D],
  [D, H, V, V, V, V, V, V, V, V, H, D],
  [_, D, H, V, V, V, V, V, V, H, D, _],
  [_, D, H, H, S, H, H, S, H, H, D, _],
  [_, _, D, H, H, H, H, H, H, D, _, _],
  [_, _, _, D, D, D, D, D, D, _, _, _],
];

const NEON = "#0fd9ff";

export function PixelAvatar({ size = 60 }: { size?: number }) {
  const [tapped, setTapped] = useState(false);
  const cell = size / 12;

  const handleTap = () => {
    setTapped(true);
    window.setTimeout(() => setTapped(false), 220);
  };

  return (
    <>
      <style>{`
        @keyframes pixelAvatarBob {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-7px); }
          100% { transform: translateY(0px); }
        }
        @keyframes pixelAvatarGlow {
          0%, 100% { box-shadow: 0 0 8px ${NEON}66, 0 0 18px ${NEON}33, inset 0 0 0 1px ${NEON}55; }
          50%      { box-shadow: 0 0 14px ${NEON}99, 0 0 28px ${NEON}55, inset 0 0 0 1px ${NEON}aa; }
        }
        .pixel-avatar-wrap {
          animation: pixelAvatarBob 2.4s ease-in-out infinite;
          will-change: transform;
        }
        .pixel-avatar-frame {
          animation: pixelAvatarGlow 2.6s ease-in-out infinite;
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .pixel-avatar-frame.tapped {
          transform: scale(1.12) rotate(-4deg);
          filter: brightness(1.45) hue-rotate(20deg);
        }
      `}</style>

      <div
        className="pixel-avatar-wrap"
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPointerDown={handleTap}
      >
        <div
          className={`pixel-avatar-frame ${tapped ? "tapped" : ""}`}
          style={{
            width: size,
            height: size,
            borderRadius: 10,
            background: "rgba(8,12,28,0.6)",
            display: "grid",
            gridTemplateColumns: `repeat(12, ${cell}px)`,
            gridTemplateRows: `repeat(12, ${cell}px)`,
            padding: 0,
            cursor: "pointer",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            imageRendering: "pixelated",
          }}
          role="button"
          aria-label="Player avatar"
        >
          {FACE.flatMap((row, y) =>
            row.map((color, x) => (
              <div
                key={`${x}-${y}`}
                style={{
                  width: cell,
                  height: cell,
                  background: color,
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
