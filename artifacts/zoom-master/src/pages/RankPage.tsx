import { useEffect, useState, useMemo } from "react";
import type { FeedEvent, Planet } from "../hooks/useGameState";
import { useGlobalStore } from "../store/globalStore";
import { useT } from "../i18n/LanguageContext";
import { TrophyIcon } from "../components/icons/GameIcons";
import { ZoomCubeIcon } from "../components/ZoomCubeIcon";
import { isLabStardustShapeId, isLabZoomShapeId } from "@workspace/game-models";

interface RankPageProps {
  balance: number;
  seasonPoolEarned: number;
  activeFarmRate: number;
  totalTonSpent: number;
  feedEvents: FeedEvent[];
  telegramId: string | null;
  planets?: Planet[];
  visible?: boolean;
}

const SEASON_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_SEASON_START = new Date("2026-08-24T00:00:00.000Z").getTime();
const TOTAL_SEASONS = 6;

function getSeasonProgress(now: number, seasonStart: number): number {
  if (now <= seasonStart) return 0;
  return Math.min((now - seasonStart) / SEASON_DURATION_MS, 1);
}

function formatZoom(amount: number): string {
  return Math.floor(amount).toLocaleString();
}

function isPlaceholderRankName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return !n || /^player$/i.test(n);
}

function getTelegramFirstName(): string | null {
  try {
    const user = (window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } };
    }).Telegram?.WebApp?.initDataUnsafe?.user;
    const name = typeof user?.first_name === "string" ? user.first_name.trim() : "";
    return name || null;
  } catch {
    return null;
  }
}

export function RankPage({ balance, seasonPoolEarned, activeFarmRate, totalTonSpent: _totalTonSpent, feedEvents: _feedEvents, telegramId, planets = [], visible }: RankPageProps) {
  void visible;
  void seasonPoolEarned;
  void activeFarmRate;
  void _totalTonSpent;
  void _feedEvents;
  const [currentTime, setCurrentTime] = useState(Date.now());
  const { t, lang } = useT();

  // All shared data is pre-loaded centrally — no per-mount fetch, no pop-in
  const leaderboard = useGlobalStore((s) => s.leaderboard);
  const profile = useGlobalStore((s) => s.profile);
  const seasonEpoch = useGlobalStore((s) => s.seasonEpoch);
  const initialized = useGlobalStore((s) => s.initialized);
  const seasonStart = seasonEpoch && seasonEpoch > 0 ? seasonEpoch : DEFAULT_SEASON_START;
  const loadingLb = !initialized && leaderboard.length === 0;
  const visibleLeaderboard = useMemo(() => {
    const tgName = getTelegramFirstName();
    const rows = leaderboard
      .filter((entry) => {
        if (telegramId && entry.telegramId === telegramId) return true;
        return !isPlaceholderRankName(entry.firstName);
      })
      .map((entry) => {
        if (
          telegramId &&
          entry.telegramId === telegramId &&
          isPlaceholderRankName(entry.firstName) &&
          tgName
        ) {
          return { ...entry, firstName: tgName };
        }
        return entry;
      });
    if (telegramId && balance > 0 && !rows.some((e) => e.telegramId === telegramId)) {
      rows.push({
        rank: 0,
        telegramId,
        firstName: tgName || "",
        photoUrl: null,
        zoomBalance: balance,
      });
    }
    return rows
      .sort((a, b) => b.zoomBalance - a.zoomBalance)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [leaderboard, telegramId, balance]);

  const labRarityCounts = useMemo(() => {
    const crafted = profile?.crafted as Record<string, number> | undefined;
    const zoomFromFarm = planets.filter((p) => isLabZoomShapeId(p.shapeId)).length;
    const stardustFromFarm = planets.filter((p) => isLabStardustShapeId(p.shapeId)).length;
    return {
      ZOOM: crafted?.ZOOM ?? zoomFromFarm,
      STARDUST: crafted?.STARDUST ?? stardustFromFarm,
    };
  }, [planets, profile?.crafted]);

  const seasonProgress = getSeasonProgress(currentTime, seasonStart);
  const currentSeason = 3;
  const seasonProgressPercent = seasonProgress * 100;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Season Header */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
            <TrophyIcon size={26} /> {t("rank.season", { n: currentSeason })}
          </h2>
          <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ borderColor: "rgba(158,197,232,0.18)", color: "#9EC5E8" }}>
            {t("rank.inProgress")}
          </span>
        </div>

        <div className="rounded-xl p-3 border mb-3" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div className="flex justify-between text-xs mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="font-bold">{t("rank.seasonOf", { n: currentSeason, tot: TOTAL_SEASONS })}</span>
            <span className="font-bold" style={{ color: "#9EC5E8" }}>{seasonProgressPercent.toFixed(2)}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${seasonProgressPercent}%`,
                background: "linear-gradient(90deg, #7a9ec8, #9EC5E8, #C9D6E8)",
                boxShadow: "0 0 10px rgba(158,197,232,0.45)",
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
                      background: isActive ? "hsl(210 22% 90%)" : isDone ? "rgba(158,197,232,0.15)" : "rgba(255,255,255,0.05)",
                      borderColor: isActive ? "rgba(255,255,255,0.35)" : isDone ? "rgba(158,197,232,0.28)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "hsl(222 28% 10%)" : isDone ? "#9EC5E8" : "rgba(255,255,255,0.2)",
                      boxShadow: isActive ? "0 0 8px rgba(200,220,255,0.35)" : "none",
                    }}
                  >
                    {isDone ? "✓" : sNum}
                  </div>
                  <div className="font-bold" style={{ color: isActive ? "#E8ECF4" : "rgba(255,255,255,0.2)", fontSize: 8 }}>
                    S{sNum}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            {t("rank.exchangeActSeason", { n: currentSeason })}
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
            <div className="rounded-2xl border p-3" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-black text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{t("rank.myProfile")}</span>
                {profile.createdAt && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(158,197,232,0.08)", color: "rgba(232,236,244,0.75)", border: "1px solid rgba(158,197,232,0.15)" }}>
                    {t("rank.joined", { date: new Date(profile.createdAt).toLocaleDateString(lang === "it" ? "it-IT" : lang === "ru" ? "ru-RU" : lang === "uk" ? "uk-UA" : "en-US") })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "ZOOM", label: "$ZOOM", color: "#7bed9f" },
                  { key: "STARDUST", label: "★ STARDUST", color: "#ffd740" },
                ] as const).map(({ key, label, color }) => (
                  <div key={key} className="rounded-lg p-2 text-center" style={{ background: color + "10", border: `1px solid ${color}20` }}>
                    <div className="font-black text-base" style={{ color }}>{labRarityCounts[key]}</div>
                    <div className="text-[9px] font-bold uppercase" style={{ color: color + "90" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Live season rank */}
        <div className="px-4 mb-3">
          <div
            className="rounded-2xl border p-3"
            style={{ borderColor: "rgba(158,197,232,0.16)", background: "rgba(158,197,232,0.035)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#9EC5E8", boxShadow: "0 0 6px rgba(158,197,232,0.75)" }} />
                <span className="font-black text-sm tracking-wide" style={{ color: "#E8ECF4" }}>{t("rank.liveSeasonRank")}</span>
              </div>
              <span />
            </div>
            <div className="flex flex-col gap-1.5">
              {loadingLb && visibleLeaderboard.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "rgba(255,255,255,0.2)" }}>{t("common.loading")}</div>
              )}
              {!loadingLb && visibleLeaderboard.length === 0 && (
                <div className="text-xs text-center py-3" style={{ color: "rgba(255,255,255,0.2)" }}>{t("rank.noPlayers")}</div>
              )}
              {visibleLeaderboard.slice(0, 10).map((entry) => {
                const isUser = !!telegramId && entry.telegramId === telegramId;
                const top3 = entry.rank <= 3;
                const displayName = isPlaceholderRankName(entry.firstName)
                  ? (isUser ? (getTelegramFirstName() || t("rank.you2")) : "")
                  : entry.firstName;
                return (
                  <div
                    key={entry.telegramId}
                    className="rounded-xl border flex items-center gap-3 px-3 py-2 transition-all"
                    style={{
                      borderColor: top3 ? "rgba(255,215,64,0.45)" : isUser ? "rgba(158,197,232,0.28)" : "rgba(255,255,255,0.05)",
                      background: top3 ? "rgba(255,215,64,0.08)" : isUser ? "rgba(158,197,232,0.08)" : "rgba(255,255,255,0.02)",
                      boxShadow: top3 ? "0 0 14px rgba(255,215,64,0.18)" : undefined,
                    }}
                  >
                    <div className="font-black text-sm w-7 text-center flex-shrink-0" style={{ color: isUser ? "#E8ECF4" : "rgba(255,255,255,0.28)" }}>
                      #{entry.rank}
                    </div>
                    {top3 && (
                      <span className="rank-zoom-badge" title="Top 3">
                        <ZoomCubeIcon size={18} />
                      </span>
                    )}
                    {entry.photoUrl ? (
                      <img
                        src={entry.photoUrl}
                        alt=""
                        className="rounded-full object-cover flex-shrink-0"
                        style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.2)" }}
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : null}
                    <div className={isUser ? "flex-1 font-black text-sm" : "flex-1 font-bold text-sm"} style={{ color: isUser ? "#E8ECF4" : "rgba(255,255,255,0.58)" }}>
                      {displayName}
                      {isUser && !isPlaceholderRankName(entry.firstName) && (
                        <span className="text-xs opacity-40 ml-1">{t("rank.you")}</span>
                      )}
                    </div>
                    <div className="text-xs font-black tabular-nums" style={{ color: isUser ? "#9EC5E8" : "rgba(255,255,255,0.42)" }}>
                      {t("rank.zoomBalance", { n: formatZoom(entry.zoomBalance) })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
              {t("rank.top10desc")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
