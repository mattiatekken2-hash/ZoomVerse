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
import { withGlThumbsPaused } from "./glThumbGate";

const SIZE = 320;
const FRAMES = 36;
const DELAY_CS = 5; // 50ms × 36 = 1.8s / revolution — close to Lab reveal spin

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
  return withGlThumbsPaused(() => captureMarketGlbLoopGifInner(shapeId));
}

async function captureMarketGlbLoopGifInner(shapeId: string): Promise<string | null> {

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
    "opacity:0.12",
    "pointer-events:none",
    "z-index:2",
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
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x060810, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060810);

    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // Same lights as LabGlbViewer reveal (end-of-taps screen).
    scene.add(new THREE.AmbientLight(0xffffff, 0.48));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbee, 0.42);
    fill.position.set(-2.5, 1.2, -1.4);
    scene.add(fill);

    const spinGroup = new THREE.Group();
    scene.add(spinGroup);
    const fitted = fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
    spinGroup.add(model);
    const gridExtras = addForgeSpaceGrid(scene, fitted);
    for (const obj of gridExtras) {
      if (!(obj instanceof THREE.GridHelper)) continue;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = Math.min(0.82, (m.opacity ?? 0.3) + 0.28);
        m.needsUpdate = true;
      }
    }

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 5000);
    const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
    const camDist = fitted * 2.85;
    camera.position.copy(camDir.multiplyScalar(camDist));
    camera.near = camDist * 0.02;
    camera.far = camDist * 12;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    await nextFrame();
    await nextFrame();
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
