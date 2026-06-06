import { useEffect, useRef } from "react";

interface Props {
  balance: number;
  activeRate: number;
  onClick?: () => void;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000)        return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(1);
}

export function BalanceCounter({ balance, activeRate, onClick }: Props) {
  const textRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef(balance);
  const currentRef = useRef(balance);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    targetRef.current = balance;
  }, [balance]);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      const now = performance.now();
      const dt = Math.min((now - lastUpdateRef.current) / 1000, 0.5);
      lastUpdateRef.current = now;
      const target = targetRef.current;
      const diff = target - currentRef.current;
      if (Math.abs(diff) < 0.05) {
        currentRef.current = target;
      } else {
        currentRef.current += diff * 0.5;
      }
      if (textRef.current) {
        textRef.current.textContent = fmt(currentRef.current);
      }
      raf = requestAnimationFrame(animate);
    };
    lastUpdateRef.current = performance.now();
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
        {fmt(balance)}
      </span>
    </div>
  );
}
