/**
 * OnlineIndicator — pulsing green dot + player count shown in the header.
 */
import { useEffect, useRef, useState, memo } from "react";
import { API_BASE } from "../utils/api";

const FETCH_INTERVAL_MS = 30_000;
const FLUCTUATION_MIN_MS = 5_000;
const FLUCTUATION_MAX_MS = 15_000;
const DELTAS = [-1, -1, +1, +1, +2];

function getOnlineFloor(): number {
  const h = new Date().getUTCHours();
  const base = h >= 10 && h <= 22
    ? 38 + Math.floor(((h - 10) / 12) * 32)
    : 20 + Math.floor((Math.abs(h - 4) / 6) * 17);
  const jitter = new Date().getUTCMinutes() % 7;
  return Math.min(70, Math.max(20, base + jitter));
}

function randomDelay() {
  return FLUCTUATION_MIN_MS + Math.random() * (FLUCTUATION_MAX_MS - FLUCTUATION_MIN_MS);
}

function pickDelta() {
  return DELTAS[Math.floor(Math.random() * DELTAS.length)];
}

async function fetchCount(): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/online-count`, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json() as { count?: number };
    return typeof j.count === "number" ? j.count : null;
  } catch {
    return null;
  }
}

function OnlineIndicatorBase() {
  const [realCount, setRealCount] = useState<number>(() => getOnlineFloor());
  const [display, setDisplay] = useState<number>(() => getOnlineFloor());
  const realRef = useRef<number>(getOnlineFloor());
  const fluctTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFluctuation = () => {
    if (fluctTimerRef.current) clearTimeout(fluctTimerRef.current);
    fluctTimerRef.current = setTimeout(() => {
      setDisplay((prev) => {
        const floor = getOnlineFloor();
        const base = Math.max(floor, realRef.current ?? prev);
        const delta = pickDelta();
        return Math.max(floor, Math.min(base + 4, prev + delta));
      });
      scheduleFluctuation();
    }, randomDelay());
  };

  const doFetch = async () => {
    const count = await fetchCount();
    const floor = getOnlineFloor();
    const effective = count !== null ? Math.max(floor, count) : floor;
    realRef.current = effective;
    setRealCount(effective);
    setDisplay((prev) => {
      if (Math.abs(prev - effective) <= 4) return prev;
      return effective;
    });
  };

  useEffect(() => {
    void doFetch();
    const interval = setInterval(() => { void doFetch(); }, FETCH_INTERVAL_MS);
    scheduleFluctuation();
    return () => {
      clearInterval(interval);
      if (fluctTimerRef.current) clearTimeout(fluctTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = display ?? realCount;

  return (
    <div
      title={`${shown} giocatori online`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 7px",
        height: 28,
        minWidth: 44,
        borderRadius: 8,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(0,220,80,0.35)",
        cursor: "default",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`
          @keyframes onlinePulse {
            0%,100% { transform: scale(1);   opacity: 1;    box-shadow: 0 0 0 0 rgba(0,220,80,0.7); }
            50%      { transform: scale(1.25); opacity: 0.85; box-shadow: 0 0 0 4px rgba(0,220,80,0); }
          }
          .online-dot { animation: onlinePulse 2s ease-in-out infinite; }
        `}</style>
        <span
          className="online-dot"
          style={{
            display: "block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#00e050",
            boxShadow: "0 0 6px rgba(0,220,80,0.9)",
          }}
        />
      </span>

      <span style={{
        fontSize: 11,
        fontWeight: 900,
        color: "#ffffff",
        textShadow: "0 0 8px rgba(0,220,80,0.55)",
        letterSpacing: "0.02em",
        minWidth: 22,
        textAlign: "right",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {shown.toLocaleString()}
      </span>
    </div>
  );
}

export const OnlineIndicator = memo(OnlineIndicatorBase);
