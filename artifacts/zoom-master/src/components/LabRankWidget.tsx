import { useEffect, useState, memo } from "react";
import {
  fetchLabRankState,
  joinLabRank,
  type LabRankState,
} from "../utils/api";
import trophyPx from "../assets/lab-rank-trophy.png";

const GOLD = "#ffd700";
const ACCENT = "#ffec70";

interface Props {
  telegramId: string | null;
  sunCount: number;
  balance: number;
}

function LabRankWidgetBase({ telegramId, sunCount, balance }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LabRankState | null>(null);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  const handleJoin = async () => {
    if (!telegramId) {
      setMsg("Telegram ID missing");
      return;
    }
    if (sunCount <= 0) {
      setMsg("You need at least 1 SUN to join");
      return;
    }
    const entryZoom = state?.entryZoom ?? 1_000_000;
    if (balance < entryZoom) {
      setMsg(`Need ${entryZoom.toLocaleString()} $ZOOM to join`);
      return;
    }
    setBuying(true);
    try {
      const r = await joinLabRank(telegramId);
      if (r.ok) {
        setMsg("Entry confirmed!");
        await refresh();
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else {
        setMsg(r.error || "Entry failed");
      }
    } catch (e) {
      setMsg("Entry failed");
    }
    setBuying(false);
  };

  const participants = state?.participants ?? 0;
  const entryZoom = state?.entryZoom ?? 1_000_000;
  const winnerTon = state?.winnerTon ?? 5;
  const pool = state?.poolTon ?? 0;
  const userPoints = state?.userPoints ?? 0;
  const userRank = state?.userRank ?? null;
  const hasPaid = state?.hasPaid ?? false;

  return (
    <>
      <style>{`
        @keyframes lrFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes lrGlow {
          0%,100% { box-shadow: 0 0 12px ${GOLD}88, 0 0 22px ${GOLD}33; }
          50%     { box-shadow: 0 0 20px ${GOLD}cc, 0 0 38px ${GOLD}55; }
        }
        .lr-tile { animation: lrGlow 2.6s ease-in-out infinite; }
        .lr-img { animation: lrFloat 3s ease-in-out infinite; }
        .lr-buy {
          background: linear-gradient(135deg, ${GOLD}, #b8860b);
          color: #1a0d00; font-weight: 900; letter-spacing: 0.05em;
          border: none; border-radius: 12px; padding: 12px 18px;
          cursor: pointer; box-shadow: 0 0 14px ${GOLD}77;
          transition: transform 0.1s ease, filter 0.15s ease;
        }
        .lr-buy:active { transform: scale(0.96); }
        .lr-buy:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.4); }
      `}</style>

      <button
        onClick={() => setOpen(true)}
        aria-label="Monthly Lab Leaderboard"
        className="lr-tile"
        style={{
          position: "fixed",
          left: 12,
          // Sotto Lotto Stellare a sinistra (top:180 + h:60 = 240).
          top: 250,
          width: 60,
          height: 60,
          borderRadius: 14,
          background: "rgba(20,12,4,0.85)",
          border: `1.5px solid ${GOLD}88`,
          padding: 4,
          cursor: "pointer",
          zIndex: 40,
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
            filter: `drop-shadow(0 0 8px ${GOLD}aa)`,
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
            }}
          />
        </div>
        {state?.eligible && userRank != null && userRank <= 100 && (
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
              background: GOLD,
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
              border: `1px solid ${GOLD}55`,
              boxShadow: `0 0 40px ${GOLD}33`,
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
                border: `1px solid ${GOLD}44`,
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
                  filter: `drop-shadow(0 0 10px ${GOLD}88)`,
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
                Monthly Lab Leaderboard
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,236,112,0.7)", marginTop: 4 }}>
                +1 point for every planet forged in the Lab
              </div>
            </div>


            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.05)",
                  border: `1px solid ${GOLD}22`,
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
                  Participants
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT, marginTop: 2 }}>
                  {participants}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Active now</div>
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.05)",
                  border: `1px solid ${GOLD}22`,
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
                <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {userPoints}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                  {userRank != null && userRank <= 100 ? `#${userRank}` : "—"}
                </div>
              </div>
            </div>

            {!hasPaid && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: "rgba(255,215,0,0.08)",
                  border: `1px solid ${GOLD}44`,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,236,112,0.6)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Entry Fee
                  </span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>
                    {entryZoom.toLocaleString()} $ZOOM
                  </span>
                </div>
                <button
                  className="lr-buy"
                  onClick={handleJoin}
                  disabled={buying || sunCount <= 0 || balance < entryZoom}
                  data-testid="button-buy-lab-rank-entry"
                >
                  {buying ? "..." : sunCount <= 0 ? "SUN REQUIRED" : balance < entryZoom ? "NOT ENOUGH $ZOOM" : "JOIN"}
                </button>
              </div>
            )}

            {hasPaid && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(0,242,100,0.08)",
                  border: "1px solid rgba(0,242,100,0.3)",
                  marginBottom: 12,
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#00f264",
                }}
              >
                ✓ You're entered in this season
              </div>
            )}

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
                PRIZES
              </div>
              <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.7 }}>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#1</span> · {winnerTon} TON prize
                </div>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#2</span> · {(state?.stardustPayouts[2] ?? 500).toLocaleString()} ★ Stardust
                </div>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#3</span> · {(state?.stardustPayouts[3] ?? 250).toLocaleString()} ★ Stardust
                </div>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#4–5</span> · {(state?.stardustPayouts[4] ?? 100).toLocaleString()} ★ Stardust
                </div>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#6–10</span> · {(state?.stardustPayouts[6] ?? 50).toLocaleString()} ★ Stardust
                </div>
                <div>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>#11–20</span> · {(state?.stardustPayouts[11] ?? 20).toLocaleString()} ★ Stardust
                </div>
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
                  return (
                    <div
                      key={r.telegramId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        padding: "5px 6px",
                        borderRadius: 6,
                        background: isMe ? "rgba(255,215,0,0.10)" : "transparent",
                        border: isMe ? `1px solid ${GOLD}44` : "1px solid transparent",
                        color: r.rank === 1 ? ACCENT : "#fff",
                        fontWeight: r.rank <= 20 ? 800 : 600,
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 240,
                        }}
                      >
                        {r.rank === 1
                          ? "🥇"
                          : r.rank === 2
                          ? "🥈"
                          : r.rank === 3
                          ? "🥉"
                          : `#${r.rank}`}{" "}
                        {r.name}
                        {isMe ? " (you)" : ""}
                      </span>
                      <span>{r.labPoints} pt</span>
                    </div>
                  );
                })}
              </div>
            )}

            {msg && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,215,0,0.10)",
                  border: `1px solid ${GOLD}33`,
                  fontSize: 12,
                  color: ACCENT,
                  textAlign: "center",
                }}
              >
                {msg}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const LabRankWidget = memo(LabRankWidgetBase);
