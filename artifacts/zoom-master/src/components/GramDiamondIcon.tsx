/** White Gram diamond — transparent background (no blue tile). */
const GRAM_DIAMOND_SRC = "/assets/gram-diamond-icon.svg";

export function GramDiamondIcon({ size = 18 }: { size?: number }) {
  return (
    <img
      src={GRAM_DIAMOND_SRC}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="gram-diamond-icon"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: "middle",
        filter: "drop-shadow(0 0 4px rgba(48,161,245,0.35))",
      }}
      aria-hidden
    />
  );
}
