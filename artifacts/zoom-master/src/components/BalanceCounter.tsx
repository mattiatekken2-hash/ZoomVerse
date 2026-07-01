import { useEffect, useRef } from "react";
import { ZoomPlanetIcon } from "./icons/GameIcons";

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
  const textRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef(balance);
  const displayRef = useRef(balance);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    targetRef.current = balance;
  }, [balance]);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.2);
      lastTimeRef.current = now;

      const target = targetRef.current;
      const diff = target - displayRef.current;
      if (Math.abs(diff) < 0.02) {
        displayRef.current = target;
      } else {
        displayRef.current += diff * 0.85;
      }

      if (textRef.current) {
        textRef.current.textContent = fmt(displayRef.current);
      }
      raf = requestAnimationFrame(animate);
    };
    lastTimeRef.current = performance.now();
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
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
      <span
        style={{
          fontSize: 12,
          filter: isProducing ? "drop-shadow(0 0 6px rgba(255,51,85,0.7))" : "none",
          transition: "filter 0.4s ease",
          display: "flex", alignItems: "center",
        }}
      >
        <ZoomPlanetIcon size={18} />
      </span>
      <span
        ref={textRef}
        style={{
          fontSize: 12,
          color: "#ff3355",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          textShadow: isProducing ? "0 0 10px rgba(255, 51, 85, 0.6)" : "0 0 4px rgba(255, 51, 85, 0.3)",
          transition: "text-shadow 0.4s ease",
        }}
      >
        {fmt(balance)}
      </span>
    </div>
  );
}
