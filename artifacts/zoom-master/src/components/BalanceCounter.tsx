import { useEffect, useRef } from "react";
import { ZoomCubeIcon } from "./ZoomCubeIcon";

interface Props {
  balance: number;
  activeRate: number;
  onClick?: () => void;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000)        return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

export function BalanceCounter({ balance, activeRate, onClick }: Props) {
  const textRef    = useRef<HTMLSpanElement>(null);
  const targetRef  = useRef(balance);
  const displayRef = useRef(balance);
  const rafRef     = useRef(0);
  const runningRef = useRef(false);

  // Start the rAF loop only when there is visible work to do.
  // The loop cancels itself the moment display === target so the GPU is
  // completely idle between balance updates (instead of spinning at 60 fps).
  const startLoop = () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const animate = () => {
      const diff = targetRef.current - displayRef.current;

      if (Math.abs(diff) < 0.01) {
        // Fully converged — snap and STOP. No more rAF until next balance change.
        displayRef.current = targetRef.current;
        if (textRef.current) textRef.current.textContent = fmt(displayRef.current);
        runningRef.current = false;
        return;
      }

      // Exponential ease-out smoothing
      displayRef.current += diff * 0.12;
      if (textRef.current) textRef.current.textContent = fmt(displayRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
  };

  // Restart the loop whenever the server pushes a new balance value.
  // Between pushes (which happen every ~30 s) the loop is fully stopped.
  useEffect(() => {
    targetRef.current = balance;
    startLoop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const isProducing = activeRate > 0;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 font-black cursor-pointer active:scale-95 flex-shrink-0"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        background: "rgba(0, 242, 254, 0.05)",
        border: `1.5px solid ${isProducing ? "rgba(0, 242, 254, 0.55)" : "rgba(0, 242, 254, 0.15)"}`,
        borderRadius: 50,
        padding: "3px 6px",
        boxShadow: isProducing
          ? "0 0 18px rgba(0, 242, 254, 0.35), inset 0 0 8px rgba(0, 242, 254, 0.12)"
          : "0 0 4px rgba(0, 242, 254, 0.05)",
        transition: "all 0.4s ease",
      }}
    >
      <ZoomCubeIcon size={14} />
      <span
        ref={textRef}
        style={{
          fontSize: 12,
          color: "#E8ECF4",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          textShadow: isProducing ? "0 0 10px rgba(200, 220, 255, 0.45)" : "0 0 4px rgba(255, 255, 255, 0.12)",
          transition: "text-shadow 0.4s ease",
        }}
      >
        {fmt(balance)}
      </span>
    </div>
  );
}
