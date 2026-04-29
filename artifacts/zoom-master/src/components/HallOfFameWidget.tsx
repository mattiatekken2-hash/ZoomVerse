import { useEffect, useState, memo } from "react";
import { fetchHallOfFame, type HallOfFameEntry } from "../utils/api";

interface HallOfFameWidgetProps {
  telegramId: string | null;
}

const PRIZE_COLORS = ["#ffd23f", "#dadada", "#cd7f32", "#a0aec0", "#a0aec0"] as const;

function HallOfFameWidgetBase({ telegramId }: HallOfFameWidgetProps) {
  void telegramId;
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [prizes, setPrizes] = useState<number[]>([100, 75, 50, 25, 25]);
  const [loading, setLoading] = useState(false);

  // Refresh the leaderboard whenever the modal opens. We intentionally
  // don't poll in the background — the data is referral-driven so a fresh
  // pull each open is enough and saves a constant DB hit on every device.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchHallOfFame().then((data) => {
      if (!alive) return;
      setEntries(data.entries);
      if (data.prizes && data.prizes.length > 0) setPrizes(data.prizes);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open]);

  const handleOpenClick = () => {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } } }).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred?.("light");
    } catch { /**/ }
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  return (
    <>
      <style>{`
        @keyframes hof-trophy-glow {
          0%,100% { box-shadow: 0 0 14px rgba(255,210,63,0.45), inset 0 0 6px rgba(255,255,255,0.05); }
          50% { box-shadow: 0 0 22px rgba(255,210,63,0.7), inset 0 0 10px rgba(255,255,255,0.08); }
        }
        @keyframes hof-trophy-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .hof-pixel-trophy { image-rendering: pixelated; }
      `}</style>

      {/* Closed widget — sits just below the Mystery Box (top:270 + 60 + 10 = 340).
          Same square framing as the Mystery Box / Collection avatars so the
          right-edge column reads as a single visual stack. */}
      <button
        onClick={handleOpenClick}
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
          background: "rgba(28,18,8,0.78)",
          border: "1.5px solid rgba(255,210,63,0.5)",
          animation: "hof-trophy-glow 2.4s ease-in-out infinite",
          color: "#fff",
          zIndex: 35,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          WebkitTapHighlightColor: "transparent",
        }}
        data-testid="button-hall-of-fame"
        aria-label="Open Hall of Fame"
      >
        <div style={{ animation: "hof-trophy-bob 2.4s ease-in-out infinite" }}>
          <PixelTrophy size={40} />
        </div>
      </button>

      {open && (
        <div
          onClick={handleClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(6,8,16,0.88)",
            backdropFilter: "blur(8px)",
            zIndex: 110, display: "flex",
            alignItems: "flex-start", justifyContent: "center",
            padding: "100px 20px 20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg, rgba(46,32,8,0.98), rgba(18,12,4,0.98))",
              border: "1.5px solid rgba(255,210,63,0.45)",
              borderRadius: 20, padding: 22,
              maxWidth: 360, width: "100%",
              boxShadow: "0 0 48px rgba(255,210,63,0.3)",
              textAlign: "center",
              maxHeight: "92vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <PixelTrophy size={56} />
            </div>
            <div className="font-black text-lg tracking-wider" style={{ color: "#ffd23f", marginBottom: 4 }}>
              HALL OF FAME
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 14, lineHeight: 1.5 }}>
              Daily Referrals — top 5 win stardust. Reset every day at 00:00 UTC.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, textAlign: "left" }}>
              {loading && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "20px 0" }}>
                  Loading…
                </div>
              )}
              {!loading && entries.length === 0 && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: "20px 0" }}>
                  No referrals yet today — be the first to climb the ranking!
                </div>
              )}
              {!loading && entries.map((e) => {
                const isPrize = e.prize > 0;
                const color = isPrize ? (PRIZE_COLORS[e.rank - 1] ?? "#ffd23f") : "rgba(255,255,255,0.6)";
                return (
                  <div
                    key={`${e.rank}-${e.name}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: isPrize ? "rgba(255,210,63,0.06)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isPrize ? "rgba(255,210,63,0.25)" : "rgba(255,255,255,0.06)"}`,
                    }}
                    data-testid={`hall-of-fame-row-${e.rank}`}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isPrize ? `${color}22` : "rgba(255,255,255,0.04)",
                      color, fontWeight: 900, fontSize: 12,
                      flexShrink: 0,
                    }}>
                      {e.rank}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color, lineHeight: 1.2 }}>
                        {e.name}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.2, marginTop: 2 }}>
                        {e.dailyCount} referral{e.dailyCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    {isPrize && (
                      <div style={{
                        display: "flex", alignItems: "center",
                        padding: "3px 8px",
                        borderRadius: 8,
                        background: "rgba(255,210,63,0.12)",
                        border: "1px solid rgba(255,210,63,0.35)",
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#ffd23f" }}>
                          {e.prize}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Prize legend — visible whenever the list is empty so a fresh
                day still tells the user what's at stake. */}
            {entries.length === 0 && !loading && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4,
                marginBottom: 14, fontSize: 9, color: "rgba(255,255,255,0.55)",
              }}>
                {prizes.slice(0, 5).map((p, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "6px 4px", borderRadius: 6,
                      background: "rgba(255,210,63,0.06)",
                      border: "1px solid rgba(255,210,63,0.25)",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ color: PRIZE_COLORS[i] ?? "#ffd23f", fontWeight: 900, fontSize: 11 }}>#{i + 1}</div>
                    <div style={{ color: "#ffd23f", fontWeight: 800, marginTop: 2 }}>{p}</div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-2 rounded-xl text-xs font-bold active:scale-95"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              data-testid="button-hall-of-fame-close"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Pixel-art golden trophy rendered as inline SVG with hard pixels.
 * 16×16 grid, scaled to `size`. Mirrors the PixelCrate approach used by
 * the Mystery Box widget so the right-column icons share the same visual
 * language.
 */
function PixelTrophy({ size }: { size: number }) {
  const grid = 16;

  // Palette
  const goldDark = "#a87a00";
  const gold = "#ffd23f";
  const goldLight = "#ffe88a";
  const baseDark = "#5c3a00";
  const base = "#8a5a00";

  // 16x16 pixel map — a chalice/cup trophy with handles, a stem and a
  // wide base. Letters → palette.
  const map = [
    "................",
    "..ggggggggggg...",
    ".gllllllllllg...",
    ".gllllllllllg...",
    "g.gllllllllg.g..",
    "g.gllllllllg.g..",
    "g.gllllllllg.g..",
    ".gglllllllgg....",
    "..ggggggggg.....",
    "....gggggg......",
    ".....gggg.......",
    ".....bbbb.......",
    "....BbbbbB......",
    "...BBBBBBBB.....",
    "..BBBBBBBBBB....",
    "................",
  ];

  const colorOf: Record<string, string> = {
    g: goldDark, l: gold, ".": "", b: base, B: baseDark, h: goldLight,
  };
  void goldLight;
  void colorOf.h;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${grid} ${grid}`} className="hof-pixel-trophy" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 8px rgba(255,210,63,0.55))" }}>
      {map.map((row, y) =>
        [...row].map((c, x) => {
          if (c === ".") return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colorOf[c] || "#fff"} />;
        })
      )}
    </svg>
  );
}

export const HallOfFameWidget = memo(HallOfFameWidgetBase);
