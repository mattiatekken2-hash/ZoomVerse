import { memo, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  LAB_STARDUST_SHAPE_IDS,
  LAB_ZOOM_SHAPE_IDS,
  LAB_STARDUST_FORGE_ZOOM_COST,
  LAB_ZOOM_FORGE_STARDUST_COST,
  type LabForgePath,
} from "@workspace/game-models";
import { LabForgeGlbCycler } from "./LabForgeGlbCycler";
import { ZoomCubeIcon } from "./ZoomCubeIcon";
import { preloadLabForgePickerGlbs } from "../utils/labGlbPreload";

function ZoomMark({ size = 13 }: { size?: number }) {
  return (
    <span className="lab-forge-zoom-mark">
      <ZoomCubeIcon size={size} />
      <span>ZOOM</span>
    </span>
  );
}

interface ForgePathPickerProps {
  stardustBalance: number;
  zoomBalance: number;
  holdOk: boolean;
  holdHint: string;
  holdCta: string;
  onHoldCta: () => void;
  onSelect: (path: LabForgePath) => void;
  onClose: () => void;
}

interface PathCardProps {
  path: LabForgePath;
  shapeIds: readonly string[];
  badge: string;
  name: string;
  costLabel: ReactNode;
  yieldLabel: string;
  enabled: boolean;
  accent: string;
  border: string;
  bgA: string;
  glow: string;
  badgeBg: string;
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
        <span className="lab-forge-path-card__badge">
          {path === "zoom" ? <ZoomMark size={11} /> : badge}
        </span>
        <div className="lab-forge-path-card__stage">
          <LabForgeGlbCycler
            shapeIds={shapeIds}
            size={104}
            variant="picker"
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
  holdOk,
  holdHint,
  holdCta,
  onHoldCta,
  onSelect,
  onClose,
}: ForgePathPickerProps) {
  const canZoom = holdOk && stardustBalance >= LAB_ZOOM_FORGE_STARDUST_COST;
  const canStardust = holdOk && zoomBalance >= LAB_STARDUST_FORGE_ZOOM_COST;

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
            <div className="lab-forge-picker-title-logo" aria-hidden>
              <ZoomCubeIcon size={22} />
            </div>
            <div className="lab-forge-picker-dual" aria-hidden>
              <span className="lab-forge-picker-dual__zoom">
                <ZoomMark size={12} />
              </span>
              <span className="lab-forge-picker-dual__sep" />
              <span className="lab-forge-picker-dual__star">★ STARDUST</span>
            </div>
            {!holdOk && (
              <button
                type="button"
                className="lab-forge-picker-hold"
                onClick={onHoldCta}
              >
                <span>{holdHint}</span>
                <span className="lab-forge-picker-hold__cta">{holdCta}</span>
              </button>
            )}
          </div>

          <div className="lab-forge-picker-grid">
            <PathCard
              path="zoom"
              shapeIds={LAB_ZOOM_SHAPE_IDS}
              badge="$ZOOM"
              name="Pizza · Creeper · Chest · Flower · Dollar"
              costLabel={`${LAB_ZOOM_FORGE_STARDUST_COST} ★`}
              yieldLabel="2.6–5.6 /h"
              enabled={canZoom}
              accent="#7bed9f"
              border="rgba(255,255,255,0.82)"
              bgA="rgba(10,11,16,1)"
              glow="rgba(255,255,255,0.08)"
              badgeBg="transparent"
              onSelect={onSelect}
            />
            <PathCard
              path="stardust"
              shapeIds={LAB_STARDUST_SHAPE_IDS}
              badge="★ STARDUST"
              name="Pot · Steve · Chicken · Onigiri · Island"
              costLabel={
                <span className="lab-forge-path-chip-zoom">
                  {LAB_STARDUST_FORGE_ZOOM_COST}{" "}
                  <ZoomMark size={11} />
                </span>
              }
              yieldLabel="0.20–0.42 ★/h"
              enabled={canStardust}
              accent="#ffd740"
              border="rgba(255,255,255,0.62)"
              bgA="rgba(10,11,16,1)"
              glow="rgba(255,255,255,0.06)"
              badgeBg="transparent"
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
