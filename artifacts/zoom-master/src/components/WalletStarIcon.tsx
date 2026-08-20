/** Wallet row star icons — SVG only (no emoji glow artifacts). */

type StarVariant = "stardust" | "redstar" | "nftstar";

const COLORS: Record<StarVariant, string> = {
  stardust: "#ffd740",
  redstar: "#ff4444",
  nftstar: "#a0a0a8",
};

export function WalletStarIcon({ variant, size = 26 }: { variant: StarVariant; size?: number }) {
  const fill = COLORS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        fill={fill}
        d="M12 2.25l2.65 6.38 6.9 0.56-5.23 4.48 1.58 6.72L12 17.02l-5.9 3.37 1.58-6.72-5.23-4.48 6.9-0.56L12 2.25z"
      />
    </svg>
  );
}
