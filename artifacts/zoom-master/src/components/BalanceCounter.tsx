import { useEffect, useRef } from "react";

interface Props {
  balance: number;
  activeRate: number;
  onClick?: () => void;
}

function formatNumber(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000)        return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString();
}

function formatLiveNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000)        return (n / 1_000).toFixed(1) + "K";
  if (n >= 1_000)         return Math.floor(n).toLocaleString();
  return n.toFixed(1);
}

export function BalanceCounter({ balance, activeRate, onClick }: Props) {
  const textRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef(balance);
  const currentRef = useRef(balance);
  const activeRef = useRef(activeRate);

  useEffect(() => {
    targetRef.current = balance;
    activeRef.current = activeRate;
  }, [balance, activeRate]);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      const target = targetRef.current;
      const diff = target - currentRef.current;
      if (Math.abs(diff) < 0.1) {
        currentRef.current = target;
      } else {
        currentRef.current += diff * 0.15;
      }
      if (textRef.current) {
        textRef.current.textContent = formatLiveNumber(currentRef.current);
      }
      raf = requestAnimationFrame(animate);
    };
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
        padding: "4px 8px",
        boxShadow: isProducing
          ? "0 0 18px rgba(0, 242, 254, 0.35), inset 0 0 8px rgba(0, 242, 254, 0.12)"
          : "0 0 4px rgba(0, 242, 254, 0.05)",
        transition: "all 0.4s ease",
      }}
    >
      <span
        style={{
          fontSize: 12,
          filter: isProducing ? "drop-shadow(0 0 4px rgba(0,242,254,0.8))" : "none",
          transition: "filter 0.4s ease",
        }}
      >
        🪐
      </span>
      <span
        ref={textRef}
        style={{
          fontSize: 12,
          color: "#00f2fe",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          textShadow: isProducing ? "0 0 10px rgba(0, 242, 254, 0.6)" : "0 0 4px rgba(0, 242, 254, 0.3)",
          transition: "text-shadow 0.4s ease",
        }}
      >
        {formatNumber(balance)}
      </span>
    </div>
  );
}
