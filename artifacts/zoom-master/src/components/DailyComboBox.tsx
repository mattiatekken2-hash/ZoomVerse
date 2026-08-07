/**
 * DailyComboBox — Shown at the top of the Inventory / Planets tab.
 *
 * The combo rotates every 48 hours. The server provides 3 required planet
 * types. The user must have all 3 ACTIVELY FARMING simultaneously to claim
 * the reward (2 RedStar). Each slot shows a ✓ tick when the corresponding
 * planet type is currently farming.
 */
import { useEffect, useState, useMemo, memo } from "react";
import type { Planet } from "../hooks/useGameState";
import { PLANET_CONFIG, isFarmActive } from "../hooks/useGameState";

const API = `${window.location.origin}/api`;

interface ComboState {
  comboEpoch: number;
  required: string[];   // 3 PlanetType strings
  claimed: boolean;
  nextResetMs: number;
}

async function fetchCombo(telegramId: string): Promise<ComboState | null> {
  try {
    const r = await fetch(`${API}/combo/current?telegramId=${encodeURIComponent(telegramId)}`);
    if (!r.ok) return null;
    return await r.json() as ComboState;
  } catch { return null; }
}

async function claimCombo(telegramId: string): Promise<{ ok: boolean; newRedStarBalance?: number; error?: string } | null> {
  try {
    const r = await fetch(`${API}/combo/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    return await r.json() as { ok: boolean; newRedStarBalance?: number; error?: string };
  } catch { return null; }
}

function formatTimeLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  telegramId: string | null;
  planets: Planet[];
  onClaimed?: (newRedStarBalance: number) => void;
}

function DailyComboBoxBase({ telegramId, planets, onClaimed }: Props) {
  const [combo, setCombo] = useState<ComboState | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Fetch combo state from server
  useEffect(() => {
    if (!telegramId) return;
    void fetchCombo(telegramId).then((c) => {
      if (c) {
        setCombo(c);
        setTimeLeft(Math.max(0, c.nextResetMs - Date.now()));
      }
    });
    const interval = setInterval(() => {
      void fetchCombo(telegramId).then((c) => {
        if (c) setCombo(c);
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [telegramId]);

  // Countdown timer
  useEffect(() => {
    if (!combo) return;
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, combo.nextResetMs - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [combo]);

  // Determine which required types the user has ACTIVELY FARMING
  const activeFarmingTypes = useMemo(
    () => new Set(planets.filter((p) => isFarmActive(p)).map((p) => p.name)),
    [planets]
  );

  const slotStatuses = useMemo(() => {
    if (!combo) return [];
    return combo.required.map((type) => ({
      type,
      label: PLANET_CONFIG[type as keyof typeof PLANET_CONFIG]?.label ?? type,
      color: PLANET_CONFIG[type as keyof typeof PLANET_CONFIG]?.color ?? "#888",
      active: activeFarmingTypes.has(type as import("../hooks/useGameState").PlanetType),
    }));
  }, [combo, activeFarmingTypes]);

  const allActive = slotStatuses.length === 3 && slotStatuses.every((s) => s.active);
  const canClaim = allActive && !combo?.claimed && !justClaimed && !!telegramId;

  const handleClaim = async () => {
    if (!canClaim || !telegramId) return;
    setClaiming(true);
    const result = await claimCombo(telegramId);
    setClaiming(false);
    if (result?.ok) {
      setJustClaimed(true);
      setCombo((prev) => prev ? { ...prev, claimed: true } : prev);
      if (result.newRedStarBalance !== undefined) {
        onClaimed?.(result.newRedStarBalance);
      }
    }
  };

  if (!combo || !telegramId) return null;

  const claimed = combo.claimed || justClaimed;

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1.5px dashed rgba(255,215,0,0.35)",
        background: "linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(20,12,4,0.8) 100%)",
        padding: "14px 14px 12px",
        contain: "layout style paint",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: "0.07em", color: "#ffd700" }}>COMBO</span>
        </div>
        <div
          style={{
            background: claimed ? "rgba(0,230,118,0.15)" : "rgba(255,215,0,0.12)",
            border: `1px solid ${claimed ? "rgba(0,230,118,0.4)" : "rgba(255,215,0,0.35)"}`,
            borderRadius: 20,
            padding: "2px 10px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 900,
            color: claimed ? "#00e676" : "#ffd700",
          }}
        >
          {claimed ? (
            <>✓ CLAIMED</>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "#ff4444", textShadow: "0 0 6px rgba(255,68,68,0.7)" }}>★</span>
              2 Redstar
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: "0 0 10px", lineHeight: 1.5 }}>
        Have all 3 planets <strong style={{ color: "rgba(255,255,255,0.7)" }}>actively farming</strong> and claim 2 <span style={{ color: "#ff4444", fontWeight: 900 }}>★</span> Redstar!
        Changes every 48h.
      </p>

      {/* 3 slots */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {slotStatuses.map((slot, i) => (
          <div
            key={i}
            style={{
              background: slot.active
                ? `linear-gradient(135deg, ${slot.color}22 0%, ${slot.color}0d 100%)`
                : "rgba(255,255,255,0.04)",
              border: `1.5px solid ${slot.active ? slot.color + "66" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 12,
              padding: "10px 6px 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              position: "relative",
              transition: "border-color 0.3s, background 0.3s",
            }}
          >
            {/* Status dot in top-right */}
            <div
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: slot.active ? "#00e676" : "rgba(255,255,255,0.15)",
                boxShadow: slot.active ? "0 0 6px #00e676" : "none",
              }}
            />
            {/* Planet icon as colored box / emoji */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: slot.active ? slot.color + "33" : "rgba(255,255,255,0.06)",
                border: `1px solid ${slot.active ? slot.color + "55" : "rgba(255,255,255,0.1)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              🪐
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, color: slot.active ? slot.color : "rgba(255,255,255,0.35)", textAlign: "center", letterSpacing: "0.05em" }}>
              {slot.label.toUpperCase()}
            </span>
            {slot.active && (
              <span style={{ fontSize: 8, color: "#00e676", fontWeight: 900 }}>✓ ACTIVE</span>
            )}
          </div>
        ))}
      </div>

      {/* Claim / status */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          disabled={!canClaim || claiming}
          onClick={handleClaim}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 12,
            border: "none",
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: "0.06em",
            cursor: canClaim && !claiming ? "pointer" : "not-allowed",
            background: claimed
              ? "rgba(0,230,118,0.12)"
              : canClaim
              ? "linear-gradient(135deg, rgba(255,215,0,0.35) 0%, rgba(255,170,40,0.25) 100%)"
              : "rgba(255,255,255,0.05)",
            color: claimed ? "#00e676" : canClaim ? "#ffd700" : "rgba(255,255,255,0.2)",
            boxShadow: canClaim && !claimed ? "0 0 20px rgba(255,215,0,0.2)" : "none",
            transition: "all 0.2s",
          }}
        >
          {claiming ? "CLAIMING…" : claimed ? "✓ CLAIMED" : "🎁 CLAIM ALL"}
        </button>
        {/* Countdown */}
        {timeLeft > 0 && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, whiteSpace: "nowrap" }}>
            resets in<br />
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{formatTimeLeft(timeLeft)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const DailyComboBox = memo(DailyComboBoxBase);
