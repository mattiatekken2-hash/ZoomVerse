import { useMemo } from "react";
import type { Planet } from "../hooks/useGameState";
import { SUN_CONFIG } from "../hooks/useGameState";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";

/** Stable preview planet for THE SUN farm card (voxel forge sphere). */
const SUN_PREVIEW_PLANET = {
  id: "the-sun",
  name: "SUN",
  rate: SUN_CONFIG.rate,
  color: "#ffee58",
  glowColor: "#ffd700",
  createdAt: 0,
  farmStartedAt: 0,
  lastCollectedAt: 0,
  isListedInMarket: false,
  isFarmingActive: false,
  marketPrice: null,
  craftCost: 0,
  shapeId: "forge-sphere",
} as unknown as Planet;

export function SunFarmThumb({
  size,
  animate = true,
  suspendGl = false,
}: {
  size: number;
  animate?: boolean;
  suspendGl?: boolean;
}) {
  const planet = useMemo(() => SUN_PREVIEW_PLANET, []);
  return (
    <PlanetVoxelThumb
      planet={planet}
      size={size}
      animate={animate}
      suspendGl={suspendGl}
      glDelayMs={120}
      hiQuality={false}
    />
  );
}
