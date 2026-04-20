import { useState } from "react";

const D = "#0a0a14";
const H = "#e8ecff";
const V = "#0fd9ff";
const R = "#ffffff";
const S = "#7a8cff";
const _ = "transparent";

const FACE: string[][] = [
  [_, _, _, D, D, D, D, D, D, _, _, _],
  [_, _, D, H, H, H, H, H, H, D, _, _],
  [_, D, H, H, H, H, H, H, H, H, D, _],
  [_, D, H, V, V, V, V, V, V, H, D, _],
  [D, H, V, V, R, R, V, V, V, V, H, D],
  [D, H, V, V, R, V, V, V, V, V, H, D],
  [D, H, V, V, V, V, V, V, V, V, H, D],
  [D, H, V, V, V, V, V, V, V, V, H, D],
  [_, D, H, V, V, V, V, V, V, H, D, _],
  [_, D, H, H, S, H, H, S, H, H, D, _],
  [_, _, D, H, H, H, H, H, H, D, _, _],
  [_, _, _, D, D, D, D, D, D, _, _, _],
];

const NEON = "#0fd9ff";
const NEON_PURPLE = "#c060ff";

export function PixelAvatar({ size = 60 }: { size?: number }) {
  const [tapped, setTapped] = useState(false);
  const [open, setOpen] = useState(false);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);

  const cell = size / 12;

  const handleTap = () => {
    setTapped(true);
    window.setTimeout(() => setTapped(false), 220);
    setOpen(true);
  };

  const handleDeposit = () => {
    setDepositMsg("Generazione indirizzo wallet in corso...");
  };

  const handleWithdraw = () => {
    const n = parseFloat(withdrawAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setWithdrawMsg("Inserisci un importo valido");
      return;
    }
    setWithdrawMsg(`Richiesta di prelievo di ${n} TON inviata`);
  };

  return (
    <>
      <style>{`
        @keyframes pixelAvatarBob {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-7px); }
          100% { transform: translateY(0px); }
        }
        @keyframes pixelAvatarGlow {
          0%, 100% { box-shadow: 0 0 8px ${NEON}66, 0 0 18px ${NEON}33, inset 0 0 0 1px ${NEON}55; }
          50%      { box-shadow: 0 0 14px ${NEON}99, 0 0 28px ${NEON}55, inset 0 0 0 1px ${NEON}aa; }
        }
        @keyframes pixelModalIn {
          from { opacity: 0; transform: translateY(14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pixelBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .pixel-avatar-wrap {
          animation: pixelAvatarBob 2.4s ease-in-out infinite;
          will-change: transform;
        }
        .pixel-avatar-frame {
          animation: pixelAvatarGlow 2.6s ease-in-out infinite;
          transition: transform 0.15s ease, filter 0.15s ease;
        }
        .pixel-avatar-frame.tapped {
          transform: scale(1.12) rotate(-4deg);
          filter: brightness(1.45) hue-rotate(20deg);
        }
        .pixel-modal-backdrop {
          animation: pixelBackdropIn 0.22s ease-out;
        }
        .pixel-modal-card {
          animation: pixelModalIn 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);
        }
        .pixel-farm-slot {
          background: rgba(255,255,255,0.03);
          border: 2px dashed rgba(255,255,255,0.18);
          border-radius: 12px;
          aspect-ratio: 1 / 1;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .pixel-farm-slot:hover {
          border-color: rgba(15,217,255,0.45);
          background: rgba(15,217,255,0.05);
        }
        .pixel-modal-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 10px 12px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .pixel-modal-input:focus {
          border-color: ${NEON}aa;
        }
        .pixel-modal-btn {
          border-radius: 12px;
          padding: 12px 16px;
          font-weight: 800;
          letter-spacing: 0.04em;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.1s ease, filter 0.15s ease;
          border: none;
          color: #060810;
        }
        .pixel-modal-btn:active { transform: scale(0.97); }
        .pixel-modal-btn.primary {
          background: linear-gradient(135deg, ${NEON}, #6c7bff);
          box-shadow: 0 0 18px ${NEON}55;
        }
        .pixel-modal-btn.secondary {
          background: linear-gradient(135deg, ${NEON_PURPLE}, #ff66c4);
          box-shadow: 0 0 18px ${NEON_PURPLE}55;
        }
      `}</style>

      <div
        className="pixel-avatar-wrap"
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPointerDown={handleTap}
      >
        <div
          className={`pixel-avatar-frame ${tapped ? "tapped" : ""}`}
          style={{
            width: size,
            height: size,
            borderRadius: 10,
            background: "rgba(8,12,28,0.6)",
            display: "grid",
            gridTemplateColumns: `repeat(12, ${cell}px)`,
            gridTemplateRows: `repeat(12, ${cell}px)`,
            cursor: "pointer",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            imageRendering: "pixelated",
          }}
          role="button"
          aria-label="Player avatar"
        >
          {FACE.flatMap((row, y) =>
            row.map((color, x) => (
              <div
                key={`${x}-${y}`}
                style={{ width: cell, height: cell, background: color }}
              />
            ))
          )}
        </div>
      </div>

      {open && (
        <div
          className="pixel-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4,6,16,0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "210px 18px 24px",
            overflowY: "auto",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          {/* Bobbing avatar peeking behind the modal */}
          <div
            style={{
              position: "absolute",
              top: 56,
              left: "50%",
              transform: "translateX(-50%)",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          >
            <div className="pixel-avatar-wrap" style={{ width: 56, height: 56 }}>
              <div
                className="pixel-avatar-frame"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  background: "rgba(8,12,28,0.6)",
                  display: "grid",
                  gridTemplateColumns: `repeat(12, ${56 / 12}px)`,
                  gridTemplateRows: `repeat(12, ${56 / 12}px)`,
                  imageRendering: "pixelated",
                }}
              >
                {FACE.flatMap((row, y) =>
                  row.map((color, x) => (
                    <div
                      key={`bg-${x}-${y}`}
                      style={{ width: 56 / 12, height: 56 / 12, background: color }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div
            className="pixel-modal-card"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "linear-gradient(180deg, rgba(12,14,28,0.96), rgba(8,10,22,0.98))",
              border: `1px solid ${NEON}55`,
              boxShadow: `0 0 32px ${NEON}33, 0 0 64px rgba(192,96,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)`,
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
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            {/* Wallet section */}
            <div style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  color: NEON,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Il Tuo Portafoglio
              </div>

              <div
                style={{
                  background: "rgba(15,217,255,0.06)",
                  border: `1px solid ${NEON}33`,
                  borderRadius: 14,
                  padding: "14px 16px",
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Saldo</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>0.00 TON</span>
              </div>

              <button
                className="pixel-modal-btn primary"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={handleDeposit}
              >
                DEPOSITA TON
              </button>

              {depositMsg && (
                <div
                  style={{
                    fontSize: 12,
                    color: NEON,
                    marginBottom: 12,
                    padding: "8px 12px",
                    background: "rgba(15,217,255,0.08)",
                    borderRadius: 8,
                    border: `1px solid ${NEON}33`,
                  }}
                >
                  {depositMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input
                  className="pixel-modal-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="Importo TON"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <button
                  className="pixel-modal-btn secondary"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={handleWithdraw}
                >
                  PRELEVA TON
                </button>
              </div>

              {withdrawMsg && (
                <div
                  style={{
                    fontSize: 12,
                    color: NEON_PURPLE,
                    marginTop: 10,
                    padding: "8px 12px",
                    background: "rgba(192,96,255,0.08)",
                    borderRadius: 8,
                    border: `1px solid ${NEON_PURPLE}33`,
                  }}
                >
                  {withdrawMsg}
                </div>
              )}
            </div>

            {/* White Collection Farm */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  color: "#fff",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                White Collection Farm
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="pixel-farm-slot" />
                ))}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                Sblocca questa farm con il pianeta SUN
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
