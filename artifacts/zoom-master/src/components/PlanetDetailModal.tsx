/**

 * PlanetDetailModal — compact inventory card widget when tapping a farm slot.

 */

import { useState } from "react";

import type { Planet } from "../hooks/useGameState";

import {

  REPAIR_STARDUST_COST,

  FARM_UPGRADE_COSTS,

  FARM_UPGRADE_TIERS,

} from "../hooks/useGameState";

import { FarmInventoryCard } from "./FarmInventoryCard";



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



  const durability = planet.durability ?? 100;

  const isListed = planet.isListedInMarket;

  const repairCost = REPAIR_STARDUST_COST[planet.name] ?? 500;

  const canRepair = stardustBalance >= repairCost;

  const currentDurationHours = planet.farmDurationHours ?? 1;



  const slotsFull = planets.filter((p) => !p.isListedInMarket).length >= maxSlots;

  const pvpEligible = !planet.isFarmingActive && !isListed && planet.slotIndex == null && !slotsFull && !!telegramId;



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

      className="fixed inset-0 z-50 flex items-center justify-center px-4"

      style={{ background: "rgba(4,6,12,0.88)", backdropFilter: "blur(6px)" }}

      onClick={(e) => e.target === e.currentTarget && onClose()}

    >

      <div

        className="flex flex-col items-center gap-3"

        style={{ maxWidth: 292, width: "100%" }}

        onClick={(e) => e.stopPropagation()}

      >

        <FarmInventoryCard

          planet={planet}

          variant="compact"

          suspendGl={false}

          onRename={telegramId && !isListed ? () => onRename?.(planet) : undefined}

          onStartFarm={handleStart}

          onUnlist={onUnlist ? () => { onUnlist(planet.id); onClose(); } : undefined}

        />



        {defectMsg && (

          <div

            className="w-full px-3 py-2 rounded-lg text-xs font-bold text-center"

            style={{ background: "rgba(255,82,82,0.15)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)" }}

          >

            {defectMsg}

          </div>

        )}



        {durability <= 0 && onRepair && (

          <button

            type="button"

            className="w-full py-2.5 rounded-xl text-xs font-black"

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



        {!isListed && (

          <div className="grid grid-cols-3 gap-2 w-full">

            <button

              type="button"

              disabled={!pvpEligible}

              onClick={() => pvpEligible && onPvP?.(planet)}

              className={`farm-btn-3d py-2 text-xs font-black${pvpEligible ? "" : " farm-btn-3d--disabled"}`}

            >

              ⚔ PvP

            </button>

            <button

              type="button"

              onClick={() => onSell(planet)}

              className="farm-btn-3d py-2 text-xs font-black"

            >

              💰 Sell

            </button>

            <button

              type="button"

              onClick={handleBurn}

              className={`farm-btn-3d py-2 text-xs font-black${confirmBurn ? " farm-btn-3d--burn-confirm" : ""}`}

            >

              {confirmBurn ? "SURE?" : "🔥 Burn"}

            </button>

          </div>

        )}



        {onUpgradeDuration && !isListed && planet.name !== "MUSHROOM" && (

          <div className="farm-panel-3d w-full">

            <div className="farm-panel-3d__title">

              ⏱ FARM DURATION

            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>

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

                    <div>{isCurrent ? "●" : `${cost}G`}</div>

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



        <button

          type="button"

          onClick={onClose}

          className="w-full py-2 rounded-xl text-xs font-black"

          style={{

            background: "rgba(255,255,255,0.04)",

            border: "1px solid rgba(255,255,255,0.1)",

            color: "rgba(255,255,255,0.45)",

          }}

        >

          Close

        </button>

      </div>

    </div>

  );

}


