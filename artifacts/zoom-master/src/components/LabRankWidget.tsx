import { useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";
import { fetchLabRankState, type LabRankState } from "../utils/api";
import { GramDiamondIcon } from "./GramDiamondIcon";

const CYAN = "#00d4ff";
const ACCENT = "#4dd4ff";

interface Props {
  telegramId: string | null;
  sunCount: number;
  balance: number;
  shopMode?: boolean;
  headerMode?: boolean;
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

function LabRankWidgetBase({ telegramId, sunCount, balance, shopMode = false, headerMode = false }: Props) {
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
    window.dispatchEvent(new CustomEvent("zoom-craft-board", { detail: { open } }));
    return () => {
      window.dispatchEvent(new CustomEvent("zoom-craft-board", { detail: { open: false } }));
    };
  }, [open]);

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
    const t = setInterval(() => setNow(Date.now()), 5000);
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
        @keyframes lrFloat { 0%,100% { transform: translateY(0) rotateX(8deg) rotateY(-12deg); } 50% { transform: translateY(-8px) rotateX(12deg) rotateY(12deg); } }
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
        .lr-img { animation: lrFloat 3.4s ease-in-out infinite; transform-style: preserve-3d; }
        @keyframes lrNamePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes lrTopFly {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes lrRing {
          0% { transform: translate(-50%, -50%) rotateX(68deg) rotateZ(0deg); opacity: 0.55; }
          100% { transform: translate(-50%, -50%) rotateX(68deg) rotateZ(360deg); opacity: 0.85; }
        }
        @keyframes lrHeroSpin {
          0% { transform: rotateY(-18deg) rotateX(12deg); }
          50% { transform: rotateY(18deg) rotateX(8deg); }
          100% { transform: rotateY(-18deg) rotateX(12deg); }
        }
      `}</style>

      <div
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(true); }}
        style={headerMode ? {
          position: "relative",
          width: 40,
          height: 40,
          cursor: "pointer",
        } : shopMode ? {
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          borderRadius: 18,
          background: "linear-gradient(155deg, rgba(14,22,36,0.96), rgba(6,10,18,0.98))",
          border: "1px solid rgba(0,212,255,0.28)",
          boxShadow: "0 8px 24px rgba(0,8,20,0.35)",
          cursor: "pointer",
        } : {
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
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label="Craft Leaderboard"
          className="lr-tile"
          style={{
            position: "relative",
            width: headerMode ? 40 : shopMode ? 56 : 60,
            height: headerMode ? 40 : shopMode ? 56 : 60,
            borderRadius: headerMode ? "50%" : 16,
            background: "rgba(8,14,24,0.92)",
            border: `1.5px solid ${CYAN}88`,
            padding: 6,
            cursor: "pointer",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
            <GramDiamondIcon size={headerMode ? 22 : shopMode ? 34 : 32} />
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
                color: "#041018",
                fontSize: 10,
                fontWeight: 900,
                border: "2px solid rgba(4,8,16,0.95)",
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
        {headerMode ? null : shopMode ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(0,212,255,0.7)", textTransform: "uppercase" }}>
              Hub
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#E8ECF4", letterSpacing: "0.04em", marginTop: 2 }}>
              Craft Leaderboard
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(232,236,244,0.55)", marginTop: 4 }}>
              {userRank != null ? `Rank #${userRank}` : "Unranked"} · {userPoints.toLocaleString()} pts · {pool} GRAM
            </div>
          </div>
        ) : (
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
          {pool} GRAM
        </span>
        )}
      </div>

      {open && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,2,8,0.85)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "calc(env(safe-area-inset-top, 0px) + 130px) 14px calc(env(safe-area-inset-bottom, 0px) + 80px)",
          }}
          data-testid="modal-lab-rank"
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 440,
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              background:
                "radial-gradient(120% 80% at 50% -10%, rgba(0,180,255,0.22), transparent 55%), linear-gradient(180deg, #071018 0%, #04080e 100%)",
              border: `1px solid ${CYAN}40`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 60px ${CYAN}22`,
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
                background: "rgba(0,212,255,0.08)",
                color: ACCENT,
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", marginBottom: 18, perspective: 900 }}>
              <div
                style={{
                  position: "relative",
                  height: 132,
                  margin: "0 auto 10px",
                  maxWidth: 220,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "62%",
                    width: 150,
                    height: 150,
                    borderRadius: "50%",
                    border: `1.5px solid ${CYAN}55`,
                    animation: "lrRing 10s linear infinite",
                    boxShadow: `0 0 24px ${CYAN}33`,
                  }}
                />
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "62%",
                    width: 104,
                    height: 104,
                    borderRadius: "50%",
                    border: "1px dashed rgba(255,255,255,0.18)",
                    animation: "lrRing 16s linear infinite reverse",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 18,
                    transform: "translateX(-50%)",
                    animation: "lrHeroSpin 5.5s ease-in-out infinite",
                    filter: `drop-shadow(0 12px 28px ${CYAN}66)`,
                  }}
                >
                  <GramDiamondIcon size={86} />
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Orbitron', 'Inter', sans-serif",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  color: "#E8FBFF",
                  textTransform: "uppercase",
                  textShadow: `0 0 18px ${CYAN}66`,
                }}
              >
                Craft Leaderboard
              </div>
              <div style={{ fontSize: 11, color: "rgba(180,230,255,0.62)", marginTop: 6 }}>
                +1 point per model forged · free for everyone
              </div>
            </div>

            {/* Countdown timer */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                background: "rgba(0,212,255,0.06)",
                border: `1px solid ${CYAN}28`,
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
                  background: "rgba(0,212,255,0.06)",
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
                  {pool} GRAM
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Top 30</div>
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(0,212,255,0.06)",
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
                  background: "rgba(0,212,255,0.06)",
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
                PRIZES · {pool} GRAM TO TOP 30
              </div>
              <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.8 }}>
                {prizes.map((p) => (
                  <div key={p.label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: ACCENT, fontWeight: 800 }}>{p.label}</span>
                    <span>{p.ton} GRAM{p.label.includes("–") ? " each" : ""}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                Prizes credit your GRAM wallet when the season ends.
              </div>
            </div>

            {state?.top100 && state.top100.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
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
                      className={r.rank === 1 ? "lr-top1" : r.rank <= 10 ? "lr-top10" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        padding: "5px 6px",
                        borderRadius: 6,
                        background: r.rank === 1
                          ? "linear-gradient(90deg, rgba(255,215,64,0.18), rgba(0,212,255,0.08))"
                          : isMe ? "rgba(255,215,0,0.10)" : "transparent",
                        border: r.rank === 1
                          ? `1px solid ${CYAN}88`
                          : isMe ? `1px solid ${CYAN}44` : "1px solid transparent",
                        color: r.rank === 1 ? ACCENT : "#fff",
                        fontWeight: r.rank <= 30 ? 800 : 600,
                        animation: r.rank === 1
                          ? "lrTopFly 2.2s ease-in-out infinite"
                          : r.rank <= 10
                            ? "lrNamePulse 1.8s ease-in-out infinite"
                            : undefined,
                        position: "relative",
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
                          {r.tonPrize} GRAM
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export const LabRankWidget = memo(LabRankWidgetBase);
