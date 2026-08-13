import { Text, RoundedBox } from "@react-three/drei";
import { MONO } from "../theme";

interface GenericSceneProps {
  title: string;
  subtitle?: string;
}

/** Placeholder spatial zone — 3D frame for tabs that still use HTML overlay. */
export function GenericScene3D({ title, subtitle }: GenericSceneProps) {
  return (
    <group>
      <RoundedBox args={[5, 3.2, 0.15]} radius={0.08} position={[0, 0.5, -0.5]}>
        <meshStandardMaterial color={MONO.panel} metalness={0.5} roughness={0.4} transparent opacity={0.85} />
      </RoundedBox>
      <Text position={[0, 1.6, 0.2]} fontSize={0.28} color={MONO.white} anchorX="center">
        {title}
      </Text>
      {subtitle && (
        <Text position={[0, 1.1, 0.2]} fontSize={0.13} color={MONO.mid} anchorX="center" maxWidth={4}>
          {subtitle}
        </Text>
      )}
      {/* Depth grid floor */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[(i - 6) * 0.5, -1.2, -2 - (i % 3) * 0.3]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.02, 0.02, 4]} />
          <meshBasicMaterial color={MONO.line} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}
