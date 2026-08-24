/**
 * Market P2P SHARE GIF of the Lab GLB.
 *
 * Market thumbs use alpha:true. Snapshotting that screen buffer is premultiplied
 * black — Telegram then shows no model. Capture into an opaque FBO instead,
 * using the live viewer that already has the GLB loaded.
 */
import * as THREE from "three";
import { labForgeShapeHasGlbReveal } from "@workspace/game-models";
import { cloneLabGlbTemplate, preloadLabGlb } from "./labGlbCache";
import { LAB_GLB_FIT_SIZE, fitGlbToCenter } from "./labGlbScene";
import { encodeLoopingGif, gifToBase64 } from "./gifLoopEncoder";
import { withGlThumbsPaused } from "./glThumbGate";
import { findLabGlbCapture, type LabGlbCaptureHandle } from "./labGlbCaptureRegistry";

const SIZE = 256;
const FRAMES = 24;
const DELAY_CS = 6;
const STAGE = 0x1e2a3d;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function framesHaveModel(frames: Uint8ClampedArray[]): boolean {
  let fg = 0;
  let samples = 0;
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4 * 13) {
      samples += 1;
      if (px[i]! > 52 || px[i + 1]! > 56 || px[i + 2]! > 70) fg += 1;
    }
  }
  return samples > 0 && fg / samples > 0.05;
}

function flipY(src: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    out.set(src.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
  }
  return out;
}

function opaqueRgb(px: Uint8ClampedArray, bg: { r: number; g: number; b: number }) {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]! / 255;
    px[i] = Math.round(px[i]! * a + bg.r * (1 - a));
    px[i + 1] = Math.round(px[i + 1]! * a + bg.g * (1 - a));
    px[i + 2] = Math.round(px[i + 2]! * a + bg.b * (1 - a));
    px[i + 3] = 255;
  }
}

function renderSpinFrames(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  spinGroup: THREE.Group,
): Uint8ClampedArray[] {
  const prevTone = renderer.toneMapping;
  const prevExp = renderer.toneMappingExposure;
  const prevBg = scene.background;
  const prevTarget = renderer.getRenderTarget();
  const prevPr = renderer.getPixelRatio();
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);
  const bg = new THREE.Color(STAGE);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
  });
  const buf = new Uint8Array(SIZE * SIZE * 4);
  const frames: Uint8ClampedArray[] = [];
  const savedY = spinGroup.rotation.y;

  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(1);
    scene.background = bg;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, SIZE, SIZE);
    const stage = { r: 30, g: 42, b: 61 };

    for (let i = 0; i < FRAMES; i++) {
      spinGroup.rotation.y = (i / FRAMES) * Math.PI * 2;
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, buf);
      const frame = flipY(buf, SIZE, SIZE);
      opaqueRgb(frame, stage);
      frames.push(frame);
    }
  } finally {
    spinGroup.rotation.y = savedY;
    renderer.setRenderTarget(prevTarget);
    renderer.setPixelRatio(prevPr);
    renderer.setSize(prevSize.x, prevSize.y, false);
    renderer.setViewport(0, 0, prevSize.x * prevPr, prevSize.y * prevPr);
    renderer.toneMapping = prevTone;
    renderer.toneMappingExposure = prevExp;
    scene.background = prevBg;
    target.dispose();
  }
  return frames;
}

function encodeIfValid(frames: Uint8ClampedArray[]): string | null {
  if (!framesHaveModel(frames)) return null;
  const gif = encodeLoopingGif(SIZE, SIZE, frames, DELAY_CS);
  if (gif.byteLength < 1200 || gif.byteLength > 1_600_000) return null;
  return gifToBase64(gif);
}

function toUnlitMaterials(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const next = mats.map((mat) => {
      const std = mat as THREE.MeshStandardMaterial;
      const color = std.color ? std.color.clone() : new THREE.Color(0xc8d2de);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      if (!std.map && hsl.l < 0.14) color.set(0xb0bcc8);
      const basic = new THREE.MeshBasicMaterial({
        map: std.map ?? null,
        color,
        vertexColors: std.vertexColors ?? false,
        side: THREE.DoubleSide,
        transparent: !!std.transparent,
        opacity: std.opacity ?? 1,
        alphaMap: std.alphaMap ?? null,
      });
      basic.needsUpdate = true;
      return basic;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  });
}

async function captureFromLiveHandle(handle: LabGlbCaptureHandle): Promise<string | null> {
  handle.paused = true;
  try {
    await nextFrame();
    await nextFrame();
    const frames = renderSpinFrames(handle.renderer, handle.scene, handle.camera, handle.spinGroup);
    return encodeIfValid(frames);
  } catch (err) {
    console.warn("[market-share] live glb capture failed", err);
    return null;
  } finally {
    handle.paused = false;
    try {
      handle.renderer.setRenderTarget(null);
      handle.renderer.render(handle.scene, handle.camera);
    } catch { /* ignore */ }
  }
}

async function captureDedicated(shapeId: string): Promise<string | null> {
  const template = await preloadLabGlb(shapeId);
  const model = cloneLabGlbTemplate(template);
  toUnlitMaterials(model);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = [
    "position:fixed",
    "left:8px",
    "top:8px",
    "width:256px",
    "height:256px",
    "opacity:0.18",
    "pointer-events:none",
    "z-index:2",
  ].join(";");
  document.body.appendChild(canvas);

  let renderer: THREE.WebGLRenderer | null = null;
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
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(STAGE, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(STAGE);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const spinGroup = new THREE.Group();
    scene.add(spinGroup);
    const fitted = fitGlbToCenter(model, LAB_GLB_FIT_SIZE);
    spinGroup.add(model);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 5000);
    const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
    const camDist = fitted * 2.2;
    camera.position.copy(camDir.multiplyScalar(camDist));
    camera.near = camDist * 0.02;
    camera.far = camDist * 12;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    renderer.compile(scene, camera);
    for (let i = 0; i < 4; i++) {
      renderer.render(scene, camera);
      await nextFrame();
    }

    const frames = renderSpinFrames(renderer, scene, camera, spinGroup);
    return encodeIfValid(frames);
  } catch (err) {
    console.warn("[market-share] dedicated glb capture failed", err);
    return null;
  } finally {
    renderer?.dispose();
    canvas.remove();
  }
}

export async function captureMarketGlbLoopGif(shapeId: string): Promise<string | null> {
  if (!labForgeShapeHasGlbReveal(shapeId)) return null;

  const live = findLabGlbCapture(shapeId);
  if (live && live.spinGroup.children.length > 0) {
    const fromLive = await captureFromLiveHandle(live);
    if (fromLive) return fromLive;
  }

  return withGlThumbsPaused(() => captureDedicated(shapeId));
}

if (import.meta.env.DEV) {
  (window as unknown as { __captureMarketGlbLoopGif?: typeof captureMarketGlbLoopGif }).__captureMarketGlbLoopGif =
    captureMarketGlbLoopGif;
}
