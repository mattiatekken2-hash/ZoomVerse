import type { Planet } from "../hooks/useGameState";
import { PlanetVoxelThumb } from "./PlanetVoxelThumb";

interface LabPlanet3DProps {
  color: string;
  accentColor?: string;
  size: number;
  progress?: number;
  onTap?: () => void;
  autoSpin?: boolean;
  rarity?: Planet["name"];
}

/** Lab 3D planet — voxel sphere with wireframe cube frame. */
export function LabPlanet3D({
  color,
  accentColor = color,
  size,
  autoSpin = true,
  rarity = "BASIC",
}: LabPlanet3DProps) {
  const previewPlanet = {
    id: "lab-planet-preview",
    name: rarity,
    rate: 1,
    color,
    glowColor: accentColor,
    createdAt: 0,
    farmStartedAt: 0,
    lastCollectedAt: 0,
    isListedInMarket: false,
    isFarmingActive: false,
    marketPrice: null,
    craftCost: 0,
    float: 0.5,
  } satisfies Planet;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        touchAction: "none",
      }}
      data-testid="lab-planet-3d"
    >
      <PlanetVoxelThumb planet={previewPlanet} size={size} animate={autoSpin} eager />
    </div>
  );
}
