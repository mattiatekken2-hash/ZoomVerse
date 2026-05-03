import { useEffect, useState } from "react";
import {
  getPlanetDisplayName,
  validateCustomNameClient,
  RENAME_RANDOM_COST,
  RENAME_CUSTOM_COST,
  RENAME_MAX_LEN,
} from "../utils/planetNames";
import { renamePlanet } from "../utils/api";
import type { Planet } from "../hooks/useGameState";
import { useT } from "../i18n/LanguageContext";

interface Props {
  planet: Planet;
  telegramId: string;
  onClose: () => void;
  // Called after a successful rename so the parent can patch its local
  // planets array (set displayName) and refresh the stardust balance.
  onRenamed: (planetId: string, displayName: string, newStardustBalance: number) => void;
}

export function PlanetRenameModal({ planet, telegramId, onClose, onRenamed }: Props) {
  const { t } = useT();
  const currentName = getPlanetDisplayName(planet);
  const [tab, setTab] = useState<"random" | "custom">("random");
  const [customInput, setCustomInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after a successful random rename so the user briefly sees the
  // name the server picked before the modal closes.
  const [revealedName, setRevealedName] = useState<string | null>(null);

  // ESC closes (unless we're in the middle of a request or showing the
  // post-rename reveal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy && !revealedName) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, revealedName, onClose]);

  const submit = async () => {
    if (busy) return;
    setError(null);
    let name = "";
    if (tab === "custom") {
      const v = validateCustomNameClient(customInput);
      if (!v.ok) { setError(v.reason); return; }
      name = customInput.trim();
    }
    setBusy(true);
    // For random mode the name argument is ignored by the server (and
    // the API client doesn't even send it).
    const result = await renamePlanet(telegramId, planet.id, tab, name);
    setBusy(false);
    if (!result.ok) {
      if (result.code === "insufficient_stardust" && typeof result.have === "number" && typeof result.need === "number") {
        setError(t("rename.notEnough", { have: result.have, need: result.need }));
      } else {
        setError(result.error);
      }
      return;
    }
    // Notify the parent so the local state + stardust counter refresh
    // immediately. For random mode show a 1.5s reveal so the user sees
    // what they got; for custom mode close right away (they typed it).
    onRenamed(planet.id, result.displayName, result.stardustBalance);
    if (tab === "random") {
      setRevealedName(result.displayName);
      setTimeout(() => onClose(), 1500);
    } else {
      onClose();
    }
  };

  const cost = tab === "random" ? RENAME_RANDOM_COST : RENAME_CUSTOM_COST;
  const customValidation = tab === "custom" ? validateCustomNameClient(customInput) : { ok: true as const };
  const submitDisabled = busy || !!revealedName || (tab === "custom" && !customValidation.ok);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm mx-4 rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, #0c1432 0%, #060a1c 100%)",
          border: "1px solid rgba(0,242,254,0.25)",
          boxShadow: "0 0 40px rgba(0,242,254,0.15)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-black tracking-wider" style={{ color: "#00f2fe" }}>
            {t("rename.title")}
          </div>
          <button
            onClick={() => { if (!busy) onClose(); }}
            disabled={busy}
            className="text-xs font-bold px-2 py-1 rounded-md"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            ✕
          </button>
        </div>

        <div className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>{t("rename.currently")}</div>
        <div className="text-base font-black mb-4" style={{ color: "#fff" }}>{currentName}</div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTab("random"); setError(null); }}
            className="flex-1 py-2 rounded-lg text-xs font-black tracking-wide"
            style={{
              background: tab === "random" ? "rgba(0,242,254,0.2)" : "rgba(255,255,255,0.05)",
              color: tab === "random" ? "#00f2fe" : "rgba(255,255,255,0.5)",
              border: tab === "random" ? "1px solid rgba(0,242,254,0.5)" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {t("rename.tab.random")} · ★ {RENAME_RANDOM_COST}
          </button>
          <button
            onClick={() => { setTab("custom"); setError(null); }}
            className="flex-1 py-2 rounded-lg text-xs font-black tracking-wide"
            style={{
              background: tab === "custom" ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.05)",
              color: tab === "custom" ? "#ffd700" : "rgba(255,255,255,0.5)",
              border: tab === "custom" ? "1px solid rgba(255,215,0,0.5)" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {t("rename.tab.custom")} · ★ {RENAME_CUSTOM_COST}
          </button>
        </div>

        {tab === "random" ? (
          <div className="mb-4">
            <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
              {revealedName ? t("rename.youGot") : t("rename.randomLabel")}
            </div>
            <div
              className="rounded-lg p-3 text-center"
              style={{ background: "rgba(0,242,254,0.08)", border: "1px solid rgba(0,242,254,0.2)" }}
            >
              <div className="text-lg font-black" style={{ color: "#fff" }}>
                {revealedName ?? "★ ? ? ?"}
              </div>
            </div>
            {!revealedName && (
              <div className="text-xs mt-2 text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t("rename.galaxyHint")}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
              {t("rename.customHint", { n: RENAME_MAX_LEN })}
            </div>
            <input
              type="text"
              value={customInput}
              onChange={(e) => { setCustomInput(e.target.value); setError(null); }}
              maxLength={RENAME_MAX_LEN + 8}
              placeholder={t("rename.placeholder")}
              className="w-full px-3 py-2 rounded-lg text-base font-black"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,215,0,0.3)",
                color: "#fff",
                outline: "none",
              }}
            />
            {!customValidation.ok && customInput.length > 0 && (
              <div className="text-xs mt-1" style={{ color: "#ff8a8a" }}>{customValidation.reason}</div>
            )}
          </div>
        )}

        {error && (
          <div
            className="rounded-lg p-2 mb-3 text-xs font-bold text-center"
            style={{ background: "rgba(255,82,82,0.1)", color: "#ff8a8a", border: "1px solid rgba(255,82,82,0.3)" }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitDisabled}
          className="w-full py-3 rounded-lg text-sm font-black tracking-wide"
          style={{
            background: submitDisabled ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00f2fe, #4facfe)",
            color: submitDisabled ? "rgba(255,255,255,0.3)" : "#03102e",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? t("rename.busy") : `${t("rename.confirm")} · ★ ${cost}`}
        </button>
      </div>
    </div>
  );
}
