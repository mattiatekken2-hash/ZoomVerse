import { useEffect, useRef, useState, useCallback } from "react";
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

const POOL_BASE_ZOOM = 1240000;
const POOL_ZOOM_RATE = 0.6;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const ZOOM_PER_TON = 1_000_000;

export function RankPage({ totalEarned, totalTonSpent: _totalTonSpent, feedEvents }: RankPageProps) {
  const [activeSection, setActiveSection] = useState<"season" | "exchange">("season");
  const feedRef = useRef<HTMLDivElement>(null);
  const [poolZoom, setPoolZoom] = useState(POOL_BASE_ZOOM);
  const sessionStart = useRef(Date.now());
  const [convertInput, setConvertInput] = useState("");

  const now = Date.now();
  const seasonProgress = Math.min((now - SEASON_START) / SEASON_DURATION_MS, 1);
  const currentSeason = 1;
  const isExchangeOpen = now >= SEASON_END;

  const estimatedTon = useCallback(() => {
    const zoom = parseFloat(convertInput.replace(/,/g, ""));
    if (!zoom || zoom <= 0) return null;
    return (zoom / ZOOM_PER_TON).toFixed(6);
  }, [convertInput]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - sessionStart.current) / 1000;
      setPoolZoom(POOL_BASE_ZOOM + elapsed * POOL_ZOOM_RATE);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [feedEvents.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Season Header */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
            🏆 Season {currentSeason}
          </h2>
          <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ borderColor: "rgba(0,242,254,0.15)", color: "rgba(0,242,254,0.6)" }}>
            In progress
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
            Exchange activates when Season 1 concludes
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="px-5 flex gap-2 flex-shrink-0 mb-3">
        {(["season", "exchange"] as const).map(s => (
          <button
            key={s}
            onClick={() => { haptic(5); setActiveSection(s); }}
            className="flex-1 py-2 rounded-xl text-xs font-black tracking-wider uppercase border transition-all"
            style={{
              borderColor: activeSection === s ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.06)",
              background: activeSection === s ? "rgba(0,242,254,0.06)" : "transparent",
              color: activeSection === s ? "#00f2fe" : "rgba(255,255,255,0.3)",
            }}
          >
            {s === "season" ? "🪐 Zoom Season" : "⚡ Exchange"}
          </button>
        ))}
      </div>

      {activeSection === "season" && (
        <>
          {/* User rank */}
          <div className="px-4 mb-3 flex-shrink-0">
            <div
              className="rounded-xl border flex items-center gap-3 px-4 py-3"
              style={{ borderColor: "rgba(0,242,254,0.2)", background: "rgba(0,242,254,0.04)" }}
            >
              <div className="font-black text-sm w-5 text-center flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>—</div>
              <div className="flex-1 font-bold text-sm neon-text">
                YOU <span className="text-xs opacity-40 ml-1">(you)</span>
              </div>
              <div className="text-xs font-black" style={{ color: "rgba(255,255,255,0.4)" }}>
                {Math.floor(totalEarned).toLocaleString()} $ZOOM
              </div>
            </div>
          </div>

          <div className="px-4 flex-shrink-0">
            <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              ⚡ Live Activity
            </div>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
            <div className="flex flex-col gap-1.5">
              {feedEvents.length === 0 && (
                <div className="text-xs text-center py-8 flex flex-col items-center gap-2">
                  <div style={{ fontSize: 28, opacity: 0.2 }}>🪐</div>
                  <div style={{ color: "rgba(255,255,255,0.15)" }}>No activity yet — forge and farm to appear here</div>
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
            {/* Live $ZOOM Pool */}
            <div
              className="rounded-2xl p-4 border relative overflow-hidden"
              style={{
                borderColor: "rgba(0,242,254,0.12)",
                background: "linear-gradient(135deg, rgba(0,242,254,0.05) 0%, rgba(196,113,237,0.03) 100%)",
              }}
            >
              <div
                className="absolute top-0 right-0 w-36 h-36 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(0,242,254,0.07) 0%, transparent 70%)", filter: "blur(20px)", transform: "translate(30%,-30%)" }}
              />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full" style={{ background: "#00f2fe", boxShadow: "0 0 6px #00f2fe" }} />
                <span className="font-black text-sm neon-text tracking-wide">LIVE $ZOOM POOL</span>
              </div>
              <div
                className="rounded-xl p-4 border mb-3"
                style={{ borderColor: "rgba(0,242,254,0.12)", background: "rgba(0,242,254,0.04)" }}
              >
                <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Total $ZOOM Accumulated</div>
                <div className="font-black text-2xl neon-text" style={{ letterSpacing: "-0.02em" }}>
                  {Math.floor(poolZoom + totalEarned).toLocaleString()}
                </div>
                <div className="text-xs mt-1" style={{ color: "rgba(0,242,254,0.5)" }}>
                  +{POOL_ZOOM_RATE}/s · growing live
                </div>
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                All $ZOOM earned in the ecosystem accumulates here. Exchangeable for TON at Season 1 end.
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
                  ? "Season 1 has ended. Exchange your $ZOOM for TON now."
                  : "The exchange activates at the end of Season 1"}
              </div>
              <div
                className="w-full py-3 rounded-xl font-black text-sm tracking-wider text-center border"
                style={{
                  background: isExchangeOpen ? "linear-gradient(135deg, #00e676, #00b894)" : "rgba(255,255,255,0.03)",
                  color: isExchangeOpen ? "#060810" : "rgba(255,255,255,0.15)",
                  borderColor: isExchangeOpen ? "transparent" : "rgba(255,255,255,0.05)",
                  cursor: isExchangeOpen ? "pointer" : "not-allowed",
                }}
              >
                {isExchangeOpen ? "EXCHANGE NOW" : "EXCHANGE"}
              </div>
            </div>

            {/* Conversion Simulator */}
            <div
              className="rounded-2xl p-4 border"
              style={{ borderColor: "rgba(255,215,0,0.12)", background: "rgba(255,215,0,0.025)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 14 }}>🧮</span>
                <span className="font-black text-sm tracking-wide" style={{ color: "#ffd700" }}>Conversion Simulator</span>
              </div>
              <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                Simulate how much TON your $ZOOM could be worth. Rate: 1,000,000 $ZOOM = 1 TON
              </div>

              <div className="relative mb-2">
                <input
                  type="number"
                  min={0}
                  value={convertInput}
                  onChange={e => { haptic(3); setConvertInput(e.target.value); }}
                  placeholder="Enter $ZOOM amount"
                  className="w-full rounded-xl px-4 py-3.5 text-base font-bold pr-20 outline-none"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,215,0,0.18)",
                    color: "rgba(255,215,0,0.9)",
                    caretColor: "#ffd700",
                  }}
                  inputMode="numeric"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "rgba(255,215,0,0.45)" }}>
                  $ZOOM
                </span>
              </div>

              <div
                className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between border"
                style={{ borderColor: "rgba(255,215,0,0.1)", background: "rgba(255,215,0,0.04)" }}
              >
                <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>Estimated value</span>
                <span className="font-black text-lg gold-text">
                  {estimatedTon() != null ? `≈ ${estimatedTon()} TON` : "—"}
                </span>
              </div>

              <button
                disabled
                className="w-full py-3.5 rounded-xl font-black text-sm tracking-widest uppercase border"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  color: "rgba(255,255,255,0.18)",
                  borderColor: "rgba(255,255,255,0.06)",
                  cursor: "not-allowed",
                  letterSpacing: "0.1em",
                }}
              >
                CONVERT (Disabled)
              </button>
              <div className="text-xs text-center mt-2" style={{ color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
                Real conversion is based on the final pool at Season 1 end. This is a simulation only.
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-2xl p-4 border" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}>
              <div className="font-black text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>How it works</div>
              {[
                { icon: "🪐", text: "Earn $ZOOM by farming, crafting, and referrals" },
                { icon: "☀️", text: "THE SUN generates 10,000 $ZOOM/hr — maximum yield" },
                { icon: "⏳", text: "Hold $ZOOM until Season 1 ends (3 months)" },
                { icon: "💱", text: "Exchange $ZOOM for TON from the final pool" },
                { icon: "🏆", text: "Top Zoom Season holders earn bonus rewards" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 mb-2 last:mb-0">
                  <div style={{ fontSize: 14, flexShrink: 0 }}>{step.icon}</div>
                  <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{step.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
