/** ZOOM cube logo — transparent PNG, cropped like GramDiamondIcon. */
const ZOOM_CUBE_SRC = "/assets/zoom-cube-icon.png?v=5";

interface ZoomCubeIconProps {
  size?: number;
}

export function ZoomCubeIcon({ size = 18 }: ZoomCubeIconProps) {
  return (
    <span
      className="zoom-cube-icon"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
        background: "transparent",
      }}
      aria-hidden
    >
      <img
        src={ZOOM_CUBE_SRC}
        width={size}
        height={size}
        alt=""
        draggable={false}
        style={{
          display: "block",
          width: size,
          height: size,
          objectFit: "contain",
          objectPosition: "center center",
          background: "transparent",
        }}
      />
    </span>
  );
}
