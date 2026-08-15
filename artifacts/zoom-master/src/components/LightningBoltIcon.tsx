import { memo } from "react";

interface LightningBoltIconProps {
  size?: number;
  /** 0–1 glow strength */
  glow?: number;
  opacity?: number;
}

/** Layered SVG lightning with depth shading — reads as 3D on dark UI. */
function LightningBoltIconBase({ size = 28, glow = 1, opacity = 1 }: LightningBoltIconProps) {
  const uid = "bolt3d";
  const g = Math.max(0, Math.min(1, glow));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      style={{ opacity, display: "block" }}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="10" y1="2" x2="22" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="38%" stopColor="#eef4ff" />
          <stop offset="72%" stopColor="#b8cce8" />
          <stop offset="100%" stopColor="#7a98c8" />
        </linearGradient>
        <linearGradient id={`${uid}-edge`} x1="8" y1="4" x2="20" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#d8e8ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5a78a8" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id={`${uid}-shine`} x1="14" y1="3" x2="16" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#1a2840" floodOpacity={0.55} />
          <feDropShadow dx="0" dy="0" stdDeviation={1.6 + g * 2.2} floodColor="#c8e0ff" floodOpacity={0.35 + g * 0.45} />
        </filter>
      </defs>

      {/* Depth / shadow layer */}
      <path
        d="M18.5 2.5 8.5 16.2h5.2l-2.4 11.3 13.2-15.1h-5.6l1.1-12.4z"
        fill="#243650"
        opacity="0.55"
        transform="translate(1.1 1.2)"
      />

      {/* Main bolt body */}
      <path
        d="M17.5 1.8 7.8 15.8h5.4l-2.5 11.8 13.5-15.5h-5.8l1.1-12.1z"
        fill={`url(#${uid}-body)`}
        filter={`url(#${uid}-glow)`}
      />

      {/* Left facet highlight */}
      <path
        d="M17.5 1.8 12.2 15.8h3.1l-1.1 8.2 4.8-6.1h-3.4l1.9-16.1z"
        fill={`url(#${uid}-shine)`}
        opacity="0.55"
      />

      {/* Edge rim light */}
      <path
        d="M17.5 1.8 7.8 15.8h5.4l-2.5 11.8 13.5-15.5h-5.8l1.1-12.1z"
        fill={`url(#${uid}-edge)`}
        opacity="0.42"
      />

      {/* Crisp highlight stroke */}
      <path
        d="M17.5 1.8 12.4 15.2 M12.4 15.2 10.8 26.2 M17.5 1.8 18.4 12.2"
        stroke="#ffffff"
        strokeWidth="0.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

export const LightningBoltIcon = memo(LightningBoltIconBase);
