import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminCreditZoom,
  adminAddPlanets,
  adminUnlockSlots,
  adminGlobalBonus,
  adminRemoveZoom,
  adminRemovePlanets,
  adminRemoveSlots,
} from "../utils/api";

const ADMIN_ID = "8144744644";

type PlanetChoice = "BASIC" | "RARE" | "EPIC" | "GOLD" | "SUN";
type ActionType = "zoom" | "planets" | "slots";

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
  const [loading, setLoading] = useState<ActionType | "global" | null>(null);

  const showFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleAction = useCallback(async (type: ActionType) => {
    haptic();
    const id = targetId.trim();
    const val = parseFloat(amount);
    if (!id || isNaN(val) || val <= 0) {
      showFeedback("ID o valore non valido", false);
      return;
    }
    setLoading(type);
    let ok = false;
    if (mode === "add") {
      if (type === "zoom") ok = await adminCreditZoom(ADMIN_ID, id, val);
      else if (type === "planets") ok = await adminAddPlanets(ADMIN_ID, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminUnlockSlots(ADMIN_ID, id, Math.floor(val));
    } else {
      if (type === "zoom") ok = await adminRemoveZoom(ADMIN_ID, id, val);
      else if (type === "planets") ok = await adminRemovePlanets(ADMIN_ID, id, Math.floor(val), planetType);
      else if (type === "slots") ok = await adminRemoveSlots(ADMIN_ID, id, Math.floor(val));
    }
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ Fatto!" : "✗ Errore", ok);
  }, [targetId, amount, planetType, mode]);

  const handleGlobalBonus = useCallback(async () => {
    haptic();
    const val = parseFloat(globalAmount);
    if (isNaN(val) || val <= 0) {
      showFeedback("Valore non valido", false);
      return;
    }
    setLoading("global");
    const ok = await adminGlobalBonus(ADMIN_ID, val);
    setLoading(null);
    if (ok) window.dispatchEvent(new Event("zoom-admin-refresh"));
    showFeedback(ok ? "✓ Bonus inviato a tutti!" : "✗ Errore", ok);
  }, [globalAmount]);

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

                {/* ID + amount fields */}
                <input
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="Telegram ID utente"
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
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { type: "zoom" as ActionType,    label: "🪐 ZOOM",    color: "#00f2fe" },
                    { type: "planets" as ActionType, label: "🌍 Pianeti", color: "#c471ed" },
                    { type: "slots" as ActionType,   label: "📦 Slot",    color: "#4facfe" },
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
