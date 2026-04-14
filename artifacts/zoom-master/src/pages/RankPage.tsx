import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "../hooks/useGameState";

interface RankPageProps {
  balance: number;
  totalEarned: number;
  totalTonSpent: number;
  feedEvents: FeedEvent[];
}

const SEASON_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const SEASON_START = new Date("2026-03-01").getTime();
const TOTAL_SEASONS = 6;

const MOCK_WHALE = [
  { rank: 1, name: "cosmicwolf", value: 142.5, color: "#ffd700" },
  { rank: 2, name: "stardust99", value: 89.2, color: "#ffd700" },
  { rank: 3, name: "deepspace42", value: 67.8, color: "#c471ed" },
  { rank: 4, name: "nebula_k", value: 44.1, color: "#4facfe" },
  { rank: 5, name: "YOU", value: 0, color: "#00f2fe", isYou: true },
];

const MOCK_WEALTH = [
  { rank: 1, name: "voidwalker_", value: 485200, color: "#ffd700" },
  { rank: 2, name: "galaxis", value: 312500, color: "#ffd700" },
  { rank: 3, name: "luminos", value: 198700, color: "#c471ed" },
  { rank: 4, name: "astrox", value: 87300, color: "#4facfe" },
  { rank: 5, name: "YOU", value: 0, color: "#00f2fe", isYou: true },
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function RankPage({ balance: _balance, totalEarned, totalTonSpent, feedEvents }: RankPageProps) {
  const [activeTab, setActiveTab] = useState<"whale" | "wealth">("whale");
  const feedRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const seasonProgress = Math.min((now - SEASON_START) / SEASON_DURATION_MS, 1);
  const daysLeft = Math.max(0, Math.ceil((SEASON_START + SEASON_DURATION_MS - now) / 86400000));
  const currentSeason = 1;

  const whaleList = MOCK_WHALE.map(e => ({ ...e, value: e.isYou ? totalTonSpent : e.value }));
  const wealthList = MOCK_WEALTH.map(e => ({ ...e, value: e.isYou ? Math.floor(totalEarned) : e.value }));
  const list = activeTab === "whale" ? whaleList : wealthList;
  const unit = activeTab === "whale" ? "TON" : "$ZOOM";

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [feedEvents.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
            🏆 Season {currentSeason}
          </h2>
          <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ borderColor: "rgba(0,242,254,0.2)", color: "#00f2fe" }}>
            {daysLeft}d left
          </span>
        </div>

        <div className="rounded-xl p-3 border mb-3" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex justify-between text-xs mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="font-bold">Season {currentSeason} of {TOTAL_SEASONS}</span>
            <span className="font-bold neon-text">{Math.round(seasonProgress * 100)}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${seasonProgress * 100}%`,
                background: "linear-gradient(90deg, #c471ed, #00f2fe, #ffd700)",
                boxShadow: "0 0 10px rgba(0,242,254,0.6)",
                transition: "width 0.5s ease",
              }}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            {Array.from({ length: TOTAL_SEASONS }, (_, i) => {
              const sNum = i + 1;
              const isActive = sNum === currentSeason;
              const isDone = sNum < currentSeason;
              return (
                <div key={sNum} className="flex flex-col items-center gap-1">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs border"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, #00f2fe, #4facfe)"
                        : isDone
                        ? "rgba(0,242,254,0.15)"
                        : "rgba(255,255,255,0.05)",
                      borderColor: isActive
                        ? "#00f2fe"
                        : isDone
                        ? "rgba(0,242,254,0.3)"
                        : "rgba(255,255,255,0.08)",
                      color: isActive ? "#060810" : isDone ? "#00f2fe" : "rgba(255,255,255,0.2)",
                      boxShadow: isActive ? "0 0 8px rgba(0,242,254,0.6)" : "none",
                    }}
                  >
                    {isDone ? "✓" : sNum}
                  </div>
                  <div className="text-xs font-bold" style={{ color: isActive ? "#00f2fe" : "rgba(255,255,255,0.2)", fontSize: 8 }}>
                    S{sNum}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
            Withdraw & Exchange opens at season end
          </div>
        </div>
      </div>

      <div className="px-5 flex gap-2 flex-shrink-0 mb-3">
        {(["whale", "wealth"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
            style={{
              borderColor: activeTab === t ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.06)",
              background: activeTab === t ? "rgba(0,242,254,0.06)" : "transparent",
              color: activeTab === t ? "#00f2fe" : "rgba(255,255,255,0.3)",
            }}
          >
            {t === "whale" ? "🐳 Whale Rank" : "💰 Wealth Rank"}
          </button>
        ))}
      </div>

      <div className="px-4 flex flex-col gap-2 flex-shrink-0">
        {list.map(entry => (
          <div
            key={entry.rank}
            className="rounded-xl border flex items-center gap-3 px-3 py-2.5"
            style={{
              borderColor: entry.isYou ? "rgba(0,242,254,0.2)" : "rgba(255,255,255,0.05)",
              background: entry.isYou ? "rgba(0,242,254,0.05)" : "transparent",
            }}
            data-testid={`rank-entry-${entry.rank}`}
          >
            <div className="font-black text-sm w-5 text-center flex-shrink-0" style={{ color: entry.rank <= 3 ? "#ffd700" : "rgba(255,255,255,0.3)" }}>
              {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
            </div>
            <div className="flex-1 font-bold text-sm" style={{ color: entry.isYou ? "#00f2fe" : "rgba(255,255,255,0.8)" }}>
              {entry.name}{entry.isYou && <span className="text-xs ml-1 opacity-50">(you)</span>}
            </div>
            <div className="text-xs font-black" style={{ color: entry.rank <= 3 ? "#ffd700" : "rgba(255,255,255,0.4)" }}>
              {activeTab === "whale" ? `${entry.value.toFixed(1)}` : Math.floor(entry.value).toLocaleString()} {unit}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 mt-4 flex-shrink-0">
        <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          ⚡ Live Activity
        </div>
      </div>
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
        <div className="flex flex-col gap-1.5">
          {feedEvents.length === 0 && (
            <div className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.2)" }}>
              Waiting for activity...
            </div>
          )}
          {feedEvents.map(ev => (
            <div
              key={ev.id}
              className="feed-item rounded-xl px-3 py-2 border flex items-center gap-2"
              style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#00f2fe", boxShadow: "0 0 4px #00f2fe" }} />
              <div className="flex-1 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{ev.text}</div>
              <div className="text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>{timeAgo(ev.timestamp)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
