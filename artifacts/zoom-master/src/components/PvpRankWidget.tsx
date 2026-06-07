import { useEffect, useState, memo } from "react";
import { fetchPvpLeaderboard, type PvpLeaderboardResponse } from "../utils/api";
import { useT } from "../i18n/LanguageContext";

// PvP DAILY LEADERBOARD widget.
//
// Floats on the right of the LAB page directly BELOW the V1 NFT widget
// (right:12 / top:320, h:60 → bottom 380). We anchor at top:390 so the PVP
// tile sits just under the NFT card without overlapping it.
//
// Click → modal "PVP LEADERBOARD" with a live countdown to the next 00:00
// UTC reset, the top-10 by today's PvP win points (with Telegram avatars and
// stardust prize badges for ranks 1..10), and — if the caller is outside the
// top 10 but has points today — a pinned row at the bottom showing their
// current rank + wins.

interface Props {
  telegramId?: string | null;
}

const PVP_PRIZES = [200, 100, 80, 40, 40, 20, 20, 20, 20, 20];

function msUntilNextUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(0, next - now);
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function PvpRankWidgetBase({ telegramId }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PvpLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(() => msUntilNextUtcMidnight());

  // Refresh standings every time the modal opens (cheap GET, no caching).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchPvpLeaderboard(telegramId)
      .then((res) => { if (alive) setData(res); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, telegramId]);

  // Tick the countdown once per second while the modal is open.
  useEffect(() => {
    if (!open) return;
    setRemaining(msUntilNextUtcMidnight());
    const id = setInterval(() => setRemaining(msUntilNextUtcMidnight()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const me = data?.me ?? null;

  return (
    <>
      <style>{`
        @keyframes pvp-glow {
          0%,100% { box-shadow: 0 0 14px rgba(255,70,86,0.45), inset 0 0 6px rgba(255,255,255,0.05); }
          50%     { box-shadow: 0 0 22px rgba(255,70,86,0.78), inset 0 0 10px rgba(255,255,255,0.08); }
        }
        @keyframes pvp-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        .pvp-pixel { image-rendering: pixelated; }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: 390,
          right: 12,
          width: 60,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4,
          borderRadius: 14,
          background: "rgba(8,12,28,0.78)",
          border: "1.5px solid rgba(255,70,86,0.6)",
          animation: "pvp-glow 2.4s ease-in-out infinite",
          color: "#fff",
          zIndex: 35,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-pvp-rank"
        aria-label={t("pvp.openAria")}
      >
        <div style={{ animation: "pvp-float 2.4s ease-in-out infinite" }}>
          <PixelPvp size={46} />
        </div>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,8,16,0.88)",
            backdropFilter: "blur(8px)",
            zIndex: 110,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "120px 20px 20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(46,10,14,0.98), rgba(14,6,8,0.98))",
              border: "1.5px solid rgba(255,70,86,0.5)",
              borderRadius: 20,
              padding: 22,
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 0 48px rgba(255,70,86,0.25)",
              textAlign: "center",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="font-black text-lg tracking-wider" style={{ color: "#ff6b78", marginBottom: 4 }}>
              {t("pvp.title")}
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
              {t("pvp.subtitle")}
            </div>

            {/* Countdown to next 00:00 UTC reset */}
            <div
              style={{
                marginBottom: 14,
                padding: "8px 10px",
                borderRadius: 12,
                background: "rgba(255,70,86,0.08)",
                border: "1px solid rgba(255,70,86,0.3)",
                color: "#ff9ba4",
                fontSize: 13,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
              data-testid="pvp-countdown"
            >
              {t("pvp.resetsIn", { t: formatCountdown(remaining) })}
            </div>

            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {loading && !data && (
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
                  {t("common.loading")}
                </div>
              )}

              {data && data.entries.length === 0 && !loading && (
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
                  {t("pvp.empty")}
                </div>
              )}

              {data && data.entries.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                  {data.entries.map((e) => {
                    const isCaller = !!telegramId && e.telegramId === telegramId;
                    const isPodium = e.prize !== null;
                    const rankColor =
                      e.rank === 1 ? "#ffd23f" :
                      e.rank === 2 ? "#dfe3ea" :
                      e.rank === 3 ? "#cd9466" :
                      "rgba(255,255,255,0.55)";
                    return (
                      <div
                        key={e.rank}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: isCaller
                            ? "rgba(255,70,86,0.16)"
                            : isPodium ? "rgba(255,70,86,0.06)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isCaller ? "rgba(255,70,86,0.6)" : isPodium ? "rgba(255,70,86,0.25)" : "rgba(255,255,255,0.08)"}`,
                        }}
                        data-testid={`pvp-row-${e.rank}`}
                      >
                        <div style={{
                          width: 24, textAlign: "center",
                          fontWeight: 900, fontSize: 14,
                          color: rankColor,
                        }}>
                          #{e.rank}
                        </div>
                        <Avatar photoUrl={e.photoUrl} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: "#fff", fontWeight: 700, fontSize: 13,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {e.name}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                            {e.points === 1 ? t("pvp.point", { n: e.points }) : t("pvp.points", { n: e.points })}
                          </div>
                        </div>
                        {e.prize !== null && (
                          <div
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              background: "rgba(255,210,63,0.15)",
                              border: "1px solid rgba(255,210,63,0.45)",
                              color: "#ffd23f",
                              fontSize: 11,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                          >
                            +{e.prize} ⭐
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Prize legend */}
              <div style={{
                marginTop: 14, paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 10, color: "rgba(255,255,255,0.55)",
                display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4,
              }}>
                {PVP_PRIZES.map((p, i) => (
                  <div key={i} style={{
                    padding: "4px 2px", borderRadius: 6,
                    background: "rgba(255,70,86,0.05)",
                    border: "1px solid rgba(255,70,86,0.2)",
                    textAlign: "center",
                  }}>
                    <div style={{ color: "#ff9ba4", fontWeight: 800 }}>#{i + 1}</div>
                    <div style={{ color: "rgba(255,255,255,0.7)" }}>+{p}⭐</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pinned caller row when outside the top 10 */}
            {me && me.rank !== null && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(255,70,86,0.12)",
                  border: "1.5px solid rgba(255,70,86,0.5)",
                  textAlign: "left",
                }}
                data-testid="pvp-me-row"
              >
                <div style={{ width: 24, textAlign: "center", fontWeight: 900, fontSize: 14, color: "#ff9ba4" }}>
                  #{me.rank}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                    {t("pvp.yourPosition")}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>
                    {me.points === 1 ? t("pvp.win", { n: me.points }) : t("pvp.wins", { n: me.points })}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                marginTop: 14,
                background: "transparent",
                color: "rgba(255,255,255,0.5)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              data-testid="button-pvp-close"
            >
              {t("common.close").toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Telegram avatar with graceful fallback to a neutral circle. */
function Avatar({ photoUrl }: { photoUrl: string | null }) {
  if (!photoUrl) {
    return (
      <div
        style={{
          width: 32, height: 32, borderRadius: "9999px", flexShrink: 0,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(255,255,255,0.15)",
        }}
      />
    );
  }
  return (
    <img
      src={photoUrl}
      alt=""
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.2)" }}
      referrerPolicy="no-referrer"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

/** Pixel-art "PVP" wordmark rendered as inline SVG. Each letter is a 3×5
 *  grid; letters are separated by a 1px gap → 11×5 total. Matches the LAB's
 *  crispEdges pixel aesthetic (same approach as the Hall of Fame trophy). */
function PixelPvp({ size }: { size: number }) {
  const red = "#ff5566";
  // 3×5 glyphs (1 = filled).
  const P = [
    "111",
    "101",
    "111",
    "100",
    "100",
  ];
  const V = [
    "101",
    "101",
    "101",
    "101",
    "010",
  ];
  const letters = [P, V, P];
  const cols = 3 * 3 + 2; // 3 glyphs of width 3 + 2 gaps = 11
  const rows = 5;
  const rects: React.ReactElement[] = [];
  letters.forEach((glyph, gi) => {
    const xOffset = gi * 4; // 3 width + 1 gap
    glyph.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c !== "1") return;
        rects.push(
          <rect key={`${gi}-${x}-${y}`} x={xOffset + x} y={y} width={1} height={1} fill={red} />,
        );
      });
    });
  });

  return (
    <svg
      width={size}
      height={(size * rows) / cols}
      viewBox={`0 0 ${cols} ${rows}`}
      className="pvp-pixel"
      shapeRendering="crispEdges"
      style={{ filter: "drop-shadow(0 0 6px rgba(255,70,86,0.6))" }}
    >
      {rects}
    </svg>
  );
}

export const PvpRankWidget = memo(PvpRankWidgetBase);
