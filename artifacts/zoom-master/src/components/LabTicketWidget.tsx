import { useEffect, useState, memo } from "react";
import { buyLabTicket } from "../utils/api";
import { haptic } from "../utils/haptic";
import ticketPx from "../assets/lab-ticket.png";

const PURPLE = "#a78bfa";
const ACCENT = "#e0c3fc";

interface Props {
  telegramId: string | null;
  depositBalance: number;
  onPurchase?: (labPointsDelta: number, stardustDelta: number) => void;
  shopMode?: boolean;
}

function LabTicketWidgetBase({ telegramId, depositBalance, onPurchase, shopMode = false }: Props) {
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const handleBuy = async () => {
    if (!telegramId) {
      setMsg("Telegram ID missing");
      return;
    }
    if (depositBalance < 1) {
      setMsg("Need 1 GRAM to buy");
      return;
    }
    haptic();
    setBuying(true);
    try {
      const r = await buyLabTicket(telegramId, 1);
      if (r.ok) {
        setMsg("+30 Lab Points & +300 Stardust!");
        onPurchase?.(30, 300);
        window.dispatchEvent(new Event("zoom-data-refresh"));
      } else {
        setMsg(r.error || "Purchase failed");
      }
    } catch {
      setMsg("Purchase failed");
    }
    setBuying(false);
  };

  return (
    <>
      <style>{`
        @keyframes ltFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes ltGlow {
          0%,100% { box-shadow: 0 0 12px ${PURPLE}88, 0 0 22px ${PURPLE}33; }
          50%     { box-shadow: 0 0 20px ${PURPLE}cc, 0 0 38px ${PURPLE}55; }
        }
        .lt-tile { animation: ltGlow 2.6s ease-in-out infinite; }
        .lt-img { animation: ltFloat 3s ease-in-out infinite; }
      `}</style>

      {shopMode ? (
        /* Inline shop card */
        <div
          onClick={() => setOpen(true)}
          style={{
            borderRadius: 14,
            background: "rgba(20,12,4,0.88)",
            border: `1px solid ${PURPLE}44`,
            overflow: "hidden",
            cursor: "pointer",
          }}
          data-testid="button-lab-ticket"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
            <div style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", filter: `drop-shadow(0 0 6px ${PURPLE}88)` }}>
              <img src={ticketPx} alt="" style={{ width: 40, height: 40, objectFit: "contain", imageRendering: "pixelated" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: PURPLE, fontSize: 14, letterSpacing: "0.04em" }}>LAB TICKET</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                +30 Lab Points · +300 Stardust · 1 GRAM
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${PURPLE}22`, padding: "10px 16px", textAlign: "center", fontWeight: 900, color: PURPLE, fontSize: 12, letterSpacing: "0.06em" }}>
            BUY — 1 GRAM →
          </div>
        </div>
      ) : (
        /* Fixed floating button */
        <button
          onClick={() => setOpen(true)}
          aria-label="Lab Ticket"
          className="lt-tile"
          style={{
            position: "fixed",
            left: 82,
            top: 90,
            width: 60,
            height: 60,
            borderRadius: 14,
            background: "rgba(20,12,4,0.85)",
            border: `1.5px solid ${PURPLE}88`,
            padding: 4,
            cursor: "pointer",
            zIndex: 40,
            backdropFilter: "blur(8px)",
            WebkitTapHighlightColor: "transparent",
          }}
          data-testid="button-lab-ticket"
        >
          <div
            className="lt-img"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              filter: `drop-shadow(0 0 8px ${PURPLE}aa)`,
            }}
          >
            <img
              src={ticketPx}
              alt=""
              style={{
                width: "84%",
                height: "84%",
                objectFit: "contain",
                imageRendering: "pixelated",
              }}
            />
          </div>
        </button>
      )}

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
          data-testid="modal-lab-ticket"
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 440,
              background: "linear-gradient(180deg, rgba(20,12,4,0.97), rgba(8,4,0,0.99))",
              border: `1px solid ${PURPLE}55`,
              boxShadow: `0 0 40px ${PURPLE}33`,
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
                border: `1px solid ${PURPLE}44`,
                background: "rgba(167,139,250,0.08)",
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
              <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 4 }}>🎟️</div>
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
                Lab Ticket
              </div>
              <div style={{ fontSize: 11, color: "rgba(224,195,252,0.7)", marginTop: 4 }}>
                Instantly boost your craft leaderboard standing
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
                  background: "rgba(167,139,250,0.05)",
                  border: `1px solid ${PURPLE}22`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Cost
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: ACCENT, marginTop: 2 }}>1 GRAM</div>
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(167,139,250,0.05)",
                  border: `1px solid ${PURPLE}22`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Your GRAM
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 2 }}>
                  {depositBalance.toFixed(2)}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", marginBottom: 6 }}>
                WHAT YOU GET
              </div>
              <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>+30</span>
                  <span>Craft Leaderboard Points</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: ACCENT, fontWeight: 800 }}>+300</span>
                  <span>Stardust for Lab crafting</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleBuy}
              disabled={buying || depositBalance < 1}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 12,
                border: "none",
                background: depositBalance < 1 ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #a78bfa, #7c3aed)",
                color: depositBalance < 1 ? "rgba(255,255,255,0.35)" : "#fff",
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: "0.06em",
                cursor: depositBalance < 1 ? "not-allowed" : "pointer",
                opacity: buying ? 0.6 : 1,
                boxShadow: depositBalance < 1 ? "none" : `0 0 18px ${PURPLE}55`,
                transition: "all 0.15s ease",
              }}
              data-testid="button-buy-lab-ticket"
            >
              {buying ? "Processing..." : depositBalance < 1 ? "Not enough GRAM" : "Buy Lab Ticket (1 GRAM)"}
            </button>

            {msg && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(167,139,250,0.10)",
                  border: `1px solid ${PURPLE}33`,
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

export const LabTicketWidget = memo(LabTicketWidgetBase);
