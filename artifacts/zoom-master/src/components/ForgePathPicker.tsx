import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  LAB_STARDUST_SHAPE_IDS,
  LAB_ZOOM_SHAPE_IDS,
  LAB_STARDUST_FORGE_ZOOM_COST,
  LAB_ZOOM_FORGE_STARDUST_COST,
  type LabForgePath,
} from "@workspace/game-models";
import { LabForgeGlbCycler } from "./LabForgeGlbCycler";
import { preloadLabForgePickerGlbs } from "../utils/labGlbPreload";

interface ForgePathPickerProps {
  stardustBalance: number;
  zoomBalance: number;
  onSelect: (path: LabForgePath) => void;
  onClose: () => void;
}

interface PathCardProps {
  path: LabForgePath;
  shapeIds: readonly string[];
  badge: string;
  name: string;
  costLabel: string;
  yieldLabel: string;
  enabled: boolean;
  accent: string;
  border: string;
  bgA: string;
  glow: string;
  badgeBg: string;
  studioGlow: string;
  onSelect: (path: LabForgePath) => void;
}

function PathCard({
  path,
  shapeIds,
  badge,
  name,
  costLabel,
  yieldLabel,
  enabled,
  accent,
  border,
  bgA,
  glow,
  badgeBg,
  studioGlow,
  onSelect,
}: PathCardProps) {
  return (
    <button
      type="button"
      onClick={() => enabled && onSelect(path)}
      disabled={!enabled}
      className={`lab-forge-path-card lab-forge-path-card--${path}${enabled ? "" : " lab-forge-path-card--disabled"}`}
      style={{
        ["--lab-path-accent" as string]: accent,
        ["--lab-path-border" as string]: border,
        ["--lab-path-bg-a" as string]: bgA,
        ["--lab-path-glow" as string]: glow,
        ["--lab-path-badge-bg" as string]: badgeBg,
      }}
    >
      <div className="lab-forge-path-card__inner">
        <div className="lab-forge-path-card__glow" aria-hidden />
        <span className="lab-forge-path-card__badge">{badge}</span>
        <div className="lab-forge-path-card__stage">
          <LabForgeGlbCycler
            shapeIds={shapeIds}
            size={104}
            variant="picker"
            studioGlow={studioGlow}
          />
        </div>
        <div className="lab-forge-path-card__name">{name}</div>
        <div className="lab-forge-path-card__meta">
          <span className="lab-forge-path-chip">{costLabel}</span>
          <span className="lab-forge-path-chip">{yieldLabel}</span>
        </div>
      </div>
    </button>
  );
}

function ForgePathPickerBase({
  stardustBalance,
  zoomBalance,
  onSelect,
  onClose,
}: ForgePathPickerProps) {
  const canZoom = stardustBalance >= LAB_ZOOM_FORGE_STARDUST_COST;
  const canStardust = zoomBalance >= LAB_STARDUST_FORGE_ZOOM_COST;

  useEffect(() => {
    preloadLabForgePickerGlbs();
  }, []);

  return createPortal(
    <div className="lab-forge-picker-overlay" role="dialog" aria-modal="true" aria-label="Choose forge model">
      <button
        type="button"
        className="lab-forge-picker-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="lab-forge-picker-anchor">
        <div className="lab-forge-picker-sheet">
          <div className="lab-forge-picker-top">
            <div className="lab-forge-picker-head">
              <span className="lab-forge-picker-kicker">Lab · Generator</span>
              <button
                type="button"
                onClick={onClose}
                className="lab-forge-picker-close"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="lab-forge-picker-title">Choose your model</div>
            <div className="lab-forge-picker-dual" aria-hidden>
              <span className="lab-forge-picker-dual__zoom">$ZOOM</span>
              <span className="lab-forge-picker-dual__sep" />
              <span className="lab-forge-picker-dual__star">★ STARDUST</span>
            </div>
          </div>

          <div className="lab-forge-picker-grid">
            <PathCard
              path="zoom"
              shapeIds={LAB_ZOOM_SHAPE_IDS}
              badge="$ZOOM"
              name="Pizza · Flower · Dollar"
              costLabel={`${LAB_ZOOM_FORGE_STARDUST_COST} ★`}
              yieldLabel="2.6–4.2 /h"
              enabled={canZoom}
              accent="#7bed9f"
              border="rgba(123,237,159,0.38)"
              bgA="rgba(46,213,115,0.14)"
              glow="rgba(46,213,115,0.22)"
              badgeBg="rgba(46,213,115,0.12)"
              studioGlow="#2ed573"
              onSelect={onSelect}
            />
            <PathCard
              path="stardust"
              shapeIds={LAB_STARDUST_SHAPE_IDS}
              badge="★ STARDUST"
              name="Street Scene · Island Home · Pot"
              costLabel={`${LAB_STARDUST_FORGE_ZOOM_COST} $ZOOM`}
              yieldLabel="0.20–0.28 ★/h"
              enabled={canStardust}
              accent="#ffd740"
              border="rgba(255,215,64,0.38)"
              bgA="rgba(255,193,7,0.12)"
              glow="rgba(255,215,64,0.2)"
              badgeBg="rgba(255,193,7,0.1)"
              studioGlow="#ffc107"
              onSelect={onSelect}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const ForgePathPicker = memo(ForgePathPickerBase);
