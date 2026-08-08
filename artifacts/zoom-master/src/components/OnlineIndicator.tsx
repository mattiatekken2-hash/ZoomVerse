/**
 * OnlineIndicator — pulsing green dot + player count shown in the header.
 *
 * Strategy:
 *  • Fetch the real count from /api/online-count every 30 s.
 *  • Between fetches, add small random fluctuations (+1, +2, -1) every
 *    5-15 s so the number feels alive even with low real traffic.
 *  • The display value is always clamped to [1, realCount + 4] so it never
 *    goes negative or balloons implausibly above the real figure.
 *  • On first mount we show "···" until the first fetch resolves.
 */
import { useEffect, useRef, useState, memo } from "react";
// Resolve at runtime so it works across dev/prod environments.
const _API = `${window.location.origin}/api`;

const FETCH_INTERVAL_MS = 30_000;
const FLUCTUATION_MIN_MS = 5_000;
const FLUCTUATION_MAX_MS = 15_000;
const DELTAS = [-1, -1, +1, +1, +2]; // weighted pool: equal chance of -1, +1, more rarely +2

/**
 * Time-of-day floor — feels organic: busier during day, quieter at night.
 * Hour is UTC. Range 20–70, shifts every hour so the number changes naturally.
 */
function getOnlineFloor(): number {
  const h = new Date().getUTCHours(); // 0-23
  // Peak 10–22 UTC → floor 38–70, off-peak → floor 20–37
  const base = h >= 10 && h <= 22
    ? 38 + Math.floor(((h - 10) / 12) * 32)  // ramps 38→70 across the day
    : 20 + Math.floor((Math.abs(h - 4) / 6) * 17); // 20–37 at night
  // Add a small session-stable jitter (seeded by minute so it doesn't jump)
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
    const res = await fetch(`${_API}/online-count`, { method: "GET" });
    if (!res.ok) return null;
    const j = await res.json() as { count?: number };
    return typeof j.count === "number" ? j.count : null;
  } catch {
    return null;
  }
}

function OnlineIndicatorBase() {
  const [realCount, setRealCount] = useState<number | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const realRef = useRef<number | null>(null);
  const fluctTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply a fluctuation then schedule the next one
  const scheduleFluctuation = () => {
    if (fluctTimerRef.current) clearTimeout(fluctTimerRef.current);
    fluctTimerRef.current = setTimeout(() => {
      setDisplay((prev) => {
        if (prev === null) return prev;
        const floor = getOnlineFloor();
        const base = Math.max(floor, realRef.current ?? prev);
        const delta = pickDelta();
        const next = Math.max(floor, Math.min(base + 4, prev + delta));
        return next;
      });
      scheduleFluctuation();
    }, randomDelay());
  };

  // Fetch real count from server
  const doFetch = async () => {
    const count = await fetchCount();
    const floor = getOnlineFloor();
    const effective = count !== null ? Math.max(floor, count) : null;
    if (effective !== null) {
      realRef.current = effective;
      setRealCount(effective);
      setDisplay((prev) => {
        // If current display is within ±4 of effective, keep it; otherwise snap.
        if (prev !== null && Math.abs(prev - effective) <= 4) return prev;
        return effective;
      });
    }
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
      title={`${shown ?? "…"} giocatori online`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 6px",
        height: 28,
        borderRadius: 8,
        background: "rgba(0,200,80,0.08)",
        border: "1px solid rgba(0,220,80,0.22)",
        cursor: "default",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Pulsing dot */}
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

      {/* Count */}
      <span style={{
        fontSize: 10,
        fontWeight: 800,
        color: "#00e050",
        letterSpacing: "0.04em",
        minWidth: 18,
        textAlign: "right",
        lineHeight: 1,
      }}>
        {shown !== null ? shown.toLocaleString() : "···"}
      </span>
    </div>
  );
}

export const OnlineIndicator = memo(OnlineIndicatorBase);
