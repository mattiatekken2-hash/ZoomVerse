import { RoundedBox, Text } from "@react-three/drei";
import { MONO } from "../theme";

interface SpatialPanelProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  title: string;
  subtitle?: string;
  onClick?: () => void;
}

export function SpatialPanel({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = 2.4,
  height = 0.9,
  title,
  subtitle,
  onClick,
}: SpatialPanelProps) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox
        args={[width, height, 0.12]}
        radius={0.06}
        smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={() => { if (onClick) document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <meshStandardMaterial color={MONO.panel} metalness={0.6} roughness={0.35} emissive={MONO.line} emissiveIntensity={0.1} />
      </RoundedBox>
      <Text position={[0, subtitle ? 0.12 : 0, 0.08]} fontSize={0.18} color={MONO.white} anchorX="center" anchorY="middle" maxWidth={width - 0.2}>
        {title}
      </Text>
      {subtitle && (
        <Text position={[0, -0.18, 0.08]} fontSize={0.11} color={MONO.mid} anchorX="center" anchorY="middle" maxWidth={width - 0.2}>
          {subtitle}
        </Text>
      )}
    </group>
  );
}
