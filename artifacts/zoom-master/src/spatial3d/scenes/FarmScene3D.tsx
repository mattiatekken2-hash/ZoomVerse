import { useMemo, useState } from "react";
import { PlanetSphere3D } from "../objects/PlanetSphere3D";
import { Text } from "@react-three/drei";
import { MONO } from "../theme";
import type { Planet } from "../../hooks/useGameState";

export interface FarmSceneProps {
  planets: Planet[];
  maxSlots: number;
  onSelectPlanet?: (planet: Planet) => void;
}

function gridPosition(index: number, cols: number, spacing: number): [number, number, number] {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const x = (col - (cols - 1) / 2) * spacing;
  const z = (row - 1) * spacing * 0.85;
  return [x, 0, z];
}

export function FarmScene3D({ planets, maxSlots, onSelectPlanet }: FarmSceneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(planets.length, maxSlots, 1)))));
  const display = useMemo(() => planets.slice(0, maxSlots), [planets, maxSlots]);

  return (
    <group position={[0, -0.5, 0]}>
      <Text position={[0, 2.8, -1]} fontSize={0.2} color={MONO.white} anchorX="center">
        INVENTORY
      </Text>
      <Text position={[0, 2.45, -1]} fontSize={0.12} color={MONO.mid} anchorX="center">
        {`${planets.length} / ${maxSlots} planets`}
      </Text>
      {display.map((p, i) => (
        <PlanetSphere3D
          key={p.id}
          planetType={p.name}
          label={p.name.slice(0, 6)}
          position={gridPosition(i, cols, 1.35)}
          selected={selectedId === p.id}
          onSelect={() => {
            setSelectedId(p.id);
            onSelectPlanet?.(p);
          }}
        />
      ))}
      {/* Empty slot placeholders */}
      {Array.from({ length: Math.max(0, Math.min(maxSlots - display.length, 8)) }).map((_, j) => {
        const i = display.length + j;
        const pos = gridPosition(i, cols, 1.35);
        return (
          <mesh key={`empty-${i}`} position={pos}>
            <sphereGeometry args={[0.38, 16, 16]} />
            <meshBasicMaterial color={MONO.surface} wireframe />
          </mesh>
        );
      })}
    </group>
  );
}
