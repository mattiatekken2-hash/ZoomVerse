import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminCreditZoom,
  adminAddPlanets,
  adminUnlockSlots,
  adminUnlockWhiteCollection,
  adminUnlockEarthCollection,
  adminRevokeWhiteCollection,
  adminRevokeEarthCollection,
  adminGrantV1,
  adminGrantAutoTap,
  adminTestWithdrawalChannel,
  adminFetchWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  type TonWithdrawal,
  fetchMaintenanceStatus,
  adminSetMaintenance,
  adminGlobalBonus,
  adminRemoveZoom,
  adminRemovePlanets,
  adminRemoveSlots,
  adminCreditSpins,
  adminRemoveSpins,
  adminCreditStardust,
  adminRemoveStardust,
  adminResetSeason,
  adminForceDelist,
  adminReconcileReferrals,
} from "../utils/api";

const ADMIN_ID = "8144744644";

type PlanetChoice = "BASIC" | "RARE" | "EPIC" | "COMET" | "GOLD" | "SUN";
type ActionType = "zoom" | "planets" | "slots" | "spins" | "stardust";

function haptic() {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: string) => void } } } }).Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred("light");
  } catch { /**/ }
}

const PLANET_OPTIONS: { type: PlanetChoice; label: string; color: string }[] = [
  { type: "BASIC",  label: "Basic",  color: "#8892b0" },
  { type: "RARE",   label: "Rare",   color: "#4facfe" },
  { type: "EPIC",   label: "Epic",   color: "#c471ed" },
  { type: "COMET",  label: "Stardust",  color: "#ffea00" },
  { type: "GOLD",   label: "Gold",   color: "#ffd700" },
  { type: "SUN",    label: "Sole ☀️", color: "#ffb347" },
];

interface Props {
  telegramId: string;
}

export function AdminPanel({ telegramId }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [planetType, setPlanetType] = useState<PlanetChoice>("BASIC");
  const [globalAmount, setGlobalAmount] = useState("");
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState<ActionType | "global" | "reset" | "delist" | "white" | "earth" | "revoke-white" | "revoke-earth" | "autotap" | "test-wd-chan" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [delistId, setDelistId] = useState("");
  const [pendingWithdrawals, setPendingWithdrawals] = useState<TonWithdrawal[]>([]);
  const [withdrawalLoadingId, setWithdrawalLoadingId] = useState<number | null>(null);
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintMessage, setMaintMessage] = useState("We're upgrading the game. Back online shortly.");
  const [maintLoading, setMaintLoading] = useState(false);

  const refreshPendingWithdrawals = useCallback(async () => {
    const list = await adminFetchWithdrawals(telegramId, "pending");
    setPendingWithdrawals(list);
  }, [telegramId]);

  const refreshMaintenance = useCallback(async () => {
    const s = await fetchMaintenanceStatus();
    setMaintEnabled(!!s.enabled);
    if (s.message) setMaintMessage(s.message);
  }, []);

  useEffect(() => {
    if (open && telegramId === ADMIN_ID) {
      refreshPendingWithdrawals();
      refreshMaintenance();
    }
  }, [open, telegramId, refreshPendingWithdrawals, refreshMaintenance]);

  const handleToggleMaintenance = useCallback(async (next: boolean) => {
    haptic();
    setMaintLoading(true);
    const res = await adminSetMaintenance(telegramId, next, maintMessage);
    setMaintLoading(false);
    if (res.ok) {
      setMaintEnabled(!!res.enabled);
      if (res.message) setMaintMessage(res.message);
      window.dispatchEvent(new Event("zoom-admin-refresh"));
      showFeedback(next ? "✓ Maintenance ON — users locked out" : "✓ Maintenance OFF — game live", true);
    } else {
      showFeedback(`✗ ${res.error || "Failed"}`, false);
    }
  }, [telegramId, maintMessage]);

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
    if (mode === "add") {
      if (type === "zoom") ok = await adminCreditZoom(telegramId, id, val);
      else if (type === "planets") ok = await adminAddPlanets(telegramId, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminUnlockSlots(telegramId, id, Math.floor(val));
      else if (type === "spins") ok = await adminCreditSpins(telegramId, id, Math.floor(val));
      else if (type === "stardust") ok = await adminCreditStardust(telegramId, id, Math.floor(val));
    } else {
      if (type === "zoom") ok = await adminRemoveZoom(telegramId, id, val);
      else if (type === "planets") ok = await adminRemovePlanets(telegramId, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminRemoveSlots(telegramId, id, Math.floor(val));
      else if (type === "spins") ok = await adminRemoveSpins(telegramId, id, Math.floor(val));
      else if (type === "stardust") ok = await adminRemoveStardust(telegramId, id, Math.floor(val));
    }
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    const direction = mode === "add" ? "aggiunti" : "rimossi";
    const item = type === "zoom" ? `${val} $ZOOM`
      : type === "slots" ? `${Math.floor(val)} slot`
      : type === "spins" ? `${Math.floor(val)} spin`
      : type === "stardust" ? `${Math.floor(val)} stardust`
      : `${Math.floor(val)} ${planetType === "SUN" ? "Sole" : `pianeti ${planetType}`}`;
    showFeedback(ok ? `✓ ${item} ${direction} a ID ${id}` : `✗ Errore per ID ${id}`, ok);
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

  if (telegramId !== ADMIN_ID) return null;

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
        onTap={() => { haptic(); setOpen(true); }}
        whileTap={{ scale: 0.85 }}
        style={{
          position: "fixed",
          bottom: 88,
          right: 16,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 40,
          cursor: "pointer",
          fontSize: 13,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        ⚙
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => { haptic(); setOpen(false); }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
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
                border: "1px solid rgba(0,242,254,0.2)",
                borderRadius: 20,
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                boxShadow: "0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,242,254,0.07) inset",
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
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#00f2fe", textShadow: "0 0 12px rgba(0,242,254,0.6)" }}>
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
                    { type: "zoom" as ActionType,     label: "🪐 ZOOM",     color: "#00f2fe" },
                    { type: "planets" as ActionType,  label: "🌍 Pianeti",  color: "#c471ed" },
                    { type: "slots" as ActionType,    label: "📦 Slot",     color: "#4facfe" },
                    { type: "spins" as ActionType,    label: "🎡 Spin",     color: "#ffd700" },
                    { type: "stardust" as ActionType, label: "✦ Stardust", color: "#ffd23f" },
                  ]).map(({ type, label, color }) => {
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

                {/* Revoke collections */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                    border: "1px solid rgba(0,242,254,0.4)",
                    background: "rgba(0,242,254,0.1)",
                    color: "#00f2fe",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    opacity: loading !== null ? 0.5 : 1,
                    transition: "opacity 0.15s",
                    boxShadow: "0 0 14px rgba(0,242,254,0.15)",
                  }}
                >
                  {loading === "autotap" ? "..." : "⚡ GRANT AUTO-TAP"}
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
                    border: "1px solid rgba(0,242,254,0.25)",
                    background: "rgba(0,242,254,0.08)",
                    color: "#00f2fe",
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
