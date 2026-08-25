import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "../utils/haptic";
import { replayFirstRunGuide } from "./FirstRunGuide";
import { isBrowserDevSession } from "../utils/telegram";
import {
  adminCreditZoom,
  adminCreditStardust,
  adminCreditTon,
  adminCreditLabPoints,
  adminRemoveLabPoints,
  adminRemoveStardust,
  adminRemoveTon,
  adminAddPlanets,
  adminUnlockSlots,
  adminUnlockWhiteCollection,
  adminUnlockEarthCollection,
  adminUnlockBlackCollection,
  adminRevokeBlackCollection,
  adminUnlockSupernovaCollection,
  adminRevokeSupernovaCollection,
  adminUnlockStellaRossaCollection,
  adminRevokeStellaRossaCollection,
  adminRevokeWhiteCollection,
  adminRevokeEarthCollection,
  adminGrantV1,
  adminGrantV1Nft,
  adminGrantAutoTap,
  adminGrantEquipment,
  adminTestWithdrawalChannel,
  adminFetchWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  type TonWithdrawal,
  fetchMaintenanceStatus,
  adminSetMaintenance,
  adminGlobalBonus,
  adminGlobalRemove,
  adminGlobalStardust,
  adminGlobalTon,
  adminGlobalRedStar,
  adminRepairTasks,
  adminRemoveZoom,
  adminRemovePlanets,
  adminRemoveSlots,
  adminCreditSpins,
  adminRemoveSpins,
  adminResetSeason,
  adminForceDelist,
  adminClearPlanetMarket,
  adminClearEquipmentMarket,
  adminForceMerchantSpawn,
  adminFetchMerchantStatus,
  adminDisableUser,
  adminEnableUser,
  adminBulkDisable,
  adminReconcileReferrals,
  adminAuditReferrals,
  adminPurgeFakeReferrals,
  adminForceZeroReferrals,
  type ReferralAudit,
  adminReconcileStars,
  adminWebhookInfo,
  adminFetchLottoDashboard,
  adminLottoDraw,
  type LottoAdminDashboard,
  adminFetchLabRankDashboard,
  adminCloseLabRank,
  adminResetLabPoints,
  type LabRankAdminDashboard,
  adminCreateRedeemCode,
  adminListRedeemCodes,
  type AdminRedeemCode,
  type RedeemKind,
  fetchLeaderboard,
  type LeaderboardEntry,
  adminBroadcast,
  adminCreditRedStar,
  adminRemoveRedStar,
} from "../utils/api";

const ADMIN_ID = "8144744644";
const ADMIN_ALIASES = [ADMIN_ID, "@zoom0100", "zoom0100"];

function isAdminId(telegramId: string | null | undefined): boolean {
  if (!telegramId) return false;
  const normalized = telegramId.trim().toLowerCase();
  if (!normalized) return false;
  return ADMIN_ALIASES.some((value) => value.toLowerCase() === normalized);
}

type PlanetChoice = "BASIC" | "RARE" | "EPIC" | "MYTHIC" | "NOVA" | "PLASMA" | "GOLD" | "MUSHROOM" | "SUN";
type EqCategory = "HELMET" | "JETPACK" | "HAT" | "SCANNER";
type EqRarity = "BASIC" | "RARE" | "EPIC" | "GOLD" | "PLASMA" | "MYTHIC";
// Stardust supports both add (credit) and remove (subtract clamped at 0).
type ActionType = "zoom" | "planets" | "slots" | "spins" | "stardust" | "ton" | "labpoints" | "redstar";

const PLANET_OPTIONS: { type: PlanetChoice; label: string; color: string }[] = [
  { type: "BASIC",  label: "Basic",  color: "#8892b0" },
  { type: "RARE",   label: "Rare",   color: "#4facfe" },
  { type: "EPIC",   label: "Epic",   color: "#c471ed" },
  { type: "MYTHIC",  label: "Mythic",  color: "#dc143c" },
  { type: "NOVA",    label: "Nova",    color: "#5000b4" },
  { type: "PLASMA",  label: "Plasma",  color: "#00e676" },
  { type: "GOLD",    label: "Gold",    color: "#ffd700" },
  { type: "MUSHROOM", label: "Fungo 🍄", color: "#8b3a8b" },
  { type: "SUN",    label: "Sole ☀️", color: "#ffb347" },
];

interface Props {
  telegramId: string;
}

export function AdminPanel({ telegramId }: Props) {
  const [open, setOpen] = useState(false);
  const browserDev = isBrowserDevSession();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [planetType, setPlanetType] = useState<PlanetChoice>("BASIC");
  const [globalAmount, setGlobalAmount] = useState("");
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState<ActionType | "global" | "reset" | "delist" | "disable" | "enable" | "bulk-nebo" | "white" | "earth" | "black" | "revoke-white" | "revoke-earth" | "revoke-black" | "autotap" | "test-wd-chan" | "v1" | "v1nft" | "rec-stars" | "wh-info" | "grant-equipment" | "supernova" | "revoke-supernova" | "stella-rossa" | "revoke-stella-rossa" | "clear-planet-market" | "clear-equipment-market" | "force-merchant" | "labpoints" | "broadcast" | null>(null);
  const [eqCategory, setEqCategory] = useState<EqCategory>("HELMET");
  const [eqRarity, setEqRarity] = useState<EqRarity>("BASIC");
  const [confirmBulkNebo, setConfirmBulkNebo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [delistId, setDelistId] = useState("");
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; skipped: number } | null>(null);
  const [disableId, setDisableId] = useState("");
  const [pendingWithdrawals, setPendingWithdrawals] = useState<TonWithdrawal[]>([]);
  const [withdrawalLoadingId, setWithdrawalLoadingId] = useState<number | null>(null);
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);
  const [topPlayersLoading, setTopPlayersLoading] = useState(false);
  const [topPlayersFilter, setTopPlayersFilter] = useState("");
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintMessage, setMaintMessage] = useState("We're upgrading the game. Back online shortly.");
  const [maintLoading, setMaintLoading] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<{ active: boolean; expiresAt?: string; nextAt?: string; remainingSec?: number }>({ active: false });

  const refreshPendingWithdrawals = useCallback(async () => {
    const list = await adminFetchWithdrawals(telegramId, "pending");
    setPendingWithdrawals(list);
  }, [telegramId]);

  const refreshMerchantStatus = useCallback(async () => {
    const s = await adminFetchMerchantStatus(telegramId);
    setMerchantStatus(s);
  }, [telegramId]);

  const refreshMaintenance = useCallback(async () => {
    const s = await fetchMaintenanceStatus();
    if (!s) return;
    setMaintEnabled(!!s.enabled);
    if (s.message) setMaintMessage(s.message);
  }, []);

  const refreshTopPlayers = useCallback(async () => {
    setTopPlayersLoading(true);
    try {
      const list = await fetchLeaderboard();
      setTopPlayers(list);
    } finally {
      setTopPlayersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && isAdminId(telegramId)) {
      refreshPendingWithdrawals();
      refreshMaintenance();
      refreshTopPlayers();
      refreshMerchantStatus();
    }
  }, [open, telegramId, refreshPendingWithdrawals, refreshMaintenance, refreshTopPlayers, refreshMerchantStatus]);

  useEffect(() => {
    if (!open || !isAdminId(telegramId)) return;
    const id = setInterval(() => refreshMerchantStatus(), 5000);
    return () => clearInterval(id);
  }, [open, telegramId, refreshMerchantStatus]);

  const handleToggleMaintenance = useCallback(async (next: boolean) => {
    haptic();
    setMaintLoading(true);
    const res = await adminSetMaintenance(telegramId, next, maintMessage);
    setMaintLoading(false);
    if (res.ok) {
      setMaintEnabled(!!res.enabled);
      if (res.message) setMaintMessage(res.message);
      try {
        localStorage.setItem("zoom-maint-cached", JSON.stringify({
          enabled: !!res.enabled,
          message: res.message || "",
          updatedAt: Date.now(),
        }));
      } catch { /**/ }
      window.dispatchEvent(new Event("zoom-admin-refresh"));
      showFeedback(next ? "✓ Maintenance ON — users locked out" : "✓ Maintenance OFF — game live", true);
    } else {
      showFeedback(`✗ ${res.error || "Failed"}`, false);
    }
  }, [telegramId, maintMessage]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const showFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleAction = useCallback(async (type: ActionType) => {
    haptic();
    const id = targetId.trim() || ADMIN_ID;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading(type);
    let ok = false;
    let apiError: string | undefined;
    if (mode === "add") {
      if (type === "zoom") {
        const r = await adminCreditZoom(telegramId, id, val);
        ok = r.ok;
        apiError = r.error;
      }
      else if (type === "planets") ok = await adminAddPlanets(telegramId, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminUnlockSlots(telegramId, id, Math.floor(val));
      else if (type === "spins") ok = await adminCreditSpins(telegramId, id, Math.floor(val));
      else if (type === "stardust") ok = await adminCreditStardust(telegramId, id, Math.floor(val));
      else if (type === "ton") ok = await adminCreditTon(telegramId, id, val);
      else if (type === "labpoints") ok = await adminCreditLabPoints(telegramId, id, Math.floor(val));
      else if (type === "redstar") ok = await adminCreditRedStar(telegramId, id, Math.floor(val));
    } else {
      if (type === "zoom") ok = await adminRemoveZoom(telegramId, id, val);
      else if (type === "planets") ok = await adminRemovePlanets(telegramId, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminRemoveSlots(telegramId, id, Math.floor(val));
      else if (type === "spins") ok = await adminRemoveSpins(telegramId, id, Math.floor(val));
      else if (type === "stardust") ok = await adminRemoveStardust(telegramId, id, Math.floor(val));
      else if (type === "ton") ok = await adminRemoveTon(telegramId, id, val);
      else if (type === "labpoints") ok = await adminRemoveLabPoints(telegramId, id, Math.floor(val));
      else if (type === "redstar") ok = await adminRemoveRedStar(telegramId, id, Math.floor(val));
    }
    setLoading(null);
    if (ok) {
      // When the admin removes assets from their OWN account, the regular
      // /grants reconciliation path is grow-only (by design — protects real
      // money from accidental counter desync wiping owned planets/ZOOM).
      // To make the admin button actually take effect on the operating
      // device, we dispatch a dedicated self-decrement event that the
      // game state listens for and applies as an EXPLICIT local mutation.
      // For other targets (or "add" mode), the regular refresh is enough.
      if (id === telegramId) {
        const eventName = mode === "remove" ? "zoom-admin-self-decrement" : "zoom-admin-self-increment";
        window.dispatchEvent(new CustomEvent(eventName, {
          detail: { type, amount: val, planetType },
        }));
      }
      window.dispatchEvent(new Event("zoom-admin-refresh"));
    }
    const direction = mode === "add" ? "aggiunti" : "rimossi";
    const item = type === "zoom" ? `${val} $ZOOM`
      : type === "slots" ? `${Math.floor(val)} slot`
      : type === "spins" ? `${Math.floor(val)} spin`
      : type === "stardust" ? `${Math.floor(val)} stardust ⭐`
      : type === "ton" ? `${val} TON 💎`
      : type === "labpoints" ? `${Math.floor(val)} punti classifica 🏆`
      : type === "redstar" ? `${Math.floor(val)} ★ REDSTAR`
      : `${Math.floor(val)} ${planetType === "SUN" ? "Sole" : `pianeti ${planetType}`}`;
    showFeedback(ok ? `✓ ${item} ${direction} a ID ${id}` : `✗ ${apiError || `Errore per ID ${id}`}`, ok);
  }, [targetId, amount, planetType, mode, telegramId]);

  const handleGlobalBonus = useCallback(async () => {
    haptic();
    const val = parseFloat(globalAmount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalBonus(telegramId, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ Bonus inviato a tutti!" : "✗ Errore", ok);
  }, [globalAmount, telegramId]);

  const handleGlobalRemove = useCallback(async () => {
    haptic();
    const val = parseFloat(globalAmount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalRemove(telegramId, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ ZOOM rimosso a tutti!" : "✗ Errore", ok);
  }, [globalAmount, telegramId]);

  const handleGlobalStardust = useCallback(async () => {
    haptic();
    const val = parseFloat(globalAmount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalStardust(telegramId, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ Stardust inviato a tutti!" : "✗ Errore", ok);
  }, [globalAmount, telegramId]);

  const handleGlobalTon = useCallback(async () => {
    haptic();
    const val = parseFloat(globalAmount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalTon(telegramId, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ TON accreditato a tutti!" : "✗ Errore", ok);
  }, [globalAmount, telegramId]);

  const handleGlobalRedStar = useCallback(async () => {
    haptic();
    const val = parseInt(globalAmount, 10);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido (intero positivo)", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalRedStar(telegramId, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? `✓ ${val} ★ REDSTAR accreditati a tutti!` : "✗ Errore", ok);
  }, [globalAmount, telegramId]);

  const handleRepairTasks = useCallback(async () => {
    haptic();
    setLoading("global");
    const affected = await adminRepairTasks(telegramId);
    setLoading(null);
    if (affected != null) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(
      affected != null ? `✓ Task riparate (${affected} utenti)` : "✗ Errore",
      affected != null,
    );
  }, [telegramId]);

  if (!isAdminId(telegramId)) return null;

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <>
      <motion.button
        onClick={() => { haptic(); setOpen(true); }}
        title="Admin Panel"
        style={{
          position: "fixed",
          bottom: browserDev ? 96 : 88,
          right: 16,
          width: browserDev ? 44 : 28,
          height: browserDev ? 44 : 28,
          borderRadius: browserDev ? 12 : "50%",
          background: browserDev ? "rgba(255,51,85,0.22)" : "rgba(255,255,255,0.06)",
          border: browserDev ? "1px solid rgba(255,51,85,0.55)" : "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 40,
          cursor: "pointer",
          fontSize: browserDev ? 10 : 13,
          fontWeight: browserDev ? 900 : 400,
          letterSpacing: browserDev ? "0.08em" : undefined,
          color: browserDev ? "#ff6b8a" : "rgba(255,255,255,0.4)",
          boxShadow: browserDev ? "0 0 16px rgba(255,51,85,0.35)" : undefined,
        }}
      >
        {browserDev ? "ADM" : "⚙"}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              onClick={() => { haptic(); setOpen(false); }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                background: "rgba(0,0,0,0.65)",
              }}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                x: "-50%",
                y: "-50%",
                zIndex: 52,
                width: "min(340px, calc(100vw - 32px))",
                maxHeight: "calc(100dvh - 80px)",
                overflowY: "auto",
                background: "rgba(10, 13, 28, 0.92)",
                border: "1px solid rgba(255,51,85,0.2)",
                borderRadius: 20,
                boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,51,85,0.07) inset",
              }}
            >
              {/* Header */}
              <div style={{
                padding: "16px 20px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#ff3355", textShadow: "0 0 12px rgba(255,51,85,0.6)" }}>
                    ⚙ ADMIN PANEL
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Accesso riservato</div>
                </div>
                <button
                  onClick={() => { haptic(); setOpen(false); }}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "50%",
                    width: 28,
                    height: 28,
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>

                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    replayFirstRunGuide();
                    setOpen(false);
                  }}
                  data-testid="admin-replay-tutorial"
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(158,197,232,0.35)",
                    background: "rgba(158,197,232,0.1)",
                    color: "#c5ddf4",
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  📘 Rivedi tutorial
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0, color: "rgba(255,255,255,0.42)", marginTop: 3 }}>
                    Lo riapre sul tuo account senza azzerare nulla
                  </div>
                </button>

                {/* MAINTENANCE MODE */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    background: maintEnabled
                      ? "linear-gradient(135deg, rgba(255,179,71,0.18), rgba(255,179,71,0.06))"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${maintEnabled ? "rgba(255,179,71,0.5)" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>🛠️</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", color: maintEnabled ? "#ffb347" : "rgba(255,255,255,0.85)" }}>
                          MAINTENANCE MODE
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                          {maintEnabled ? "Users see a lock screen" : "Game is live for everyone"}
                        </div>
                      </div>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      disabled={maintLoading}
                      onClick={() => handleToggleMaintenance(!maintEnabled)}
                      style={{
                        position: "relative",
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        border: "none",
                        background: maintEnabled ? "#ffb347" : "rgba(255,255,255,0.15)",
                        cursor: maintLoading ? "wait" : "pointer",
                        opacity: maintLoading ? 0.6 : 1,
                        transition: "background 0.2s",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 3,
                          left: maintEnabled ? 25 : 3,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        }}
                      />
                    </motion.button>
                  </div>
                  <input
                    value={maintMessage}
                    onChange={(e) => setMaintMessage(e.target.value)}
                    placeholder="Message shown to users…"
                    onFocus={() => haptic()}
                    style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }}
                  />
                  {maintEnabled && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      disabled={maintLoading}
                      onClick={() => handleToggleMaintenance(true)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,179,71,0.4)",
                        background: "rgba(255,179,71,0.1)",
                        color: "#ffb347",
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        cursor: "pointer",
                      }}
                    >
                      {maintLoading ? "..." : "💬 UPDATE MESSAGE"}
                    </motion.button>
                  )}
                </div>

                {/* ID + amount fields */}
                <input
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="Telegram ID o @username (vuoto = 8144744644)"
                  onFocus={() => haptic()}
                  style={inputStyle}
                />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Quantità / Numero"
                  type="number"
                  min="1"
                  onFocus={() => haptic()}
                  style={inputStyle}
                />

                {/* Add / Remove toggle */}
                <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
                  {(["add", "remove"] as const).map((m) => (
                    <motion.button
                      key={m}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => { haptic(); setMode(m); }}
                      style={{
                        flex: 1,
                        padding: "7px",
                        borderRadius: 8,
                        border: "none",
                        background: mode === m
                          ? m === "add" ? "rgba(0,242,100,0.18)" : "rgba(255,60,60,0.18)"
                          : "transparent",
                        color: mode === m
                          ? m === "add" ? "#00f264" : "#ff5555"
                          : "rgba(255,255,255,0.3)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {m === "add" ? "➕ Aggiungi" : "➖ Rimuovi"}
                    </motion.button>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([
                    { type: "zoom" as ActionType,    label: "🪐 ZOOM",    color: "#ff3355" },
                    { type: "planets" as ActionType, label: "🌍 Pianeti", color: "#c471ed" },
                    { type: "slots" as ActionType,   label: "📦 Slot",    color: "#4facfe" },
                    { type: "spins" as ActionType,   label: "🎡 Spin",    color: "#ffd700" },
                    // Stardust supports both add and remove (subtract is
                    // server-clamped at 0 so we can't push balances negative).
                    { type: "stardust" as ActionType, label: "⭐ Stardust", color: "#ffd23f" },
                    // TON earned balance — admin credit only; users withdraw naturally.
                    { type: "ton" as ActionType,      label: "💎 TON",     color: "#00e5ff" },
                    { type: "labpoints" as ActionType, label: "🏆 LAB POINTS", color: "#00d4ff" },
                    { type: "redstar" as ActionType,   label: "★ REDSTAR",    color: "#ff2244" },
                  ])
                    .map(({ type, label, color }) => {
                    const btnColor = mode === "remove" ? "#ff5555" : color;
                    return (
                      <motion.button
                        key={type}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => handleAction(type)}
                        disabled={loading !== null}
                        style={{
                          flex: 1,
                          padding: "9px 4px",
                          borderRadius: 10,
                          border: `1px solid ${btnColor}44`,
                          background: `${btnColor}14`,
                          color: btnColor,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          opacity: loading !== null ? 0.5 : 1,
                          transition: "all 0.2s",
                        }}
                      >
                        {loading === type ? "..." : label}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Planet type selector */}
                <div style={{ marginTop: 2 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6, letterSpacing: "0.08em" }}>
                    TIPO PIANETA
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {PLANET_OPTIONS.map(({ type, label, color }) => {
                      const selected = planetType === type;
                      return (
                        <motion.button
                          key={type}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => { haptic(); setPlanetType(type); }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: `1px solid ${selected ? color : color + "44"}`,
                            background: selected ? `${color}22` : "transparent",
                            color: selected ? color : color + "99",
                            fontSize: 11,
                            fontWeight: selected ? 800 : 600,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            boxShadow: selected ? `0 0 8px ${color}44` : "none",
                          }}
                        >
                          {label}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* White Collection unlock */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("white");
                    const ok = await adminUnlockWhiteCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ White Collection unlocked for ID ${id}` : `✗ Error for ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.4)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(255,255,255,0.15)",
                  }}
                >
                  {loading === "white" ? "..." : "🤍 GRANT WHITE COLLECTION (4 planets)"}
                </motion.button>

                {/* Earth Collection unlock */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("earth");
                    const ok = await adminUnlockEarthCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Earth Collection unlocked for ID ${id}` : `✗ Error for ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(61,220,151,0.5)",
                    background: "rgba(61,220,151,0.10)",
                    color: "#3ddc97",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(61,220,151,0.18)",
                  }}
                >
                  {loading === "earth" ? "..." : "🌍 GRANT EARTH COLLECTION (4 planets)"}
                </motion.button>

                {/* Black Collection unlock */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("black");
                    const ok = await adminUnlockBlackCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Black Collection unlocked for ID ${id}` : `✗ Error for ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(192,132,252,0.55)",
                    background: "rgba(123,47,255,0.14)",
                    color: "#c084fc",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(123,47,255,0.25)",
                  }}
                >
                  {loading === "black" ? "..." : "⬛ GRANT BLACK COLLECTION (4 planets)"}
                </motion.button>

                {/* Supernova Collection unlock */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("supernova");
                    const ok = await adminUnlockSupernovaCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Supernova Collection unlocked for ID ${id}` : `✗ Error for ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(253,224,71,0.6)",
                    background: "rgba(255,215,0,0.14)",
                    color: "#fde047",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(255,215,0,0.28)",
                  }}
                >
                  {loading === "supernova" ? "..." : "🌟 GRANT SUPERNOVA COLLECTION (4 stars)"}
                </motion.button>

                {/* Revoke Supernova */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    if (!confirm(`Rimuovere la SUPERNOVA COLLECTION a ID ${id}?`)) return;
                    setLoading("revoke-supernova");
                    const ok = await adminRevokeSupernovaCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Supernova Collection rimossa a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "10px 4px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,85,85,0.45)",
                    background: "rgba(255,85,85,0.10)",
                    color: "#ff7a7a",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "revoke-supernova" ? "..." : "✗ REVOKE SUPERNOVA"}
                </motion.button>

                {/* Stella Rossa Collection unlock */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("stella-rossa");
                    const ok = await adminUnlockStellaRossaCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Stella Rossa Collection sbloccata per ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(220,20,60,0.6)",
                    background: "rgba(180,0,0,0.14)",
                    color: "#ff6666",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(220,20,60,0.28)",
                  }}
                >
                  {loading === "stella-rossa" ? "..." : "🔴 GRANT STELLA ROSSA COLLECTION (4 SR)"}
                </motion.button>

                {/* Revoke Stella Rossa */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    if (!confirm(`Rimuovere la STELLA ROSSA COLLECTION a ID ${id}?`)) return;
                    setLoading("revoke-stella-rossa");
                    const ok = await adminRevokeStellaRossaCollection(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Stella Rossa Collection rimossa a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "10px 4px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,85,85,0.45)",
                    background: "rgba(255,85,85,0.10)",
                    color: "#ff7a7a",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "revoke-stella-rossa" ? "..." : "✗ REVOKE STELLA ROSSA"}
                </motion.button>

                {/* Revoke collections */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = targetId.trim() || ADMIN_ID;
                      if (!confirm(`Rimuovere la WHITE COLLECTION a ID ${id}?`)) return;
                      setLoading("revoke-white");
                      const ok = await adminRevokeWhiteCollection(telegramId, id);
                      setLoading(null);
                      if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                      showFeedback(ok ? `✓ White Collection rimossa a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "10px 4px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,85,85,0.45)",
                      background: "rgba(255,85,85,0.10)",
                      color: "#ff7a7a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {loading === "revoke-white" ? "..." : "✗ REVOKE WHITE"}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = targetId.trim() || ADMIN_ID;
                      if (!confirm(`Rimuovere la EARTH COLLECTION a ID ${id}?`)) return;
                      setLoading("revoke-earth");
                      const ok = await adminRevokeEarthCollection(telegramId, id);
                      setLoading(null);
                      if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                      showFeedback(ok ? `✓ Earth Collection rimossa a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "10px 4px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,85,85,0.45)",
                      background: "rgba(255,85,85,0.10)",
                      color: "#ff7a7a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {loading === "revoke-earth" ? "..." : "✗ REVOKE EARTH"}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = targetId.trim() || ADMIN_ID;
                      if (!confirm(`Rimuovere la BLACK COLLECTION a ID ${id}?`)) return;
                      setLoading("revoke-black");
                      const ok = await adminRevokeBlackCollection(telegramId, id);
                      setLoading(null);
                      if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                      showFeedback(ok ? `✓ Black Collection rimossa a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "10px 4px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,85,85,0.45)",
                      background: "rgba(255,85,85,0.10)",
                      color: "#ff7a7a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {loading === "revoke-black" ? "..." : "✗ REVOKE BLACK"}
                  </motion.button>
                </div>

                {/* Grant V1 (rank counter only) */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("v1");
                    const ok = await adminGrantV1(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ V1 +1 accreditato a ID ${id} (rank)` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(245,251,255,0.55)",
                    background: "rgba(245,251,255,0.08)",
                    color: "#f5fbff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(245,251,255,0.2)",
                  }}
                >
                  {loading === "v1" ? "..." : "✦ GRANT V1 (+1 su Rank)"}
                </motion.button>

                {/* Grant V1 NFT Platinum (bypassa cap globale) */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("v1nft");
                    const ok = await adminGrantV1Nft(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ V1 NFT Platinum +1 accreditato a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(202,225,255,0.55)",
                    background: "linear-gradient(135deg, rgba(202,225,255,0.14), rgba(126,168,224,0.10))",
                    color: "#cfe4ff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(202,225,255,0.25)",
                  }}
                >
                  {loading === "v1nft" ? "..." : "◆ GRANT V1 NFT (+1 inventory)"}
                </motion.button>

                {/* Auto-Tap grant */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("autotap");
                    const ok = await adminGrantAutoTap(telegramId, id);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? `✓ Auto-Tap accreditato a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,51,85,0.4)",
                    background: "rgba(255,51,85,0.1)",
                    color: "#ff3355",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(255,51,85,0.15)",
                  }}
                >
                  {loading === "autotap" ? "..." : "⚡ GRANT AUTO-TAP"}
                </motion.button>

                {/* ── EQUIPMENT GRANT ── */}
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["HELMET","JETPACK","HAT","SCANNER"] as EqCategory[]).map((c) => (
                    <motion.button key={c} whileTap={{ scale: 0.9 }} onClick={() => { haptic(); setEqCategory(c); }}
                      style={{
                        padding: "6px 10px", borderRadius: 8,
                        border: `1px solid ${eqCategory === c ? "rgba(120,200,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                        background: eqCategory === c ? "rgba(80,180,255,0.25)" : "transparent",
                        color: eqCategory === c ? "#e6f3ff" : "rgba(220,230,245,0.45)",
                        fontSize: 11, fontWeight: eqCategory === c ? 800 : 600, cursor: "pointer", transition: "all 0.15s",
                      }}>
                      {c === "HELMET" ? "🪖" : c === "JETPACK" ? "🚀" : c === "HAT" ? "🎩" : "📡"} {c}
                    </motion.button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["BASIC","RARE","EPIC","GOLD","PLASMA","MYTHIC"] as EqRarity[]).map((r) => {
                    const color = r === "BASIC" ? "#9aa4b2" : r === "RARE" ? "#4fc3f7" : r === "EPIC" ? "#ab47bc" : r === "GOLD" ? "#ffd700" : r === "PLASMA" ? "#00e676" : "#ff1744";
                    return (
                      <motion.button key={r} whileTap={{ scale: 0.9 }} onClick={() => { haptic(); setEqRarity(r); }}
                        style={{
                          padding: "5px 9px", borderRadius: 8,
                          border: `1px solid ${eqRarity === r ? color : color + "44"}`,
                          background: eqRarity === r ? `${color}33` : "transparent",
                          color: eqRarity === r ? color : color + "99",
                          fontSize: 10, fontWeight: eqRarity === r ? 800 : 600, cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {r}
                      </motion.button>
                    );
                  })}
                </div>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    const id = targetId.trim() || ADMIN_ID;
                    setLoading("grant-equipment");
                    const ok = await adminGrantEquipment(telegramId, id, eqCategory, eqRarity);
                    setLoading(null);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    const label = `${eqCategory} ${eqRarity}`;
                    showFeedback(ok ? `✓ Equipment [${label}] accreditato a ID ${id}` : `✗ Errore per ID ${id}`, ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px", borderRadius: 10,
                    border: "1px solid rgba(180,140,255,0.5)",
                    background: "linear-gradient(135deg, rgba(180,140,255,0.16), rgba(120,80,220,0.10))",
                    color: "#d4b0ff", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
                    cursor: "pointer", opacity: loading !== null ? 0.5 : 1, transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(180,140,255,0.2)",
                  }}
                >
                  {loading === "grant-equipment" ? "..." : `🪖 GRANT EQUIPMENT [${eqCategory} · ${eqRarity}]`}
                </motion.button>

                {/* Test withdrawal-channel announcement */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    setLoading("test-wd-chan");
                    const ok = await adminTestWithdrawalChannel(telegramId);
                    setLoading(null);
                    showFeedback(ok ? "✓ Messaggio test inviato nel canale" : "✗ Bot non può scrivere nel canale", ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,200,80,0.35)",
                    background: "rgba(40,30,15,0.55)",
                    color: "#ffc850",
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(255,200,80,0.15)",
                  }}
                >
                  {loading === "test-wd-chan" ? "..." : "🧪 TEST WITHDRAWAL CHANNEL"}
                </motion.button>

                {/* Reconcile Stars payments — credits any pending Stars purchases that webhook missed */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    setLoading("rec-stars");
                    const res = await adminReconcileStars(telegramId);
                    setLoading(null);
                    if (res.ok) {
                      window.dispatchEvent(new Event("zoom-admin-refresh"));
                      showFeedback(`✓ Scansionati ${res.scanned ?? 0} • Accreditati ${res.credited ?? 0} • Già fatti ${res.alreadyDone ?? 0}`, true);
                    } else {
                      showFeedback(`✗ ${res.error || "Errore"}`, false);
                    }
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,200,80,0.45)",
                    background: "rgba(40,30,15,0.55)",
                    color: "#ffc850",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(255,200,80,0.18)",
                  }}
                >
                  {loading === "rec-stars" ? "..." : "★ RICONCILIA PAGAMENTI STARS"}
                </motion.button>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                  Recupera da Telegram tutti i pagamenti Stars ricevuti e accredita quelli che il webhook non ha consegnato. Sicuro: non accredita due volte.
                </div>

                {/* Webhook info — live diagnostic */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    setLoading("wh-info");
                    const res = await adminWebhookInfo(telegramId);
                    setLoading(null);
                    if (res.ok) {
                      const info = res.info as { result?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } } | undefined;
                      const r = info?.result;
                      const pending = r?.pending_update_count ?? 0;
                      const err = r?.last_error_message;
                      if (err) {
                        showFeedback(`Pending: ${pending} • Errore: ${err.slice(0, 60)}`, false);
                      } else {
                        showFeedback(`✓ Webhook ok • Pending: ${pending} • Nessun errore`, true);
                      }
                      // Also log full info to console for deep inspection
                      try { console.warn("[admin webhook-info]", JSON.stringify(info, null, 2)); } catch { /**/ }
                    } else {
                      showFeedback(`✗ ${res.error || "Errore"}`, false);
                    }
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(140,180,255,0.35)",
                    background: "rgba(20,30,55,0.55)",
                    color: "#9ec1ff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "wh-info" ? "..." : "🛰 STATO WEBHOOK TELEGRAM"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Global bonus */}
                <input
                  value={globalAmount}
                  onChange={(e) => setGlobalAmount(e.target.value)}
                  placeholder="ZOOM per tutti gli utenti"
                  type="number"
                  min="1"
                  onFocus={() => haptic()}
                  style={{ ...inputStyle, border: "1px solid rgba(255,215,0,0.18)" }}
                />
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleGlobalBonus}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,215,0,0.3)",
                    background: "rgba(255,215,0,0.1)",
                    color: "#ffd700",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "⚡ BONUS ZOOM GLOBALE"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleGlobalRemove}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,80,80,0.3)",
                    background: "rgba(255,80,80,0.1)",
                    color: "#ff5050",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "🗑 RIMUOVI ZOOM GLOBALE"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleGlobalStardust}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,215,0,0.3)",
                    background: "rgba(255,215,0,0.1)",
                    color: "#ffd700",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "⭐ INVIA STARDUST GLOBALE"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleGlobalTon}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,229,255,0.3)",
                    background: "rgba(0,229,255,0.1)",
                    color: "#00e5ff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "💎 ACCREDITA TON GLOBALE"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleGlobalRedStar}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,34,68,0.35)",
                    background: "rgba(255,34,68,0.12)",
                    color: "#ff2244",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "★ REDSTAR A TUTTI"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleRepairTasks}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(168,255,96,0.3)",
                    background: "rgba(168,255,96,0.1)",
                    color: "#a8ff60",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "global" ? "..." : "🧹 RIPARA TASK"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Clear planet marketplace */}
                <motion.button
                  onClick={async () => {
                    haptic();
                    setLoading("clear-planet-market");
                    const r = await adminClearPlanetMarket(telegramId);
                    setLoading(null);
                    showFeedback(r.ok ? `✓ ${r.cleared ?? 0} listing rimossi dal mercato` : "✗ Errore pulizia mercato", r.ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,60,60,0.3)",
                    background: "rgba(255,60,60,0.1)",
                    color: "#ff5555",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "clear-planet-market" ? "..." : "🧹 PULISCI MERCATO PIANETI"}
                </motion.button>

                <motion.button
                  onClick={async () => {
                    haptic();
                    setLoading("clear-equipment-market");
                    const r = await adminClearEquipmentMarket(telegramId);
                    setLoading(null);
                    showFeedback(r.ok ? `✓ ${r.cleared ?? 0} equipment rimossi dal mercato` : "✗ Errore pulizia mercato equipment", r.ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,60,60,0.3)",
                    background: "rgba(255,60,60,0.1)",
                    color: "#ff5555",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "clear-equipment-market" ? "..." : "🧹 PULISCI MERCATO EQUIPMENT"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* ── BROADCAST TELEGRAM ── */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  📢 BROADCAST TELEGRAM
                </div>
                <textarea
                  value={broadcastText}
                  onChange={e => setBroadcastText(e.target.value)}
                  placeholder="Scrivi il messaggio da inviare a tutti gli utenti…"
                  maxLength={4096}
                  rows={4}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#fff",
                    fontSize: 12,
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                  }}
                />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "right", marginTop: -4 }}>
                  {broadcastText.length}/4096
                </div>
                {broadcastResult && (
                  <div style={{ fontSize: 11, color: "#00e676", background: "rgba(0,230,118,0.08)", borderRadius: 8, padding: "6px 10px" }}>
                    ✓ Inviato a <b>{broadcastResult.sent}</b> utenti · {broadcastResult.skipped} saltati
                  </div>
                )}
                <motion.button
                  onClick={async () => {
                    if (!broadcastText.trim()) return;
                    haptic();
                    setBroadcastResult(null);
                    setLoading("broadcast");
                    const r = await adminBroadcast(telegramId, broadcastText.trim());
                    setLoading(null);
                    if (r.ok) {
                      setBroadcastResult({ sent: r.sent ?? 0, skipped: r.skipped ?? 0 });
                      setBroadcastText("");
                    } else {
                      showFeedback(`✗ ${r.error ?? "Errore broadcast"}`, false);
                    }
                  }}
                  disabled={loading !== null || !broadcastText.trim()}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(33,150,243,0.35)",
                    background: "rgba(33,150,243,0.12)",
                    color: "#2196f3",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: loading !== null || !broadcastText.trim() ? "default" : "pointer",
                    opacity: loading !== null || !broadcastText.trim() ? 0.45 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "broadcast" ? "⏳ Invio in corso…" : "📤 INVIA A TUTTI"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Merchant status monitor */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  STATO ALIENO
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.2)",
                    fontSize: 12,
                    color: merchantStatus.active ? "#00e676" : "rgba(255,255,255,0.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>
                    {merchantStatus.active
                      ? `🔴 ATTIVO (scade tra ${formatCountdown(merchantStatus.remainingSec ?? 0)})`
                      : merchantStatus.nextAt
                        ? `🕓 Prossimo: ${formatCountdown(merchantStatus.remainingSec ?? 0)}`
                        : "— Nessun timer —"}
                  </span>
                  <span
                    onClick={() => { haptic(); refreshMerchantStatus(); }}
                    style={{ cursor: "pointer", fontSize: 10, opacity: 0.5 }}
                  >
                    🔄
                  </span>
                </div>

                {/* Force Space Merchant spawn */}
                <motion.button
                  onClick={async () => {
                    haptic();
                    setLoading("force-merchant");
                    const r = await adminForceMerchantSpawn(telegramId);
                    setLoading(null);
                    showFeedback(r.ok ? `✓ Alieno spawnato! Scade: ${new Date(r.expiresAt || "").toLocaleTimeString()}` : "✗ Errore spawn alieno", r.ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,230,118,0.3)",
                    background: "rgba(0,230,118,0.1)",
                    color: "#00e676",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loading === "force-merchant" ? "..." : "👽 FORZA ALIENO"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Force delist marketplace listing */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  RIMUOVI LISTING DAL MERCATO
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={delistId}
                    onChange={(e) => setDelistId(e.target.value)}
                    placeholder="ID listing"
                    type="number"
                    min="1"
                    onFocus={() => haptic()}
                    style={{ ...inputStyle, flex: 1, border: "1px solid rgba(255,60,60,0.18)" }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = parseInt(delistId, 10);
                      if (!Number.isFinite(id) || id <= 0) {
                        showFeedback("✗ ID non valido", false);
                        return;
                      }
                      setLoading("delist");
                      const ok = await adminForceDelist(telegramId, id);
                      setLoading(null);
                      if (ok) setDelistId("");
                      showFeedback(ok ? `✓ Listing #${id} rimosso` : `✗ Listing non trovato`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "0 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,60,60,0.3)",
                      background: "rgba(255,60,60,0.1)",
                      color: "#ff5555",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {loading === "delist" ? "..." : "🗑 DELIST"}
                  </motion.button>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Top players (with Telegram IDs) — tap to fill the disable input */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                    TOP PLAYERS (TELEGRAM ID)
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => { haptic(); refreshTopPlayers(); }}
                    disabled={topPlayersLoading}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      cursor: "pointer",
                      opacity: topPlayersLoading ? 0.5 : 1,
                    }}
                  >
                    {topPlayersLoading ? "..." : "↻ REFRESH"}
                  </motion.button>
                </div>
                <input
                  value={topPlayersFilter}
                  onChange={(e) => setTopPlayersFilter(e.target.value)}
                  placeholder="Filtra per nome o ID (es. Бам)"
                  onFocus={() => haptic()}
                  style={{ ...inputStyle, width: "100%" }}
                />
                <div
                  style={{
                    maxHeight: 240,
                    overflowY: "auto",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(0,0,0,0.2)",
                  }}
                >
                  {(() => {
                    const q = topPlayersFilter.trim().toLowerCase();
                    const filtered = q
                      ? topPlayers.filter((r) =>
                          (r.firstName || "").toLowerCase().includes(q) ||
                          r.telegramId.toLowerCase().includes(q),
                        )
                      : topPlayers;
                    if (topPlayersLoading && filtered.length === 0) {
                      return (
                        <div style={{ padding: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                          Caricamento…
                        </div>
                      );
                    }
                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                          Nessun risultato
                        </div>
                      );
                    }
                    return filtered.slice(0, 50).map((r) => {
                      const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
                      return (
                        <button
                          key={r.telegramId}
                          onClick={() => {
                            haptic();
                            setDisableId(r.telegramId);
                            setTargetId(r.telegramId);
                            showFeedback(`✓ ID ${r.telegramId} copiato (${r.firstName})`, true);
                          }}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "32px 1fr auto",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "6px 8px",
                            border: "none",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            background: "transparent",
                            color: "#e6f0ff",
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{medal}</span>
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.firstName || "Player"}
                            </span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                              {r.telegramId}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#ffd700" }}>
                            {Math.floor(r.zoomBalance).toLocaleString()}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Disable / Enable user (anti-abuse freeze) */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  DISABILITA / RIATTIVA UTENTE (blocca market + prelievi)
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={disableId}
                    onChange={(e) => setDisableId(e.target.value)}
                    placeholder="@username o telegram_id"
                    onFocus={() => haptic()}
                    style={{ ...inputStyle, flex: 1, border: "1px solid rgba(255,60,60,0.18)" }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = disableId.trim();
                      if (!id) { showFeedback("✗ Nessun ID", false); return; }
                      setLoading("disable");
                      const ok = await adminDisableUser(telegramId, id);
                      setLoading(null);
                      if (ok) setDisableId("");
                      showFeedback(ok ? `✓ ${id} disabilitato` : `✗ Errore per ${id}`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,60,60,0.35)",
                      background: "rgba(255,60,60,0.12)",
                      color: "#ff5555",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {loading === "disable" ? "..." : "DISABLE"}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={async () => {
                      haptic();
                      const id = disableId.trim();
                      if (!id) { showFeedback("✗ Nessun ID", false); return; }
                      setLoading("enable");
                      const ok = await adminEnableUser(telegramId, id);
                      setLoading(null);
                      if (ok) setDisableId("");
                      showFeedback(ok ? `✓ ${id} riattivato` : `✗ Errore per ${id}`, ok);
                    }}
                    disabled={loading !== null}
                    style={{
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(80,200,120,0.35)",
                      background: "rgba(80,200,120,0.12)",
                      color: "#5cd690",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      opacity: loading !== null ? 0.5 : 1,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {loading === "enable" ? "..." : "ENABLE"}
                  </motion.button>
                </div>

                {/* One-click ban for the Nebo MVP referral-farm case */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={async () => {
                    haptic();
                    if (!confirmBulkNebo) {
                      setConfirmBulkNebo(true);
                      setTimeout(() => setConfirmBulkNebo(false), 4000);
                      return;
                    }
                    setConfirmBulkNebo(false);
                    setLoading("bulk-nebo");
                    const ids = [
                      "6146915686",
                      "6635251318","7063908258","6998414565","6707354644","7183981146",
                      "7142328234","7024910715","6744006845","6108390927","7173815503",
                      "7105736820","6965069519","7144279392","7121448815","7164889297",
                      "6820659857","6609114207",
                    ];
                    const r = await adminBulkDisable(telegramId, ids);
                    setLoading(null);
                    if (r.ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(
                      r.ok ? `✓ ${r.disabled}/${ids.length} account disabilitati` : "✗ Errore bulk-disable",
                      r.ok,
                    );
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: confirmBulkNebo ? "1px solid #ff3b3b" : "1px solid rgba(255,60,60,0.35)",
                    background: confirmBulkNebo ? "rgba(255,60,60,0.25)" : "rgba(255,60,60,0.1)",
                    color: "#ff5555",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    letterSpacing: "0.05em",
                  }}
                >
                  {loading === "bulk-nebo"
                    ? "..."
                    : confirmBulkNebo
                      ? "CONFERMA: BAN NEBO + 17 ALTS"
                      : "BAN NEBO + 17 ALTS (1 click)"}
                </motion.button>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* TON Withdrawal Requests */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                    PRELIEVI TON ({pendingWithdrawals.length})
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => { haptic(); refreshPendingWithdrawals(); }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↻ AGGIORNA
                  </motion.button>
                </div>
                {pendingWithdrawals.length === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 8 }}>
                    Nessuna richiesta in attesa.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                    {pendingWithdrawals.map((w) => (
                      <WithdrawalRow
                        key={w.id}
                        w={w}
                        loading={withdrawalLoadingId === w.id}
                        onApprove={async (txHash) => {
                          haptic();
                          setWithdrawalLoadingId(w.id);
                          const res = await adminApproveWithdrawal(telegramId, w.id, txHash);
                          setWithdrawalLoadingId(null);
                          showFeedback(res.ok ? `✓ Prelievo #${w.id} approvato` : `✗ ${res.error || "Errore"}`, res.ok);
                          if (res.ok) refreshPendingWithdrawals();
                        }}
                        onReject={async (reason) => {
                          haptic();
                          setWithdrawalLoadingId(w.id);
                          const res = await adminRejectWithdrawal(telegramId, w.id, reason);
                          setWithdrawalLoadingId(null);
                          showFeedback(res.ok ? `✓ Prelievo #${w.id} rifiutato e rimborsato` : `✗ ${res.error || "Errore"}`, res.ok);
                          if (res.ok) {
                            refreshPendingWithdrawals();
                            window.dispatchEvent(new Event("zoom-admin-refresh"));
                          }
                        }}
                      />
                    ))}
                  </div>
                )}

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Reset Season - destructive */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  RESET STAGIONE
                </div>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    if (!confirmReset) {
                      setConfirmReset(true);
                      setTimeout(() => setConfirmReset(false), 4000);
                      return;
                    }
                    setLoading("reset");
                    const ok = await adminResetSeason(telegramId);
                    setLoading(null);
                    setConfirmReset(false);
                    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
                    showFeedback(ok ? "✓ Stagione resettata per tutti" : "✗ Errore reset", ok);
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: `1px solid ${confirmReset ? "rgba(255,60,60,0.6)" : "rgba(255,60,60,0.25)"}`,
                    background: confirmReset ? "rgba(255,60,60,0.18)" : "rgba(255,60,60,0.08)",
                    color: "#ff5555",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "all 0.2s",
                    boxShadow: confirmReset ? "0 0 14px rgba(255,60,60,0.3)" : "none",
                  }}
                >
                  {loading === "reset" ? "..." : confirmReset ? "⚠ CONFERMA RESET (tap)" : "🔄 RESET STAGIONE (Zoom + Exchange)"}
                </motion.button>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                  Azzera $ZOOM, pool stagionale, conteggi craft e claim per tutti gli utenti.
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Reconcile referral counts - safe data fix */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                  RICONCILIA REFERRAL
                </div>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={async () => {
                    haptic();
                    setLoading("reset");
                    const res = await adminReconcileReferrals(telegramId);
                    setLoading(null);
                    if (res.ok) {
                      window.dispatchEvent(new Event("zoom-admin-refresh"));
                      const delta = res.delta ?? 0;
                      showFeedback(`✓ Referral riallineati: ${res.before} → ${res.after} (${delta >= 0 ? "+" : ""}${delta})`, true);
                    } else {
                      showFeedback(`✗ ${res.error || "Errore"}`, false);
                    }
                  }}
                  disabled={loading !== null}
                  style={{
                    padding: "11px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,51,85,0.25)",
                    background: "rgba(255,51,85,0.08)",
                    color: "#ff3355",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  🧮 RICONCILIA CONTEGGIO REFERRAL
                </motion.button>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                  Riallinea il conteggio referral di ogni utente al numero reale di invitati. Non tocca i $ZOOM già accreditati.
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* AUDIT + PURGE FAKE REFERRALS — chirurgico, solo i fantasmi */}
                <FakeReferralsAdminSection adminId={telegramId} onFeedback={showFeedback} />

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* REDEEM CODES — generate 24h promo codes */}
                <RedeemCodesAdminSection adminId={telegramId} onFeedback={showFeedback} />

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* LOTTO STELLARE — admin dashboard */}
                <LottoAdminSection adminId={telegramId} onFeedback={showFeedback} />

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* CLASSIFICA MENSILE LAB — admin dashboard + close season */}
                <LabRankAdminSection adminId={telegramId} onFeedback={showFeedback} />

                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: feedback.ok ? "rgba(0,242,100,0.12)" : "rgba(255,60,60,0.12)",
                        border: `1px solid ${feedback.ok ? "rgba(0,242,100,0.3)" : "rgba(255,60,60,0.3)"}`,
                        color: feedback.ok ? "#00f264" : "#ff5555",
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {feedback.msg}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface LottoAdminSectionProps {
  adminId: string;
  onFeedback: (msg: string, ok: boolean) => void;
}

function LottoAdminSection({ adminId, onFeedback }: LottoAdminSectionProps) {
  const [dash, setDash] = useState<LottoAdminDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const d = await adminFetchLottoDashboard(adminId);
    setLoading(false);
    if (d) setDash(d);
  }, [adminId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDraw = async () => {
    haptic();
    if (!confirmDraw) {
      setConfirmDraw(true);
      setTimeout(() => setConfirmDraw(false), 4000);
      return;
    }
    setDrawing(true);
    const res = await adminLottoDraw(adminId);
    setDrawing(false);
    setConfirmDraw(false);
    if (res.ok) {
      const name = res.winnerName || res.winnerTelegramId || "?";
      onFeedback(`✓ Vincitore: ${name} · ${res.winnerTickets} biglietti · paga ${(res.prizeTon || 0).toFixed(4)} TON`, true);
      refresh();
    } else {
      const msg = res.error === "NO_TICKETS_SOLD" ? "Nessun biglietto venduto in questo round"
        : res.error === "NO_ACTIVE_ROUND" ? "Nessun round attivo"
        : res.error || "Errore estrazione";
      onFeedback(`✗ ${msg}`, false);
    }
  };

  const collected = dash?.totalCollectedTon ?? 0;
  const prize = dash?.prizeToPayTon ?? 0;
  const profit = dash?.myNetProfitTon ?? 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,216,77,0.7)", letterSpacing: "0.08em", fontWeight: 800 }}>
          🎟 LOTTO STELLARE
        </div>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => { haptic(); refresh(); }}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "↻ AGGIORNA"}
        </motion.button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 6,
        padding: 10,
        borderRadius: 10,
        background: "linear-gradient(135deg, rgba(255,216,77,0.06), rgba(196,113,237,0.04))",
        border: "1px solid rgba(255,216,77,0.2)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Total Collected</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 2 }}>{collected.toFixed(4)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>TON</div>
        </div>
        <div style={{ textAlign: "center", borderLeft: "1px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Prize 90%</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#ffd84d", marginTop: 2 }}>{prize.toFixed(4)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>al vincitore</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Profit 10%</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#00f264", marginTop: 2 }}>{profit.toFixed(4)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>tuo netto</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.6)", padding: "0 4px" }}>
        <span>Round #{dash?.round.id ?? "—"}</span>
        <span>{dash?.round.totalTickets ?? 0} biglietti · {dash?.round.participants ?? 0} partecipanti</span>
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, padding: "8px 10px", borderRadius: 8,
        background: "rgba(196,113,237,0.08)",
        border: "1px solid rgba(196,113,237,0.25)",
      }}>
        <span style={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.04em" }}>
          Estrazione automatica settimanale
        </span>
        <span style={{ color: "#c471ed", fontWeight: 800 }}>
          {dash?.round.nextDrawAt
            ? new Date(dash.round.nextDrawAt).toLocaleString("it-IT", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })
            : "—"}
        </span>
      </div>

      {dash && dash.topBuyers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 2 }}>TOP COMPRATORI</div>
          {dash.topBuyers.map((b, i) => {
            const total = dash.round.totalTickets || 1;
            const pct = (b.tickets / total) * 100;
            const name = b.firstName || (b.username ? `@${b.username}` : b.telegramId);
            return (
              <div key={b.telegramId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#fff", padding: "3px 4px" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  {i + 1}. {name}
                </span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>
                  {b.tickets} <span style={{ color: "#ffd84d" }}>({pct.toFixed(1)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={handleDraw}
        disabled={drawing || (dash?.round.totalTickets ?? 0) <= 0}
        style={{
          padding: "11px",
          borderRadius: 10,
          border: `1px solid ${confirmDraw ? "rgba(255,216,77,0.6)" : "rgba(255,216,77,0.3)"}`,
          background: confirmDraw ? "rgba(255,216,77,0.18)" : "rgba(255,216,77,0.08)",
          color: "#ffd84d",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.06em",
          cursor: drawing || (dash?.round.totalTickets ?? 0) <= 0 ? "not-allowed" : "pointer",
          opacity: drawing || (dash?.round.totalTickets ?? 0) <= 0 ? 0.5 : 1,
          transition: "all 0.2s",
          boxShadow: confirmDraw ? "0 0 14px rgba(255,216,77,0.3)" : "none",
        }}
      >
        {drawing ? "..." : confirmDraw ? "⚠ CONFERMA ESTRAZIONE (tap)" : "🎲 ESTRAI VINCITORE"}
      </motion.button>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
        L'estrazione automatica avviene ogni settimana e manda una notifica Telegram a TUTTI gli utenti del bot col vincitore e il montepremi. Questo bottone qui sopra serve come <b>override manuale</b> nel caso volessi anticipare il draw. Dopo ogni estrazione parte automaticamente un nuovo round. <b style={{ color: "#ffd84d" }}>Il pagamento del premio al vincitore lo fai manualmente dal tuo wallet.</b>
      </div>

      {dash && dash.history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 2 }}>STORICO ESTRAZIONI</div>
          {dash.history.map((h) => (
            <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "rgba(255,255,255,0.7)", padding: "4px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Round #{h.id}</span>
                <span>{h.drawnAt ? new Date(h.drawnAt).toLocaleString() : ""}</span>
              </div>
              <div>
                Vincitore: <b style={{ color: "#fff" }}>{h.winnerTelegramId || "—"}</b> ({h.winnerTickets ?? 0} biglietti)
              </div>
              <div>
                Premio: <b style={{ color: "#ffd84d" }}>{(h.prizeTon ?? 0).toFixed(4)} TON</b> · Profitto: <b style={{ color: "#00f264" }}>{(h.profitTon ?? 0).toFixed(4)} TON</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface LabRankAdminSectionProps {
  adminId: string;
  onFeedback: (msg: string, ok: boolean) => void;
}

function LabRankAdminSection({ adminId, onFeedback }: LabRankAdminSectionProps) {
  const [dash, setDash] = useState<LabRankAdminDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const d = await adminFetchLabRankDashboard(adminId);
    setLoading(false);
    if (d) setDash(d);
  }, [adminId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleClose = async () => {
    haptic();
    if (!confirmClose) {
      setConfirmClose(true);
      setTimeout(() => setConfirmClose(false), 4000);
      return;
    }
    if (!dash?.round.id) {
      onFeedback("✗ Dashboard non caricata: aggiorna prima di chiudere", false);
      return;
    }
    setClosing(true);
    const res = await adminCloseLabRank(adminId, dash.round.id);
    setClosing(false);
    setConfirmClose(false);
    if (res.ok) {
      const winnerName = res.winner?.name || "Nessun vincitore";
      const credited = res.credited?.length || 0;
      onFeedback(`✓ Stagione chiusa · #1: ${winnerName} · ${(res.prizeTon || 0).toLocaleString()} ★ accreditati a ${credited} vincitori`, true);
      refresh();
    } else {
      const msg = res.error === "NO_ACTIVE_ROUND_OR_ALREADY_ROTATED"
        ? "Nessun round attivo o già ruotato"
        : res.error || "Errore chiusura";
      onFeedback(`✗ ${msg}`, false);
    }
  };

  const handleResetPoints = async () => {
    haptic();
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setResetting(true);
    const res = await adminResetLabPoints(adminId);
    setResetting(false);
    setConfirmReset(false);
    if (res.ok) {
      onFeedback(`✓ Punti azzerati per ${res.resetCount || 0} giocatori`, true);
      refresh();
    } else {
      onFeedback(`✗ ${res.error || "Errore reset"}`, false);
    }
  };

  const pool = dash?.poolTon ?? 60;
  const prizes = dash?.prizes ?? [];
  const participants = dash?.round.participants ?? 0;
  const endsAt = dash?.round.endsAt ? new Date(dash.round.endsAt) : null;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,215,0,0.75)", letterSpacing: "0.08em", fontWeight: 800 }}>
          🏆 CLASSIFICA MENSILE LAB
        </div>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => { haptic(); refresh(); }}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "↻ AGGIORNA"}
        </motion.button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        padding: 10,
        borderRadius: 10,
        background: "linear-gradient(135deg, rgba(255,215,0,0.06), rgba(255,140,0,0.04))",
        border: "1px solid rgba(255,215,0,0.2)",
      }}>
        <div style={{ textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Montepremi</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#ffd700", marginTop: 2 }}>{pool.toLocaleString()} ★</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>fisso · Top 30</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Giocatori</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 2 }}>{participants}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)" }}>nella stagione</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.6)", padding: "0 4px" }}>
        <span>Round #{dash?.round.id ?? "—"}</span>
        <span>{endsAt ? `Scade: ${endsAt.toLocaleString()}` : "Scadenza —"}</span>
      </div>

      {prizes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 4px" }}>
          {prizes.map((p) => (
            <span key={p.label} style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 6, padding: "2px 7px" }}>
              <b style={{ color: "#ffd700" }}>{p.label}</b> · {p.ton} ★
            </span>
          ))}
        </div>
      )}

      {dash?.currentLeader && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 11, padding: "8px 10px", borderRadius: 8,
          background: "rgba(255,215,0,0.08)",
          border: "1px solid rgba(255,215,0,0.25)",
        }}>
          <span style={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.04em" }}>
            👑 Leader corrente
          </span>
          <span style={{ color: "#ffd700", fontWeight: 800 }}>
            {dash.currentLeader.name} · {dash.currentLeader.labPoints} pt
          </span>
        </div>
      )}

      {dash && dash.top30.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 2 }}>TOP 30 — ANTEPRIMA PAYOUT</div>
          {dash.top30.map((r) => (
            <div key={r.telegramId} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#fff", padding: "3px 4px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                #{r.rank} {r.name} · {r.labPoints} pt
              </span>
              <span style={{ color: r.rank === 1 ? "#ffd700" : "rgba(255,255,255,0.7)" }}>
                {r.tonPrize > 0 ? `${r.tonPrize} ★` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={handleClose}
        disabled={closing}
        style={{
          padding: "11px",
          borderRadius: 10,
          border: `1px solid ${confirmClose ? "rgba(255,215,0,0.6)" : "rgba(255,215,0,0.3)"}`,
          background: confirmClose ? "rgba(255,215,0,0.18)" : "rgba(255,215,0,0.08)",
          color: "#ffd700",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.06em",
          cursor: closing ? "not-allowed" : "pointer",
          opacity: closing ? 0.5 : 1,
          transition: "all 0.2s",
          boxShadow: confirmClose ? "0 0 14px rgba(255,215,0,0.3)" : "none",
        }}
        data-testid="button-close-lab-rank-season"
      >
        {closing ? "..." : confirmClose ? "⚠ CONFERMA CHIUSURA STAGIONE (tap)" : "🏁 CHIUDI STAGIONE & PAYOUT"}
      </motion.button>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
        La stagione si chiude <b style={{ color: "#ffd700" }}>automaticamente dopo 60 giorni</b>: i premi ★ ({pool.toLocaleString()} ★ in totale) vengono accreditati <b style={{ color: "#ffd700" }}>subito sul saldo Stardust</b> dei primi 30. I punti di tutti vengono azzerati e parte una nuova stagione. Questo pulsante è solo un fallback manuale.
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={handleResetPoints}
        disabled={resetting}
        style={{
          padding: "11px",
          borderRadius: 10,
          border: `1px solid ${confirmReset ? "rgba(255,80,80,0.6)" : "rgba(255,80,80,0.3)"}`,
          background: confirmReset ? "rgba(255,80,80,0.18)" : "rgba(255,80,80,0.08)",
          color: "#ff6b6b",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.06em",
          cursor: resetting ? "not-allowed" : "pointer",
          opacity: resetting ? 0.5 : 1,
          transition: "all 0.2s",
          boxShadow: confirmReset ? "0 0 14px rgba(255,80,80,0.3)" : "none",
        }}
      >
        {resetting ? "..." : confirmReset ? "⚠ CONFERMA RESET PUNTI (tap)" : "🔄 RESET PUNTI CLASSIFICA"}
      </motion.button>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
        Azzera <b style={{ color: "#ff6b6b" }}>tutti i punti</b> della classifica craft per tutti i giocatori. <b>Nessun premio viene distribuito</b> — i punti tornano solo a 0. Utile per ripartire da zero con una classifica pulita.
      </div>

      {dash && dash.history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 2 }}>STORICO STAGIONI</div>
          {dash.history.map((h) => (
            <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "rgba(255,255,255,0.7)", padding: "4px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Stagione #{h.id}</span>
                <span>{h.closedAt ? new Date(h.closedAt).toLocaleString() : ""}</span>
              </div>
              <div>
                #1: <b style={{ color: "#fff" }}>{h.winnerTelegramId || "—"}</b> ({h.winnerLabPoints ?? 0} pt)
              </div>
              <div>
                Pool: <b style={{ color: "#fff" }}>{(h.poolTon ?? 0).toLocaleString()}</b> · Premio: <b style={{ color: "#ffd700" }}>{(h.prizeTon ?? 0).toLocaleString()} ★</b> · Residuo: <b style={{ color: "#00f264" }}>{(h.profitTon ?? 0).toLocaleString()} ★</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface WithdrawalRowProps {
  w: TonWithdrawal;
  loading: boolean;
  onApprove: (txHash: string) => void;
  onReject: (reason?: string) => void;
}

function WithdrawalRow({ w, loading, onApprove, onReject }: WithdrawalRowProps) {
  const [txHash, setTxHash] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const userLabel = w.firstName || w.username || w.telegramId;

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); } catch { /* noop */ }
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
            {w.amountTon.toFixed(4)} TON <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 11 }}>(fee {w.feeTon.toFixed(4)})</span>
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            {userLabel} · ID {w.telegramId}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {new Date(w.createdAt).toLocaleString()}
          </span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, color: "#f5d36a", background: "rgba(245,211,106,0.1)", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          #{w.id}
        </span>
      </div>

      <div
        onClick={() => copy(w.walletAddress)}
        title="Tap per copiare"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.25)", padding: "6px 8px", borderRadius: 6, fontFamily: "monospace", wordBreak: "break-all", cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {w.walletAddress}
      </div>

      {!showReject ? (
        <>
          <input
            type="text"
            placeholder="TX hash dopo invio"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            disabled={loading}
            style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 11, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "monospace" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                if (!txHash.trim()) return;
                onApprove(txHash.trim());
              }}
              disabled={loading || !txHash.trim()}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 8,
                border: "1px solid rgba(0,242,100,0.4)",
                background: "rgba(0,242,100,0.12)",
                color: "#00f264",
                fontSize: 11,
                fontWeight: 800,
                cursor: loading || !txHash.trim() ? "not-allowed" : "pointer",
                opacity: loading || !txHash.trim() ? 0.5 : 1,
                letterSpacing: "0.05em",
              }}
            >
              {loading ? "..." : "✓ APPROVA"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowReject(true)}
              disabled={loading}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 8,
                border: "1px solid rgba(255,60,60,0.4)",
                background: "rgba(255,60,60,0.1)",
                color: "#ff7a7a",
                fontSize: 11,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                letterSpacing: "0.05em",
              }}
            >
              ✗ RIFIUTA
            </motion.button>
          </div>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Motivo rifiuto (opzionale)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={loading}
            style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,60,60,0.3)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 11, outline: "none", width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => onReject(reason.trim() || undefined)}
              disabled={loading}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 8,
                border: "1px solid rgba(255,60,60,0.5)",
                background: "rgba(255,60,60,0.18)",
                color: "#ff7a7a",
                fontSize: 11,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                letterSpacing: "0.05em",
              }}
            >
              {loading ? "..." : "CONFERMA RIFIUTO + RIMBORSO"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => { setShowReject(false); setReason(""); }}
              disabled={loading}
              style={{
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.7)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ANNULLA
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}

interface FakeReferralsAdminSectionProps {
  adminId: string;
  onFeedback: (msg: string, ok: boolean) => void;
}

function FakeReferralsAdminSection({ adminId, onFeedback }: FakeReferralsAdminSectionProps) {
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<"today" | "all">("today");
  const [audit, setAudit] = useState<ReferralAudit | null>(null);
  const [busy, setBusy] = useState<"audit" | "purge" | "force-daily" | "force-all" | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [confirmForce, setConfirmForce] = useState<"daily" | "all" | null>(null);

  const runAudit = useCallback(async () => {
    haptic();
    const t = target.trim();
    if (!t) { onFeedback("Inserisci username o telegram_id", false); return; }
    setBusy("audit");
    setConfirmPurge(false);
    const res = await adminAuditReferrals(adminId, t);
    setBusy(null);
    if (!res.ok) {
      setAudit(null);
      onFeedback(`✗ ${res.error || "Errore audit"}`, false);
      return;
    }
    setAudit(res);
    onFeedback("✓ Audit completato", true);
  }, [adminId, target, onFeedback]);

  const runPurge = useCallback(async () => {
    haptic();
    const t = target.trim();
    if (!t) return;
    setBusy("purge");
    const res = await adminPurgeFakeReferrals(adminId, t, scope);
    setBusy(null);
    setConfirmPurge(false);
    if (!res.ok) {
      onFeedback(`✗ ${res.error || "Errore purge"}`, false);
      return;
    }
    onFeedback(`✓ Sganciati ${res.unlinked} fake (-${res.decrementedDaily} oggi, -${res.decrementedTotal} totale)`, true);
    // Auto-refresh audit per mostrare i nuovi numeri.
    const refreshed = await adminAuditReferrals(adminId, t);
    if (refreshed.ok) setAudit(refreshed);
  }, [adminId, target, scope, onFeedback]);

  // Nuclear option: bypass the strict "fake" heuristic and zero out the HoF
  // counters directly. Needed when the bot accounts have balance_epoch >= 1
  // (because they opened the WebApp once) and therefore evade the
  // /referrals/purge-fakes filter.
  const runForceZero = useCallback(async (mode: "daily" | "all") => {
    haptic();
    const id = audit?.targetTelegramId;
    if (!id) return;
    setBusy(mode === "daily" ? "force-daily" : "force-all");
    const res = await adminForceZeroReferrals(adminId, id, {
      zeroDaily: true,
      zeroTotal: mode === "all",
    });
    setBusy(null);
    setConfirmForce(null);
    if (!res.ok) {
      onFeedback(`✗ ${res.error || "Errore force-zero"}`, false);
      return;
    }
    onFeedback(mode === "all"
      ? "✓ HoF azzerato (oggi + totale). L'utente sparisce dalla classifica."
      : "✓ HoF azzerato per oggi. L'utente sparisce dalla Hall of Fame.", true);
    const refreshed = await adminAuditReferrals(adminId, id);
    if (refreshed.ok) setAudit(refreshed);
  }, [adminId, audit?.targetTelegramId, onFeedback]);

  const c = audit?.counts;
  const targetCount = scope === "today" ? (c?.today_fake ?? 0) : (c?.total_fake ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
        AUDIT + PURGE FAKE REFERRALS
      </div>

      <input
        type="text"
        placeholder="@username o telegram_id"
        value={target}
        onChange={(e) => { setTarget(e.target.value); setAudit(null); setConfirmPurge(false); }}
        disabled={busy !== null}
        style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,200,80,0.25)",
          borderRadius: 8,
          padding: "9px 10px",
          color: "#fff",
          fontSize: 12,
          outline: "none",
        }}
      />

      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={runAudit}
        disabled={busy !== null}
        style={{
          padding: "10px",
          borderRadius: 10,
          border: "1px solid rgba(255,200,80,0.35)",
          background: "rgba(255,200,80,0.10)",
          color: "#ffc850",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.06em",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy === "audit" ? "..." : "🔍 AUDIT REFERRALS"}
      </motion.button>

      {audit && c && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            borderRadius: 10,
            background: "rgba(0,0,0,0.30)",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <div style={{ fontSize: 11, color: "#ffc850", fontWeight: 800 }}>
            {audit.username ? `@${audit.username}` : audit.firstName || "—"}{" "}
            <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
              ({audit.targetTelegramId})
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Oggi totali: <b>{c.today_refs}</b></div>
            <div style={{ color: "#ff7a7a" }}>Oggi fake: <b>{c.today_fake}</b></div>
            <div>Tutti totali: <b>{c.total_refs}</b></div>
            <div style={{ color: "#ff7a7a" }}>Tutti fake: <b>{c.total_fake}</b></div>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
            HOF count: <b>{audit.dailyReferralCount}</b> oggi · <b>{audit.referralCount}</b> totale
          </div>

          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {(["today", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setScope(s); setConfirmPurge(false); }}
                style={{
                  flex: 1,
                  padding: "7px",
                  borderRadius: 6,
                  border: scope === s ? "1px solid rgba(255,80,80,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  background: scope === s ? "rgba(255,80,80,0.15)" : "rgba(255,255,255,0.03)",
                  color: scope === s ? "#ff7a7a" : "rgba(255,255,255,0.5)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                }}
              >
                {s === "today" ? "OGGI" : "TUTTI"}
              </button>
            ))}
          </div>

          {!confirmPurge ? (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => { setConfirmPurge(true); setConfirmForce(null); }}
              disabled={busy !== null || targetCount === 0}
              style={{
                padding: "10px",
                borderRadius: 8,
                border: "1px solid rgba(255,80,80,0.4)",
                background: "rgba(255,80,80,0.10)",
                color: "#ff7a7a",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                cursor: targetCount === 0 ? "not-allowed" : "pointer",
                opacity: targetCount === 0 ? 0.4 : 1,
              }}
            >
              {targetCount === 0 ? "Nessun fake da rimuovere" : `🧹 RIMUOVI ${targetCount} FAKE (${scope === "today" ? "oggi" : "tutti"})`}
            </motion.button>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={runPurge}
                disabled={busy !== null}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,60,60,0.6)",
                  background: "rgba(255,60,60,0.20)",
                  color: "#ff7a7a",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {busy === "purge" ? "..." : `CONFERMA RIMOZIONE ${targetCount}`}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setConfirmPurge(false)}
                disabled={busy !== null}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ANNULLA
              </motion.button>
            </div>
          )}

          {/* Nuclear option: force-zero the HoF counters for this user.
              Needed when the bot accounts already have balance_epoch >= 1
              and slip past the strict "fake" filter above (so the purge
              unlinks 0 rows and the HoF count never drops). */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
            FORZA AZZERAMENTO HALL OF FAME (bypassa il filtro fake)
          </div>
          {confirmForce === null ? (
            <div style={{ display: "flex", gap: 4 }}>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => { haptic(); setConfirmForce("daily"); setConfirmPurge(false); }}
                disabled={busy !== null || (audit.dailyReferralCount ?? 0) === 0}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,160,40,0.45)",
                  background: "rgba(255,160,40,0.10)",
                  color: "#ffa830",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  cursor: (audit.dailyReferralCount ?? 0) === 0 ? "not-allowed" : "pointer",
                  opacity: (audit.dailyReferralCount ?? 0) === 0 ? 0.4 : 1,
                }}
              >
                ⚡ AZZERA HOF OGGI ({audit.dailyReferralCount ?? 0})
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => { haptic(); setConfirmForce("all"); setConfirmPurge(false); }}
                disabled={busy !== null || (audit.referralCount ?? 0) === 0}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 8,
                  border: "1px solid rgba(220,20,60,0.45)",
                  background: "rgba(220,20,60,0.10)",
                  color: "#ff5577",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  cursor: (audit.referralCount ?? 0) === 0 ? "not-allowed" : "pointer",
                  opacity: (audit.referralCount ?? 0) === 0 ? 0.4 : 1,
                }}
              >
                ☢ AZZERA TUTTO ({audit.referralCount ?? 0})
              </motion.button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => runForceZero(confirmForce)}
                disabled={busy !== null}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  border: confirmForce === "all"
                    ? "1px solid rgba(255,40,40,0.7)"
                    : "1px solid rgba(255,160,40,0.7)",
                  background: confirmForce === "all"
                    ? "rgba(255,40,40,0.20)"
                    : "rgba(255,160,40,0.20)",
                  color: confirmForce === "all" ? "#ff5577" : "#ffa830",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {busy === "force-daily" || busy === "force-all"
                  ? "..."
                  : confirmForce === "all"
                    ? "CONFERMA AZZERAMENTO TOTALE"
                    : "CONFERMA AZZERAMENTO OGGI"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setConfirmForce(null)}
                disabled={busy !== null}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ANNULLA
              </motion.button>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
        <b>RIMUOVI FAKE</b>: sgancia solo i referral fantasma (zoom_balance=0 + mai loggati).
        Se i bot hanno aperto il WebApp anche solo una volta, questo non li trova
        e il contatore HoF resta intero.
        <br />
        <b>AZZERA HOF OGGI</b>: forza a 0 il contatore di oggi (l'utente sparisce subito dalla Hall of Fame).
        <br />
        <b>AZZERA TUTTO</b>: forza a 0 anche il contatore lifetime (resetta i milestone visibili).
      </div>
    </div>
  );
}

interface RedeemCodesAdminSectionProps {
  adminId: string;
  onFeedback: (msg: string, ok: boolean) => void;
}

function RedeemCodesAdminSection({ adminId, onFeedback }: RedeemCodesAdminSectionProps) {
  const [codes, setCodes] = useState<AdminRedeemCode[]>([]);
  const [generating, setGenerating] = useState<RedeemKind | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    const list = await adminListRedeemCodes(adminId);
    setCodes(list);
  }, [adminId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-render every 30s so the "expires in" countdown updates without
  // forcing the admin to refresh the panel.
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const generate = useCallback(async (kind: RedeemKind) => {
    haptic();
    setGenerating(kind);
    const res = await adminCreateRedeemCode(adminId, kind);
    setGenerating(null);
    if (res.ok && res.code) {
      try { await navigator.clipboard.writeText(res.code); } catch { /**/ }
      setCopiedCode(res.code);
      setTimeout(() => setCopiedCode(null), 2500);
      onFeedback(`✓ Codice ${res.code} generato e copiato`, true);
      refresh();
    } else {
      onFeedback(`✗ ${res.error || "Errore"}`, false);
    }
  }, [adminId, onFeedback, refresh]);

  const copyCode = async (code: string) => {
    haptic();
    try { await navigator.clipboard.writeText(code); } catch { /**/ }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const formatRemaining = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "scaduto";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  const labelFor = (k: string, n: number): string => {
    if (k === "zoom") return `${n.toLocaleString()} $ZOOM`;
    if (k === "stardust") return `${n} ★ Stardust`;
    if (k === "spins") return `${n} Spin`;
    return `${n}`;
  };

  const colorFor = (k: string): string => {
    if (k === "zoom") return "#ff3355";
    if (k === "stardust") return "#ffd23f";
    if (k === "spins") return "#ffd700";
    return "#ffffff";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
        REDEEM CODES (24h, 1× per utente)
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {([
          { kind: "zoom" as RedeemKind,     label: "2.000 $ZOOM",  color: "#ff3355" },
          { kind: "stardust" as RedeemKind, label: "10 ★ Stardust", color: "#ffd23f" },
          { kind: "spins" as RedeemKind,    label: "3 Spin",       color: "#ffd700" },
        ]).map(({ kind, label, color }) => (
          <motion.button
            key={kind}
            whileTap={{ scale: 0.93 }}
            onClick={() => generate(kind)}
            disabled={generating !== null}
            style={{
              padding: "11px 4px",
              borderRadius: 10,
              border: `1px solid ${color}55`,
              background: `${color}14`,
              color,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
              opacity: generating !== null ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {generating === kind ? "..." : `🎟️ ${label}`}
          </motion.button>
        ))}
      </div>

      {codes.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 220,
            overflowY: "auto",
            padding: 6,
            borderRadius: 10,
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {codes.map((c) => {
            const expired = new Date(c.expiresAt).getTime() <= Date.now();
            return (
              <button
                key={c.code}
                onClick={() => copyCode(c.code)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: copiedCode === c.code ? "rgba(0,242,100,0.10)" : "rgba(255,255,255,0.03)",
                  color: "white",
                  textAlign: "left",
                  cursor: "pointer",
                  opacity: expired ? 0.45 : 1,
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: copiedCode === c.code ? "#00f264" : "#ffffff" }}>
                    {c.code}
                  </div>
                  <div style={{ fontSize: 10, color: colorFor(c.rewardType), fontWeight: 700 }}>
                    {labelFor(c.rewardType, c.rewardAmount)}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: expired ? "#ff7a7a" : "rgba(255,255,255,0.45)", fontWeight: 700, textAlign: "right" }}>
                  {expired ? "scaduto" : formatRemaining(c.expiresAt)}
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>
                    {copiedCode === c.code ? "copiato ✓" : "tap = copia"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
        Genera un codice random valido 24h. Ogni utente può usarlo una sola volta.
      </div>
    </div>
  );
}
