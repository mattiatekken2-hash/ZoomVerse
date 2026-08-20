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
  disposeSceneObject,
  fitGlbToCenter,
} from "../utils/labGlbScene";

interface LabGlbViewerProps {
  shapeId: string;
  size: number;
  autoSpin?: boolean;
  /** card = bordered panel (picker/reveal); none = transparent embed (farm orb). */
  chrome?: "card" | "none";
  /** Forge space grid — reveal card only. */
  showGrid?: boolean;
  /** @deprecated Picker uses forge stage; kept for API compat. */
  studioGlow?: string;
  /** @deprecated Always forge — raw GLB materials only. */
  stage?: "forge" | "studio";
  /** Drag to orbit (detail modal). */
  interactive?: boolean;
  /** Rad/frame auto-spin speed (defaults to lab rate). */
  spinRate?: number;
  onGlFailed?: () => void;
}

const LOAD_RETRIES = 2;

/**
 * Pure GLB preview — geometry and materials come straight from the .glb file.
 * Only uniform scale/center for framing; no procedural overlays.
 */
function LabGlbViewerBase({
  shapeId,
  size,
  autoSpin = true,
  chrome = "card",
  showGrid = false,
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

    const scene = new THREE.Scene();
    if (!embedded) {
      scene.background = new THREE.Color(0x060810);
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 5000);
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
    let loadAttempt = 0;

    const placeModel = (model: THREE.Object3D) => {
      const fitted = fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
      spinGroup.add(model);

      if (showGrid) {
        gridExtras = addForgeSpaceGrid(scene, fitted);
      }

      const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
      const camDist = fitted * 2.85;
      camera.position.copy(camDir.multiplyScalar(camDist));
      camera.near = camDist * 0.02;
      camera.far = camDist * 12;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
      controls?.update();
      draw();
    };

    const tryLoad = () => {
      loader.load(
        glbUrl,
        (gltf) => {
          if (disposed) return;
          placeModel(gltf.scene);
        },
        undefined,
        () => {
          if (disposed) return;
          loadAttempt += 1;
          if (loadAttempt <= LOAD_RETRIES) {
            window.setTimeout(tryLoad, 400 * loadAttempt);
            return;
          }
          onGlFailedRef.current?.();
        },
      );
    };
    tryLoad();

    const animate = () => {
      if (disposed) return;
      spinGroup.position.y = 0;
      spinGroup.rotation.x = 0;
      spinGroup.rotation.z = 0;
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
  }, [shapeId, size, autoSpin, chrome, showGrid, interactive, spinRate]);

  const wrapperStyle: CSSProperties = embeddedStyle(chrome, size);

  return <div ref={mountRef} style={wrapperStyle} />;
}

function embeddedStyle(chrome: "card" | "none", size: number): CSSProperties {
  if (chrome === "none") {
    return {
      width: size,
      height: size,
      overflow: "hidden",
      background: "transparent",
      touchAction: "manipulation",
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

export const LabGlbViewer = memo(LabGlbViewerBase);
