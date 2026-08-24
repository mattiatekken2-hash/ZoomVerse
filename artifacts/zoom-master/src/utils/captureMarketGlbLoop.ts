/**
 * Offscreen capture of a Lab GLB spinning on a dark stage — Market P2P SHARE.
 * Telegram WebView skips WebGL on 1×1 / fully off-screen canvases, so this
 * parks a real-sized canvas in the viewport for the capture.
 *
 * Camera matches LabGlbViewer (not zoomed-out 4.5×) so the mesh fills the GIF.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { labForgeShapeHasGlbReveal } from "@workspace/game-models";
import { cloneLabGlbTemplate, preloadLabGlb } from "./labGlbCache";
import { LAB_GLB_FIT_SIZE, fitGlbToCenter } from "./labGlbScene";
import { encodeLoopingGif, gifToBase64 } from "./gifLoopEncoder";
import { withGlThumbsPaused } from "./glThumbGate";

const SIZE = 256;
const FRAMES = 28;
const DELAY_CS = 5; // 50ms × 28 = 1.4s / revolution
/** LabGlbViewer uses 2.85×. Slightly closer so the model reads on a 256 GIF. */
const CAM_DIST_MUL = 2.6;

function prepareMeshes(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function framesHaveModel(frames: Uint8ClampedArray[]): boolean {
  let lit = 0;
  let samples = 0;
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4 * 19) {
      samples += 1;
      if (px[i]! > 38 || px[i + 1]! > 38 || px[i + 2]! > 48) lit += 1;
    }
  }
  return samples > 0 && lit / samples > 0.012;
}

function readFrame(renderer: THREE.WebGLRenderer): Uint8ClampedArray {
  const gl = renderer.getContext();
  const raw = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const stride = SIZE * 4;
  for (let y = 0; y < SIZE; y++) {
    out.set(raw.subarray((SIZE - 1 - y) * stride, (SIZE - y) * stride), y * stride);
  }
  return out;
}

export async function captureMarketGlbLoopGif(shapeId: string): Promise<string | null> {
  if (!labForgeShapeHasGlbReveal(shapeId)) return null;
  return withGlThumbsPaused(() => captureMarketGlbLoopGifInner(shapeId));
}

async function captureMarketGlbLoopGifInner(shapeId: string): Promise<string | null> {
  const template = await preloadLabGlb(shapeId);
  const model = cloneLabGlbTemplate(template);
  prepareMeshes(model);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.setAttribute("data-market-share-capture", "1");
  canvas.style.cssText = [
    "position:fixed",
    "left:12px",
    "bottom:12px",
    `width:${SIZE}px`,
    `height:${SIZE}px`,
    "opacity:0.45",
    "pointer-events:none",
    "z-index:80",
    "border-radius:12px",
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
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
    renderer.debug.checkShaderErrors = false;
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.setClearColor(0x060810, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060810);

    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a2230, 0.72));
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbee, 0.55);
    fill.position.set(-2.5, 1.2, -1.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0.2, 1.8, -2.4);
    scene.add(rim);

    const spinGroup = new THREE.Group();
    scene.add(spinGroup);
    const fitted = fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
    spinGroup.add(model);

    const floor = new THREE.GridHelper(4.2, 18, 0xb8c0cc, 0x6a7280);
    const floorMats = Array.isArray(floor.material) ? floor.material : [floor.material];
    for (const m of floorMats) {
      m.transparent = true;
      m.opacity = 0.42;
      m.depthWrite = false;
    }
    floor.position.y = -fitted * 0.52;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 5000);
    const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
    const camDist = fitted * CAM_DIST_MUL;
    camera.position.copy(camDir.multiplyScalar(camDist));
    camera.near = camDist * 0.02;
    camera.far = camDist * 12;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    for (let i = 0; i < 8; i++) await nextFrame();

    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < FRAMES; i++) {
      spinGroup.rotation.y = (i / FRAMES) * Math.PI * 2;
      renderer.render(scene, camera);
      frames.push(readFrame(renderer));
      await nextFrame();
    }

    if (!framesHaveModel(frames)) {
      console.warn("[market-share] glb loop capture was empty (no lit pixels)");
      return null;
    }

    const gif = encodeLoopingGif(SIZE, SIZE, frames, DELAY_CS);
    if (gif.byteLength < 800 || gif.byteLength > 1_600_000) return null;
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
