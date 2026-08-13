import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { PlanetSphere3D } from "../objects/PlanetSphere3D";
import { ItemMesh3D } from "../objects/ItemMesh3D";
import { MONO } from "../theme";

export type Mesh3DKind = "planet" | "item";

export interface Mesh3DPreviewProps {
  kind: Mesh3DKind;
  planetType?: string;
  itemType?: string;
  meshShape?: string;
  rarity?: string;
  size?: number;
  animate?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

function Scene({
  kind,
  planetType,
  itemType,
  meshShape,
  rarity,
  animate,
  selected,
  onClick,
}: Omit<Mesh3DPreviewProps, "size">) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} color={MONO.white} castShadow />
      <directionalLight position={[-2, 1, -2]} intensity={0.3} color={MONO.mid} />
      {kind === "planet" && planetType && (
        <PlanetSphere3D
          planetType={planetType}
          scale={1}
          selected={selected}
          onSelect={onClick}
        />
      )}
      {kind === "item" && (
        <group onClick={onClick}>
          <ItemMesh3D
            itemType={itemType}
            meshShape={meshShape}
            rarity={rarity}
            scale={1}
            animate={animate}
          />
        </group>
      )}
    </>
  );
}

/** Inline 3D preview for HTML pages (Farm, Market, PVP, Lab). */
export function Mesh3DPreview({
  kind,
  planetType = "BASIC",
  itemType,
  meshShape,
  rarity,
  size = 60,
  animate = true,
  selected,
  onClick,
}: Mesh3DPreviewProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
        borderRadius: 12,
        overflow: "hidden",
        background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.85) 70%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.45)",
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 2.4], fov: 42 }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene
            kind={kind}
            planetType={planetType}
            itemType={itemType}
            meshShape={meshShape}
            rarity={rarity}
            animate={animate}
            selected={selected}
            onClick={onClick}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
