import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Grid, PerspectiveCamera } from "@react-three/drei";
import { MONO, TAB_CAMERA } from "./theme";
import { LabScene3D, type LabSceneProps } from "./scenes/LabScene3D";
import { FarmScene3D, type FarmSceneProps } from "./scenes/FarmScene3D";
import { GenericScene3D } from "./scenes/GenericScene3D";
import type { Planet } from "../hooks/useGameState";

export type SpatialTab = "lab" | "home" | "farm" | "market" | "earn" | "pvp" | "rank" | "shop" | "wallet";

export interface SpatialExperienceProps {
  tab: SpatialTab;
  lab: LabSceneProps;
  farm: FarmSceneProps;
  onSelectFarmPlanet?: (planet: Planet) => void;
}

function TabCamera({ tab }: { tab: SpatialTab }) {
  const { camera } = useThree();
  useEffect(() => {
    const [x, y, z] = TAB_CAMERA[tab] ?? TAB_CAMERA.lab;
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }, [tab, camera]);
  return null;
}

function SceneContent({ tab, lab, farm, onSelectFarmPlanet }: SpatialExperienceProps) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow color={MONO.white} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} color={MONO.mid} />
      <pointLight position={[0, 0, 2]} intensity={0.5} color={MONO.bright} />

      <Stars radius={80} depth={40} count={1200} factor={3} saturation={0} fade speed={0.4} />
      <Grid
        args={[30, 30]}
        cellSize={0.6}
        cellThickness={0.4}
        cellColor={MONO.line}
        sectionSize={3}
        sectionThickness={0.8}
        sectionColor={MONO.muted}
        fadeDistance={22}
        fadeStrength={1.5}
        infiniteGrid
        position={[0, -1.5, 0]}
      />

      {tab === "lab" && <LabScene3D {...lab} />}
      {tab === "farm" && <FarmScene3D {...farm} onSelectPlanet={onSelectFarmPlanet} />}
      {tab === "market" && <GenericScene3D title="MARKET" subtitle="3D listings · tap overlay to trade" />}
      {tab === "earn" && <GenericScene3D title="EARN" subtitle="Missions & daily streak" />}
      {tab === "rank" && <GenericScene3D title="RANK" subtitle="Season leaderboard in space" />}
      {tab === "pvp" && <GenericScene3D title="PVP" subtitle="Planet battles" />}
      {tab === "wallet" && <GenericScene3D title="WALLET" subtitle="Balances & TON" />}
      {tab === "shop" && <GenericScene3D title="SHOP" subtitle="Stardust & bundles" />}
      {tab === "home" && <GenericScene3D title="HOME" subtitle="Your pixel room" />}
    </>
  );
}

export function SpatialExperience(props: SpatialExperienceProps) {
  return (
    <div className="spatial-canvas-root" style={{ position: "absolute", inset: 0, zIndex: 0, background: MONO.bg }}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <color attach="background" args={[MONO.bg]} />
        <PerspectiveCamera makeDefault fov={50} near={0.1} far={200} position={[0, 1.2, 5.5]} />
        <Suspense fallback={null}>
          <TabCamera tab={props.tab} />
          <SceneContent {...props} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={3}
          maxDistance={14}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.1}
          rotateSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
