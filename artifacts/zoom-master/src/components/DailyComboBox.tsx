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
  required: string[];
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

function ComboGiftIcon({ size = 28, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden style={{ opacity }}>
      {/* Lid — top face */}
      <path
        d="M6 12.5 L16 7 L26 12.5 L16 18 Z"
        fill="rgba(255,255,255,0.14)"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Lid — left face */}
      <path
        d="M6 12.5 L16 18 V24.5 L6 19 Z"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* Lid — right face */}
      <path
        d="M26 12.5 L16 18 V24.5 L26 19 Z"
        fill="rgba(255,255,255,0.09)"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* Box — front left */}
      <path
        d="M6 19 L16 24.5 V29 L6 23.5 Z"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.48)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* Box — front right */}
      <path
        d="M26 19 L16 24.5 V29 L26 23.5 Z"
        fill="rgba(255,255,255,0.07)"
        stroke="rgba(255,255,255,0.58)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* Ribbon vertical */}
      <path d="M16 7 V29" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeLinecap="round" />
      {/* Ribbon horizontal on lid */}
      <path d="M6 12.5 L26 12.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
      {/* Bow left loop */}
      <path
        d="M16 6.5 C13.5 4.5 10.5 5.2 10.8 7.8 C11 9.5 13 10.2 16 8.8"
        fill="rgba(255,255,255,0.1)"
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Bow right loop */}
      <path
        d="M16 6.5 C18.5 4.5 21.5 5.2 21.2 7.8 C21 9.5 19 10.2 16 8.8"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Bow knot */}
      <circle cx="16" cy="8.2" r="1.1" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.9)" strokeWidth="0.8" />
    </svg>
  );
}

function ComboCubeIcon({ size = 28, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden style={{ opacity }}>
      <path
        d="M16 4L28 11v10L16 28 4 21V11L16 4z"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="1.4"
        fill="rgba(255,255,255,0.06)"
      />
      <path d="M16 4v24M4 11l12 7 12-7M4 21l12-7 12 7" stroke="rgba(255,255,255,0.42)" strokeWidth="1" />
      <path d="M16 11l8 4.5v9L16 29 8 24.5v-9L16 11z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
    </svg>
  );
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

  useEffect(() => {
    if (!combo) return;
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, combo.nextResetMs - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [combo]);

  const activeFarmingTypes = useMemo(
    () => new Set(planets.filter((p) => isFarmActive(p)).map((p) => p.name)),
    [planets],
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

  const activeCount = slotStatuses.filter((s) => s.active).length;
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
  const progressPct = Math.round((activeCount / 3) * 100);

  return (
    <div
      className="combo-box-relax"
      style={{
        borderRadius: 20,
        border: "1.5px dashed rgba(255,255,255,0.42)",
        background: "linear-gradient(165deg, rgba(255,255,255,0.07) 0%, rgba(18,20,28,0.92) 38%, rgba(8,9,14,0.96) 100%)",
        padding: "16px 16px 14px",
        contain: "layout style paint",
        boxShadow: `
          0 1px 0 rgba(255,255,255,0.12) inset,
          0 -1px 0 rgba(0,0,0,0.35) inset,
          0 12px 32px rgba(0,0,0,0.38),
          0 0 0 1px rgba(255,255,255,0.04)
        `,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)",
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.18) inset",
            }}
          >
            <ComboGiftIcon size={22} />
          </div>
          <span
            style={{
              fontWeight: 900,
              fontSize: 15,
              letterSpacing: "0.14em",
              color: "#ffffff",
              textShadow: "0 1px 0 rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.45)",
            }}
          >
            COMBO
          </span>
        </div>

        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%)",
            border: "1px solid rgba(255,255,255,0.28)",
            borderRadius: 999,
            padding: "4px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 800,
            color: claimed ? "#a8f0c8" : "rgba(255,255,255,0.88)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.12) inset",
          }}
        >
          {claimed ? (
            <>✓ CLAIMED</>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "#ff6b6b", textShadow: "0 0 8px rgba(255,80,80,0.45)" }}>★</span>
              2 Redstar
            </>
          )}
        </div>
      </div>

      {/* Progress bar — soft white 3D track */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10, fontWeight: 700 }}>
          <span style={{ color: "rgba(255,255,255,0.45)" }}>Progress</span>
          <span style={{ color: "rgba(255,255,255,0.82)", fontVariantNumeric: "tabular-nums" }}>
            {activeCount} / 3
            <span style={{ marginLeft: 6, color: "#ff6b6b" }}>★</span>
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.35) inset",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${claimed ? 100 : progressPct}%`,
              borderRadius: 999,
              background: claimed
                ? "linear-gradient(90deg, rgba(168,240,200,0.85), rgba(120,220,160,0.75))"
                : "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(210,215,225,0.75))",
              boxShadow: "0 0 12px rgba(255,255,255,0.25)",
              transition: "width 0.45s ease",
            }}
          />
        </div>
      </div>

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.52)", margin: "0 0 12px", lineHeight: 1.55 }}>
        Have all 3 planets <strong style={{ color: "rgba(255,255,255,0.82)", fontWeight: 800 }}>actively farming</strong> and claim 2{" "}
        <span style={{ color: "#ff6b6b", fontWeight: 900 }}>★</span> Redstar. Changes every 48h.
      </p>

      {/* 3 mystery slots — white 3D cubes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        {slotStatuses.map((slot, i) => {
          const revealed = slot.active || claimed;
          return (
            <div
              key={i}
              style={{
                background: revealed
                  ? `linear-gradient(160deg, rgba(255,255,255,0.1) 0%, ${slot.color}18 55%, rgba(0,0,0,0.35) 100%)`
                  : "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                border: `1.5px solid ${revealed ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"}`,
                borderRadius: 14,
                padding: "12px 8px 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                position: "relative",
                transition: "border-color 0.3s, background 0.3s, transform 0.25s",
                boxShadow: revealed
                  ? `0 6px 16px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.14) inset, 0 0 14px ${slot.color}22`
                  : "0 4px 14px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.1) inset",
              }}
            >
              {revealed && slot.active && (
                <div
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 7,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#7dffb0",
                    boxShadow: "0 0 8px rgba(125,255,176,0.75)",
                  }}
                />
              )}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "linear-gradient(145deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 100%)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 5px 14px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.15) inset",
                }}
              >
                {revealed ? (
                  <span style={{ fontSize: 22, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}>🪐</span>
                ) : (
                  <ComboCubeIcon size={30} opacity={0.75} />
                )}
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: revealed ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                  textAlign: "center",
                  letterSpacing: "0.08em",
                  textShadow: revealed ? "0 1px 4px rgba(0,0,0,0.35)" : undefined,
                }}
              >
                {revealed ? slot.label.toUpperCase() : "???"}
              </span>
              {slot.active && (
                <span style={{ fontSize: 8, color: "#a8f0c8", fontWeight: 900, letterSpacing: "0.06em" }}>✓ ACTIVE</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Claim row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!canClaim || claiming}
          onClick={handleClaim}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 14,
            border: claimed
              ? "1.5px solid rgba(168,240,200,0.45)"
              : canClaim
                ? "1.5px solid rgba(255,255,255,0.72)"
                : "1.5px solid rgba(255,255,255,0.22)",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: "0.12em",
            cursor: canClaim && !claiming ? "pointer" : "not-allowed",
            background: claimed
              ? "linear-gradient(180deg, rgba(168,240,200,0.12) 0%, rgba(0,0,0,0.2) 100%)"
              : canClaim
                ? "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.28) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.22) 100%)",
            color: claimed ? "#a8f0c8" : canClaim ? "#ffffff" : "rgba(255,255,255,0.28)",
            boxShadow: canClaim && !claimed
              ? "0 6px 20px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.2) inset, 0 0 24px rgba(255,255,255,0.08)"
              : "0 4px 12px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.08) inset",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.22s ease",
            textShadow: canClaim ? "0 1px 3px rgba(0,0,0,0.35)" : undefined,
          }}
        >
          <ComboCubeIcon size={16} opacity={canClaim || claimed ? 1 : 0.45} />
          {claiming ? "CLAIMING…" : claimed ? "✓ CLAIMED" : "CLAIM ALL"}
        </button>

        {timeLeft > 0 && (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.38)",
              fontWeight: 700,
              whiteSpace: "nowrap",
              textAlign: "right",
              lineHeight: 1.35,
            }}
          >
            resets in
            <br />
            <span style={{ color: "rgba(255,255,255,0.68)" }}>{formatTimeLeft(timeLeft)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const DailyComboBox = memo(DailyComboBoxBase);
