import { useEffect, useState, memo } from "react";
import { fetchLabRankState, type LabRankState } from "../utils/api";
import trophyPx from "../assets/lab-rank-trophy.png";

const CYAN = "#00d4ff";
const ACCENT = "#4dd4ff";

interface Props {
  telegramId: string | null;
  sunCount: number;
  balance: number;
}

function formatCountdown(ms: number): { d: number; h: number; m: number; s: number } {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function LabRankWidgetBase({ telegramId, sunCount, balance }: Props) {
  // sunCount/balance kept for prop compatibility — craft leaderboard is now free.
  void sunCount;
  void balance;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LabRankState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = async () => {
    if (!telegramId) return;
    const s = await fetchLabRankState(telegramId);
    if (s) setState(s);
  };

  useEffect(() => {
    refresh();
    const onR = () => refresh();
    window.addEventListener("zoom-data-refresh", onR);
    const i = setInterval(refresh, 20000);
    return () => {
      window.removeEventListener("zoom-data-refresh", onR);
      clearInterval(i);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId]);

  useEffect(() => {
    if (!open) return;
    refresh();
    // Re-fetch at 2s and 4s to catch server updates that arrive after
    // the 1.2s debounced craft save fires.
    const t1 = setTimeout(() => refresh(), 2000);
    const t2 = setTimeout(() => refresh(), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live 1s ticker for the countdown timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const participants = state?.participants ?? 0;
  const pool = state?.poolTon ?? 200;
  const userPoints = state?.userPoints ?? 0;
  const userRank = state?.userRank ?? null;
  const prizes = state?.prizes ?? [];
  const endsAtMs = state?.endsAt ? new Date(state.endsAt).getTime() : null;
  const remaining = endsAtMs != null ? formatCountdown(endsAtMs - now) : null;

  return (
    <>
      <style>{`
        @keyframes lrFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes lrGlow {
          0%,100% { box-shadow: 0 0 12px ${CYAN}88, 0 0 22px ${CYAN}33; }
          50%     { box-shadow: 0 0 20px ${CYAN}cc, 0 0 38px ${CYAN}55; }
        }
        @keyframes lrPulse {
          0%, 85% { transform: scale(1); opacity: 0.75; }
          87% { transform: scale(1.12) rotate(-2deg); opacity: 1; }
          89% { transform: scale(1.12) rotate(2deg); }
          91% { transform: scale(1.12) rotate(-2deg); }
          93% { transform: scale(1.12) rotate(2deg); }
          95% { transform: scale(1); opacity: 0.75; }
          100% { transform: scale(1); opacity: 0.75; }
        }
        .lr-tile { animation: lrGlow 2.6s ease-in-out infinite; }
        .lr-img { animation: lrFloat 3s ease-in-out infinite; }
        .lr-pulse { animation: lrPulse 4s ease-in-out infinite; }
      `}</style>

      <div
        style={{
          position: "fixed",
          left: 12,
          top: 170,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 40,
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Craft Leaderboard"
          className="lr-tile"
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            background: "rgba(20,12,4,0.85)",
            border: `1.5px solid ${CYAN}88`,
            padding: 4,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitTapHighlightColor: "transparent",
          }}
          data-testid="button-lab-rank"
        >
          <div
            className="lr-img"
            style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              filter: `drop-shadow(0 0 8px ${CYAN}aa)`,
            }}
          >
            <img
              src={trophyPx}
              alt=""
              style={{
                width: "84%",
                height: "84%",
                objectFit: "contain",
                imageRendering: "pixelated",
                filter: "hue-rotate(140deg) saturate(2.2)",
              }}
            />
          </div>
          {userRank != null && userRank <= 100 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                minWidth: 22,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: CYAN,
                color: "#1a0d00",
                fontSize: 10,
                fontWeight: 900,
                border: "2px solid rgba(8,4,0,0.95)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              #{userRank}
            </span>
          )}
        </button>
        <span
          className="lr-pulse"
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: CYAN,
            textShadow: `0 0 8px ${CYAN}66`,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {pool} TON
        </span>
      </div>

      {open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,2,8,0.85)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding:
              "calc(env(safe-area-inset-top, 0px) + 130px) 14px calc(env(safe-area-inset-bottom, 0px) + 80px)",
            overflowY: "auto",
          }}
          data-testid="modal-lab-rank"
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 440,
              background:
                "linear-gradient(180deg, rgba(20,12,4,0.97), rgba(8,4,0,0.99))",
              border: `1px solid ${CYAN}55`,
              boxShadow: `0 0 40px ${CYAN}33`,
              borderRadius: 18,
              padding: 22,
              color: "#fff",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${CYAN}44`,
                background: "rgba(255,215,0,0.08)",
                color: ACCENT,
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <img
                src={trophyPx}
                alt=""
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "contain",
                  imageRendering: "pixelated",
                  marginBottom: 4,
                  filter: `drop-shadow(0 0 10px ${CYAN}88)`,
                }}
              />
              <div
                style={{
                  fontFamily: "'Orbitron', 'Inter', sans-serif",
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  color: ACCENT,
                  textTransform: "uppercase",
                }}
              >
                Craft Leaderboard
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,236,112,0.7)", marginTop: 4 }}>
                Free for everyone · +1 point for every planet you craft
              </div>
            </div>

            {/* Countdown timer */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                background: "rgba(255,215,0,0.06)",
                border: `1px solid ${CYAN}33`,
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Season ends in
              </div>
              {remaining ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                    fontFamily: "'Orbitron', 'Inter', sans-serif",
                  }}
                  data-testid="text-lab-rank-countdown"
                >
                  {[
                    { v: remaining.d, l: "D" },
                    { v: remaining.h, l: "H" },
                    { v: remaining.m, l: "M" },
                    { v: remaining.s, l: "S" },
                  ].map((seg) => (
                    <div key={seg.l} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: ACCENT }}>
                        {seg.l === "D" ? seg.v : pad(seg.v)}
                      </span>
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>
                        {seg.l}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.6)" }}>—</div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.05)",
                  border: `1px solid ${CYAN}22`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Prize Pool
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT, marginTop: 2 }}>
                  {pool} TON
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Top 30</div>
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.05)",
                  border: `1px solid ${CYAN}22`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Players
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {participants}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>In season</div>
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.05)",
                  border: `1px solid ${CYAN}22`,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Your Points
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {userPoints}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                  {userRank != null && userRank <= 100 ? `#${userRank}` : "—"}
                </div>
              </div>
            </div>

            {/* Prize map */}
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                PRIZES · {pool} TON TO TOP 30
              </div>
              <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.8 }}>
                {prizes.map((p) => (
                  <div key={p.label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: ACCENT, fontWeight: 800 }}>{p.label}</span>
                    <span>{p.ton} TON{p.label.includes("–") ? " each" : ""}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                Prizes are credited automatically to your withdrawable Earned TON balance when the season ends.
              </div>
            </div>

            {state?.top100 && state.top100.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 280,
                  overflowY: "auto",
                  padding: 8,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  TOP 100
                </div>
                {state.top100.map((r) => {
                  const isMe = telegramId === r.telegramId;
                  const rankEmoji = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
                  const hasPrize = r.rank <= 30 && r.tonPrize > 0;
                  return (
                    <div
                      key={r.telegramId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        padding: "5px 6px",
                        borderRadius: 6,
                        background: isMe ? "rgba(255,215,0,0.10)" : "transparent",
                        border: isMe ? `1px solid ${CYAN}44` : "1px solid transparent",
                        color: r.rank === 1 ? ACCENT : "#fff",
                        fontWeight: r.rank <= 30 ? 800 : 600,
                      }}
                    >
                      <span style={{ minWidth: 24, textAlign: "center" }}>{rankEmoji}</span>
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid rgba(255,255,255,0.25)",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 900,
                            color: "rgba(255,255,255,0.6)",
                            flexShrink: 0,
                          }}
                        >
                          {r.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {r.name}
                        {isMe ? " (you)" : ""}
                      </span>
                      <span style={{ whiteSpace: "nowrap" }}>{r.labPoints} pt</span>
                      {hasPrize && (
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            fontSize: 10,
                            fontWeight: 900,
                            color: "#ffd700",
                            background: "rgba(255,215,0,0.15)",
                            border: "1px solid rgba(255,215,0,0.35)",
                            borderRadius: 6,
                            padding: "2px 6px",
                          }}
                        >
                          {r.tonPrize} TON
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const LabRankWidget = memo(LabRankWidgetBase);
