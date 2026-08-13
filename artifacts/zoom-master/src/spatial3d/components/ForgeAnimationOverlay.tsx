import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { Text } from "@react-three/drei";
import { PlanetSphere3D } from "../objects/PlanetSphere3D";
import { ItemMesh3D } from "../objects/ItemMesh3D";
import { MONO, rarityShade } from "../theme";
import type { ForgeResultKind } from "../../utils/season3Forge";

export interface ForgeRevealData {
  kind: ForgeResultKind;
  planetType?: string;
  itemType?: string;
  meshShape?: string;
  label?: string;
  rarity?: string;
  rate?: number;
}

interface ForgeAnimationOverlayProps {
  active: boolean;
  reveal: ForgeRevealData | null;
  onComplete: () => void;
}

const PARTICLE_COUNT = 48;

function Particles({ phase, targetKind }: { phase: number; targetKind: ForgeResultKind | null }) {
  const groupRef = useRef<Group>(null);
  const seeds = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      radius: 1.2 + (i % 5) * 0.15,
      y: (Math.random() - 0.5) * 1.2,
      speed: 0.4 + Math.random() * 0.6,
      size: 0.04 + Math.random() * 0.05,
    }));
  }, []);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.3;
    groupRef.current.children.forEach((child, i) => {
      const seed = seeds[i];
      if (!seed) return;
      const t = Math.min(1, phase);
      const orbit = seed.radius * (1 - t * 0.85);
      const a = seed.angle + Date.now() * 0.001 * seed.speed;
      child.position.set(
        Math.cos(a) * orbit,
        seed.y * (1 - t),
        Math.sin(a) * orbit,
      );
      const mesh = child as Mesh;
      if (mesh.scale) {
        const s = seed.size * (1 + t * 0.5);
        mesh.scale.set(s, s, s);
      }
    });
  });

  return (
    <group ref={groupRef}>
      {seeds.map((seed, i) => (
        <mesh key={i}>
          <octahedronGeometry args={[seed.size, 0]} />
          <meshStandardMaterial
            color={MONO.bright}
            emissive={targetKind === "dust" ? MONO.muted : MONO.white}
            emissiveIntensity={0.4 + phase * 0.4}
            metalness={0.9}
            roughness={0.15}
          />
        </mesh>
      ))}
    </group>
  );
}

function ForgeScene({
  phase,
  reveal,
}: {
  phase: number;
  reveal: ForgeRevealData | null;
}) {
  const revealScale = Math.max(0, Math.min(1, (phase - 0.72) / 0.28));

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} color={MONO.white} />
      <pointLight position={[0, 0, 1]} intensity={0.6 + phase * 0.8} color={MONO.bright} />

      {phase < 0.85 && <Particles phase={phase} targetKind={reveal?.kind ?? null} />}

      {reveal?.kind === "planet" && reveal.planetType && revealScale > 0 && (
        <group scale={revealScale}>
          <PlanetSphere3D planetType={reveal.planetType} scale={1.4} />
        </group>
      )}
      {reveal?.kind === "item" && revealScale > 0 && (
        <group scale={revealScale}>
          <ItemMesh3D
            itemType={reveal.itemType}
            meshShape={reveal.meshShape}
            rarity={reveal.rarity}
            scale={1.3}
          />
        </group>
      )}
      {reveal?.kind === "dust" && phase > 0.75 && (
        <Text position={[0, 0, 0]} fontSize={0.35} color={MONO.mid} anchorX="center">
          STARDUST SCATTERED
        </Text>
      )}
    </>
  );
}

export function ForgeAnimationOverlay({ active, reveal, onComplete }: ForgeAnimationOverlayProps) {
  const [phase, setPhase] = useState(0);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      startRef.current = null;
      doneRef.current = false;
      return;
    }
    startRef.current = performance.now();
    doneRef.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const start = startRef.current ?? now;
      const elapsed = (now - start) / 1000;
      const p = Math.min(1, elapsed / 3.2);
      setPhase(p);
      if (p >= 1 && reveal && !doneRef.current) {
        doneRef.current = true;
        setTimeout(onComplete, reveal.kind === "planet" ? 400 : 1200);
        return;
      }
      if (p < 1 || !reveal) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reveal, onComplete]);

  if (!active) return null;

  const rarityLabel = reveal?.rarity ?? "";
  const shade = rarityShade(reveal?.planetType ?? reveal?.rarity);

  return (
    <div
      className="forge-overlay-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <div style={{ width: "100%", height: "55vh", maxHeight: 420 }}>
        <Canvas camera={{ position: [0, 0, 4], fov: 50 }} dpr={[1, 2]}>
          <Suspense fallback={null}>
            <ForgeScene phase={phase} reveal={reveal} />
          </Suspense>
        </Canvas>
      </div>

      <div className="forge-overlay-stats" style={{ textAlign: "center", padding: "0 24px", marginTop: 8 }}>
        {!reveal && (
          <div style={{ color: MONO.mid, fontWeight: 800, letterSpacing: "0.2em", fontSize: 12 }}>
            FORGING...
          </div>
        )}
        {reveal && phase > 0.7 && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.25em",
                color: `rgb(${Math.floor(shade * 255)},${Math.floor(shade * 255)},${Math.floor(shade * 255)})`,
                marginBottom: 8,
              }}
            >
              {rarityLabel}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: MONO.white, letterSpacing: "0.06em" }}>
              {reveal.label ?? (reveal.kind === "dust" ? "Nothing formed" : reveal.planetType ?? reveal.itemType)}
            </div>
            {typeof reveal.rate === "number" && reveal.rate > 0 && (
              <div style={{ fontSize: 13, color: MONO.mid, marginTop: 6, fontWeight: 700 }}>
                +{reveal.rate.toLocaleString()} ZOOM/hr
              </div>
            )}
            {reveal.kind !== "planet" && phase >= 1 && (
              <button
                type="button"
                onClick={onComplete}
                className="btn-craft s3-bw-btn"
                style={{ marginTop: 24, maxWidth: 280, width: "100%" }}
              >
                CONTINUE
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
