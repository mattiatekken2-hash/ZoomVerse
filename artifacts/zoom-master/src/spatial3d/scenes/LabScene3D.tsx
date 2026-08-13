import { BlackHole } from "../objects/BlackHole";
import { SpatialPanel } from "../objects/SpatialPanel";
import { Text } from "@react-three/drei";
import { MONO } from "../theme";
import type { Planet } from "../../hooks/useGameState";

export interface LabSceneProps {
  taps: number;
  goal: number;
  balance: number;
  pendingPlanet: Planet | null;
  onCraft: () => void;
  onClaim: () => void;
}

export function LabScene3D({ taps, goal, balance, pendingPlanet, onCraft, onClaim }: LabSceneProps) {
  const progress = goal > 0 ? Math.min(1, taps / goal) : 0;

  return (
    <group>
      <BlackHole onTap={onCraft} progress={progress} active={!pendingPlanet} />
      <Text position={[0, 2.4, 0]} fontSize={0.22} color={MONO.white} anchorX="center">
        {`${Math.floor(balance).toLocaleString()} $ZOOM`}
      </Text>
      <Text position={[0, -2.2, 0]} fontSize={0.14} color={MONO.mid} anchorX="center">
        {pendingPlanet ? "PLANET READY" : `${taps} / ${goal} TAPS`}
      </Text>
      {pendingPlanet && (
        <SpatialPanel
          position={[0, -3.2, 0.5]}
          title="CLAIM PLANET"
          subtitle={pendingPlanet.name}
          onClick={onClaim}
        />
      )}
      {/* Floating craft panels — curved in space */}
      <SpatialPanel position={[-2.8, 0.5, 0.2]} rotation={[0, 0.35, 0]} title="FORGE" subtitle="Tap singularity" width={1.8} />
      <SpatialPanel position={[2.8, 0.5, 0.2]} rotation={[0, -0.35, 0]} title="EXCHANGE" subtitle="ZOOM ~ GRAM" width={1.8} />
    </group>
  );
}
