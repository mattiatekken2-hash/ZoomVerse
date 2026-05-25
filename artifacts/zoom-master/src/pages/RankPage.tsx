import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "../hooks/useGameState";
import { useGlobalStore } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";

interface RankPageProps {
  balance: number;
  seasonPoolEarned: number;
  activeFarmRate: number;
  totalTonSpent: number;
  feedEvents: FeedEvent[];
  telegramId: string | null;
  visible?: boolean;
}

const SEASON_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_SEASON_START = new Date("2026-04-14T00:00:00.000Z").getTime();
const TOTAL_SEASONS = 6;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function getSeasonProgress(now: number, seasonStart: number): number {
  if (now <= seasonStart) return 0;
  return Math.min((now - seasonStart) / SEASON_DURATION_MS, 1);
}

function formatZoom(amount: number): string {
  return Math.floor(amount).toLocaleString();
}

export function RankPage({ balance, seasonPoolEarned, activeFarmRate, totalTonSpent: _totalTonSpent, feedEvents, telegramId, visible }: RankPageProps) {
  void telegramId;
  void visible;
  void seasonPoolEarned;
  void activeFarmRate;
  void _totalTonSpent;
  const feedRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const { t } = useT();

  // All shared data is pre-loaded centrally — no per-mount fetch, no pop-in
  const leaderboard = useGlobalStore((s) => s.leaderboard);
  const profile = useGlobalStore((s) => s.profile);
  const seasonEpoch = useGlobalStore((s) => s.seasonEpoch);
  const initialized = useGlobalStore((s) => s.initialized);
  const seasonStart = seasonEpoch && seasonEpoch > 0 ? seasonEpoch : DEFAULT_SEASON_START;
  const loadingLb = !initialized && leaderboard.length === 0;

  const seasonProgress = getSeasonProgress(currentTime, seasonStart);
  const currentSeason = 2;
  const seasonProgressPercent = seasonProgress * 100;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
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
            <span className="font-bold neon-text">{seasonProgressPercent.toFixed(2)}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${seasonProgressPercent}%`,
                background: "linear-gradient(90deg, #c471ed, #00f2fe, #ffd700)",
                boxShadow: "0 0 10px rgba(0,242,254,0.6)",
                transition: "width 1s linear",
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
            Exchange activates when Season 2 concludes
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          minHeight: 0,
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          transform: "translateZ(0)",
          willChange: "scroll-position",
          contain: "layout paint",
        }}
      >
        {profile?.exists && (
          <div className="px-4 mb-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-black text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{t("rank.myProfile")}</span>
                {profile.createdAt && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,242,254,0.08)", color: "rgba(0,242,254,0.6)", border: "1px solid rgba(0,242,254,0.15)" }}>
                    {t("rank.joined", { date: new Date(profile.createdAt).toLocaleDateString("it-IT") })}
                  </span>
                )}
              </div>
              {profile.crafted && (
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "BASIC", label: "Basic", color: "#8892b0" },
                    { key: "RARE", label: "Rare", color: "#4facfe" },
                    { key: "EPIC", label: "Epic", color: "#c471ed" },
                    { key: "MYTHIC", label: "Mythic", color: "#dc143c" },
                    { key: "PLASMA", label: "Plasma", color: "#00e676" },
                    { key: "GOLD", label: "Gold", color: "#ffd700" },
                    { key: "V1", label: "V1", color: "#f5fbff" },
                  ] as const).map(({ key, label, color }) => (
                    <div key={key} className="rounded-lg p-2 text-center" style={{ background: color + "10", border: `1px solid ${color}20` }}>
                      <div className="font-black text-base" style={{ color }}>{profile.crafted![key] ?? 0}</div>
                      <div className="text-[9px] font-bold uppercase" style={{ color: color + "90" }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live season rank */}
        <div className="px-4 mb-3">
          <div
            className="rounded-2xl border p-3"
            style={{ borderColor: "rgba(0,242,254,0.16)", background: "rgba(0,242,254,0.035)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#00f2fe", boxShadow: "0 0 6px #00f2fe" }} />
                <span className="font-black text-sm neon-text tracking-wide">LIVE SEASON RANK</span>
              </div>
              <span className="text-[10px] font-bold uppercase" style={{ color: "rgba(0,242,254,0.45)" }}>wallet sync</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {loadingLb && leaderboard.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "rgba(255,255,255,0.2)" }}>Loading...</div>
              )}
              {!loadingLb && leaderboard.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "rgba(255,255,255,0.2)" }}>No players yet — start farming to appear here</div>
              )}
              {leaderboard.slice(0, 10).map((entry) => {
                const isUser = !!telegramId && entry.telegramId === telegramId;
                const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
                return (
                  <div
                    key={entry.telegramId}
                    className="rounded-xl border flex items-center gap-3 px-3 py-2 transition-all"
                    style={{
                      borderColor: isUser ? "rgba(0,242,254,0.28)" : "rgba(255,255,255,0.05)",
                      background: isUser ? "rgba(0,242,254,0.08)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="font-black text-sm w-7 text-center flex-shrink-0" style={{ color: isUser ? "#00f2fe" : "rgba(255,255,255,0.28)" }}>
                      {medal ?? `#${entry.rank}`}
                    </div>
                    <div className={isUser ? "flex-1 font-black text-sm neon-text" : "flex-1 font-bold text-sm"} style={{ color: isUser ? undefined : "rgba(255,255,255,0.58)" }}>
                      {entry.firstName}
                      {isUser && <span className="text-xs opacity-40 ml-1">(you)</span>}
                    </div>
                    <div className="text-xs font-black tabular-nums" style={{ color: isUser ? "#00f2fe" : "rgba(255,255,255,0.42)" }}>
                      {formatZoom(entry.zoomBalance)} $ZOOM
                    </div>
                  </div>
                );
              })}
              {telegramId && leaderboard.length > 0 && !leaderboard.some(e => e.telegramId === telegramId) && (
                <div
                  className="rounded-xl border flex items-center gap-3 px-3 py-2 mt-1"
                  style={{ borderColor: "rgba(0,242,254,0.15)", background: "rgba(0,242,254,0.04)" }}
                >
                  <div className="font-black text-sm w-7 text-center flex-shrink-0" style={{ color: "rgba(0,242,254,0.5)" }}>—</div>
                  <div className="flex-1 font-black text-sm neon-text opacity-60">YOU</div>
                  <div className="text-xs font-black tabular-nums" style={{ color: "rgba(0,242,254,0.5)" }}>
                    {formatZoom(balance)} $ZOOM
                  </div>
                </div>
              )}
            </div>
            <div className="text-[10px] mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
              Top 10 players by $ZOOM balance, updated in real time from the server.
            </div>
          </div>
        </div>

        <div className="px-4">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            ⚡ Live Activity
          </div>
        </div>
        <div ref={feedRef} className="px-4 pb-4">
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
      </div>
    </div>
  );
}
