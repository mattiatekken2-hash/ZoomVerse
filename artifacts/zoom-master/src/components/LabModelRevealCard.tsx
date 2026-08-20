import type { Planet } from "../hooks/useGameState";
import { getPlanetDisplayColors } from "../hooks/useGameState";
import { FORGE_SPHERE_SHAPE_ID, LAB_STARDUST_POT_SHAPE_ID } from "@workspace/game-models";
import { LabForgeGlbThumb } from "./LabForgeGlbThumb";
import { ZoomCubeIcon } from "./ZoomCubeIcon";

interface LabModelRevealCardProps {
  planet: Planet;
  pathLabel: string;
}

/** Lab forge claim preview — GLB on forge grid, auto-spin. */
export function LabModelRevealCard({ planet, pathLabel }: LabModelRevealCardProps) {
  const colors = getPlanetDisplayColors(planet);
  const shapeId = planet.shapeId && planet.shapeId.length > 0 ? planet.shapeId : FORGE_SPHERE_SHAPE_ID;
  const title = planet.displayName ?? pathLabel;
  const isStardust = shapeId === LAB_STARDUST_POT_SHAPE_ID;
  const rateUnit = isStardust ? "★" : "$ZOOM";
  const rateValue = planet.rate >= 1
    ? planet.rate.toLocaleString()
    : String(planet.rate);
  const farmHours = planet.farmDurationHours ?? 1;
  const cycleTotal = Math.round(planet.rate * farmHours);

  return (
    <div
      className="lab-reveal-card"
      style={{
        ["--lab-reveal-accent" as string]: colors.color,
        ["--lab-reveal-border" as string]: `${colors.color}66`,
        ["--lab-reveal-glow" as string]: `${colors.color}33`,
        ["--lab-reveal-hero-a" as string]: `${colors.color}28`,
      }}
      data-testid="lab-reveal-model-card"
    >
      <div className="lab-reveal-card__hero">
        <div className="lab-reveal-card__kicker">
          <span className="lab-reveal-card__kicker-dot" aria-hidden />
          Forged · {pathLabel}
        </div>
        <div className="lab-reveal-card__stage">
          <div className="lab-reveal-card__stage-ring" aria-hidden />
          <LabForgeGlbThumb shapeId={shapeId} size={196} />
        </div>
      </div>

      <div className="lab-reveal-card__body">
        <div className="lab-reveal-card__title">{title}</div>
        <div className="lab-reveal-card__stats">
          <div className="lab-reveal-card__stat">
            <div className="lab-reveal-card__stat-label">/H</div>
            <div className="lab-reveal-card__stat-value inline-flex items-center justify-center gap-1">
              {!isStardust && <ZoomCubeIcon size={11} />}
              {rateValue} {rateUnit}
            </div>
          </div>
          <div className="lab-reveal-card__stat">
            <div className="lab-reveal-card__stat-label">CYCLE</div>
            <div className="lab-reveal-card__stat-value lab-reveal-card__stat-value--accent">
              {farmHours}h
            </div>
          </div>
          <div className="lab-reveal-card__stat">
            <div className="lab-reveal-card__stat-label">/CYCLE</div>
            <div className="lab-reveal-card__stat-value inline-flex items-center justify-center gap-1">
              {!isStardust && <ZoomCubeIcon size={11} />}
              {cycleTotal} {rateUnit}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
