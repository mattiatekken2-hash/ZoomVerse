import * as THREE from "three";
import { FORGE_CLAY, FORGE_VOXEL_SIZE } from "@workspace/game-models";
import type { VoxelCoord } from "./voxelStudioStore";

const CUBE_FILL = 0.98;
const VOXEL = FORGE_VOXEL_SIZE;
const EDGE = 0x454545;
const MAX_VOXELS = 900;

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

function addLabGrid(scene: THREE.Scene) {
  const span = 4.8;
  const cells = 22;
  const tuneGrid = (grid: THREE.GridHelper, opacity: number) => {
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
    grid.renderOrder = -10;
  };

  const gridPivot = new THREE.Group();
  const floorGrid = new THREE.GridHelper(span, cells, 0xb8c0cc, 0x6a7280);
  tuneGrid(floorGrid, 0.38);
  floorGrid.position.y = -1.25;
  gridPivot.add(floorGrid);
  scene.add(gridPivot);

  const backGrid = new THREE.GridHelper(span, cells, 0xa0a8b8, 0x505868);
  tuneGrid(backGrid, 0.2);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.set(0, -0.55, -1.35);
  scene.add(backGrid);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 90;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 1.8 + Math.random() * 2.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xc8d0dc, size: 0.018, transparent: true, opacity: 0.55 }),
  ));
}

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
};

let shared: Shared | null = null;
let chain: Promise<void> = Promise.resolve();

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
    addLabGrid(scene);
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
    };
    return shared;
  } catch {
    return null;
  }
}

function paintNow(canvas: HTMLCanvasElement, voxels: VoxelCoord[], cssW: number, cssH: number) {
  const s = ensure();
  const ctx = canvas.getContext("2d");
  if (!s || !ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(Math.max(1, cssW) * dpr));
  const h = Math.max(1, Math.round(Math.max(1, cssH) * dpr));
  canvas.width = w;
  canvas.height = h;
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
  const dist = Math.min(9.8, Math.max(4.8, maxR * 8.2 + 2.6));
  const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
  s.camera.position.copy(camDir).multiplyScalar(dist).add(focus);
  s.camera.lookAt(focus.x, Math.min(focus.y, -0.15), focus.z);
  s.renderer.render(s.scene, s.camera);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(s.renderer.domElement, 0, 0, w, h);
}

/** Same Studio cubes/lighting, one shared WebGL context → 2D canvas (no extra GL per card). */
export function paintStudioVoxelThumb(
  canvas: HTMLCanvasElement,
  voxels: VoxelCoord[],
  cssW: number,
  cssH: number,
): Promise<void> {
  const job = chain.then(() => {
    paintNow(canvas, voxels, cssW, cssH);
  }).catch(() => { /* keep queue alive */ });
  chain = job;
  return job;
}
