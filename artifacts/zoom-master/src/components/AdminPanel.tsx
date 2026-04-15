import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminCreditZoom,
  adminAddPlanets,
  adminUnlockSlots,
  adminGlobalBonus,
} from "../utils/api";

const ADMIN_ID = "8144744644";

function haptic() {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: string) => void } } } }).Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred("light");
  } catch { /**/ }
}

interface Props {
  telegramId: string;
}

type ActionType = "zoom" | "planets" | "slots";

export function AdminPanel({ telegramId }: Props) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
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
    if (type === "zoom") ok = await adminCreditZoom(ADMIN_ID, id, val);
    else if (type === "planets") ok = await adminAddPlanets(ADMIN_ID, id, Math.floor(val));
    else if (type === "slots") ok = await adminUnlockSlots(ADMIN_ID, id, Math.floor(val));
    setLoading(null);
    showFeedback(ok ? "✓ Fatto!" : "✗ Errore", ok);
  }, [targetId, amount]);

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
    showFeedback(ok ? "✓ Bonus inviato a tutti!" : "✗ Errore", ok);
  }, [globalAmount]);

  if (telegramId !== ADMIN_ID) return null;

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
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 51,
                width: "min(360px, calc(100vw - 32px))",
                background: "rgba(14, 17, 35, 0.85)",
                border: "1px solid rgba(0,242,254,0.18)",
                borderRadius: 20,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,242,254,0.06) inset",
                padding: "24px 20px 20px",
              }}
            >
              <button
                onClick={() => { haptic(); setOpen(false); }}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 16,
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 20,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "#00f2fe", textShadow: "0 0 12px rgba(0,242,254,0.6)" }}>
                  ADMIN PANEL
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Accesso riservato</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="Telegram ID utente"
                  onFocus={() => haptic()}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: 13,
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Quantità / Numero"
                  type="number"
                  min="1"
                  onFocus={() => haptic()}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: 13,
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                  {([
                    { type: "zoom" as ActionType, label: "💰 ZOOM", color: "#00f2fe" },
                    { type: "planets" as ActionType, label: "🪐 Pianeti", color: "#c471ed" },
                    { type: "slots" as ActionType, label: "📦 Slot", color: "#4facfe" },
                  ]).map(({ type, label, color }) => (
                    <motion.button
                      key={type}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => handleAction(type)}
                      disabled={loading !== null}
                      style={{
                        flex: 1,
                        padding: "9px 4px",
                        borderRadius: 10,
                        border: `1px solid ${color}33`,
                        background: `${color}14`,
                        color,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: loading !== null ? 0.5 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {loading === type ? "..." : label}
                    </motion.button>
                  ))}
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />

                <input
                  value={globalAmount}
                  onChange={(e) => setGlobalAmount(e.target.value)}
                  placeholder="ZOOM per tutti gli utenti"
                  type="number"
                  min="1"
                  onFocus={() => haptic()}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,215,0,0.18)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: 13,
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
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
              </div>

              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      marginTop: 12,
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
