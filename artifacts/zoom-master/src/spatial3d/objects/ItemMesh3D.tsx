import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { MONO, rarityShade } from "../theme";
import type { MeshShape } from "../../utils/season3Forge";

interface ItemMesh3DProps {
  itemType?: string;
  meshShape?: MeshShape | string;
  rarity?: string;
  scale?: number;
  animate?: boolean;
}

function shadeForRarity(rarity?: string): number {
  if (!rarity) return 0.55;
  return rarityShade(rarity);
}

export function ItemMesh3D({
  itemType,
  meshShape = "box",
  rarity,
  scale = 1,
  animate = true,
}: ItemMesh3DProps) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const shade = shadeForRarity(rarity ?? itemType);
  const gray = Math.floor(shade * 220);
  const color = `rgb(${gray},${gray},${gray})`;

  useFrame((_, dt) => {
    if (!animate || !groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.55;
    groupRef.current.rotation.x = Math.sin(Date.now() * 0.001) * 0.12;
  });

  const shape = meshShape as MeshShape;

  return (
    <group ref={groupRef} scale={scale}>
      {shape === "box" && (
        <mesh ref={meshRef}>
          <boxGeometry args={[0.7, 0.5, 0.35]} />
          <meshStandardMaterial color={color} metalness={0.9} roughness={0.2} emissive={MONO.bright} emissiveIntensity={0.12} />
        </mesh>
      )}
      {shape === "cylinder" && (
        <mesh ref={meshRef}>
          <cylinderGeometry args={[0.45, 0.45, 0.18, 32]} />
          <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} emissive={MONO.mid} emissiveIntensity={0.1} />
        </mesh>
      )}
      {shape === "cone" && (
        <mesh ref={meshRef}>
          <coneGeometry args={[0.4, 0.75, 24]} />
          <meshStandardMaterial color={color} metalness={0.88} roughness={0.22} emissive={MONO.white} emissiveIntensity={0.15} />
        </mesh>
      )}
      {shape === "disc" && (
        <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.08, 32]} />
          <meshStandardMaterial color={color} metalness={0.95} roughness={0.15} emissive={MONO.bright} emissiveIntensity={0.18} />
        </mesh>
      )}
      {shape === "torus" && (
        <mesh ref={meshRef}>
          <torusGeometry args={[0.35, 0.12, 16, 32]} />
          <meshStandardMaterial color={color} metalness={0.92} roughness={0.18} emissive={MONO.white} emissiveIntensity={0.2} />
        </mesh>
      )}
      {shape === "octahedron" && (
        <mesh ref={meshRef}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color={color} metalness={0.93} roughness={0.12} emissive={MONO.white} emissiveIntensity={0.25} flatShading />
        </mesh>
      )}
      {shape === "board" && (
        <group>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.9, 0.12, 0.28]} />
            <meshStandardMaterial color={color} metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0.32, -0.08, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.16, 12]} />
            <meshStandardMaterial color={MONO.mid} metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}
