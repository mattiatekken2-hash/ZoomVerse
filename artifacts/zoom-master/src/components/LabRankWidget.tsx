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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const participants = state?.participants ?? 0;
  const pool = state?.poolTon ?? 200;
  const userPoints = state?.userPoints ?? 0;
  const userRank = state?.userRank ?? null;
  const endsAtMs = state?.endsAt ? new Date(state.endsAt).getTime() : null;
  const remaining = endsAtMs != null ? formatCountdown(endsAtMs - now) : null;
  const board = state?.top100 ?? [];

  return (
    <>
      <style>{`
        @keyframes lrPulse {
          0%, 82% { transform: rotate(0deg) scale(1); }
          86% { transform: rotate(-14deg) scale(1.06); }
          90% { transform: rotate(14deg) scale(1.06); }
          94% { transform: rotate(-8deg) scale(1.03); }
          97% { transform: rotate(8deg) scale(1.02); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .lr-tile { overflow: visible; }
        .lr-icon-clip { overflow: hidden; width: 100%; height: 100%; border-radius: inherit; display: flex; align-items: center; justify-content: center; }
        .lr-emoji { display: flex; align-items: center; justify-content: center; animation: lrPulse 3s ease-in-out infinite; transform-origin: 50% 50%; will-change: transform; }
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
          width: 52,
          height: 48,
          cursor: "pointer",
          overflow: "visible",
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
          <div className="lr-icon-clip">
            <div
              className="lr-emoji"
              style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1,
              }}
            >
              <GramDiamondIcon size={headerMode ? 22 : shopMode ? 30 : 28} />
            </div>
          </div>
          {userRank != null && userRank <= 100 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: headerMode ? -7 : -6,
                right: headerMode ? -14 : -6,
                zIndex: 3,
                minWidth: headerMode ? 28 : 22,
                height: headerMode ? 20 : 18,
                padding: headerMode ? "0 6px" : "0 5px",
                borderRadius: 999,
                background: "#ffe566",
                color: "#041018",
                fontSize: headerMode ? 11 : 10,
                fontWeight: 900,
                border: "2px solid #041018",
                boxShadow: `0 0 0 1px ${CYAN}, 0 2px 8px rgba(0,0,0,0.55)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                pointerEvents: "none",
                whiteSpace: "nowrap",
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
            onClick={(e) => e.stopPropagation()}
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
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 40,
                width: 44,
                height: 44,
                borderRadius: 10,
                border: `1px solid ${CYAN}55`,
                background: "rgba(4,12,20,0.92)",
                color: ACCENT,
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                lineHeight: 1,
                pointerEvents: "auto",
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div
                className="lr-emoji"
                aria-hidden
                style={{
                  width: 72,
                  height: 72,
                  margin: "4px auto 8px",
                  filter: `drop-shadow(0 0 14px ${CYAN}88)`,
                }}
              >
                <GramDiamondIcon size={64} />
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

            <div
              style={{
                borderRadius: 14,
                background: "rgba(0,212,255,0.05)",
                border: `1px solid ${CYAN}28`,
                marginBottom: 12,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "10px 12px", textAlign: "center", borderBottom: `1px solid ${CYAN}18` }}>
                <div
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Ends in
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
                        <span style={{ fontSize: 20, fontWeight: 900, color: ACCENT }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div style={{ padding: "10px 6px", textAlign: "center", borderRight: `1px solid ${CYAN}18` }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Prize pool
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: ACCENT, marginTop: 2 }}>
                    {pool}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>GRAM</div>
                </div>
                <div style={{ padding: "10px 6px", textAlign: "center", borderRight: `1px solid ${CYAN}18` }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Players
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                    {participants}
                  </div>
                </div>
                <div style={{ padding: "10px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Your points
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                    {userPoints}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)" }}>
                    {userRank != null && userRank <= 100 ? `#${userRank}` : "—"}
                  </div>
                </div>
              </div>
            </div>

            {board.length > 0 && (
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
                {board.map((r) => {
                  const isMe = telegramId === r.telegramId;
                  const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : null;
                  const photo = r.photoUrl;
                  const pts = r.labPoints;
                  const stripe = r.rank === 1
                    ? "linear-gradient(90deg, rgba(255,210,70,0.22), rgba(8,16,24,0.4))"
                    : r.rank === 2
                      ? "linear-gradient(90deg, rgba(196,210,230,0.16), rgba(8,16,24,0.35))"
                      : r.rank === 3
                        ? "linear-gradient(90deg, rgba(205,140,70,0.16), rgba(8,16,24,0.35))"
                        : isMe
                          ? "rgba(0,212,255,0.10)"
                          : "rgba(255,255,255,0.03)";
                  return (
                    <div
                      key={r.telegramId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        padding: "7px 8px",
                        borderRadius: 10,
                        background: stripe,
                        border: r.rank <= 3
                          ? `1px solid ${r.rank === 1 ? "rgba(255,210,70,0.45)" : "rgba(255,255,255,0.12)"}`
                          : isMe ? `1px solid ${CYAN}55` : "1px solid rgba(255,255,255,0.05)",
                        color: "#fff",
                        fontWeight: r.rank <= 30 ? 800 : 600,
                        position: "relative",
                      }}
                    >
                      <span style={{
                        minWidth: 28,
                        textAlign: "center",
                        fontFamily: "'Orbitron', 'Inter', sans-serif",
                        fontSize: medal ? 14 : 10,
                        color: r.rank <= 3 ? ACCENT : "rgba(255,255,255,0.45)",
                      }}>
                        {medal ?? `#${r.rank}`}
                      </span>
                      {photo ? (
                        <img
                          src={photo}
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
                      <span style={{ whiteSpace: "nowrap" }}>{pts} pt</span>
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
