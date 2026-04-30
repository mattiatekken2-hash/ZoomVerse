import { useEffect, useState, memo } from "react";
import { fetchHallOfFameDaily, type HallOfFameResponse } from "../utils/api";

// HALL OF FAME — Daily Referrals widget.
//
// Floats on the right of the LAB page below the Mystery Box (top:270, h:60
// → bottom 330; the box's optional ticker sits at top 320). We anchor at
// top:340 so the trophy never overlaps the box itself; if a ticker is
// briefly visible it sits next to (not under) the trophy because the
// ticker is a narrow bar on the same side, not a full row.
//
// Click → modal with the top 10 from /api/leaderboard/daily-referrals.
// Ranks 1..5 show the stardust prize badge baked into the response;
// ranks 6..10 show only username and count. Auto-refreshes the modal data
// when opened so the user always sees the current standings.

interface Props {
  telegramId?: string | null;
  // SUN-gated entry: when false, opening the widget shows a paywall
  // message ("☀️ SUN Required!") instead of the leaderboard. The
  // backend mirrors this gate (referral.ts upsert + leaderboard query
  // + cron settlement all check sun_count > 0), so even if a non-SUN
  // user bypasses the UI they cannot accumulate or be credited points.
  hasSun?: boolean;
}

function HallOfFameWidgetBase({ hasSun = false }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HallOfFameResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Refresh every time the modal opens (cheap GET, no caching).
  // Skip the fetch entirely for non-SUN users — they only see the gate.
  useEffect(() => {
    if (!open || !hasSun) return;
    let alive = true;
    setLoading(true);
    void fetchHallOfFameDaily()
      .then((res) => { if (alive) setData(res); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, hasSun]);

  return (
    <>
      <style>{`
        @keyframes hof-glow {
          0%,100% { box-shadow: 0 0 14px rgba(255,210,63,0.45), inset 0 0 6px rgba(255,255,255,0.05); }
          50%     { box-shadow: 0 0 22px rgba(255,210,63,0.75), inset 0 0 10px rgba(255,255,255,0.08); }
        }
        @keyframes hof-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        .hof-pixel { image-rendering: pixelated; }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: 340,
          right: 12,
          width: 60,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4,
          borderRadius: 14,
          background: "rgba(8,12,28,0.78)",
          border: "1.5px solid rgba(255,210,63,0.55)",
          animation: "hof-glow 2.4s ease-in-out infinite",
          color: "#fff",
          zIndex: 35,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-hall-of-fame"
        aria-label="Open Hall of Fame"
      >
        <div style={{ animation: "hof-float 2.4s ease-in-out infinite" }}>
          <PixelTrophy size={40} />
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
            padding: "180px 20px 20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(46,32,8,0.98), rgba(18,12,4,0.98))",
              border: "1.5px solid rgba(255,210,63,0.5)",
              borderRadius: 20,
              padding: 22,
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 0 48px rgba(255,210,63,0.25)",
              textAlign: "center",
              maxHeight: "82vh",
              overflowY: "auto",
            }}
          >
            <div className="font-black text-lg tracking-wider" style={{ color: "#ffd23f", marginBottom: 4 }}>
              HALL OF FAME
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
              Daily Referrals — Top 10
            </div>
            <div className="text-xs" style={{ color: "rgba(255,210,63,0.7)", marginBottom: 14, fontWeight: 700 }}>
              Resets every day at 00:00 UTC
            </div>

            {!hasSun && (
              <div
                data-testid="hof-sun-gate"
                style={{
                  padding: "26px 18px",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(255,179,71,0.10), rgba(255,210,63,0.06))",
                  border: "1.5px solid rgba(255,210,63,0.45)",
                  textAlign: "center",
                  margin: "8px 0 4px",
                }}
              >
                <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 10 }}>☀️</div>
                <div style={{ color: "#ffd23f", fontWeight: 900, fontSize: 16, marginBottom: 10, letterSpacing: 0.5 }}>
                  SUN Required!
                </div>
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 1.55 }}>
                  Only Sun holders can enter the Hall of Fame and win Daily Stardust. Visit the Shop to join the elite.
                </div>
              </div>
            )}

            {hasSun && loading && !data && (
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
                Loading…
              </div>
            )}

            {hasSun && data && data.entries.length === 0 && (
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
                No referrals yet today — be the first!
              </div>
            )}

            {hasSun && data && data.entries.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                {data.entries.map((e) => {
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
                        background: isPodium ? "rgba(255,210,63,0.06)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isPodium ? "rgba(255,210,63,0.25)" : "rgba(255,255,255,0.08)"}`,
                      }}
                      data-testid={`hof-row-${e.rank}`}
                    >
                      <div style={{
                        width: 26, textAlign: "center",
                        fontWeight: 900, fontSize: 14,
                        color: rankColor,
                      }}>
                        #{e.rank}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: "#fff", fontWeight: 700, fontSize: 13,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {e.name}
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                          {e.count} referral{e.count === 1 ? "" : "s"} today
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

            {/* Prize legend — visible to SUN holders so they know the
                tiers even when the leaderboard is short. Hidden for
                non-SUN users because the gate message above is already
                the call-to-action. */}
            {hasSun && (
              <div style={{
                marginTop: 14, paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 10, color: "rgba(255,255,255,0.55)",
                display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4,
              }}>
                {[100, 75, 50, 25, 25].map((p, i) => (
                  <div key={i} style={{
                    padding: "4px 2px", borderRadius: 6,
                    background: "rgba(255,210,63,0.05)",
                    border: "1px solid rgba(255,210,63,0.2)",
                    textAlign: "center",
                  }}>
                    <div style={{ color: "#ffd23f", fontWeight: 800 }}>#{i + 1}</div>
                    <div style={{ color: "rgba(255,255,255,0.7)" }}>+{p}⭐</div>
                  </div>
                ))}
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
              data-testid="button-hof-close"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Pixel-art gold trophy on a 16×16 grid, rendered as inline SVG.
 *  Same approach as MysteryBoxWidget's PixelCrate so the visual style
 *  matches the rest of the LAB UI. */
function PixelTrophy({ size }: { size: number }) {
  const grid = 16;
  const gold = "#ffd23f";
  const goldDark = "#caa11d";
  const goldLight = "#fff0a8";
  const base = "#7a4a14";
  const baseLight = "#a86c1f";

  // Letters: g=gold, d=goldDark, l=goldLight, b=base, B=baseLight, .=empty
  const map = [
    "................",
    "................",
    "..ggggggggggg...",
    ".bgggggggggggb..",
    ".bglglglglglgb..",
    ".bgddgggggddgb..",
    ".bgdggggggggdb..",
    "..bgddgggggdb...",
    "...bgdgggggb....",
    "....bgggggb.....",
    ".....bgggb......",
    ".....bgggb......",
    "....BBBBBBB.....",
    "...BbbbbbbbB....",
    "..BbbbbbbbbbB...",
    "................",
  ];

  const colorOf: Record<string, string> = {
    g: gold, d: goldDark, l: goldLight, b: base, B: baseLight,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      className="hof-pixel"
      shapeRendering="crispEdges"
      style={{ filter: "drop-shadow(0 0 8px rgba(255,210,63,0.55))" }}
    >
      {map.map((row, y) =>
        [...row].map((c, x) => {
          if (c === ".") return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colorOf[c] || "#fff"} />;
        }),
      )}
    </svg>
  );
}

export const HallOfFameWidget = memo(HallOfFameWidgetBase);
