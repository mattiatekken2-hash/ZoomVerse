import { useState, useEffect, useCallback, memo } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { PlanetOrb } from "./PlanetOrb";
import { RealisticEarth } from "./RealisticEarth";
import { RealisticWhite } from "./RealisticWhite";
import { BlackPlanetOrb } from "./BlackPlanetOrb";
import { SupernovaStarOrb } from "./SupernovaStarOrb";
import {
  PLANET_CONFIG,
  FARM_UPGRADE_COSTS,
  FARM_UPGRADE_TIERS,
  isFarmActive,
  isFarmExpired,
  getFarmTimeRemaining,
  needsCollect,
  formatDuration,
  getWhitePlanetPendingTon,
  type Planet,
} from "../hooks/useGameState";
import {
  requestTonWithdrawal,
  fetchMyWithdrawals,
  reactivateCollectionWithRedStar,
  WITHDRAWAL_MIN_TON,
  WITHDRAWAL_FEE_TON,
  WITHDRAWAL_COOLDOWN_HOURS,
  type TonWithdrawal,
} from "../utils/api";


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
  blackPlanets?: Planet[];
  blackCollectionUnlocked?: boolean;
  blackCollectionBundles?: number;
  supernovaPlanets?: Planet[];
  supernovaCollectionUnlocked?: boolean;
  supernovaCollectionBundles?: number;
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
  onPlaceBlackPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectBlackPlanet?: (planetId: string) => void;
  onReactivateBlackPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkBlackPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  onPlaceSupernovaPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectSupernovaPlanet?: (planetId: string) => void;
  onReactivateSupernovaPlanet?: (planetId: string) => { ok: boolean; reason?: string };
  onMarkSupernovaPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  // REDSTAR Collection
  stellaPlanets?: Planet[];
  stellaRossaCollectionUnlocked?: boolean;
  stellaRossaCollectionBundles?: number;
  onPlaceStellaRossaPlanet?: (planetId: string, slotIndex: number) => { ok: boolean; reason?: string };
  onCollectStellaRossaPlanet?: (planetId: string) => void;
  onMarkStellaRossaPlanetReactivated?: (planetId: string) => { ok: boolean; reason?: string };
  /** Current REDSTAR balance — shown on REACT ALL buttons. */
  redStarBalance?: number;
  /** Called after a successful REDSTAR deduction so the parent can update its state. */
  onRedStarBalanceUpdate?: (newBalance: number) => void;
  /** Current collection farm-duration (hours). Used to highlight the active tier. */
  collectionFarmDurationHours?: number;
  /** Permanently upgrade farm-cycle duration for ALL collection planets. Charges GRAM. */
  onUpgradeCollectionDuration?: (hours: number) => Promise<{ ok: boolean; error?: string }>;
}

function PixelAvatarBase({
  size = 60,
  whitePlanets = [],
  whiteCollectionUnlocked = false,
  whiteCollectionBundles = 0,
  earthPlanets = [],
  earthCollectionUnlocked = false,
  earthCollectionBundles = 0,
  blackPlanets = [],
  blackCollectionUnlocked = false,
  blackCollectionBundles = 0,
  supernovaPlanets = [],
  supernovaCollectionUnlocked = false,
  supernovaCollectionBundles = 0,
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
  onPlaceBlackPlanet,
  onCollectBlackPlanet,
  onReactivateBlackPlanet: _onReactivateBlackPlanet,
  onMarkBlackPlanetReactivated,
  onPlaceSupernovaPlanet,
  onCollectSupernovaPlanet,
  onReactivateSupernovaPlanet: _onReactivateSupernovaPlanet,
  onMarkSupernovaPlanetReactivated,
  stellaPlanets = [],
  stellaRossaCollectionUnlocked = false,
  stellaRossaCollectionBundles = 0,
  onPlaceStellaRossaPlanet,
  onCollectStellaRossaPlanet,
  onMarkStellaRossaPlanetReactivated,
  redStarBalance = 0,
  onRedStarBalanceUpdate,
  collectionFarmDurationHours = 1,
  onUpgradeCollectionDuration,
}: PixelAvatarProps) {
  // TonConnect still wired for potential future use (collection unlock purchases share this component)
  const [tonConnectUI] = useTonConnectUI();
  void tonConnectUI; // suppress unused-variable lint
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [reactingAll, setReactingAll] = useState(false);
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
  const effectiveBlackBundles = blackCollectionBundles > 0
    ? blackCollectionBundles
    : (blackCollectionUnlocked ? 1 : 0);
  const maxBlackSlots = effectiveBlackBundles * 4;
  const effectiveSupernovaBundles = supernovaCollectionBundles > 0
    ? supernovaCollectionBundles
    : (supernovaCollectionUnlocked ? 1 : 0);
  const maxSupernovaSlots = effectiveSupernovaBundles * 4;
  const effectiveStellaBundles = stellaRossaCollectionBundles > 0
    ? stellaRossaCollectionBundles
    : (stellaRossaCollectionUnlocked ? 1 : 0);
  const maxStellaSlots = effectiveStellaBundles * 4;
  // Withdrawals are gated by: White Collection, OR Earth Collection, OR Black, OR Supernova, OR Redstar.
  const canWithdraw = whiteCollectionUnlocked || earthCollectionUnlocked || blackCollectionUnlocked || supernovaCollectionUnlocked || stellaRossaCollectionUnlocked;
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
    // Battery-saver: tick every 5s is enough for minute-level timer labels.
    const t = window.setInterval(() => setTick((n) => n + 1), 5000);
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
    for (const p of blackPlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of supernovaPlanets) pending += getWhitePlanetPendingTon(p, now);
    for (const p of stellaPlanets) pending += getWhitePlanetPendingTon(p, now);
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
      setWithdrawErr("White or Earth Collection holders only");
      return;
    }
    if (!telegramId) {
      setWithdrawErr("Session not ready");
      return;
    }
    const n = parseFloat(withdrawAmount);
    if (!Number.isFinite(n) || n < WITHDRAWAL_MIN_TON) {
      setWithdrawErr(`Minimum amount: ${WITHDRAWAL_MIN_TON} GRAM`);
      return;
    }
    const total = n + WITHDRAWAL_FEE_TON;
    if (liveTonBalance < total) {
      setWithdrawErr(`Insufficient GRAM. Need ${total.toFixed(4)} GRAM (amount + ${WITHDRAWAL_FEE_TON} fee)`);
      return;
    }
    const wallet = withdrawWallet.trim();
    if (!wallet) {
      setWithdrawErr("Enter your GRAM wallet address");
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
    setWithdrawMsg(`Request submitted. You will receive ${n.toFixed(4)} GRAM after admin approval.`);
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

  // Black Collection — mirrors earth collection.
  const blackInventory = blackPlanets.filter((p) => p.slotIndex == null);
  const blackSlotOccupants: (Planet | null)[] = Array.from({ length: maxBlackSlots }, (_, i) =>
    blackPlanets.find((p) => p.slotIndex === i) || null
  );
  const [selectedBlackInvId, setSelectedBlackInvId] = useState<string | null>(null);

  // Supernova Collection — mirrors black collection.
  const supernovaInventory = supernovaPlanets.filter((p) => p.slotIndex == null);
  const supernovaSlotOccupants: (Planet | null)[] = Array.from({ length: maxSupernovaSlots }, (_, i) =>
    supernovaPlanets.find((p) => p.slotIndex === i) || null
  );
  const [selectedSupernovaInvId, setSelectedSupernovaInvId] = useState<string | null>(null);

  // REDSTAR Collection — mirrors supernova collection.
  const stellaInventory = stellaPlanets.filter((p) => p.slotIndex == null);
  const stellaSlotOccupants: (Planet | null)[] = Array.from({ length: maxStellaSlots }, (_, i) =>
    stellaPlanets.find((p) => p.slotIndex === i) || null
  );
  const [selectedStellaInvId, setSelectedStellaInvId] = useState<string | null>(null);

  const flashWhiteMsg = (msg: string) => {
    setWhiteMsg(msg);
    window.setTimeout(() => setWhiteMsg(null), 2200);
  };

  // Batch REACT: one TonConnect transaction covers all expired planets in a collection.
  // After the on-chain payment succeeds, each planet is marked reactivated locally.
  /**
   * Batch-reactivate `expiredPlanets` by spending 1 ★ REDSTAR per planet.
   * Server validates and deducts atomically; on success marks each planet
   * locally and notifies the parent of the new redStarBalance.
   */
  const handleReactAllRedStar = useCallback(async (
    expiredPlanets: Planet[],
    markOne?: (id: string) => { ok: boolean; reason?: string },
  ) => {
    if (expiredPlanets.length === 0) return;
    if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
    if (reactingAll || reactingId) return;
    setReactingAll(true);
    try {
      const result = await reactivateCollectionWithRedStar(telegramId, expiredPlanets.length);
      if (!result.ok) {
        flashWhiteMsg(result.error ?? "Insufficient ★ Redstar balance");
        return;
      }
      let ok = 0;
      for (const planet of expiredPlanets) {
        const res = markOne?.(planet.id);
        if (!res || res.ok) ok++;
      }
      if (typeof result.newRedStarBalance === "number") {
        onRedStarBalanceUpdate?.(result.newRedStarBalance);
      }
      flashWhiteMsg(`✅ ${ok}/${expiredPlanets.length} planets reactivated!`);
    } catch {
      flashWhiteMsg("Reactivation failed");
    } finally {
      setReactingAll(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramId, reactingAll, reactingId, onRedStarBalanceUpdate]);

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

  const handleBlackSlotClick = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= maxBlackSlots) return;
    const occupant = blackSlotOccupants[slotIndex];
    if (occupant) return;
    if (!selectedBlackInvId || !onPlaceBlackPlanet) {
      flashWhiteMsg("Select a black planet from the inventory first");
      return;
    }
    const res = onPlaceBlackPlanet(selectedBlackInvId, slotIndex);
    if (!res.ok) {
      flashWhiteMsg(res.reason || "Cannot place planet");
      return;
    }
    setSelectedBlackInvId(null);
  };

  const handleBlackInvClick = (id: string) => {
    setSelectedBlackInvId((cur) => (cur === id ? null : id));
  };

  const handleSupernovaSlotClick = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= maxSupernovaSlots) return;
    const occupant = supernovaSlotOccupants[slotIndex];
    if (occupant) return;
    if (!selectedSupernovaInvId || !onPlaceSupernovaPlanet) {
      flashWhiteMsg("Select a supernova star from the inventory first");
      return;
    }
    const res = onPlaceSupernovaPlanet(selectedSupernovaInvId, slotIndex);
    if (!res.ok) {
      flashWhiteMsg(res.reason || "Cannot place star");
      return;
    }
    setSelectedSupernovaInvId(null);
  };

  const handleSupernovaInvClick = (id: string) => {
    setSelectedSupernovaInvId((cur) => (cur === id ? null : id));
  };

  const handleStellaSlotClick = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= maxStellaSlots) return;
    const occupant = stellaSlotOccupants[slotIndex];
    if (occupant) return;
    if (!selectedStellaInvId || !onPlaceStellaRossaPlanet) {
      flashWhiteMsg("Select a REDSTAR planet from the inventory first");
      return;
    }
    const res = onPlaceStellaRossaPlanet(selectedStellaInvId, slotIndex);
    if (!res.ok) { flashWhiteMsg(res.reason || "Cannot place planet"); return; }
    setSelectedStellaInvId(null);
  };

  const handleStellaInvClick = (id: string) => {
    setSelectedStellaInvId((cur) => (cur === id ? null : id));
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
        /* Modal in/backdrop animations intentionally disabled: they replay
           every time the LAB tab becomes visible again (display:none → flex
           restarts CSS animations), which caused a perceived "flash" in the
           inventory whenever the user switched tabs with the modal open. */
        .pixel-modal-backdrop { /* opens instantly */ }
        .pixel-modal-card { /* opens instantly */ }
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

            {/* Wallet section removed — use the GRAM pill in the header */}
            <div style={{ marginBottom: 22, display: "none" }}>
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
                <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{liveTonBalance.toFixed(4)} GRAM</span>
              </div>

              <button
                className="pixel-modal-btn primary"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={handleDeposit}
              >
                DEPOSIT GRAM
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
                    placeholder="Your GRAM wallet address (UQ... / EQ...)"
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
                                <span style={{ color: "#fff", fontWeight: 700 }}>{w.amountTon.toFixed(4)} GRAM</span>
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
                    ? "GRAM withdrawals require a SUN module (Earth Collection)."
                    : "GRAM withdrawals are available to White or Earth Collection holders."}
                </div>
              )}
            </div>

            {/* ── Collection farm-duration upgrade (shared across all collections) ── */}
            {onUpgradeCollectionDuration && (whiteCollectionUnlocked || earthCollectionUnlocked || blackCollectionUnlocked || supernovaCollectionUnlocked || stellaRossaCollectionUnlocked) && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(255,179,71,0.07)", borderRadius: 10, border: "1px solid rgba(255,179,71,0.2)" }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "rgba(255,179,71,0.7)", marginBottom: 8 }}>
                  ⏱ CYCLE DURATION — ALL COLLECTIONS · {collectionFarmDurationHours}h · costs EARNED GRAM
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                  {FARM_UPGRADE_TIERS.map((h) => {
                    const cost = FARM_UPGRADE_COSTS[h]!;
                    const isCurrent = collectionFarmDurationHours === h;
                    const canAfford = tonBalance >= cost;
                    return (
                      <button
                        key={h}
                        disabled={isCurrent || !canAfford}
                        onClick={async () => {
                          const result = await onUpgradeCollectionDuration(h);
                          if (!result.ok) flashWhiteMsg(result.error ?? "Upgrade failed");
                        }}
                        style={{
                          padding: "5px 2px", borderRadius: 7, fontSize: 9, fontWeight: 900,
                          background: isCurrent ? "rgba(255,179,71,0.25)" : canAfford ? "rgba(255,179,71,0.10)" : "rgba(255,255,255,0.04)",
                          border: isCurrent ? "1px solid rgba(255,179,71,0.7)" : "1px solid rgba(255,179,71,0.2)",
                          color: isCurrent ? "#ffb347" : canAfford ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
                          cursor: isCurrent || !canAfford ? "default" : "pointer",
                          textAlign: "center", lineHeight: 1.3,
                        }}
                      >
                        <div>{h}h</div>
                        {!isCurrent && <div style={{ fontSize: 8, opacity: 0.75 }}>{cost} G</div>}
                        {isCurrent && <div style={{ fontSize: 8, opacity: 0.7 }}>✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                    title="Persisted GRAM balance + uncollected pending earnings (live)"
                  >
                    {liveTonBalance.toFixed(6)} GRAM
                  </div>
                )}
              </div>

              {/* REACT ALL — batch reactivate all expired white slots · 1 ★ REDSTAR each */}
              {(() => {
                const exp = slotOccupants.filter((p): p is Planet => !!p && isFarmExpired(p));
                if (exp.length === 0) return null;
                const canAfford = redStarBalance >= exp.length;
                return (
                  <button
                    disabled={reactingAll || !!reactingId || !canAfford}
                    onClick={() => void handleReactAllRedStar(exp, onMarkWhitePlanetReactivated)}
                    style={{
                      width: "100%", marginBottom: 8, padding: "8px 0", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(0,217,255,0.18), rgba(0,150,200,0.10))",
                      border: "1px solid rgba(0,217,255,0.4)",
                      color: "#0fd9ff", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em",
                      cursor: reactingAll || !!reactingId || !canAfford ? "not-allowed" : "pointer",
                      opacity: reactingAll || !!reactingId || !canAfford ? 0.5 : 1,
                    }}
                  >
                    {reactingAll ? "REACTING ALL…" : `⚡ REACT ALL ${exp.length} · ${exp.length} ★ Redstar`}
                  </button>
                );
              })()}

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
                                                    onReactivate={async (id, _planet) => {
                            if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                            if (reactingId) return;
                            setReactingId(id);
                            try {
                              const result = await reactivateCollectionWithRedStar(telegramId, 1);
                              if (!result.ok) { flashWhiteMsg(result.error ?? "Insufficient ★ Redstar"); return; }
                              const res = onMarkWhitePlanetReactivated?.(id);
                              if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                              else {
                                flashWhiteMsg("Reactivated!");
                                if (typeof result.newRedStarBalance === "number") onRedStarBalanceUpdate?.(result.newRedStarBalance);
                              }
                            } catch { flashWhiteMsg("Reactivation failed"); }
                            finally { setReactingId(null); }
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
                          <RealisticWhite size={42} />
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

              {/* REACT ALL — batch reactivate all expired earth slots · 1 ★ REDSTAR each */}
              {earthCollectionUnlocked && (() => {
                const exp = earthSlotOccupants.filter((p): p is Planet => !!p && isFarmExpired(p));
                if (exp.length === 0) return null;
                const canAfford = redStarBalance >= exp.length;
                return (
                  <button
                    disabled={reactingAll || !!reactingId || !canAfford}
                    onClick={() => void handleReactAllRedStar(exp, onMarkEarthPlanetReactivated)}
                    style={{
                      width: "100%", marginBottom: 8, padding: "8px 0", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(34,197,94,0.10))",
                      border: "1px solid rgba(59,130,246,0.4)",
                      color: "#3b82f6", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em",
                      cursor: reactingAll || !!reactingId || !canAfford ? "not-allowed" : "pointer",
                      opacity: reactingAll || !!reactingId || !canAfford ? 0.5 : 1,
                    }}
                  >
                    {reactingAll ? "REACTING ALL…" : `⚡ REACT ALL ${exp.length} · ${exp.length} ★ Redstar`}
                  </button>
                );
              })()}

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
                                                        onReactivate={async (id, _planet) => {
                              if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                              if (reactingId) return;
                              setReactingId(id);
                              try {
                                const result = await reactivateCollectionWithRedStar(telegramId, 1);
                                if (!result.ok) { flashWhiteMsg(result.error ?? "Insufficient ★ Redstar"); return; }
                                const res = onMarkEarthPlanetReactivated?.(id);
                                if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                else {
                                  flashWhiteMsg("Reactivated!");
                                  if (typeof result.newRedStarBalance === "number") onRedStarBalanceUpdate?.(result.newRedStarBalance);
                                }
                              } catch { flashWhiteMsg("Reactivation failed"); }
                              finally { setReactingId(null); }
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
                          <RealisticEarth size={42} />
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
                  Unlock the Earth Collection (7 GRAM) to receive 4 earth planets · requires SUN to withdraw
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

            {/* Black Collection Farm — 40 GRAM/bundle, ~0.333 GRAM/day. */}
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
                  Black Collection Farm
                </div>
                {blackCollectionUnlocked && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#7b2fff",
                      padding: "4px 9px",
                      borderRadius: 8,
                      background: "rgba(123,47,255,0.10)",
                      border: "1px solid rgba(123,47,255,0.45)",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                    title="Live GRAM balance including uncollected black planet earnings"
                  >
                    {liveTonBalance.toFixed(6)} GRAM
                  </div>
                )}
              </div>

              {/* REACT ALL — batch reactivate all expired black slots · 1 ★ REDSTAR each */}
              {blackCollectionUnlocked && (() => {
                const exp = blackSlotOccupants.filter((p): p is Planet => !!p && isFarmExpired(p));
                if (exp.length === 0) return null;
                const canAfford = redStarBalance >= exp.length;
                return (
                  <button
                    disabled={reactingAll || !!reactingId || !canAfford}
                    onClick={() => void handleReactAllRedStar(exp, onMarkBlackPlanetReactivated)}
                    style={{
                      width: "100%", marginBottom: 8, padding: "8px 0", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(123,47,255,0.18), rgba(192,132,252,0.10))",
                      border: "1px solid rgba(123,47,255,0.4)",
                      color: "#c084fc", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em",
                      cursor: reactingAll || !!reactingId || !canAfford ? "not-allowed" : "pointer",
                      opacity: reactingAll || !!reactingId || !canAfford ? 0.5 : 1,
                    }}
                  >
                    {reactingAll ? "REACTING ALL…" : `⚡ REACT ALL ${exp.length} · ${exp.length} ★ Redstar`}
                  </button>
                );
              })()}

              {blackCollectionUnlocked && maxBlackSlots > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                    marginBottom: 10,
                    maxHeight: maxBlackSlots > 12 ? 360 : undefined,
                    overflowY: maxBlackSlots > 12 ? "auto" : "visible",
                    paddingRight: maxBlackSlots > 12 ? 4 : 0,
                  }}
                >
                  {blackSlotOccupants.map((_unused, i) => {
                    const occupant = blackSlotOccupants[i];
                    const targetable = !occupant && !!selectedBlackInvId;
                    return (
                      <div
                        key={`black-slot-${i}`}
                        className={`pixel-farm-slot ${occupant ? "filled locked-tag" : ""} ${targetable ? "targetable" : ""}`}
                        style={{ position: "relative", padding: occupant ? 6 : 0, flexDirection: "column" }}
                        onClick={() => handleBlackSlotClick(i)}
                      >
                        {occupant ? (
                          <SlotContent
                            planet={occupant}
                            tonBalance={tonBalance}
                            busy={reactingId === occupant.id}
                            onCollect={onCollectBlackPlanet}
                                                        onReactivate={async (id, _planet) => {
                              if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                              if (reactingId) return;
                              setReactingId(id);
                              try {
                                const result = await reactivateCollectionWithRedStar(telegramId, 1);
                                if (!result.ok) { flashWhiteMsg(result.error ?? "Insufficient ★ Redstar"); return; }
                                const res = onMarkBlackPlanetReactivated?.(id);
                                if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                else {
                                  flashWhiteMsg("Reactivated!");
                                  if (typeof result.newRedStarBalance === "number") onRedStarBalanceUpdate?.(result.newRedStarBalance);
                                }
                              } catch { flashWhiteMsg("Reactivation failed"); }
                              finally { setReactingId(null); }
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

              {blackCollectionUnlocked && blackInventory.length > 0 && (
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
                    Black Inventory · Tap to select, then tap a slot
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(4, blackInventory.length)}, 1fr)`,
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {blackInventory.map((p) => {
                      const cfg = PLANET_CONFIG[p.name];
                      return (
                        <div
                          key={p.id}
                          className={`pixel-inv-item ${selectedBlackInvId === p.id ? "selected" : ""}`}
                          onClick={() => handleBlackInvClick(p.id)}
                        >
                          <BlackPlanetOrb size={42} nebula={false} spin={false} />
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

              {!blackCollectionUnlocked && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  Unlock the Black Collection (40 GRAM) to receive 4 exclusive black planets
                </div>
              )}

              {blackCollectionUnlocked && effectiveBlackBundles > 1 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    marginTop: 4,
                    letterSpacing: "0.08em",
                  }}
                >
                  {effectiveBlackBundles}× bundles · {maxBlackSlots} slots
                </div>
              )}

              {blackCollectionUnlocked && maxBlackSlots > 0 && blackInventory.length === 0 && blackSlotOccupants.every((o) => o) && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#9d4edd",
                    textAlign: "center",
                    fontStyle: "italic",
                    opacity: 0.8,
                  }}
                >
                  All {maxBlackSlots} black planets have been placed
                </div>
              )}
            </div>

            {/* ───── SUPERNOVA COLLECTION FARM ───── */}
            <div style={{ borderTop: "1px solid rgba(255,215,0,0.18)", paddingTop: 12, marginTop: 12 }}>
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
                    color: "#ffd700",
                    textTransform: "uppercase",
                  }}
                >
                  Supernova Collection Farm
                </div>
                {supernovaCollectionUnlocked && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#ffd700",
                      padding: "4px 9px",
                      borderRadius: 8,
                      background: "rgba(255,215,0,0.10)",
                      border: "1px solid rgba(255,215,0,0.45)",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                    title="Live GRAM balance including uncollected supernova earnings"
                  >
                    {liveTonBalance.toFixed(6)} GRAM
                  </div>
                )}
              </div>

              {/* REACT ALL — batch reactivate all expired supernova slots · 1 ★ REDSTAR each */}
              {supernovaCollectionUnlocked && (() => {
                const exp = supernovaSlotOccupants.filter((p): p is Planet => !!p && isFarmExpired(p));
                if (exp.length === 0) return null;
                const canAfford = redStarBalance >= exp.length;
                return (
                  <button
                    disabled={reactingAll || !!reactingId || !canAfford}
                    onClick={() => void handleReactAllRedStar(exp, onMarkSupernovaPlanetReactivated)}
                    style={{
                      width: "100%", marginBottom: 8, padding: "8px 0", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(253,224,71,0.10))",
                      border: "1px solid rgba(255,215,0,0.4)",
                      color: "#ffd700", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em",
                      cursor: reactingAll || !!reactingId || !canAfford ? "not-allowed" : "pointer",
                      opacity: reactingAll || !!reactingId || !canAfford ? 0.5 : 1,
                    }}
                  >
                    {reactingAll ? "REACTING ALL…" : `⚡ REACT ALL ${exp.length} · ${exp.length} ★ Redstar`}
                  </button>
                );
              })()}

              {supernovaCollectionUnlocked && maxSupernovaSlots > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                    marginBottom: 10,
                    maxHeight: maxSupernovaSlots > 12 ? 360 : undefined,
                    overflowY: maxSupernovaSlots > 12 ? "auto" : "visible",
                    paddingRight: maxSupernovaSlots > 12 ? 4 : 0,
                  }}
                >
                  {supernovaSlotOccupants.map((_unused, i) => {
                    const occupant = supernovaSlotOccupants[i];
                    const targetable = !occupant && !!selectedSupernovaInvId;
                    return (
                      <div
                        key={`supernova-slot-${i}`}
                        className={`pixel-farm-slot ${occupant ? "filled locked-tag" : ""} ${targetable ? "targetable" : ""}`}
                        style={{ position: "relative", padding: occupant ? 6 : 0, flexDirection: "column" }}
                        onClick={() => handleSupernovaSlotClick(i)}
                      >
                        {occupant ? (
                          <SlotContent
                            planet={occupant}
                            tonBalance={tonBalance}
                            busy={reactingId === occupant.id}
                            onCollect={onCollectSupernovaPlanet}
                                                        onReactivate={async (id, _planet) => {
                              if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                              if (reactingId) return;
                              setReactingId(id);
                              try {
                                const result = await reactivateCollectionWithRedStar(telegramId, 1);
                                if (!result.ok) { flashWhiteMsg(result.error ?? "Insufficient ★ Redstar"); return; }
                                const res = onMarkSupernovaPlanetReactivated?.(id);
                                if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                else {
                                  flashWhiteMsg("Reactivated!");
                                  if (typeof result.newRedStarBalance === "number") onRedStarBalanceUpdate?.(result.newRedStarBalance);
                                }
                              } catch { flashWhiteMsg("Reactivation failed"); }
                              finally { setReactingId(null); }
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

              {supernovaCollectionUnlocked && supernovaInventory.length > 0 && (
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
                    Supernova Inventory · Tap to select, then tap a slot
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(4, supernovaInventory.length)}, 1fr)`,
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {supernovaInventory.map((p) => {
                      const cfg = PLANET_CONFIG[p.name];
                      return (
                        <div
                          key={p.id}
                          className={`pixel-inv-item ${selectedSupernovaInvId === p.id ? "selected" : ""}`}
                          onClick={() => handleSupernovaInvClick(p.id)}
                        >
                          <SupernovaStarOrb size={32} color={cfg.color} />
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

              {!supernovaCollectionUnlocked && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  Unlock the Supernova Collection (12 GRAM) to receive 4 pixel-art stars
                </div>
              )}

              {supernovaCollectionUnlocked && effectiveSupernovaBundles > 1 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    textAlign: "center",
                    marginTop: 4,
                    letterSpacing: "0.08em",
                  }}
                >
                  {effectiveSupernovaBundles}× bundles · {maxSupernovaSlots} slots
                </div>
              )}

              {supernovaCollectionUnlocked && maxSupernovaSlots > 0 && supernovaInventory.length === 0 && supernovaSlotOccupants.every((o) => o) && (
                <div style={{ fontSize: 11, color: "#ffd700", textAlign: "center", fontStyle: "italic", opacity: 0.8 }}>
                  All {maxSupernovaSlots} supernova stars have been placed
                </div>
              )}
            </div>

            {/* ───── REDSTAR COLLECTION FARM ───── */}
            <div style={{ borderTop: "1px solid rgba(220,20,60,0.22)", paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#ff2244", textTransform: "uppercase" }}>
                  REDSTAR Collection Farm
                </div>
                {stellaRossaCollectionUnlocked && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#ff2244", padding: "4px 9px", borderRadius: 8, background: "rgba(220,20,60,0.10)", border: "1px solid rgba(220,20,60,0.45)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} title="Live GRAM balance including uncollected REDSTAR earnings">
                    {liveTonBalance.toFixed(6)} GRAM
                  </div>
                )}
              </div>

              {/* REACT ALL — batch reactivate all expired REDSTAR slots · 1 ★ REDSTAR each */}
              {stellaRossaCollectionUnlocked && (() => {
                const exp = stellaSlotOccupants.filter((p): p is Planet => !!p && isFarmExpired(p));
                if (exp.length === 0) return null;
                const canAfford = redStarBalance >= exp.length;
                return (
                  <button
                    disabled={reactingAll || !!reactingId || !canAfford}
                    onClick={() => void handleReactAllRedStar(exp, onMarkStellaRossaPlanetReactivated)}
                    style={{
                      width: "100%", marginBottom: 8, padding: "8px 0", borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(220,20,60,0.18), rgba(255,34,68,0.10))",
                      border: "1px solid rgba(220,20,60,0.4)",
                      color: "#ff2244", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em",
                      cursor: reactingAll || !!reactingId || !canAfford ? "not-allowed" : "pointer",
                      opacity: reactingAll || !!reactingId || !canAfford ? 0.5 : 1,
                    }}
                  >
                    {reactingAll ? "REACTING ALL…" : `⚡ REACT ALL ${exp.length} · ${exp.length} ★ Redstar`}
                  </button>
                );
              })()}

              {stellaRossaCollectionUnlocked && maxStellaSlots > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
                  {stellaSlotOccupants.map((_unused, i) => {
                    const occupant = stellaSlotOccupants[i];
                    const targetable = !occupant && !!selectedStellaInvId;
                    return (
                      <div
                        key={`stella-slot-${i}`}
                        className={`pixel-farm-slot ${occupant ? "filled locked-tag" : ""} ${targetable ? "targetable" : ""}`}
                        style={{ position: "relative", padding: occupant ? 6 : 0, flexDirection: "column" }}
                        onClick={() => handleStellaSlotClick(i)}
                      >
                        {occupant ? (
                          <SlotContent
                            planet={occupant}
                            tonBalance={tonBalance}
                            busy={reactingId === occupant.id}
                            onCollect={onCollectStellaRossaPlanet}
                                                        onReactivate={async (id, _planet) => {
                              if (!telegramId) { flashWhiteMsg("Session not ready"); return; }
                              if (reactingId) return;
                              setReactingId(id);
                              try {
                                const result = await reactivateCollectionWithRedStar(telegramId, 1);
                                if (!result.ok) { flashWhiteMsg(result.error ?? "Insufficient ★ Redstar"); return; }
                                const res = onMarkStellaRossaPlanetReactivated?.(id);
                                if (res && !res.ok) flashWhiteMsg(res.reason || "Reactivation failed");
                                else {
                                  flashWhiteMsg("Reactivated!");
                                  if (typeof result.newRedStarBalance === "number") onRedStarBalanceUpdate?.(result.newRedStarBalance);
                                }
                              } catch { flashWhiteMsg("Reactivation failed"); }
                              finally { setReactingId(null); }
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

              {stellaRossaCollectionUnlocked && stellaInventory.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginBottom: 8 }}>
                    Redstar Inventory · Tap to select, then tap a slot
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, stellaInventory.length)}, 1fr)`, gap: 8, marginBottom: 10 }}>
                    {stellaInventory.map((p) => {
                      const cfg = PLANET_CONFIG[p.name];
                      return (
                        <div
                          key={p.id}
                          className={`pixel-inv-item ${selectedStellaInvId === p.id ? "selected" : ""}`}
                          onClick={() => handleStellaInvClick(p.id)}
                        >
                          <svg width={32} height={32} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 5px #ff2244cc)" }}>
                            <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
                            <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
                            <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
                            <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
                            <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
                            <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
                            <rect x="4" y="11" width="4" height="1" fill="#880011" />
                          </svg>
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

              {!stellaRossaCollectionUnlocked && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", fontStyle: "italic" }}>
                  Unlock the REDSTAR Collection (60 GRAM) to receive 4 exclusive red star planets
                </div>
              )}

              {stellaRossaCollectionUnlocked && effectiveStellaBundles > 1 && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 4, letterSpacing: "0.08em" }}>
                  {effectiveStellaBundles}× bundles · {maxStellaSlots} slots
                </div>
              )}

              {stellaRossaCollectionUnlocked && maxStellaSlots > 0 && stellaInventory.length === 0 && stellaSlotOccupants.every((o) => o) && (
                <div style={{ fontSize: 11, color: "#ff2244", textAlign: "center", fontStyle: "italic", opacity: 0.8 }}>
                  All {maxStellaSlots} REDSTAR planets have been placed
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
  // Collection planets now reactivate with 1 ★ REDSTAR (not GRAM via TonConnect).
  const cfg = PLANET_CONFIG[planet.name];
  const canPay = !busy;

  const isEarth = planet.name === "EARTH1" || planet.name === "EARTH2" || planet.name === "EARTH3" || planet.name === "EARTH4";
  const isWhite = planet.name === "WHITE1" || planet.name === "WHITE2" || planet.name === "WHITE3" || planet.name === "WHITE4";
  const isBlack = planet.name === "BLACK1" || planet.name === "BLACK2" || planet.name === "BLACK3" || planet.name === "BLACK4";
  const isSupernova = planet.name === "SUPERNOVA1" || planet.name === "SUPERNOVA2" || planet.name === "SUPERNOVA3" || planet.name === "SUPERNOVA4";
  const isStella = planet.name === "STELLA1" || planet.name === "STELLA2" || planet.name === "STELLA3" || planet.name === "STELLA4";
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {isEarth ? <RealisticEarth size={36} /> : isWhite ? <RealisticWhite size={36} /> : isBlack ? <BlackPlanetOrb size={36} nebula={false} spin={active} /> : isSupernova ? <SupernovaStarOrb size={36} color={cfg.color} /> : isStella ? (
        <svg width={36} height={36} viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ filter: "drop-shadow(0 0 6px #ff2244cc)" }}>
          <rect x="5" y="0" width="2" height="2" fill="#ff2244" />
          <rect x="3" y="2" width="6" height="2" fill="#ff2244" />
          <rect x="1" y="4" width="10" height="2" fill="#ff3355" />
          <rect x="0" y="6" width="12" height="2" fill="#ff2244" />
          <rect x="1" y="8" width="10" height="2" fill="#cc1133" />
          <rect x="2" y="10" width="8" height="1" fill="#aa0022" />
          <rect x="4" y="11" width="4" height="1" fill="#880011" />
          <rect x="5" y="1" width="1" height="1" fill="#ff88aa" />
        </svg>
      ) : <PlanetOrb planet={planet} size={36} animate={active} />}

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
      {expired && onReactivate && (
        <button
          className="white-slot-action reactivate"
          disabled={!canPay}
          style={!canPay ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          onClick={(e) => { e.stopPropagation(); onReactivate(planet.id, planet); }}
          title="1 ★ Redstar"
        >
          {busy ? "…" : "REACT · 1 ★"}
        </button>
      )}
    </div>
  );
}

export const PixelAvatar = memo(PixelAvatarBase);
