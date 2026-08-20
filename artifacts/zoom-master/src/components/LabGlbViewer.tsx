import { memo, useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getShapeGlbUrl, labForgeShapeHasGlbReveal } from "@workspace/game-models";
import {
  FARM_GLB_SPIN_RATE,
  LAB_GLB_FIT_SIZE,
  LAB_GLB_SPIN_RATE,
  addForgeSpaceGrid,
  addStudioAmbient,
  applyPathLineArt,
  disposeSceneObject,
  fitGlbToCenter,
} from "../utils/labGlbScene";

interface LabGlbViewerProps {
  shapeId: string;
  size: number;
  autoSpin?: boolean;
  /** card = bordered panel (picker/reveal); none = transparent embed (farm orb). */
  chrome?: "card" | "none";
  /** Forge space grid — off in farm slot cards and picker. */
  showGrid?: boolean;
  /** Hex glow (#rrggbb) for studio pedestal when grid is off. */
  studioGlow?: string;
  /** card chrome style — forge (default) or studio (picker). */
  stage?: "forge" | "studio";
  /** Drag to orbit (detail modal). */
  interactive?: boolean;
  /** Rad/frame auto-spin speed (defaults to lab rate). */
  spinRate?: number;
  onGlFailed?: () => void;
}

/**
 * Pure GLB preview — no procedural voxels/mesh parts.
 * Materials and geometry come straight from the .glb file.
 */
function LabGlbViewerBase({
  shapeId,
  size,
  autoSpin = true,
  chrome = "card",
  showGrid,
  studioGlow,
  stage = "forge",
  interactive = false,
  spinRate = LAB_GLB_SPIN_RATE,
  onGlFailed,
}: LabGlbViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onGlFailedRef = useRef(onGlFailed);
  onGlFailedRef.current = onGlFailed;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;
    if (!labForgeShapeHasGlbReveal(shapeId)) return;

    const glbUrl = getShapeGlbUrl(shapeId);
    if (!glbUrl) return;

    let disposed = false;
    let frameId = 0;
    let gridExtras: THREE.Object3D[] = [];
    let pmrem: THREE.PMREMGenerator | null = null;
    let envTex: THREE.Texture | null = null;
    const embedded = chrome === "none";
    const renderGrid = showGrid ?? (chrome === "card" && stage === "forge");
    const glowHex = parseStudioGlowHex(studioGlow);
    const floatIdle = stage === "studio" && !interactive;
    const floatStart = performance.now();

    const scene = new THREE.Scene();
    if (!embedded) {
      scene.background = stage === "studio"
        ? new THREE.Color(0x070910)
        : new THREE.Color(0x060810);
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    const spinGroup = new THREE.Group();
    scene.add(spinGroup);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: embedded,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      onGlFailedRef.current?.();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (embedded) {
      renderer.setClearColor(0x000000, 0);
    }
    mount.appendChild(renderer.domElement);

    let controls: OrbitControls | null = null;
    let dragging = false;
    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = true;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 0.75;
      controls.minDistance = LAB_GLB_FIT_SIZE * 1.15;
      controls.maxDistance = LAB_GLB_FIT_SIZE * 4.8;
      controls.target.set(0, 0, 0);
      controls.addEventListener("start", () => { dragging = true; });
      controls.addEventListener("end", () => { dragging = false; });
      renderer.domElement.style.touchAction = "none";
    } else {
      renderer.domElement.style.pointerEvents = "none";
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      cancelAnimationFrame(frameId);
      onGlFailedRef.current?.();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    scene.add(new THREE.AmbientLight(0xffffff, 0.48));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbee, 0.42);
    fill.position.set(-2.5, 1.2, -1.4);
    scene.add(fill);

    const draw = () => renderer.render(scene, camera);

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
        if (stage === "studio" && glowHex != null) {
          applyPathLineArt(model, glowHex);
        }
        spinGroup.add(model);

        if (renderGrid) {
          gridExtras = addForgeSpaceGrid(scene, LAB_GLB_FIT_SIZE);
        } else if (glowHex != null && chrome === "card") {
          gridExtras = addStudioAmbient(scene, LAB_GLB_FIT_SIZE, glowHex);
        }
        const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
        camera.position.copy(camDir.multiplyScalar(LAB_GLB_FIT_SIZE * 2.75));
        camera.lookAt(0, 0, 0);
        controls?.update();
        draw();
      },
      undefined,
      () => { onGlFailedRef.current?.(); },
    );

    const animate = () => {
      if (disposed) return;
      const t = performance.now() - floatStart;
      if (floatIdle) {
        const bob = Math.sin(t * 0.0011) * LAB_GLB_FIT_SIZE * 0.052;
        const swayX = Math.sin(t * 0.00078) * 0.026;
        const swayZ = Math.cos(t * 0.00068) * 0.016;
        spinGroup.position.y = bob;
        spinGroup.rotation.x = swayX;
        spinGroup.rotation.z = swayZ;
      } else {
        spinGroup.position.y = 0;
        spinGroup.rotation.x = 0;
        spinGroup.rotation.z = 0;
      }
      if (interactive && controls) {
        controls.update();
        if (autoSpin && !dragging) spinGroup.rotation.y += spinRate;
      } else if (autoSpin) {
        spinGroup.rotation.y += spinRate;
      }
      draw();
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      controls?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      gridExtras.forEach((obj) => {
        scene.remove(obj);
        disposeSceneObject(obj);
      });
      spinGroup.children.slice().forEach((child) => {
        spinGroup.remove(child);
        disposeSceneObject(child);
      });
      envTex?.dispose?.();
      pmrem?.dispose?.();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [shapeId, size, autoSpin, chrome, showGrid, studioGlow, stage, interactive, spinRate]);

  const wrapperStyle: CSSProperties = embeddedStyle(chrome, size, stage, studioGlow);

  return <div ref={mountRef} style={wrapperStyle} />;
}

function hexToRgbParts(hex: string | undefined): string {
  if (!hex) return "136, 153, 187";
  const h = hex.replace("#", "");
  if (h.length !== 6) return "136, 153, 187";
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return "136, 153, 187";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function embeddedStyle(
  chrome: "card" | "none",
  size: number,
  stage: "forge" | "studio",
  studioGlow?: string,
): CSSProperties {
  if (chrome === "none") {
    return {
      width: size,
      height: size,
      overflow: "hidden",
      background: "transparent",
      touchAction: "manipulation",
    };
  }
  if (stage === "studio") {
    const rgb = hexToRgbParts(studioGlow);
    return {
      width: size,
      height: size,
      borderRadius: 14,
      overflow: "hidden",
      background: `radial-gradient(circle at 50% 44%, rgba(${rgb},0.14) 0%, transparent 48%), radial-gradient(circle at 50% 56%, rgba(255,255,255,0.03) 0%, rgba(8,10,18,0.98) 62%)`,
      border: `1.5px solid rgba(${rgb},0.45)`,
      boxShadow: `
        inset 0 0 0 1px rgba(${rgb},0.28),
        inset 0 0 24px rgba(${rgb},0.1),
        0 0 20px rgba(${rgb},0.12)
      `,
    };
  }
  return {
    width: size,
    height: size,
    borderRadius: 12,
    overflow: "hidden",
    background: "linear-gradient(180deg, rgba(12,16,28,0.95) 0%, rgba(4,6,12,0.98) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "inset 0 0 24px rgba(0,0,0,0.45)",
  };
}

function parseStudioGlowHex(hex: string | undefined): number | null {
  if (!hex) return null;
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : null;
}

export const LabGlbViewer = memo(LabGlbViewerBase);
