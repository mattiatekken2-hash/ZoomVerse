/**
 * PlanetDetailModal — full-screen overlay shown when the user taps a planet card.
 * Contains: large animated orb, stats, and all action buttons (PvP / Sell / Burn / Repair).
 * Repair button is shown ONLY when durability reaches 0%.
 */
import { useState } from "react";
import type { Planet } from "../hooks/useGameState";
import {
  PLANET_CONFIG,
  REPAIR_STARDUST_COST,
  isFarmActive,
  isFarmExpired,
  formatDuration,
  getFarmTimeRemaining,
  getPlanetFarmDurationMs,
  FARM_UPGRADE_COSTS,
  FARM_UPGRADE_TIERS,
} from "../hooks/useGameState";
import { PlanetOrb } from "./PlanetOrb";
import { getPlanetDisplayName } from "../utils/planetNames";
import { getDisplayFloat, isFloatablePlanet } from "../utils/planetFloat";
import { PlanetFloatBar } from "./PlanetFloatBar";

const RARITY_CLASS: Record<string, string> = {
  BASIC: "rarity-basic",
  RARE: "rarity-rare",
  EPIC: "rarity-epic",
  MYTHIC: "rarity-mythic",
  PLASMA: "rarity-plasma",
  GOLD: "rarity-gold",
  MUSHROOM: "rarity-gold",
  NOVA: "rarity-plasma",
  V1: "rarity-gold",
  V1_NFT: "rarity-gold",
};

interface Props {
  planet: Planet;
  telegramId: string | null;
  stardustBalance?: number;
  tonBalance?: number;
  maxSlots: number;
  planets: Planet[];
  onClose: () => void;
  onStartFarming: (id: string) => { ok: boolean; reason?: string };
  onBurn: (id: string) => void;
  onSell: (planet: Planet) => void;
  onUnlist?: (id: string) => void;
  onRepair?: (id: string) => { ok: boolean; reason?: string };
  onPvP?: (planet: Planet) => void;
  onRename?: (planet: Planet) => void;
  onUpgradeDuration?: (planetId: string, durationHours: number) => Promise<{ ok: boolean; error?: string }>;
}

export function PlanetDetailModal({
  planet,
  telegramId,
  stardustBalance = 0,
  tonBalance = 0,
  maxSlots,
  planets,
  onClose,
  onStartFarming,
  onBurn,
  onSell,
  onUnlist,
  onRepair,
  onPvP,
  onRename,
  onUpgradeDuration,
}: Props) {
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [defectMsg, setDefectMsg] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const cfg = PLANET_CONFIG[planet.name];
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const remaining = getFarmTimeRemaining(planet);
  const currentDurationHours = planet.farmDurationHours ?? 1;
  const currentDurationMs = getPlanetFarmDurationMs(planet);
  const planetFloat = isFloatablePlanet(planet) ? getDisplayFloat(planet) : undefined;
  const durability = planet.durability ?? 100;
  const dur = durability;
  const durColor = dur > 50 ? "#00e676" : dur > 20 ? "#ffb347" : "#ff5252";
  const isListed = planet.isListedInMarket;

  const repairCost = REPAIR_STARDUST_COST[planet.name] ?? 500;
  const canRepair = stardustBalance >= repairCost;

  // PvP eligibility
  const slotsFull = planets.filter((p) => !p.isListedInMarket).length >= maxSlots;
  const pvpEligible = !planet.isFarmingActive && !isListed && planet.slotIndex == null && !slotsFull && !!telegramId;

  // Telegram deep link to market listing
  const marketDeepLink = `https://t.me/ZoomVerse_bot/app?startapp=mkt_planet_${planet.id}`;

  const handleBurn = () => {
    if (!confirmBurn) {
      setConfirmBurn(true);
      setTimeout(() => setConfirmBurn(false), 2500);
    } else {
      onBurn(planet.id);
      onClose();
    }
  };

  const handleRepair = () => {
    if (!onRepair) return;
    const r = onRepair(planet.id);
    if (!r.ok) {
      setDefectMsg(r.reason ?? "Repair failed");
      setTimeout(() => setDefectMsg(null), 1800);
    } else {
      onClose();
    }
  };

  const handleStart = () => {
    const r = onStartFarming(planet.id);
    if (!r.ok) {
      setDefectMsg(r.reason ?? "Cannot start farming");
      setTimeout(() => setDefectMsg(null), 1800);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full rounded-3xl overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${planet.color}18 0%, rgba(6,8,16,0.97) 40%)`,
          border: `1px solid ${planet.color}33`,
          boxShadow: `0 0 60px ${planet.color}22, 0 20px 80px rgba(0,0,0,0.7)`,
          maxHeight: "88vh",
          maxWidth: 420,
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* Hero: planet orb + core info */}
        <div className="flex flex-col items-center px-5 pt-2 pb-4">
          <div style={{ position: "relative" }}>
            <PlanetOrb planet={planet} size={108} animate={active} displayFloat={planetFloat} />
            {active && (
              <div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full pulse-soft"
                style={{ background: "#00e676", boxShadow: "0 0 8px #00e676" }}
              />
            )}
            {expired && (
              <div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                style={{ background: "#ff5252", boxShadow: "0 0 8px #ff5252" }}
              />
            )}
          </div>

          {/* Planet name — tappable for rename */}
          <button
            type="button"
            onClick={() => onRename?.(planet)}
            disabled={!telegramId || isListed}
            className={`font-black text-xl tracking-wide mt-3 text-center ${RARITY_CLASS[planet.name] ?? ""}`}
            style={{ background: "transparent", border: 0, padding: 0, cursor: telegramId && !isListed ? "pointer" : "default" }}
          >
            {getPlanetDisplayName(planet)}
          </button>

          {/* Rarity badge */}
          <span
            className={`text-xs font-bold px-3 py-0.5 rounded-full border mt-1 ${RARITY_CLASS[planet.name] ?? ""}`}
            style={{ fontSize: 10 }}
          >
            {cfg?.label?.toUpperCase() ?? planet.name}
          </span>

          {/* Stats */}
          <div className="w-full mt-4 flex flex-col gap-2">
            {/* Rate */}
            <div className="flex justify-between text-xs">
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Production</span>
              <span style={{ color: planet.color, fontWeight: 800 }}>
                {planet.name === "MUSHROOM" ? "+5 ★ NFTSTAR/24h" : `+${planet.rate.toLocaleString()} $ZOOM/hr`}
              </span>
            </div>

            {/* Float — label+value on top row, bar below */}
            {typeof planetFloat === "number" && (
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>Float</span>
                  <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>
                    {planetFloat.toFixed(3)}
                  </span>
                </div>
                <PlanetFloatBar value={planetFloat} compact />
              </div>
            )}

            {/* Farming status */}
            <div className="flex justify-between text-xs">
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Status</span>
              <span style={{ fontWeight: 800, color: active ? "#00e676" : expired ? "#ff5252" : "rgba(255,255,255,0.4)" }}>
                {active ? `Farming — ${formatDuration(remaining)} left` : expired ? "Expired" : "Idle"}
              </span>
            </div>

            {/* Durability — always shown for NOVA/MUSHROOM, otherwise only when below 100% */}
            {(dur < 100 || planet.name === "NOVA" || planet.name === "MUSHROOM") && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>Durability</span>
                  <span style={{ fontWeight: 800, color: durColor }}>{dur}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${dur}%`, background: durColor, borderRadius: 3, transition: "width 0.4s" }} />
                </div>
              </div>
            )}

            {/* Listed info */}
            {isListed && (
              <div className="flex justify-between text-xs">
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Listed for</span>
                <span style={{ color: "#ffd700", fontWeight: 800 }}>{planet.marketPrice?.toLocaleString()} GRAM</span>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {defectMsg && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg text-xs font-bold text-center" style={{ background: "rgba(255,82,82,0.15)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)" }}>
            {defectMsg}
          </div>
        )}

        {/* Action buttons */}
        <div className="px-5 pb-8 flex flex-col gap-2.5">
          {/* Primary farm action */}
          {dur <= 0 ? (
            <div
              className="w-full py-3 rounded-xl text-sm font-black text-center"
              style={{ background: "rgba(255,82,82,0.07)", border: "1px solid rgba(255,82,82,0.3)", color: "#ff5252", cursor: "not-allowed" }}
            >
              ❄ FROZEN — Repair required
            </div>
          ) : active ? (
            <div
              className="w-full py-3 rounded-xl text-sm font-black text-center"
              style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.3)", color: "#00e676", cursor: "default" }}
            >
              FARMING · {formatDuration(remaining)} left
            </div>
          ) : expired ? (
            <button
              className="w-full py-3 rounded-xl text-sm font-black"
              style={{
                background: `linear-gradient(135deg, ${planet.color}33, ${planet.color}1a)`,
                border: `1px solid ${planet.color}66`,
                color: planet.color,
              }}
              onClick={handleStart}
            >
              REACTIVATE · 1 ★ Redstar
            </button>
          ) : !isListed ? (
            <button
              className="w-full py-3 rounded-xl text-sm font-black"
              style={{
                background: `linear-gradient(135deg, ${planet.color}33, ${planet.color}1a)`,
                border: `1px solid ${planet.color}66`,
                color: planet.color,
                boxShadow: `0 0 18px ${planet.color}22`,
              }}
              onClick={handleStart}
            >
              START FARM
            </button>
          ) : null}

          {/* REPAIR — only at durability = 0% */}
          {dur <= 0 && onRepair && (
            <button
              className="w-full py-3 rounded-xl text-sm font-black"
              disabled={!canRepair}
              onClick={handleRepair}
              style={{
                background: canRepair
                  ? "linear-gradient(135deg, rgba(255,183,77,0.22), rgba(255,152,0,0.12))"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${canRepair ? "rgba(255,183,77,0.5)" : "rgba(255,255,255,0.06)"}`,
                color: canRepair ? "#ffb347" : "rgba(255,255,255,0.2)",
                cursor: canRepair ? "pointer" : "not-allowed",
              }}
            >
              REPAIR · {repairCost.toLocaleString()} ⭐ Stardust
              {!canRepair && ` (need ${repairCost - stardustBalance} more)`}
            </button>
          )}

          {/* DELIST — only when planet is currently listed */}
          {isListed && onUnlist && (
            <button
              onClick={() => { onUnlist(planet.id); onClose(); }}
              className="w-full py-3 rounded-xl text-sm font-black"
              style={{
                background: "rgba(255,215,0,0.08)",
                border: "1px solid rgba(255,215,0,0.35)",
                color: "#ffd700",
              }}
            >
              ✕ DELIST from Market
            </button>
          )}

          {/* Secondary row: PvP + Sell/Burn */}
          {!isListed && (
            <div className="grid grid-cols-3 gap-2">
              {/* PvP */}
              <button
                disabled={!pvpEligible}
                onClick={() => pvpEligible && onPvP?.(planet)}
                className="py-2.5 rounded-xl text-xs font-black"
                style={{
                  background: pvpEligible ? "rgba(255,50,50,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${pvpEligible ? "rgba(255,50,50,0.45)" : "rgba(255,255,255,0.1)"}`,
                  color: pvpEligible ? "#ff6666" : "rgba(255,255,255,0.2)",
                  cursor: pvpEligible ? "pointer" : "not-allowed",
                  boxShadow: pvpEligible ? "0 0 10px rgba(255,50,50,0.2)" : "none",
                }}
              >
                ⚔ PvP
              </button>

              {/* Sell */}
              <button
                onClick={() => onSell(planet)}
                className="py-2.5 rounded-xl text-xs font-black"
                style={{
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.35)",
                  color: "#ffd700",
                }}
              >
                💰 Sell
              </button>

              {/* Burn */}
              <button
                onClick={handleBurn}
                className="py-2.5 rounded-xl text-xs font-black"
                style={{
                  background: confirmBurn ? "rgba(255,82,82,0.20)" : "rgba(255,82,82,0.07)",
                  border: `1px solid ${confirmBurn ? "rgba(255,82,82,0.7)" : "rgba(255,82,82,0.25)"}`,
                  color: confirmBurn ? "#ff5252" : "rgba(255,82,82,0.7)",
                }}
              >
                {confirmBurn ? "SURE?" : "🔥 Burn"}
              </button>
            </div>
          )}

          {/* ─── Farm Duration Upgrade ─── */}
          {onUpgradeDuration && !isListed && planet.name !== "MUSHROOM" && (
            <div style={{
              marginTop: 8,
              borderRadius: 12,
              border: "1px solid rgba(255,215,0,0.18)",
              background: "rgba(255,215,0,0.04)",
              padding: "10px 12px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,215,0,0.7)", letterSpacing: "0.07em", marginBottom: 8 }}>
                ⏱ FARM DURATION UPGRADE
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 6 }}>
                {FARM_UPGRADE_TIERS.map((hrs) => {
                  const cost = FARM_UPGRADE_COSTS[hrs]!;
                  const isCurrent = hrs === currentDurationHours;
                  const canAfford = tonBalance >= cost;
                  return (
                    <button
                      key={hrs}
                      disabled={upgrading || isCurrent || !canAfford}
                      onClick={async () => {
                        if (isCurrent || upgrading) return;
                        setUpgrading(true);
                        setUpgradeMsg(null);
                        const r = await onUpgradeDuration(planet.id, hrs);
                        setUpgrading(false);
                        setUpgradeMsg(r.ok ? `✓ Upgraded to ${hrs}h` : (r.error ?? "Failed"));
                      }}
                      style={{
                        padding: "5px 2px",
                        borderRadius: 8,
                        border: `1px solid ${isCurrent ? "rgba(0,230,118,0.5)" : canAfford ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.07)"}`,
                        background: isCurrent ? "rgba(0,230,118,0.12)" : canAfford ? "rgba(255,215,0,0.07)" : "rgba(255,255,255,0.03)",
                        color: isCurrent ? "#00e676" : canAfford ? "#ffd700" : "rgba(255,255,255,0.2)",
                        fontSize: 9,
                        fontWeight: 900,
                        cursor: isCurrent || !canAfford ? "default" : "pointer",
                        textAlign: "center",
                        lineHeight: 1.3,
                      }}
                    >
                      <div>{hrs}h</div>
                      <div style={{ fontWeight: 700, fontSize: 8, opacity: 0.8 }}>{isCurrent ? "●" : `${cost}G`}</div>
                    </button>
                  );
                })}
              </div>
              {upgradeMsg && (
                <div style={{ fontSize: 9, fontWeight: 700, color: upgradeMsg.startsWith("✓") ? "#00e676" : "#ff5252", textAlign: "center" }}>
                  {upgradeMsg}
                </div>
              )}
              {!upgradeMsg && (
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                  Current: {currentDurationHours}h · Balance: {tonBalance.toFixed(2)} GRAM
                </div>
              )}
            </div>
          )}

          {/* Telegram market link */}
          <a
            href={marketDeepLink}
            target="_blank"
            rel="noreferrer"
            className="w-full py-2.5 rounded-xl text-xs font-black text-center"
            style={{
              background: "rgba(80,160,255,0.08)",
              border: "1px solid rgba(80,160,255,0.28)",
              color: "rgba(80,160,255,0.9)",
              display: "block",
            }}
          >
            🔗 View in Telegram Market
          </a>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-black"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.45)",
              marginTop: 2,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
