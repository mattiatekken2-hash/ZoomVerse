/**
 * PlanetDetailModal — bottom-sheet detail (same style as THE SUN) when tapping a farm planet.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Planet } from "../hooks/useGameState";
import {
  REPAIR_STARDUST_COST,
  FARM_UPGRADE_COSTS,
  FARM_UPGRADE_TIERS,
  PLANET_CONFIG,
  getPlanetDisplayColors,
  isFarmActive,
  isFarmExpired,
  getFarmTimeRemaining,
  formatDuration,
} from "../hooks/useGameState";
import { getPlanetDisplayName } from "../utils/planetNames";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";

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
  onPvP?: (planet: Planet) => void;
  onUnlist?: (id: string) => void;
  onRepair?: (id: string) => { ok: boolean; reason?: string };
  onUpgradeDuration?: (planetId: string, durationHours: number) => Promise<{ ok: boolean; error?: string }>;
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "255, 215, 64";
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
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
  onPvP,
  onUnlist,
  onRepair,
  onUpgradeDuration,
}: Props) {
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [defectMsg, setDefectMsg] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const displayColors = getPlanetDisplayColors(planet);
  const accent = displayColors.color;
  const rgb = hexToRgb(accent);
  const durability = planet.durability ?? 100;
  const isListed = planet.isListedInMarket;
  const repairCost = REPAIR_STARDUST_COST[planet.name] ?? 500;
  const canRepair = stardustBalance >= repairCost;
  const currentDurationHours = planet.farmDurationHours ?? 1;
  const active = isFarmActive(planet);
  const expired = isFarmExpired(planet);
  const remaining = getFarmTimeRemaining(planet);
  const farmHours = planet.farmDurationHours ?? 1;
  const cfg = PLANET_CONFIG[planet.name];
  const rarityLabel = cfg?.label?.toUpperCase() ?? planet.name;

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

  const primaryLabel = (() => {
    if (durability <= 0) return "FROZEN — REPAIR";
    if (isListed) return "LISTED ON MARKET";
    if (active) return `FARMING · ${formatDuration(remaining)}`;
    if (expired) return "START / REACTIVATE";
    return "START FARMING";
  })();

  const primaryDisabled = durability <= 0 || isListed || (active && !expired);
  const slotsFull = planets.filter((p) => !p.isListedInMarket).length >= maxSlots;
  const pvpEligible = !planet.isFarmingActive && !isListed && planet.slotIndex == null && !slotsFull && !!telegramId;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(6,8,16,0.92)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8"
        style={{
          background: `linear-gradient(180deg, rgba(${rgb},0.14) 0%, rgba(8,10,18,0.98) 32%)`,
          border: `1px solid rgba(${rgb},0.28)`,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", color: `rgba(${rgb},0.65)` }}>
              {rarityLabel}
            </div>
            <div className="font-black text-xl" style={{ color: accent }}>
              {getPlanetDisplayName(planet)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex flex-col items-center gap-3">
          <PlanetVoxelThumb planet={planet} size={120} animate={false} suspendGl={false} />
          <div className="text-center text-xs font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
            +{planet.name === "MUSHROOM" ? "5 ★" : `${planet.rate.toLocaleString()} $ZOOM`}/hr · {farmHours}h cycle
          </div>

          {durability <= 0 && onRepair ? (
            <button
              type="button"
              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"
              disabled={!canRepair}
              onClick={handleRepair}
              style={{
                background: canRepair ? "linear-gradient(135deg, rgba(255,183,77,0.35), rgba(255,152,0,0.2))" : "rgba(255,255,255,0.06)",
                color: canRepair ? "#ffb347" : "rgba(255,255,255,0.35)",
                border: `1px solid ${canRepair ? "rgba(255,183,77,0.45)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              REPAIR · {repairCost.toLocaleString()} ★
            </button>
          ) : isListed && onUnlist ? (
            <button
              type="button"
              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"
              style={{
                background: `linear-gradient(135deg, rgba(${rgb},0.35), rgba(${rgb},0.15))`,
                color: accent,
                border: `1px solid rgba(${rgb},0.45)`,
              }}
              onClick={() => { onUnlist(planet.id); onClose(); }}
            >
              DELIST FROM MARKET
            </button>
          ) : (
            <button
              type="button"
              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"
              disabled={primaryDisabled}
              style={{
                background: primaryDisabled && active
                  ? `linear-gradient(135deg, rgba(${rgb},0.55), rgba(${rgb},0.28))`
                  : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: primaryDisabled && active ? "#fff" : "#1a1000",
                opacity: primaryDisabled && !active ? 0.45 : 1,
              }}
              onClick={handleStart}
            >
              {primaryLabel}
            </button>
          )}
        </div>

        {defectMsg && (
          <div
            className="mb-3 px-3 py-2 rounded-lg text-xs font-bold text-center"
            style={{ background: "rgba(255,82,82,0.15)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)" }}
          >
            {defectMsg}
          </div>
        )}

        {onUpgradeDuration && !isListed && planet.name !== "MUSHROOM" && (
          <div className="farm-panel-3d farm-panel-3d--static mb-3">
            <div className="farm-panel-3d__title">
              ⏱ CYCLE DURATION — {currentDurationHours}h · costs EARNED GRAM
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
              {FARM_UPGRADE_TIERS.map((hrs) => {
                const cost = FARM_UPGRADE_COSTS[hrs]!;
                const isCurrent = hrs === currentDurationHours;
                const canAfford = tonBalance >= cost;
                const tierDisabled = upgrading || isCurrent || !canAfford;
                return (
                  <button
                    key={hrs}
                    type="button"
                    disabled={tierDisabled}
                    onClick={async () => {
                      if (isCurrent || upgrading) return;
                      setUpgrading(true);
                      setUpgradeMsg(null);
                      const r = await onUpgradeDuration(planet.id, hrs);
                      setUpgrading(false);
                      setUpgradeMsg(r.ok ? `✓ Upgraded to ${hrs}h` : (r.error ?? "Failed"));
                    }}
                    className={`farm-btn-3d farm-btn-3d--tier${isCurrent ? " farm-btn-3d--current" : ""}${tierDisabled && !isCurrent ? " farm-btn-3d--disabled" : ""}`}
                  >
                    <div>{hrs}h</div>
                    {!isCurrent && <div>{cost} G</div>}
                    {isCurrent && <div>✓</div>}
                  </button>
                );
              })}
            </div>
            {upgradeMsg && (
              <div style={{ fontSize: 9, fontWeight: 700, color: upgradeMsg.startsWith("✓") ? "#00e676" : "#ff5252", textAlign: "center", marginTop: 6 }}>
                {upgradeMsg}
              </div>
            )}
          </div>
        )}

        {!isListed && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!pvpEligible}
              onClick={() => pvpEligible && onPvP?.(planet)}
              className={`farm-btn-3d py-3 text-xs font-black${pvpEligible ? "" : " farm-btn-3d--disabled"}`}
            >
              PvP
            </button>
            <button
              type="button"
              onClick={() => onSell(planet)}
              className="farm-btn-3d py-3 text-xs font-black"
            >
              Sell
            </button>
            <button
              type="button"
              onClick={handleBurn}
              className={`farm-btn-3d py-3 text-xs font-black${confirmBurn ? " farm-btn-3d--burn-confirm" : ""}`}
            >
              {confirmBurn ? "SURE?" : "Burn"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
