import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  buildSphereVoxels,
  dugVoxelColor,
  SPHERE_RADIUS,
  VOXEL_CUBE_SIZE,
  type SphereVoxel,
} from "./buildSphereVoxels";

export interface DugVoxelCoord {
  x: number;
  y: number;
  z: number;
  key: string;
}

export interface VoxelPlanetProps {
  className?: string;
  style?: CSSProperties;
  onVoxelDig?: (coord: DugVoxelCoord) => void;
}

function VoxelSphere({
  voxels,
  onDig,
}: {
  voxels: SphereVoxel[];
  onDig?: (coord: DugVoxelCoord) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [dug, setDug] = useState<Set<string>>(() => new Set());
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorScratch = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i]!;
      const isDug = dug.has(v.key);
      dummy.position.set(v.x * VOXEL_CUBE_SIZE, v.y * VOXEL_CUBE_SIZE, v.z * VOXEL_CUBE_SIZE);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colorScratch.set(isDug ? dugVoxelColor() : v.color);
      mesh.setColorAt(i, colorScratch);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [voxels, dug, dummy, colorScratch]);

  const handlePointer = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id == null || id < 0) return;
      const v = voxels[id];
      if (!v || dug.has(v.key)) return;
      setDug((prev) => {
        const next = new Set(prev);
        next.add(v.key);
        return next;
      });
      onDig?.({ x: v.x, y: v.y, z: v.z, key: v.key });
    },
    [voxels, dug, onDig],
  );

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, voxels.length]}
      frustumCulled={false}
      onClick={handlePointer}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <boxGeometry args={[VOXEL_CUBE_SIZE * 0.98, VOXEL_CUBE_SIZE * 0.98, VOXEL_CUBE_SIZE * 0.98]} />
      <meshStandardMaterial vertexColors roughness={0.76} metalness={0.04} flatShading />
    </instancedMesh>
  );
}

function VoxelPlanetScene({ onVoxelDig }: { onVoxelDig?: (coord: DugVoxelCoord) => void }) {
  const voxels = useMemo(() => buildSphereVoxels(SPHERE_RADIUS), []);
  const maxExtent = (SPHERE_RADIUS + 1) * VOXEL_CUBE_SIZE;

  return (
    <>
      <Stars radius={80} depth={40} count={1200} factor={3.5} saturation={0.15} fade speed={0.35} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[14, 18, 12]} intensity={1.2} />
      <directionalLight position={[-10, -6, -8]} intensity={0.28} color="#9ec5ff" />
      <VoxelSphere voxels={voxels} onDig={onVoxelDig} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        minDistance={maxExtent * 1.05}
        maxDistance={maxExtent * 3.8}
        rotateSpeed={0.9}
        zoomSpeed={0.85}
      />
    </>
  );
}

/** Interactive voxel sphere — tap cubes to dig, orbit + zoom. */
export function VoxelPlanet({ className, style, onVoxelDig }: VoxelPlanetProps) {
  const maxExtent = (SPHERE_RADIUS + 1) * VOXEL_CUBE_SIZE;

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        touchAction: "none",
        background: "radial-gradient(ellipse at 50% 35%, #0a1830 0%, #060810 45%, #020308 100%)",
        ...style,
      }}
      data-testid="voxel-planet"
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, maxExtent * 2.8], fov: 38, near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", display: "block", background: "transparent" }}
      >
        <Suspense fallback={null}>
          <VoxelPlanetScene onVoxelDig={onVoxelDig} />
        </Suspense>
      </Canvas>
    </div>
  );
}
