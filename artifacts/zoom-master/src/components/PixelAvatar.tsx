import { useState, useEffect } from "react";
import { PlanetOrb } from "./PlanetOrb";
import {
  PLANET_CONFIG,
  isFarmActive,
  isFarmExpired,
  getFarmTimeRemaining,
  getReactivationFee,
  needsCollect,
  formatDuration,
  type Planet,
} from "../hooks/useGameState";

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
const WHITE_GLOW = "#dfe8ff";

interface PixelAvatarProps {
  size?: number;
  whitePlanets?: Planet[];
  whiteCollectionUnlocked?: boolean;
  balance?: number;
  onPlaceWhitePlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectWhitePlanet?: (planetId: string) => void;
  onReactivateWhitePlanet?: (planetId: string) => { ok: boolean; reason?: string };
}

export function PixelAvatar({
  size = 60,
  whitePlanets = [],
  whiteCollectionUnlocked = false,
  balance = 0,
  onPlaceWhitePlanet,
  onCollectWhitePlanet,
  onReactivateWhitePlanet,
}: PixelAvatarProps) {
  const [tapped, setTapped] = useState(false);
  const [open, setOpen] = useState(false);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
  // Currently selected unplaced planet (in inventory). Tap a slot to assign.
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [whiteMsg, setWhiteMsg] = useState<string | null>(null);
  // Tick once a minute to refresh the time-remaining labels on the slots.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  const cell = size / 12;

  const handleTap = () => {
    setTapped(true);
    window.setTimeout(() => setTapped(false), 220);
    setOpen(true);
  };

  const handleDeposit = () => {
    setDepositMsg("Coming soon");
  };

  const handleWithdraw = () => {
    const n = parseFloat(withdrawAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setWithdrawMsg("Enter a valid amount");
      return;
    }
    setWithdrawMsg(`Withdrawal request for ${n} TON sent`);
  };

  // Sort the inventory (unplaced) and slot occupants for stable rendering.
  const inventory = whitePlanets.filter((p) => p.slotIndex == null);
  const slotOccupants: (Planet | null)[] = [0, 1, 2, 3].map(
    (i) => whitePlanets.find((p) => p.slotIndex === i) || null
  );

  const flashWhiteMsg = (msg: string) => {
    setWhiteMsg(msg);
    window.setTimeout(() => setWhiteMsg(null), 2200);
  };

  const handleSlotClick = (slotIndex: number) => {
    const occupant = slotOccupants[slotIndex];
    if (occupant) return; // Locked once filled.
    if (!selectedInvId || !onPlaceWhitePlanet) {
      flashWhiteMsg("Select a planet from the inventory first");
      return;
    }
    const res = onPlaceWhitePlanet(selectedInvId, slotIndex);
    if (!res.ok) {
      flashWhiteMsg(res.reason || "Cannot place planet");
      return;
    }
    setSelectedInvId(null);
  };

  const handleInvClick = (id: string) => {
    setSelectedInvId((cur) => (cur === id ? null : id));
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
        @keyframes whiteSlotPulse {
          0%, 100% { box-shadow: 0 0 0 1px ${WHITE_GLOW}66, 0 0 14px ${WHITE_GLOW}44; }
          50%      { box-shadow: 0 0 0 1px ${WHITE_GLOW}cc, 0 0 22px ${WHITE_GLOW}99; }
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
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .pixel-farm-slot.targetable {
          border-color: ${WHITE_GLOW}aa;
          background: rgba(223,232,255,0.06);
          animation: whiteSlotPulse 1.6s ease-in-out infinite;
        }
        .pixel-farm-slot.filled {
          border: 1px solid ${WHITE_GLOW}55;
          background: rgba(223,232,255,0.05);
          cursor: default;
        }
        .pixel-farm-slot.locked-tag::after {
          content: "🔒";
          position: absolute;
          top: 4px;
          right: 6px;
          font-size: 9px;
          opacity: 0.55;
        }
        .pixel-inv-item {
          position: relative;
          background: rgba(223,232,255,0.04);
          border: 1px solid ${WHITE_GLOW}33;
          border-radius: 12px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
        }
        .pixel-inv-item:active { transform: scale(0.96); }
        .pixel-inv-item.selected {
          border-color: ${WHITE_GLOW};
          background: rgba(223,232,255,0.12);
          box-shadow: 0 0 14px ${WHITE_GLOW}66;
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
        .white-slot-action {
          margin-top: 6px;
          width: 100%;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 5px 4px;
          border-radius: 7px;
          border: 1px solid ${WHITE_GLOW}55;
          background: rgba(223,232,255,0.08);
          color: #fff;
          cursor: pointer;
          text-transform: uppercase;
        }
        .white-slot-action:active { transform: scale(0.96); }
        .white-slot-action.collect {
          background: linear-gradient(135deg, #00e676, #00b859);
          border-color: #00e67688;
          color: #042;
        }
        .white-slot-action.reactivate {
          background: linear-gradient(135deg, #ff8a3d, #ff5252);
          border-color: #ff525288;
          color: #fff;
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
                Your Wallet
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
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Balance</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>0.00 TON</span>
              </div>

              <button
                className="pixel-modal-btn primary"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={handleDeposit}
              >
                DEPOSIT TON
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
                  placeholder="TON amount"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <button
                  className="pixel-modal-btn secondary"
                  style={{ whiteSpace: "nowrap", opacity: 0.5, cursor: "not-allowed", filter: "grayscale(0.4)" }}
                  disabled
                  title="Coming soon"
                  onClick={handleWithdraw}
                >
                  WITHDRAW TON
                </button>
              </div>

              <input
                className="pixel-modal-input"
                type="text"
                placeholder="Withdraw address (coming soon)"
                disabled
                style={{ marginTop: 10, opacity: 0.55, cursor: "not-allowed" }}
              />

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

              {/* 4-slot grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {[0, 1, 2, 3].map((i) => {
                  const occupant = slotOccupants[i];
                  const targetable = !occupant && !!selectedInvId;
                  return (
                    <div
                      key={i}
                      className={`pixel-farm-slot ${occupant ? "filled locked-tag" : ""} ${targetable ? "targetable" : ""}`}
                      style={{ position: "relative", padding: occupant ? 6 : 0, flexDirection: "column" }}
                      onClick={() => handleSlotClick(i)}
                    >
                      {occupant ? (
                        <SlotContent
                          planet={occupant}
                          balance={balance}
                          onCollect={onCollectWhitePlanet}
                          onReactivate={(id) => {
                            const res = onReactivateWhitePlanet?.(id);
                            if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 18, opacity: 0.3 }}>◌</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {whiteMsg && (
                <div
                  style={{
                    fontSize: 11,
                    color: WHITE_GLOW,
                    marginBottom: 10,
                    padding: "6px 10px",
                    background: `${WHITE_GLOW}14`,
                    borderRadius: 8,
                    border: `1px solid ${WHITE_GLOW}44`,
                    textAlign: "center",
                  }}
                >
                  {whiteMsg}
                </div>
              )}

              {/* Inventory of unplaced white planets */}
              {whiteCollectionUnlocked && inventory.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "rgba(255,255,255,0.6)",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Inventory · Tap to select, then tap a slot
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(4, inventory.length)}, 1fr)`,
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {inventory.map((p) => {
                      const cfg = PLANET_CONFIG[p.name];
                      return (
                        <div
                          key={p.id}
                          className={`pixel-inv-item ${selectedInvId === p.id ? "selected" : ""}`}
                          onClick={() => handleInvClick(p.id)}
                        >
                          <PlanetOrb planet={p} size={42} animate={false} />
                          <div style={{ fontSize: 9, fontWeight: 800, opacity: 0.85, textAlign: "center", lineHeight: 1.1 }}>
                            {cfg.label}
                          </div>
                          <div style={{ fontSize: 8, opacity: 0.6 }}>+{cfg.rate}/h</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!whiteCollectionUnlocked && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  Unlock the White Collection to receive 4 exclusive white planets
                </div>
              )}

              {whiteCollectionUnlocked && inventory.length === 0 && slotOccupants.every((o) => o) && (
                <div
                  style={{
                    fontSize: 11,
                    color: WHITE_GLOW,
                    textAlign: "center",
                    fontStyle: "italic",
                    opacity: 0.8,
                  }}
                >
                  All 4 white planets have been placed 🔒
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface SlotContentProps {
  planet: Planet;
  balance: number;
  onCollect?: (id: string) => void;
  onReactivate?: (id: string) => void;
}

function SlotContent({ planet, balance, onCollect, onReactivate }: SlotContentProps) {
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const remaining = getFarmTimeRemaining(planet);
  const fee = getReactivationFee(planet);
  const showCollect = needsCollect(planet);
  const cfg = PLANET_CONFIG[planet.name];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <PlanetOrb planet={planet} size={36} animate={active} />
      <div style={{ fontSize: 8, fontWeight: 800, opacity: 0.95, lineHeight: 1.1, textAlign: "center" }}>
        {cfg.label.replace("White Planet ", "W")}
      </div>
      <div style={{ fontSize: 7, opacity: 0.7, lineHeight: 1.05, textAlign: "center" }}>
        {active
          ? `${formatDuration(remaining)}`
          : expired
          ? "expired"
          : "stopped"}
      </div>
      {showCollect && onCollect && (
        <button className="white-slot-action collect" onClick={(e) => { e.stopPropagation(); onCollect(planet.id); }}>
          COLLECT
        </button>
      )}
      {expired && !showCollect && onReactivate && (
        <button
          className="white-slot-action reactivate"
          disabled={balance < fee}
          style={balance < fee ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={(e) => { e.stopPropagation(); onReactivate(planet.id); }}
          title={`${fee.toLocaleString()} $ZOOM`}
        >
          REACT · {fee >= 1000 ? `${(fee / 1000).toFixed(1)}k` : fee}
        </button>
      )}
    </div>
  );
}
