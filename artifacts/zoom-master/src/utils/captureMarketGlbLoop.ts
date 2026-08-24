/**
 * Offscreen capture of a Lab GLB spinning on the forge grid — used only for
 * Market P2P share. Does not touch LabGlbViewer / farm thumbs.
 *
 * One full 360° with the duplicate end-angle omitted so Telegram's GIF loop
 * has no visible restart hitch.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { labForgeShapeHasGlbReveal } from "@workspace/game-models";
import { cloneLabGlbTemplate, preloadLabGlb } from "./labGlbCache";
import { LAB_GLB_FIT_SIZE, addForgeSpaceGrid, fitGlbToCenter } from "./labGlbScene";
import { encodeLoopingGif, gifToBase64 } from "./gifLoopEncoder";

const SIZE = 320;
const FRAMES = 24;
const DELAY_CS = 6; // 60ms × 24 = 1.44s / revolution

function cloneMaterialsForCapture(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const cloned = mats.map((mat) => {
      const next = mat.clone();
      next.needsUpdate = true;
      const maps = [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "emissiveMap",
        "aoMap",
        "bumpMap",
        "alphaMap",
      ] as const;
      for (const key of maps) {
        const tex = (next as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (tex) tex.needsUpdate = true;
      }
      return next;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!;
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function captureMarketGlbLoopGif(shapeId: string): Promise<string | null> {
  if (!labForgeShapeHasGlbReveal(shapeId)) return null;

  const template = await preloadLabGlb(shapeId);
  const model = cloneLabGlbTemplate(template);
  cloneMaterialsForCapture(model);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  // Real CSS size inside the viewport: Telegram WebView skips WebGL on 1×1 /
  // fully off-screen canvases, which produced a dark GIF with no model.
  canvas.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${SIZE}px`,
    `height:${SIZE}px`,
    "opacity:0.02",
    "pointer-events:none",
    "z-index:0",
  ].join(";");
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let envTex: THREE.Texture | null = null;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setClearColor(0x12161f, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161f);

    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.7);
    fill.position.set(-2.5, 1.2, -1.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff4e0, 0.45);
    rim.position.set(0, 2.2, -3.2);
    scene.add(rim);

    const spinGroup = new THREE.Group();
    scene.add(spinGroup);
    const fitted = fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
    spinGroup.add(model);
    addForgeSpaceGrid(scene, fitted);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 5000);
    const camDir = new THREE.Vector3(1.2, 0.82, 1.55).normalize();
    const camDist = fitted * 2.35;
    camera.position.copy(camDir.multiplyScalar(camDist));
    camera.near = camDist * 0.02;
    camera.far = camDist * 12;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    await nextFrame();
    await nextFrame();

    const scratch = document.createElement("canvas");
    scratch.width = SIZE;
    scratch.height = SIZE;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < FRAMES; i++) {
      spinGroup.rotation.y = (i / FRAMES) * Math.PI * 2;
      renderer.render(scene, camera);
      ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
      frames.push(new Uint8ClampedArray(ctx.getImageData(0, 0, SIZE, SIZE).data));
    }

    const gif = encodeLoopingGif(SIZE, SIZE, frames, DELAY_CS);
    return gifToBase64(gif);
  } catch (err) {
    console.warn("[market-share] glb loop capture failed", err);
    return null;
  } finally {
    envTex?.dispose();
    pmrem?.dispose();
    renderer?.dispose();
    canvas.remove();
  }
}
