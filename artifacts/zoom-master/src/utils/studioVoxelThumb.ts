import * as THREE from "three";
import { FORGE_CLAY, FORGE_VOXEL_SIZE } from "@workspace/game-models";
import type { VoxelCoord } from "./voxelStudioStore";

const CUBE_FILL = 0.98;
const VOXEL = FORGE_VOXEL_SIZE;
const EDGE = 0x454545;
const MAX_VOXELS = 900;
/** ~40s per turn — same “slow card” feel as Farm slots. */
const SPIN_PER_MS = 0.000156;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BASE_CAM = new THREE.Vector3(1.35, 0.95, 1.7).normalize();

const UNIT_BOX_EDGES = (() => {
  const h = 0.5;
  const c = [
    [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h],
    [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h],
  ] as const;
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const out: number[] = [];
  for (const [a, b] of pairs) {
    out.push(...c[a]!, ...c[b]!);
  }
  return out;
})();

type Shared = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.InstancedMesh;
  edgeGeo: THREE.BufferGeometry;
  edgeBuf: Float32Array;
  dummy: THREE.Object3D;
  tint: THREE.Color;
  cube: number;
  edgeVertCount: number;
  camDir: THREE.Vector3;
};

type ThumbJob = {
  canvas: HTMLCanvasElement;
  voxels: VoxelCoord[];
  cssW: number;
  cssH: number;
  visible: boolean;
};

let shared: Shared | null = null;
const jobs = new Map<HTMLCanvasElement, ThumbJob>();
let raf = 0;
let loopOn = false;
let paintCursor = 0;

function worldCenter(list: VoxelCoord[]): THREE.Vector3 {
  if (list.length === 0) return new THREE.Vector3(0, 0, 0);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of list) {
    const x = v.x * VOXEL, y = v.y * VOXEL, z = v.z * VOXEL;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
}

function ensure(): Shared | null {
  if (shared) return shared;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.debug.checkShaderErrors = false;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.background = null;
    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x909098, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 1.65);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-3, 2, -4);
    scene.add(fill);
    const cube = VOXEL * CUBE_FILL;
    const geo = new THREE.BoxGeometry(cube, cube, cube);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_VOXELS);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const edgeVertCount = UNIT_BOX_EDGES.length / 3;
    const edgeBuf = new Float32Array(MAX_VOXELS * UNIT_BOX_EDGES.length);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgeBuf, 3));
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: EDGE, toneMapped: false }),
    );
    edges.frustumCulled = false;
    edges.renderOrder = 2;
    scene.add(edges);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 80);
    shared = {
      renderer,
      scene,
      camera,
      mesh,
      edgeGeo,
      edgeBuf,
      dummy: new THREE.Object3D(),
      tint: new THREE.Color(),
      cube,
      edgeVertCount,
      camDir: new THREE.Vector3(),
    };
    return shared;
  } catch {
    return null;
  }
}

function paintNow(canvas: HTMLCanvasElement, voxels: VoxelCoord[], cssW: number, cssH: number, yaw: number) {
  const s = ensure();
  const ctx = canvas.getContext("2d");
  if (!s || !ctx) return;
  const w = Math.max(1, Math.round(Math.max(1, cssW)));
  const h = Math.max(1, Math.round(Math.max(1, cssH)));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  s.renderer.setPixelRatio(1);
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h;
  s.camera.updateProjectionMatrix();

  const list = voxels.slice(0, MAX_VOXELS);
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const v = list[i]!;
    s.dummy.position.set(v.x * VOXEL, v.y * VOXEL, v.z * VOXEL);
    s.dummy.rotation.set(0, 0, 0);
    s.dummy.scale.setScalar(1);
    s.dummy.updateMatrix();
    s.mesh.setMatrixAt(i, s.dummy.matrix);
    s.tint.setHex(typeof v.color === "number" ? v.color : FORGE_CLAY);
    s.mesh.setColorAt(i, s.tint);
    const base = i * UNIT_BOX_EDGES.length;
    for (let j = 0; j < UNIT_BOX_EDGES.length; j += 3) {
      s.edgeBuf[base + j] = s.dummy.position.x + UNIT_BOX_EDGES[j]! * s.cube;
      s.edgeBuf[base + j + 1] = s.dummy.position.y + UNIT_BOX_EDGES[j + 1]! * s.cube;
      s.edgeBuf[base + j + 2] = s.dummy.position.z + UNIT_BOX_EDGES[j + 2]! * s.cube;
    }
  }
  s.mesh.count = n;
  s.mesh.instanceMatrix.needsUpdate = true;
  if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  s.edgeGeo.setDrawRange(0, n * s.edgeVertCount);
  (s.edgeGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

  const focus = worldCenter(list);
  let maxR = 0.4;
  for (const v of list) {
    const dx = v.x * VOXEL - focus.x;
    const dy = v.y * VOXEL - focus.y;
    const dz = v.z * VOXEL - focus.z;
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  const dist = Math.min(9.8, Math.max(4.6, maxR * 8.2 + 2.4));
  s.camDir.copy(BASE_CAM).applyAxisAngle(Y_AXIS, yaw);
  s.camera.position.copy(s.camDir).multiplyScalar(dist).add(focus);
  s.camera.lookAt(focus);
  s.renderer.render(s.scene, s.camera);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(s.renderer.domElement, 0, 0, w, h);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  loopOn = false;
}

function tick(now: number) {
  if (!loopOn) return;
  if (document.hidden || jobs.size === 0) {
    stopLoop();
    return;
  }
  const yaw = now * SPIN_PER_MS;
  const visible: ThumbJob[] = [];
  for (const job of jobs.values()) {
    if (job.visible && job.cssW >= 2 && job.cssH >= 2) visible.push(job);
  }
  if (visible.length === 0) {
    raf = 0;
    return;
  }
  const budget = Math.min(visible.length, 6);
  for (let i = 0; i < budget; i++) {
    const job = visible[(paintCursor + i) % visible.length]!;
    paintNow(job.canvas, job.voxels, job.cssW, job.cssH, yaw);
  }
  paintCursor = (paintCursor + budget) % visible.length;
  raf = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (loopOn && raf) return;
  loopOn = true;
  raf = requestAnimationFrame(tick);
}

function onVis() {
  if (!document.hidden && jobs.size > 0) ensureLoop();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", onVis);
}

function syncSize(job: ThumbJob) {
  const r = job.canvas.getBoundingClientRect();
  job.cssW = Math.max(8, r.width);
  job.cssH = Math.max(8, r.height);
}

/** Live slow-spin thumb: one shared WebGL context, blit to each 2D canvas. */
export function attachStudioVoxelThumb(canvas: HTMLCanvasElement, voxels: VoxelCoord[]): () => void {
  const job: ThumbJob = {
    canvas,
    voxels,
    cssW: 8,
    cssH: 8,
    visible: true,
  };
  syncSize(job);
  jobs.set(canvas, job);

  const ro = new ResizeObserver(() => {
    syncSize(job);
    ensureLoop();
  });
  ro.observe(canvas);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === canvas) job.visible = e.isIntersecting && e.intersectionRatio > 0.02;
    }
    if (job.visible) ensureLoop();
  }, { root: null, rootMargin: "48px", threshold: [0, 0.02, 0.1] });
  io.observe(canvas);

  ensureLoop();

  return () => {
    jobs.delete(canvas);
    ro.disconnect();
    io.disconnect();
    if (jobs.size === 0) stopLoop();
  };
}

export function updateStudioVoxelThumb(canvas: HTMLCanvasElement, voxels: VoxelCoord[]) {
  const job = jobs.get(canvas);
  if (job) job.voxels = voxels;
}
