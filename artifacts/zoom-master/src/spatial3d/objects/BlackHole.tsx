import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { MONO } from "../theme";

interface BlackHoleProps {
  onTap?: () => void;
  progress?: number;
  active?: boolean;
}

export function BlackHole({ onTap, progress = 0, active = true }: BlackHoleProps) {
  const coreRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const diskRef = useRef<Mesh>(null);

  useFrame((_, dt) => {
    if (ringRef.current) ringRef.current.rotation.z += dt * 0.4;
    if (diskRef.current) diskRef.current.rotation.z -= dt * 0.25;
    if (coreRef.current && active) {
      const s = 1 + Math.sin(Date.now() * 0.003) * 0.03;
      coreRef.current.scale.setScalar(s);
    }
  });

  const ringScale = 1 + progress * 0.35;

  return (
    <group position={[0, 0, 0]}>
      {/* Accretion disk */}
      <mesh ref={diskRef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[2.2, 0.06, 8, 64]} />
        <meshStandardMaterial color={MONO.mid} metalness={0.9} roughness={0.2} emissive={MONO.line} emissiveIntensity={0.15} />
      </mesh>
      {/* Progress ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} scale={ringScale}>
        <torusGeometry args={[1.55, 0.04, 8, 64, Math.max(0.05, progress) * Math.PI * 2]} />
        <meshStandardMaterial color={MONO.white} metalness={1} roughness={0.1} emissive={MONO.bright} emissiveIntensity={0.4} />
      </mesh>
      {/* Event horizon */}
      <mesh
        ref={coreRef}
        onClick={(e) => { e.stopPropagation(); onTap?.(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[0.85, 48, 48]} />
        <meshStandardMaterial color={MONO.bg} metalness={1} roughness={0} emissive={MONO.surface} emissiveIntensity={0.05} />
      </mesh>
      {/* Outer glow shell */}
      <mesh scale={1.15}>
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshBasicMaterial color={MONO.line} wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}
