/**

 * PlanetDetailModal — bottom-sheet detail when tapping a farm planet.

 */

import { useState, useEffect, type CSSProperties } from "react";

import { createPortal } from "react-dom";

import type { Planet } from "../hooks/useGameState";

import {

  REPAIR_STARDUST_COST,

  PLANET_CONFIG,

  getPlanetDisplayColors,

  isFarmActive,

  isFarmExpired,

  getFarmTimeRemaining,

  formatDuration,

  getPlanetFarmDurationHours,

} from "../hooks/useGameState";

import { getPlanetDisplayName } from "../utils/planetNames";

import { PlanetVoxelThumb } from "./PlanetVoxelThumb";

import { useT } from "../i18n/LanguageContext";

import { planetTypeLabel } from "../i18n/translations";

import { labForgeShapeHasGlbReveal, isLabStardustShapeId } from "@workspace/game-models";



interface Props {

  planet: Planet;

  telegramId: string | null;

  stardustBalance?: number;

  maxSlots: number;

  planets: Planet[];

  onClose: () => void;

  onStartFarming: (id: string) => { ok: boolean; reason?: string };

  onBurn: (id: string) => void;

  onSell: (planet: Planet) => void;

  onUnlist?: (id: string) => void;

  onRepair?: (id: string) => { ok: boolean; reason?: string };

}



function hexToRgb(hex: string): string {

  const h = hex.replace("#", "");

  if (h.length !== 6) return "255, 215, 64";

  const n = parseInt(h, 16);

  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;

}



function formatYieldAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function yieldUnit(planet: Planet): string {
  if (planet.name === "MUSHROOM" || isLabStardustShapeId(planet.shapeId)) return "★";
  return "$ZOOM";
}

function formatYieldPerHour(planet: Planet): string {
  if (planet.name === "MUSHROOM") return "5 ★";
  return `${formatYieldAmount(planet.rate)} ${yieldUnit(planet)}`;
}



export function PlanetDetailModal({

  planet,

  telegramId: _telegramId,

  stardustBalance = 0,

  maxSlots: _maxSlots,

  planets,

  onClose,

  onStartFarming,

  onBurn,

  onSell,

  onUnlist,

  onRepair,

}: Props) {

  const { t, lang } = useT();

  const [confirmBurn, setConfirmBurn] = useState(false);

  const [defectMsg, setDefectMsg] = useState<string | null>(null);

  const [detailGlReady, setDetailGlReady] = useState(false);



  const livePlanet = planets.find((p) => p.id === planet.id) ?? planet;
  void _maxSlots;
  void _telegramId;

  useEffect(() => {
    setDetailGlReady(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDetailGlReady(true));
    });
    const fallback = window.setTimeout(() => setDetailGlReady(true), 160);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
    };
  }, [livePlanet.id]);



  const displayColors = getPlanetDisplayColors(livePlanet);

  const accent = displayColors.color;

  const rgb = hexToRgb(accent);

  const durability = 100;

  const isListed = livePlanet.isListedInMarket;

  const repairCost = REPAIR_STARDUST_COST[livePlanet.name] ?? 500;

  const canRepair = stardustBalance >= repairCost;

  const farmHours = getPlanetFarmDurationHours(livePlanet);

  const active = isFarmActive(livePlanet);

  const expired = isFarmExpired(livePlanet);

  const remaining = getFarmTimeRemaining(livePlanet);

  const cfg = PLANET_CONFIG[livePlanet.name];

  const rarityLabel = (planetTypeLabel(lang, livePlanet.name, cfg?.label ?? livePlanet.name)).toUpperCase();

  const isLabGlbDetail = labForgeShapeHasGlbReveal(livePlanet.shapeId);

  const detailThumbSize = isLabGlbDetail ? 200 : 120;

  const yieldPerHour = formatYieldPerHour(livePlanet);

  const cycleTotal = livePlanet.name === "MUSHROOM"
    ? 5
    : livePlanet.rate * farmHours;
  const cycleTotalLabel = livePlanet.name === "MUSHROOM"
    ? "5 ★"
    : `${formatYieldAmount(cycleTotal)} ${yieldUnit(livePlanet)}`;



  const handleBurn = () => {

    if (!confirmBurn) {

      setConfirmBurn(true);

      setTimeout(() => setConfirmBurn(false), 2500);

    } else {

      onBurn(livePlanet.id);

      onClose();

    }

  };



  const handleRepair = () => {

    if (!onRepair) return;

    const r = onRepair(livePlanet.id);

    if (!r.ok) {

      setDefectMsg(r.reason ?? t("planetDetail.failed"));

      setTimeout(() => setDefectMsg(null), 1800);

    } else {

      onClose();

    }

  };



  const handleStart = () => {

    const r = onStartFarming(livePlanet.id);

    if (!r.ok) {

      setDefectMsg(r.reason ?? t("farm.cannotStartFarming"));

      setTimeout(() => setDefectMsg(null), 1800);

    }

  };



  const primaryLabel = (() => {

    if (durability <= 0) return t("planetDetail.frozenRepair");

    if (isListed) return t("planetDetail.listedMarket");

    if (active) return `${t("farm.farming")} · ${formatDuration(remaining)}`;

    if (expired) return t("planetDetail.startReactivate");

    return t("planetDetail.startFarming");

  })();



  const primaryDisabled = durability <= 0 || isListed || (active && !expired);



  const ghostBtn: CSSProperties = {

    flex: 1,

    padding: "10px 6px",

    borderRadius: 10,

    border: "1px solid rgba(255,255,255,0.1)",

    background: "rgba(255,255,255,0.03)",

    color: "rgba(255,255,255,0.72)",

    fontSize: 11,

    fontWeight: 800,

    letterSpacing: "0.06em",

    cursor: "pointer",

  };



  return createPortal(

    <div

      className="fixed inset-0 z-50 flex items-end justify-center"

      style={{ background: "rgba(6,8,16,0.92)" }}

      onClick={(e) => e.target === e.currentTarget && onClose()}

    >

      <div

        className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8"

        style={{

          background: `linear-gradient(180deg, rgba(${rgb},0.12) 0%, rgba(8,10,18,0.98) 28%)`,

          border: `1px solid rgba(${rgb},0.22)`,

          maxHeight: "88vh",

          overflowY: "auto",

        }}

        onClick={(e) => e.stopPropagation()}

      >

        <div className="flex items-center justify-between mb-3">

          <div>

            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", color: `rgba(${rgb},0.55)` }}>

              {rarityLabel}

            </div>

            <div className="font-black text-lg" style={{ color: accent }}>

              {getPlanetDisplayName(livePlanet)}

            </div>

          </div>

          <button

            type="button"

            onClick={onClose}

            className="text-xs font-bold px-3 py-1.5 rounded-full"

            style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}

          >

            {t("common.close")}

          </button>

        </div>



        <div className="mb-4 flex flex-col items-center gap-3">

          {detailGlReady ? (

          <PlanetVoxelThumb

            key={`detail-gl-${livePlanet.id}`}

            planet={livePlanet}

            size={detailThumbSize}

            animate

            eager

            suspendGl={false}

            showLabForgeGrid={isLabGlbDetail}

            labGlbInteractive={isLabGlbDetail}

          />

          ) : (

          <div style={{ width: detailThumbSize, height: detailThumbSize, flexShrink: 0 }} aria-hidden />

          )}



          <div

            style={{

              display: "flex",

              alignItems: "stretch",

              justifyContent: "center",

              gap: 0,

              width: "100%",

              maxWidth: 280,

              borderRadius: 14,

              border: "1px solid rgba(255,255,255,0.08)",

              background: "rgba(0,0,0,0.28)",

              overflow: "hidden",

            }}

          >

            <div style={{ flex: 1, padding: "10px 12px", textAlign: "center" }}>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.38)", marginBottom: 4 }}>

                /H

              </div>

              <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>

                {yieldPerHour}

              </div>

            </div>

            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />

            <div style={{ flex: 1, padding: "10px 12px", textAlign: "center" }}>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.38)", marginBottom: 4 }}>

                TIME

              </div>

              <div style={{ fontSize: 17, fontWeight: 900, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>

                {farmHours}h

              </div>

            </div>

            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />

            <div style={{ flex: 1, padding: "10px 12px", textAlign: "center" }}>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.38)", marginBottom: 4 }}>

                TOTAL

              </div>

              <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>

                {cycleTotalLabel}

              </div>

            </div>

          </div>



          {durability <= 0 && onRepair ? (

            <button

              type="button"

              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"

              disabled={!canRepair}

              onClick={handleRepair}

              style={{

                background: canRepair ? "rgba(255,183,77,0.18)" : "rgba(255,255,255,0.04)",

                color: canRepair ? "#ffb347" : "rgba(255,255,255,0.35)",

                border: `1px solid ${canRepair ? "rgba(255,183,77,0.35)" : "rgba(255,255,255,0.08)"}`,

              }}

            >

              {t("planetDetail.repairBtn", { n: repairCost.toLocaleString() })}

            </button>

          ) : isListed && onUnlist ? (

            <button

              type="button"

              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"

              style={{

                background: `rgba(${rgb},0.12)`,

                color: accent,

                border: `1px solid rgba(${rgb},0.35)`,

              }}

              onClick={() => { onUnlist(livePlanet.id); onClose(); }}

            >

              {t("planetDetail.delist")}

            </button>

          ) : (

            <button

              type="button"

              className="w-full max-w-xs py-3 rounded-xl text-xs font-black"

              disabled={primaryDisabled}

              style={{

                background: primaryDisabled && active

                  ? `rgba(${rgb},0.22)`

                  : `linear-gradient(135deg, ${accent}, ${accent}bb)`,

                color: primaryDisabled && active ? "#fff" : "#0a0a0f",

                opacity: primaryDisabled && !active ? 0.45 : 1,

                border: "none",

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

            style={{ background: "rgba(255,82,82,0.12)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.25)" }}

          >

            {defectMsg}

          </div>

        )}



        {!isListed && (

          <div style={{ display: "flex", gap: 8 }}>

            <button

              type="button"

              onClick={() => onSell(livePlanet)}

              style={ghostBtn}

            >

              {t("farm.sell")}

            </button>

            <button

              type="button"

              onClick={handleBurn}

              style={{

                ...ghostBtn,

                color: confirmBurn ? "#ff5252" : "rgba(255,255,255,0.72)",

                borderColor: confirmBurn ? "rgba(255,82,82,0.45)" : "rgba(255,255,255,0.1)",

                background: confirmBurn ? "rgba(255,82,82,0.1)" : "rgba(255,255,255,0.03)",

              }}

            >

              {confirmBurn ? t("planetDetail.sure") : t("planetDetail.burn")}

            </button>

          </div>

        )}

      </div>

    </div>,

    document.body,

  );

}


