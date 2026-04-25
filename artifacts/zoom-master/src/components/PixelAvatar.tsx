import { useState, useEffect, useCallback, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { PlanetOrb } from "./PlanetOrb";
import {
  PLANET_CONFIG,
  isFarmActive,
  isFarmExpired,
  getFarmTimeRemaining,
  getReactivationFee,
  needsCollect,
  formatDuration,
  getWhitePlanetPendingTon,
  type Planet,
} from "../hooks/useGameState";
import {
  requestTonWithdrawal,
  fetchMyWithdrawals,
  confirmTonPurchase,
  pollTxnUntilFinal,
  WITHDRAWAL_MIN_TON,
  WITHDRAWAL_FEE_TON,
  WITHDRAWAL_COOLDOWN_HOURS,
  type TonWithdrawal,
} from "../utils/api";

// Project TON receiver wallet — same constant used by ShopPage for SUN/etc.
const TON_RECEIVER_WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";

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
  whiteCollectionBundles?: number;
  earthPlanets?: Planet[];
  earthCollectionUnlocked?: boolean;
  earthCollectionBundles?: number;
  sunCount?: number;
  tonBalance?: number;
  telegramId?: string | null;
  onPlaceWhitePlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectWhitePlanet?: (planetId: string) => void;
  onReactivateWhitePlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkWhitePlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceEarthPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectEarthPlanet?: (planetId: string) => void;
  onReactivateEarthPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkEarthPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
}

function PixelAvatarBase({
  size = 60,
  whitePlanets = [],
  whiteCollectionUnlocked = false,
  whiteCollectionBundles = 0,
  earthPlanets = [],
  earthCollectionUnlocked = false,
  earthCollectionBundles = 0,
  sunCount = 0,
  tonBalance = 0,
  telegramId = null,
  onPlaceWhitePlanet,
  onCollectWhitePlanet,
  onReactivateWhitePlanet: _onReactivateWhitePlanet,
  onMarkWhitePlanetReactivated,
  onPlaceEarthPlanet,
  onCollectEarthPlanet,
  onReactivateEarthPlanet: _onReactivateEarthPlanet,
  onMarkEarthPlanetReactivated,
}: PixelAvatarProps) {
  // TonConnect — same wiring used by the Shop page (SUN, packs, etc.). The
  // REACT button on a white-planet slot opens the wallet, sends 0.005 TON to
  // the project receiver, then asks the server to verify and credit the txn.
  const [tonConnectUI] = useTonConnectUI();
  const connectedAddress = useTonAddress();
  const [reactingId, setReactingId] = useState<string | null>(null);
  // Each bundle unlocks 4 slots. Backwards-compat: if the legacy unlocked flag
  // is true but bundles is 0 (pre-migration cache), assume 1 bundle = 4 slots.
  const effectiveBundles = whiteCollectionBundles > 0
    ? whiteCollectionBundles
    : (whiteCollectionUnlocked ? 1 : 0);
  const maxWhiteSlots = effectiveBundles * 4;
  const effectiveEarthBundles = earthCollectionBundles > 0
    ? earthCollectionBundles
    : (earthCollectionUnlocked ? 1 : 0);
  const maxEarthSlots = effectiveEarthBundles * 4;
  // Withdrawals are gated by either: a White Collection bundle (always
  // unlocks), OR an Earth Collection bundle PLUS at least one SUN module.
  const canWithdraw = whiteCollectionUnlocked || (earthCollectionUnlocked && sunCount > 0);
  const [tapped, setTapped] = useState(false);
  const [open, setOpen] = useState(false);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
  const [withdrawErr, setWithdrawErr] = useState<string | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [myWithdrawals, setMyWithdrawals] = useState<TonWithdrawal[]>([]);

  const refreshWithdrawals = useCallback(async () => {
    if (!telegramId) return;
    const list = await fetchMyWithdrawals(telegramId);
    setMyWithdrawals(list);
  }, [telegramId]);

  useEffect(() => {
    if (open && whiteCollectionUnlocked && telegramId) {
      refreshWithdrawals();
    }
  }, [open, whiteCollectionUnlocked, telegramId, refreshWithdrawals]);
  // Currently selected unplaced planet (in inventory). Tap a slot to assign.
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [whiteMsg, setWhiteMsg] = useState<string | null>(null);
  // Tick once a minute to refresh the time-remaining labels on the slots.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    // Tick once a second so the live TON balance and slot timers refresh smoothly.
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  // Real-time TON balance shown in the modal: persisted balance + uncollected
  // pending earnings from each placed white AND earth planet (capped at 24h
  // per planet). The same pending-TON helper works for any TON-farming planet.
  const liveTonBalance = (() => {
    const now = Date.now();
    let pending = 0;
    for (const p of whitePlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of earthPlanets) pending += getWhitePlanetPendingTon(p, now);
    return tonBalance + pending;
  })();

  const cell = size / 12;

  const handleTap = () => {
    setTapped(true);
    window.setTimeout(() => setTapped(false), 220);
    setOpen(true);
  };

  const handleDeposit = () => {
    setDepositMsg("Coming soon");
  };

  const handleWithdraw = async () => {
    setWithdrawErr(null);
    setWithdrawMsg(null);
    if (!canWithdraw) {
      // Earth holders need at least one SUN; surface the precise reason so
      // the user knows exactly what's missing.
      if (earthCollectionUnlocked && sunCount <= 0) {
        setWithdrawErr("Earth Collection requires a SUN module to withdraw");
      } else {
        setWithdrawErr("White or Earth Collection holders only");
      }
      return;
    }
    if (!telegramId) {
      setWithdrawErr("Session not ready");
      return;
    }
    const n = parseFloat(withdrawAmount);
    if (!Number.isFinite(n) || n < WITHDRAWAL_MIN_TON) {
      setWithdrawErr(`Minimum amount: ${WITHDRAWAL_MIN_TON} TON`);
      return;
    }
    const total = n + WITHDRAWAL_FEE_TON;
    if (liveTonBalance < total) {
      setWithdrawErr(`Insufficient TON. Need ${total.toFixed(4)} TON (amount + ${WITHDRAWAL_FEE_TON} fee)`);
      return;
    }
    const wallet = withdrawWallet.trim();
    if (!wallet) {
      setWithdrawErr("Enter your TON wallet address");
      return;
    }
    setSubmittingWithdraw(true);
    const res = await requestTonWithdrawal({ telegramId, amountTon: n, walletAddress: wallet });
    setSubmittingWithdraw(false);
    if (!res.ok) {
      setWithdrawErr(res.error || "Withdrawal failed");
      return;
    }
    // Sync local state with the new server-side TON balance and epoch.
    if (typeof res.newTonBalance === "number" && typeof res.balanceEpoch === "number") {
      window.dispatchEvent(new CustomEvent("zoom-server-ton-snap", {
        detail: { tonBalance: res.newTonBalance, epoch: res.balanceEpoch },
      }));
    }
    setWithdrawMsg(`Request submitted. You will receive ${n.toFixed(4)} TON after admin approval.`);
    setWithdrawAmount("");
    refreshWithdrawals();
  };

  // Sort the inventory (unplaced) and slot occupants for stable rendering.
  const inventory = whitePlanets.filter((p) => p.slotIndex == null);
  const slotOccupants: (Planet | null)[] = Array.from({ length: maxWhiteSlots }, (_, i) =>
    whitePlanets.find((p) => p.slotIndex === i) || null
  );

  // Earth Collection — separate inventory + slot grid mirroring the white one.
  const earthInventory = earthPlanets.filter((p) => p.slotIndex == null);
  const earthSlotOccupants: (Planet | null)[] = Array.from({ length: maxEarthSlots }, (_, i) =>
    earthPlanets.find((p) => p.slotIndex === i) || null
  );
  const [selectedEarthInvId, setSelectedEarthInvId] = useState<string | null>(null);

  const flashWhiteMsg = (msg: string) => {
    setWhiteMsg(msg);
    window.setTimeout(() => setWhiteMsg(null), 2200);
  };

  const handleSlotClick = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= maxWhiteSlots) return;
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

  const handleEarthSlotClick = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= maxEarthSlots) return;
    const occupant = earthSlotOccupants[slotIndex];
    if (occupant) return;
    if (!selectedEarthInvId || !onPlaceEarthPlanet) {
      flashWhiteMsg("Select an earth planet from the inventory first");
      return;
    }
    const res = onPlaceEarthPlanet(selectedEarthInvId, slotIndex);
    if (!res.ok) {
      flashWhiteMsg(res.reason || "Cannot place planet");
      return;
    }
    setSelectedEarthInvId(null);
  };

  const handleEarthInvClick = (id: string) => {
    setSelectedEarthInvId((cur) => (cur === id ? null : id));
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
          overflow: hidden;
        }
        .pixel-farm-slot.targetable {
          border-color: ${WHITE_GLOW}aa;
          background: rgba(223,232,255,0.06);
          animation: whiteSlotPulse 1.6s ease-in-out infinite;
        }
        /* Filled cells host variable-height content (orb + label + status +
           optional COLLECT/REACT button). Drop the square aspect-ratio so the
           cell grows vertically to fit; pin a min-height that fits the tallest
           variant so all cells in the row stay visually aligned. */
        .pixel-farm-slot.filled {
          border: 1px solid ${WHITE_GLOW}55;
          background: rgba(223,232,255,0.05);
          cursor: default;
          aspect-ratio: auto;
          min-height: 110px;
          align-items: stretch;
          justify-content: flex-start;
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
                <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{liveTonBalance.toFixed(4)} TON</span>
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

              {canWithdraw ? (
                <>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, marginBottom: 6 }}>
                    Min {WITHDRAWAL_MIN_TON} TON · Fee {WITHDRAWAL_FEE_TON} TON
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <input
                      className="pixel-modal-input"
                      type="number"
                      inputMode="decimal"
                      placeholder={`Amount (min ${WITHDRAWAL_MIN_TON})`}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      disabled={submittingWithdraw}
                    />
                    <button
                      className="pixel-modal-btn secondary"
                      style={{ whiteSpace: "nowrap", opacity: submittingWithdraw ? 0.6 : 1 }}
                      disabled={submittingWithdraw}
                      onClick={handleWithdraw}
                    >
                      {submittingWithdraw ? "..." : "WITHDRAW"}
                    </button>
                  </div>

                  <input
                    className="pixel-modal-input"
                    type="text"
                    placeholder="Your TON wallet address (UQ... / EQ...)"
                    value={withdrawWallet}
                    onChange={(e) => setWithdrawWallet(e.target.value)}
                    disabled={submittingWithdraw}
                    style={{ marginTop: 10 }}
                  />

                  {withdrawErr && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#ff7a7a",
                        marginTop: 10,
                        padding: "8px 12px",
                        background: "rgba(255,80,80,0.08)",
                        borderRadius: 8,
                        border: "1px solid rgba(255,80,80,0.25)",
                      }}
                    >
                      {withdrawErr}
                    </div>
                  )}

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

                  {myWithdrawals.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 6 }}>
                        Recent withdrawals
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                        {myWithdrawals.slice(0, 8).map((w) => {
                          const color = w.status === "paid" ? "#3ddc97" : w.status === "rejected" ? "#ff7a7a" : "#f5d36a";
                          return (
                            <div key={w.id} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                <span style={{ color: "#fff", fontWeight: 700 }}>{w.amountTon.toFixed(4)} TON</span>
                                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>{new Date(w.createdAt).toLocaleString()}</span>
                                {w.status === "paid" && w.txHash && (
                                  <a href={`https://tonscan.org/tx/${w.txHash}`} target="_blank" rel="noreferrer" style={{ color: NEON, fontSize: 10, textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    View tx
                                  </a>
                                )}
                                {w.status === "rejected" && w.rejectReason && (
                                  <span style={{ color: "rgba(255,122,122,0.85)", fontSize: 10 }}>{w.rejectReason}</span>
                                )}
                              </div>
                              <span style={{ color, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>{w.status}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", marginTop: 4 }}>
                  {earthCollectionUnlocked && sunCount <= 0
                    ? "TON withdrawals require a SUN module (Earth Collection)."
                    : "TON withdrawals are available to White or Earth Collection holders."}
                </div>
              )}
            </div>

            {/* White Collection Farm */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.18em",
                    color: "#fff",
                    textTransform: "uppercase",
                  }}
                >
                  White Collection Farm
                </div>
                {(whiteCollectionUnlocked || earthCollectionUnlocked) && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: WHITE_GLOW,
                      padding: "4px 9px",
                      borderRadius: 8,
                      background: `${WHITE_GLOW}14`,
                      border: `1px solid ${WHITE_GLOW}55`,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                    title="Persisted TON balance + uncollected pending earnings (live)"
                  >
                    {liveTonBalance.toFixed(6)} TON
                  </div>
                )}
              </div>

              {/* Slot grid: 4 columns, 1 row per bundle. Scrolls vertically when many bundles are owned. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                  marginBottom: 10,
                  maxHeight: maxWhiteSlots > 12 ? 360 : undefined,
                  overflowY: maxWhiteSlots > 12 ? "auto" : "visible",
                  paddingRight: maxWhiteSlots > 12 ? 4 : 0,
                }}
              >
                {slotOccupants.map((_occupantUnused, i) => {
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
                          tonBalance={tonBalance}
                          busy={reactingId === occupant.id}
                          onCollect={onCollectWhitePlanet}
                          onReactivate={async (id, planet) => {
                            // Pay the reactivation fee on-chain via TonConnect,
                            // then ask the server to verify the BOC. On success,
                            // flip the planet to active client-side. Same flow
                            // we use for SUN / shop TON purchases.
                            if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                            if (!connectedAddress) { tonConnectUI.openModal(); flashWhiteMsg("Connect your wallet"); return; }
                            if (reactingId) return;
                            setReactingId(id);
                            try {
                              const fee = getReactivationFee(planet);
                              const nanotons = BigInt(Math.round(fee * 1e9)).toString();
                              const txResult = await tonConnectUI.sendTransaction({
                                validUntil: Math.floor(Date.now() / 1000) + 300,
                                messages: [{ address: TON_RECEIVER_WALLET, amount: nanotons }],
                              });
                              const boc = txResult.boc || "";
                              const confirm = await confirmTonPurchase(telegramId, "white_react", connectedAddress, fee, boc);
                              let creditedOk = confirm.ok && !confirm.pending;
                              if (confirm.pending && confirm.txnId) {
                                flashWhiteMsg("Verifying payment on-chain…");
                                const final = await pollTxnUntilFinal(confirm.txnId);
                                creditedOk = final?.status === "completed";
                                if (final?.status === "failed") {
                                  flashWhiteMsg("Payment not detected on-chain");
                                  setReactingId(null);
                                  return;
                                }
                              } else if (!confirm.ok) {
                                flashWhiteMsg(confirm.error || "Payment failed");
                                setReactingId(null);
                                return;
                              }
                              if (creditedOk) {
                                const res = onMarkWhitePlanetReactivated?.(id);
                                if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                else flashWhiteMsg("Reactivated!");
                              } else {
                                flashWhiteMsg("Awaiting confirmation…");
                              }
                            } catch (err: unknown) {
                              const m = err instanceof Error ? err.message : String(err);
                              if (m.includes("cancel") || m.includes("reject") || m.includes("Interrupted")) flashWhiteMsg("Payment cancelled");
                              else { flashWhiteMsg("TON payment failed"); console.error("[react] ton tx error:", err); }
                            } finally {
                              setReactingId(null);
                            }
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

              {whiteCollectionUnlocked && effectiveBundles > 1 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    marginTop: 4,
                    letterSpacing: "0.08em",
                  }}
                >
                  {effectiveBundles}× bundles · {maxWhiteSlots} slots
                </div>
              )}

              {whiteCollectionUnlocked && maxWhiteSlots > 0 && inventory.length === 0 && slotOccupants.every((o) => o) && (
                <div
                  style={{
                    fontSize: 11,
                    color: WHITE_GLOW,
                    textAlign: "center",
                    fontStyle: "italic",
                    opacity: 0.8,
                  }}
                >
                  All {maxWhiteSlots} white planets have been placed 🔒
                </div>
              )}
            </div>

            {/* Earth Collection Farm — mirrors the white panel above. */}
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.18em",
                    color: "#fff",
                    textTransform: "uppercase",
                  }}
                >
                  🌍 Earth Collection Farm
                </div>
                {earthCollectionUnlocked && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: sunCount > 0 ? "#3ddc97" : "#ff9966",
                      padding: "4px 9px",
                      borderRadius: 8,
                      background: sunCount > 0 ? "rgba(61,220,151,0.10)" : "rgba(255,153,102,0.10)",
                      border: `1px solid ${sunCount > 0 ? "#3ddc97" : "#ff9966"}55`,
                      whiteSpace: "nowrap",
                    }}
                    title={sunCount > 0 ? "SUN module active — withdrawals enabled" : "Need a SUN to withdraw"}
                  >
                    {sunCount > 0 ? "SUN ✓" : "SUN required"}
                  </div>
                )}
              </div>

              {earthCollectionUnlocked && maxEarthSlots > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                    marginBottom: 10,
                    maxHeight: maxEarthSlots > 12 ? 360 : undefined,
                    overflowY: maxEarthSlots > 12 ? "auto" : "visible",
                    paddingRight: maxEarthSlots > 12 ? 4 : 0,
                  }}
                >
                  {earthSlotOccupants.map((_unused, i) => {
                    const occupant = earthSlotOccupants[i];
                    const targetable = !occupant && !!selectedEarthInvId;
                    return (
                      <div
                        key={`earth-slot-${i}`}
                        className={`pixel-farm-slot ${occupant ? "filled locked-tag" : ""} ${targetable ? "targetable" : ""}`}
                        style={{ position: "relative", padding: occupant ? 6 : 0, flexDirection: "column" }}
                        onClick={() => handleEarthSlotClick(i)}
                      >
                        {occupant ? (
                          <SlotContent
                            planet={occupant}
                            tonBalance={tonBalance}
                            busy={reactingId === occupant.id}
                            onCollect={onCollectEarthPlanet}
                            onReactivate={async (id, planet) => {
                              if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                              if (!connectedAddress) { tonConnectUI.openModal(); flashWhiteMsg("Connect your wallet"); return; }
                              if (reactingId) return;
                              setReactingId(id);
                              try {
                                const fee = getReactivationFee(planet);
                                const nanotons = BigInt(Math.round(fee * 1e9)).toString();
                                const txResult = await tonConnectUI.sendTransaction({
                                  validUntil: Math.floor(Date.now() / 1000) + 300,
                                  messages: [{ address: TON_RECEIVER_WALLET, amount: nanotons }],
                                });
                                const boc = txResult.boc || "";
                                const confirm = await confirmTonPurchase(telegramId, "earth_react", connectedAddress, fee, boc);
                                let creditedOk = confirm.ok && !confirm.pending;
                                if (confirm.pending && confirm.txnId) {
                                  flashWhiteMsg("Verifying payment on-chain…");
                                  const final = await pollTxnUntilFinal(confirm.txnId);
                                  creditedOk = final?.status === "completed";
                                  if (final?.status === "failed") {
                                    flashWhiteMsg("Payment not detected on-chain");
                                    setReactingId(null);
                                    return;
                                  }
                                } else if (!confirm.ok) {
                                  flashWhiteMsg(confirm.error || "Payment failed");
                                  setReactingId(null);
                                  return;
                                }
                                if (creditedOk) {
                                  const res = onMarkEarthPlanetReactivated?.(id);
                                  if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                  else flashWhiteMsg("Reactivated!");
                                } else {
                                  flashWhiteMsg("Awaiting confirmation…");
                                }
                              } catch (err: unknown) {
                                const m = err instanceof Error ? err.message : String(err);
                                if (m.includes("cancel") || m.includes("reject") || m.includes("Interrupted")) flashWhiteMsg("Payment cancelled");
                                else { flashWhiteMsg("TON payment failed"); console.error("[earth-react] ton tx error:", err); }
                              } finally {
                                setReactingId(null);
                              }
                            }}
                          />
                        ) : (
                          <div style={{ fontSize: 18, opacity: 0.3 }}>◌</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {earthCollectionUnlocked && earthInventory.length > 0 && (
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
                    Earth Inventory · Tap to select, then tap a slot
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(4, earthInventory.length)}, 1fr)`,
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {earthInventory.map((p) => {
                      const cfg = PLANET_CONFIG[p.name];
                      return (
                        <div
                          key={p.id}
                          className={`pixel-inv-item ${selectedEarthInvId === p.id ? "selected" : ""}`}
                          onClick={() => handleEarthInvClick(p.id)}
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

              {!earthCollectionUnlocked && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  Unlock the Earth Collection (7 TON) to receive 4 earth planets · requires SUN to withdraw
                </div>
              )}

              {earthCollectionUnlocked && effectiveEarthBundles > 1 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    marginTop: 4,
                    letterSpacing: "0.08em",
                  }}
                >
                  {effectiveEarthBundles}× bundles · {maxEarthSlots} slots
                </div>
              )}

              {earthCollectionUnlocked && maxEarthSlots > 0 && earthInventory.length === 0 && earthSlotOccupants.every((o) => o) && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#3ddc97",
                    textAlign: "center",
                    fontStyle: "italic",
                    opacity: 0.8,
                  }}
                >
                  All {maxEarthSlots} earth planets have been placed 🌍
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
  tonBalance: number;
  busy?: boolean;
  onCollect?: (id: string) => void;
  onReactivate?: (id: string, planet: Planet) => void;
}

function SlotContent({ planet, busy = false, onReactivate }: SlotContentProps) {
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const remaining = getFarmTimeRemaining(planet);
  const fee = getReactivationFee(planet);
  // White-planet rule: NO collect step at all. TON earnings are auto-credited
  // to tonBalance the moment the user pays the on-chain reactivation fee.
  // The only action surface for white planets is REACT after expiry.
  const cfg = PLANET_CONFIG[planet.name];
  // Reactivation is paid on-chain via TonConnect now (same as the SUN/shop
  // flow). The button stays enabled as long as no payment is in-flight.
  const canPay = !busy;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <PlanetOrb planet={planet} size={36} animate={active} />
      <div style={{ fontSize: 8, fontWeight: 800, opacity: 0.95, lineHeight: 1.1, textAlign: "center" }}>
        {cfg.label.replace("White Planet ", "W").replace("Earth Planet ", "E")}
      </div>
      <div style={{ fontSize: 7, opacity: 0.7, lineHeight: 1.05, textAlign: "center" }}>
        {active
          ? `${formatDuration(remaining)}`
          : expired
          ? "expired"
          : "stopped"}
      </div>
      {expired && onReactivate && (
        <button
          className="white-slot-action reactivate"
          disabled={!canPay}
          style={!canPay ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={(e) => { e.stopPropagation(); onReactivate(planet.id, planet); }}
          title={`${fee.toFixed(4)} TON`}
        >
          {busy ? "…" : `REACT · ${fee.toFixed(3)}`}
        </button>
      )}
    </div>
  );
}

export const PixelAvatar = memo(PixelAvatarBase);
