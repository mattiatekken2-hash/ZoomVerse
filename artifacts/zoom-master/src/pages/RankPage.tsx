import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "../hooks/useGameState";
import { haptic } from "../utils/haptic";

interface RankPageProps {
  balance: number;
  totalEarned: number;
  totalTonSpent: number;
  feedEvents: FeedEvent[];
}

const SEASON_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const SEASON_START = new Date("2026-03-01").getTime();
const TOTAL_SEASONS = 6;
const SEASON_END = SEASON_START + SEASON_DURATION_MS;

const POOL_BASE_ZOOM = 850000;
const POOL_BASE_TON = 128.5;
const POOL_ZOOM_RATE = 0.4;
const POOL_TON_RATE = 0.00008;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function RankPage({ totalEarned, totalTonSpent, feedEvents }: RankPageProps) {
  const [activeTab, setActiveTab] = useState<"whale" | "season">("whale");
  const [activeSection, setActiveSection] = useState<"rank" | "exchange">("rank");
  const feedRef = useRef<HTMLDivElement>(null);
  const [poolZoom, setPoolZoom] = useState(POOL_BASE_ZOOM);
  const [poolTon, setPoolTon] = useState(POOL_BASE_TON);
  const sessionStart = useRef(Date.now());

  const now = Date.now();
  const seasonProgress = Math.min((now - SEASON_START) / SEASON_DURATION_MS, 1);
  const daysLeft = Math.max(0, Math.ceil((SEASON_END - now) / 86400000));
  const currentSeason = 1;
  const isExchangeOpen = now >= SEASON_END;

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - sessionStart.current) / 1000;
      setPoolZoom(POOL_BASE_ZOOM + elapsed * POOL_ZOOM_RATE);
      setPoolTon(POOL_BASE_TON + elapsed * POOL_TON_RATE);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [feedEvents.length]);

  const yourWhaleValue = totalTonSpent;
  const yourZoomValue = Math.floor(totalEarned);

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
          <div className="w-full h-2 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
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
          <div className="flex items-center justify-between">
            {Array.from({ length: TOTAL_SEASONS }, (_, i) => {
              const sNum = i + 1;
              const isActive = sNum === currentSeason;
              const isDone = sNum < currentSeason;
              return (
                <div key={sNum} className="flex flex-col items-center gap-1">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs border"
                    style={{
                      background: isActive ? "linear-gradient(135deg, #00f2fe, #4facfe)" : isDone ? "rgba(0,242,254,0.15)" : "rgba(255,255,255,0.05)",
                      borderColor: isActive ? "#00f2fe" : isDone ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "#060810" : isDone ? "#00f2fe" : "rgba(255,255,255,0.2)",
                      boxShadow: isActive ? "0 0 8px rgba(0,242,254,0.6)" : "none",
                    }}
                  >
                    {isDone ? "✓" : sNum}
                  </div>
                  <div className="font-bold" style={{ color: isActive ? "#00f2fe" : "rgba(255,255,255,0.2)", fontSize: 8 }}>
                    S{sNum}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            Withdraw & Exchange opens at season end
          </div>
        </div>
      </div>

      {/* SECTION TABS */}
      <div className="px-5 flex gap-2 flex-shrink-0 mb-3">
        <button
          onClick={() => { haptic(5); setActiveSection("rank"); }}
          className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
          style={{
            borderColor: activeSection === "rank" ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.06)",
            background: activeSection === "rank" ? "rgba(0,242,254,0.06)" : "transparent",
            color: activeSection === "rank" ? "#00f2fe" : "rgba(255,255,255,0.3)",
          }}
        >
          🏆 Rank
        </button>
        <button
          onClick={() => { haptic(5); setActiveSection("exchange"); }}
          className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
          style={{
            borderColor: activeSection === "exchange" ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.06)",
            background: activeSection === "exchange" ? "rgba(255,215,0,0.06)" : "transparent",
            color: activeSection === "exchange" ? "#ffd700" : "rgba(255,255,255,0.3)",
          }}
        >
          ⚡ Exchange
        </button>
      </div>

      {activeSection === "rank" && (
        <>
          <div className="px-5 flex gap-2 flex-shrink-0 mb-3">
            {(["whale", "season"] as const).map(t => (
              <button
                key={t}
                onClick={() => { haptic(5); setActiveTab(t); }}
                className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
                style={{
                  borderColor: activeTab === t ? "rgba(0,242,254,0.25)" : "rgba(255,255,255,0.05)",
                  background: activeTab === t ? "rgba(0,242,254,0.05)" : "transparent",
                  color: activeTab === t ? "#00f2fe" : "rgba(255,255,255,0.25)",
                }}
              >
                {t === "whale" ? "🐳 Whale Rank" : "🪐 Zoom Season"}
              </button>
            ))}
          </div>

          <div className="px-4 flex flex-col gap-2 flex-shrink-0">
            <div
              className="rounded-xl border flex items-center gap-3 px-3 py-2.5"
              style={{ borderColor: "rgba(0,242,254,0.2)", background: "rgba(0,242,254,0.05)" }}
            >
              <div className="font-black text-sm w-5 text-center flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>—</div>
              <div className="flex-1 font-bold text-sm neon-text">
                YOU <span className="text-xs opacity-50 ml-1">(you)</span>
              </div>
              <div className="text-xs font-black" style={{ color: "rgba(255,255,255,0.4)" }}>
                {activeTab === "whale"
                  ? `${yourWhaleValue.toFixed(1)} TON`
                  : `${yourZoomValue.toLocaleString()} $ZOOM`}
              </div>
            </div>
          </div>

          <div className="px-4 mt-3 flex-shrink-0">
            <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              ⚡ Live Activity
            </div>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
            <div className="flex flex-col gap-1.5">
              {feedEvents.length === 0 && (
                <div className="text-xs text-center py-6" style={{ color: "rgba(255,255,255,0.15)" }}>
                  No activity yet — start playing to see events here
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
        </>
      )}

      {activeSection === "exchange" && (
        <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
          <div className="flex flex-col gap-3">
            {/* Live Pool Widget */}
            <div
              className="rounded-2xl p-4 border relative overflow-hidden"
              style={{
                borderColor: "rgba(0,242,254,0.15)",
                background: "linear-gradient(135deg, rgba(0,242,254,0.05) 0%, rgba(196,113,237,0.04) 100%)",
                boxShadow: "0 0 24px rgba(0,242,254,0.06)",
              }}
            >
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(0,242,254,0.08) 0%, transparent 70%)",
                  filter: "blur(20px)",
                  transform: "translate(30%, -30%)",
                  pointerEvents: "none",
                }}
              />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: "#00f2fe", boxShadow: "0 0 6px #00f2fe", animation: "pulse-soft 2s infinite" }} />
                <span className="font-black text-sm neon-text tracking-wide">LIVE FINAL POOL</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div
                  className="rounded-xl p-3 border"
                  style={{ borderColor: "rgba(0,242,254,0.12)", background: "rgba(0,242,254,0.04)" }}
                >
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>$ZOOM Pool</div>
                  <div className="font-black text-lg neon-text" style={{ letterSpacing: "-0.02em" }}>
                    {Math.floor(poolZoom + totalEarned).toLocaleString()}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(0,242,254,0.5)" }}>+{POOL_ZOOM_RATE}/s</div>
                </div>
                <div
                  className="rounded-xl p-3 border"
                  style={{ borderColor: "rgba(255,215,0,0.12)", background: "rgba(255,215,0,0.03)" }}
                >
                  <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>TON Pool</div>
                  <div className="font-black text-lg gold-text" style={{ letterSpacing: "-0.02em" }}>
                    {(poolTon + totalTonSpent).toFixed(2)}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(255,215,0,0.5)" }}>Live</div>
                </div>
              </div>

              <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                Pool accumulates all $ZOOM earned and TON spent in the game. Distributed to holders at season end.
              </div>
            </div>

            {/* Exchange Lock */}
            <div
              className="rounded-2xl p-5 border flex flex-col items-center gap-3 text-center"
              style={{
                borderColor: isExchangeOpen ? "rgba(0,230,118,0.2)" : "rgba(255,255,255,0.06)",
                background: isExchangeOpen ? "rgba(0,230,118,0.04)" : "rgba(255,255,255,0.01)",
              }}
            >
              <div style={{ fontSize: 36 }}>{isExchangeOpen ? "🔓" : "🔒"}</div>
              <div className="font-black text-base tracking-wide" style={{ color: isExchangeOpen ? "#00e676" : "rgba(255,255,255,0.5)" }}>
                {isExchangeOpen ? "Exchange Open!" : "Exchange Locked"}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                {isExchangeOpen
                  ? "Season 1 has ended. You can now exchange your $ZOOM for TON."
                  : `Available at Season 1 end · ${daysLeft} days remaining`}
              </div>
              {!isExchangeOpen && (
                <div
                  className="w-full py-3 rounded-xl font-black text-sm tracking-wider text-center border"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.2)",
                    borderColor: "rgba(255,255,255,0.06)",
                    cursor: "not-allowed",
                  }}
                >
                  EXCHANGE (SOON)
                </div>
              )}
            </div>

            {/* Exchange Info */}
            <div className="rounded-2xl p-4 border" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}>
              <div className="font-black text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
                How it works
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { icon: "🪐", text: "Earn $ZOOM by farming, crafting, and referrals" },
                  { icon: "⏳", text: "Hold until Season 1 ends (90 days)" },
                  { icon: "💱", text: "Exchange $ZOOM for TON from the final pool" },
                  { icon: "🏆", text: "Top holders get bonus rewards" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div style={{ fontSize: 16, flexShrink: 0 }}>{step.icon}</div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{step.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
