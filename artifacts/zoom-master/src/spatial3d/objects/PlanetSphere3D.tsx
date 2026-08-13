import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { Text } from "@react-three/drei";
import { MONO, rarityShade } from "../theme";

interface PlanetSphere3DProps {
  planetType: string;
  label?: string;
  position?: [number, number, number];
  scale?: number;
  selected?: boolean;
  onSelect?: () => void;
}

export function PlanetSphere3D({
  planetType,
  label,
  position = [0, 0, 0],
  scale = 1,
  selected = false,
  onSelect,
}: PlanetSphere3DProps) {
  const ref = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const shade = rarityShade(planetType);
  const gray = MONO.bright;
  const dark = `rgb(${Math.floor(shade * 180)},${Math.floor(shade * 180)},${Math.floor(shade * 180)})`;

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.35;
  });

  return (
    <group position={position} scale={scale * (selected ? 1.15 : hovered ? 1.08 : 1)}>
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[0.45, 32, 32]} />
        <meshStandardMaterial
          color={dark}
          metalness={0.85}
          roughness={0.25}
          emissive={gray}
          emissiveIntensity={selected ? 0.35 : hovered ? 0.2 : 0.08}
        />
      </mesh>
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.02, 8, 32]} />
          <meshBasicMaterial color={MONO.white} />
        </mesh>
      )}
      {label && (
        <Text position={[0, -0.75, 0]} fontSize={0.12} color={MONO.mid} anchorX="center" anchorY="top" maxWidth={1.2}>
          {label}
        </Text>
      )}
    </group>
  );
}
