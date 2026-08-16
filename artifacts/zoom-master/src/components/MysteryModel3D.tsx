import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { FORGE_VOXEL_SIZE, forgeClayToneHex, getMeshParts, getShapeGlbUrl, meshPartsToVoxels, mysteryKitParts, type MaterialProfile, type MeshPart, type VoxelCell } from "@workspace/game-models";

const DEFAULT_PARTS = mysteryKitParts();

/** Fade-in threshold — opacity ramp instead of popping visible on/off. */
const MIN_PART_LOCK = 0.08;

const GLASS_COLORS = new Set(["#9ad4ff", "#bff7ff", "#a8e7ff", "#88cc44"]);

/** Cached studio HDRI — shared across all showcase views. */
let cachedStudioEnv: THREE.Texture | null = null;
let studioEnvPromise: Promise<THREE.Texture> | null = null;

const STUDIO_HDR = "/assets/env/studio_small_09_1k.hdr";

/** Internal render scale — 3 ⇒ 156px canvas renders at ~52×52 then upscales blocky. */
const PIXEL_SCALE = 3;
const PIXEL_MIN_INTERNAL = 16;

type GeoDetail = "low" | "standard" | "showcase" | "ultra";

type PartMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

function isShowcaseView(
  performanceMode: boolean,
  size: number,
  interactive: boolean,
  opaqueBackground: boolean,
  revealed: boolean,
  forgeVoxelBuild: boolean,
): boolean {
  if (performanceMode) return false;
  if (forgeVoxelBuild && !revealed) return false;
  if (interactive && !revealed) return false;
  return size >= 96 || opaqueBackground || (revealed && size >= 72);
}

function isGlassPart(part: MeshPart): boolean {
  return typeof part.color === "string" && GLASS_COLORS.has(part.color.toLowerCase());
}

function setupRenderer(renderer: THREE.WebGLRenderer, showcase: boolean): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (showcase) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } else {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;
  }
}

function loadStudioHDRI(renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  if (cachedStudioEnv) return Promise.resolve(cachedStudioEnv);
  if (studioEnvPromise) return studioEnvPromise;
  studioEnvPromise = new Promise((resolve, reject) => {
    const loader = new RGBELoader();
    loader.load(
      STUDIO_HDR,
      (hdr) => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const env = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        cachedStudioEnv = env;
        resolve(env);
      },
      undefined,
      () => {
        studioEnvPromise = null;
        reject(new Error("HDRI load failed"));
      },
    );
  });
  return studioEnvPromise;
}

function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return envMap;
}

function addShowcaseGround(
  scene: THREE.Scene,
  maxDim: number,
  accentColor: string,
): THREE.Object3D[] {
  const extras: THREE.Object3D[] = [];

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 1.1, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0a0c14,
      roughness: 0.92,
      metalness: 0.04,
      transparent: true,
      opacity: 0.55,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -maxDim * 0.5;
  floor.receiveShadow = true;
  floor.renderOrder = -3;
  scene.add(floor);
  extras.push(floor);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 0.58, 48),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -maxDim * 0.495;
  shadow.renderOrder = -2;
  scene.add(shadow);
  extras.push(shadow);

  const accentGlow = new THREE.Mesh(
    new THREE.CircleGeometry(maxDim * 0.34, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accentColor),
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    }),
  );
  accentGlow.rotation.x = -Math.PI / 2;
  accentGlow.position.y = -maxDim * 0.494;
  accentGlow.renderOrder = -1;
  scene.add(accentGlow);
  extras.push(accentGlow);

  return extras;
}

/** Infinite space grid for Lab voxel forge — no floor disc. */
function addForgeSpaceGrid(scene: THREE.Scene, maxDim: number): THREE.Object3D[] {
  const extras: THREE.Object3D[] = [];
  const span = maxDim * 3.6;
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

  const floorGrid = new THREE.GridHelper(span, cells, 0x6a8cb8, 0x2a3548);
  tuneGrid(floorGrid, 0.42);
  floorGrid.position.y = -maxDim * 0.46;
  scene.add(floorGrid);
  extras.push(floorGrid);

  const backGrid = new THREE.GridHelper(span, cells, 0x4a6080, 0x1a2230);
  tuneGrid(backGrid, 0.22);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.set(0, maxDim * 0.05, -maxDim * 1.05);
  scene.add(backGrid);
  extras.push(backGrid);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 120;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = maxDim * (1.8 + Math.random() * 2.4);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xc8d8f0,
      size: maxDim * 0.028,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  stars.renderOrder = -12;
  scene.add(stars);
  extras.push(stars);

  return extras;
}

interface PixelPass {
  renderScene: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
}

function createPixelPass(
  renderer: THREE.WebGLRenderer,
  outputSize: number,
  transparent: boolean,
): PixelPass {
  const getPixelSize = () => Math.max(PIXEL_MIN_INTERNAL, Math.floor(outputSize / PIXEL_SCALE));

  const fullRT = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });

  const pixelRT = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const downsampleScene = new THREE.Scene();
  const downsampleMat = new THREE.MeshBasicMaterial({
    map: fullRT.texture,
    toneMapped: false,
  });
  downsampleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), downsampleMat));

  const upscaleScene = new THREE.Scene();
  const upscaleMat = new THREE.MeshBasicMaterial({
    map: pixelRT.texture,
    transparent,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  upscaleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), upscaleMat));

  const renderScene = (scene: THREE.Scene, camera: THREE.Camera) => {
    const dpr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(outputSize * dpr));
    const px = getPixelSize();

    if (fullRT.width !== w || fullRT.height !== w) fullRT.setSize(w, w);
    if (pixelRT.width !== px || pixelRT.height !== px) pixelRT.setSize(px, px);

    const prevToneMapping = renderer.toneMapping;

    // 1) Full-res 3D — smooth while rotating
    renderer.setRenderTarget(fullRT);
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.render(scene, camera);

    // 2) Screen-aligned downsample — stable pixel grid (fixed screen blocks)
    fullRT.texture.minFilter = THREE.NearestFilter;
    fullRT.texture.magFilter = THREE.NearestFilter;
    renderer.setRenderTarget(pixelRT);
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.render(downsampleScene, ortho);

    // 3) Nearest upscale to canvas
    renderer.setRenderTarget(null);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(upscaleScene, ortho);
    renderer.toneMapping = prevToneMapping;
  };

  return {
    renderScene,
    dispose: () => {
      fullRT.dispose();
      pixelRT.dispose();
      downsampleMat.dispose();
      upscaleMat.dispose();
      downsampleScene.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      upscaleScene.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    },
  };
}

function inferProfile(part: MeshPart): MaterialProfile {
  if (part.profile) return part.profile;
  if (isGlassPart(part)) return "glass";
  if ((part.metal ?? 0) >= 0.55) return "metal";
  if (part.color === RUBBER_CONST) return "rubber";
  return "default";
}

const RUBBER_CONST = "#1e1e1e";

function applyProfileToMaterial(
  mat: PartMaterial,
  part: MeshPart,
  color: THREE.Color,
  showcase: boolean,
  envMap: THREE.Texture | null,
): void {
  if (!(mat instanceof THREE.MeshPhysicalMaterial)) return;

  const profile = inferProfile(part);
  mat.color.copy(color);
  mat.envMap = envMap;
  mat.envMapIntensity = showcase ? 1.35 : 1.05;

  mat.transmission = 0;
  mat.thickness = 0;
  mat.sheen = 0;
  mat.sheenRoughness = 0.5;
  mat.sheenColor.set(0xffffff);
  mat.clearcoat = 0;
  mat.clearcoatRoughness = 0.2;
  mat.ior = 1.5;

  switch (profile) {
    case "fur":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.78;
      mat.sheen = 1;
      mat.sheenRoughness = 0.82;
      mat.sheenColor.set("#fff8f0");
      mat.clearcoat = 0.12;
      mat.clearcoatRoughness = 0.45;
      break;
    case "skin":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.52;
      mat.sheen = 0.65;
      mat.sheenRoughness = 0.55;
      mat.sheenColor.set("#ffe8d8");
      mat.clearcoat = 0.08;
      break;
    case "food":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.58;
      mat.clearcoat = 0.42;
      mat.clearcoatRoughness = 0.32;
      break;
    case "food_glossy":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.42;
      mat.clearcoat = 0.88;
      mat.clearcoatRoughness = 0.22;
      mat.sheen = 0.35;
      mat.sheenRoughness = 0.4;
      mat.sheenColor.set("#fff5e0");
      break;
    case "metal":
      mat.metalness = Math.min(1, (part.metal ?? 0.75) + 0.15);
      mat.roughness = Math.max(0.1, (part.rough ?? 0.28) - 0.08);
      mat.clearcoat = 0.55;
      mat.clearcoatRoughness = 0.15;
      break;
    case "glass":
      mat.metalness = 0.04;
      mat.roughness = 0.04;
      mat.transmission = 0.82;
      mat.thickness = 0.4;
      mat.ior = 1.48;
      mat.clearcoat = 0.75;
      mat.clearcoatRoughness = 0.08;
      break;
    case "rubber":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.88;
      mat.sheen = 0.2;
      mat.sheenRoughness = 0.7;
      break;
    case "fabric":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.72;
      mat.sheen = 0.85;
      mat.sheenRoughness = 0.75;
      break;
    case "liquid":
      mat.metalness = 0;
      mat.roughness = part.rough ?? 0.28;
      mat.transmission = 0.55;
      mat.thickness = 0.25;
      mat.clearcoat = 0.95;
      mat.clearcoatRoughness = 0.1;
      break;
    default:
      mat.metalness = part.metal ?? 0.22;
      mat.roughness = part.rough ?? 0.48;
      mat.clearcoat = showcase ? 0.25 : 0;
      mat.clearcoatRoughness = 0.18;
      break;
  }
}

export interface ForgeMeshHandle {
  /** Screen-space targets (canvas center origin) for parts currently assembling. */
  getPartScreenTargets: (maxCount?: number) => Array<{ x: number; y: number; strength?: number }>;
  /** Next voxel landing slot — for pixel-in particle on the latest tap. */
  getIncomingVoxelTarget: () => { x: number; y: number; color: string; sizePx: number } | null;
}

interface ObjectMesh3DProps {
  parts?: MeshPart[];
  shapeId?: string;
  primaryColor: string;
  accentColor: string;
  /** 0–1 assembly progress */
  progress?: number;
  revealed?: boolean;
  size: number;
  onTap?: (point?: { x: number; y: number }) => void;
  autoSpin?: boolean;
  /** Lab forge — block-by-block Minecraft build (not part fly-in). */
  forgeVoxelBuild?: boolean;
  /** Softer particle timing (auto-tap). */
  forgeTapRelaxed?: boolean;
  interactive?: boolean;
  /** Solid dark backdrop instead of transparent canvas (Farm detail view). */
  opaqueBackground?: boolean;
  /** Lower GPU cost for live Lab forging. */
  performanceMode?: boolean;
  onGlFailed?: () => void;
  onGlContextLost?: () => void;
}

function resolveColor(c: MeshPart["color"], primary: string, accent: string): string {
  if (c === "p") return primary;
  if (c === "a") return accent;
  return c;
}

function makeGeometry(part: MeshPart, detail: GeoDetail = "standard"): THREE.BufferGeometry {
  const capSeg = detail === "ultra" ? 16 : detail === "showcase" ? 12 : detail === "low" ? 4 : 8;
  const radSeg = detail === "ultra" ? 48 : detail === "showcase" ? 32 : detail === "low" ? 10 : 18;

  if (detail === "low") {
    switch (part.prim) {
      case "sphere":
        return new THREE.SphereGeometry(part.sx, 10, 8);
      case "capsule":
        return new THREE.CapsuleGeometry(part.sx, part.sy, 4, 10);
      case "cyl":
        return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, 10);
      case "cone":
        return new THREE.ConeGeometry(part.sx, part.sy, 10);
      case "torus":
        return new THREE.TorusGeometry(part.sx, part.sy, 8, 12);
      default:
        return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
    }
  }
  if (detail === "showcase" || detail === "ultra") {
    switch (part.prim) {
      case "sphere":
        return new THREE.SphereGeometry(part.sx, radSeg, Math.floor(radSeg * 0.85));
      case "capsule":
        return new THREE.CapsuleGeometry(part.sx, part.sy, capSeg, radSeg);
      case "cyl":
        return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, radSeg);
      case "cone":
        return new THREE.ConeGeometry(part.sx, part.sy, radSeg);
      case "torus":
        return new THREE.TorusGeometry(part.sx, part.sy, capSeg + 4, radSeg);
      default:
        return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
    }
  }
  switch (part.prim) {
    case "sphere":
      return new THREE.SphereGeometry(part.sx, 18, 14);
    case "capsule":
      return new THREE.CapsuleGeometry(part.sx, part.sy, 8, 16);
    case "cyl":
      return new THREE.CylinderGeometry(part.sx, part.sz, part.sy, 14);
    case "cone":
      return new THREE.ConeGeometry(part.sx, part.sy, 14);
    case "torus":
      return new THREE.TorusGeometry(part.sx, part.sy, 10, 18);
    default:
      return new THREE.BoxGeometry(part.sx, part.sy, part.sz);
  }
}

function createPartMaterial(
  part: MeshPart,
  showcase: boolean,
  envMap: THREE.Texture | null,
  usePhysical: boolean,
  pixelMode: boolean,
): PartMaterial {
  if (showcase && usePhysical) {
    const mat = new THREE.MeshPhysicalMaterial({ color: "#888888", flatShading: false });
    applyProfileToMaterial(mat, part, new THREE.Color("#888888"), showcase, envMap);
    return mat;
  }

  const metal = part.metal ?? 0.25;
  const rough = part.rough ?? 0.55;
  const glass = isGlassPart(part);

  if (showcase && usePhysical && (glass || metal >= 0.4)) {
    return new THREE.MeshPhysicalMaterial({
      color: "#3a3a3a",
      flatShading: false,
      metalness: glass ? 0.05 : Math.min(1, metal + 0.15),
      roughness: glass ? 0.06 : Math.max(0.12, rough - 0.12),
      transmission: glass ? 0.88 : 0,
      thickness: glass ? 0.35 : 0,
      ior: 1.48,
      clearcoat: glass ? 0.65 : 0.35,
      clearcoatRoughness: 0.18,
      envMap: envMap ?? undefined,
      envMapIntensity: glass ? 1.35 : 1.1,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: "#3a3a3a",
    flatShading: false,
    metalness: metal,
    roughness: rough,
    envMap: showcase && envMap ? envMap : undefined,
    envMapIntensity: showcase ? 1.05 : 1,
  });
}

function scatterDir(id: string): THREE.Vector3 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 628) / 100;
  const b = (((h >>> 8) % 314) / 100) - 0.5;
  return new THREE.Vector3(Math.cos(a), 0.4 + b, Math.sin(a)).normalize();
}

/** Bounds from blueprint data — never from InstancedMesh parked at y=-999. */
function computeForgeBounds(meshParts: MeshPart[], forgeVoxels: VoxelCell[], voxelStep: number): THREE.Box3 {
  const box = new THREE.Box3();
  const half = Math.max(voxelStep, FORGE_VOXEL_SIZE) * 0.55;

  if (forgeVoxels.length > 0) {
    for (const v of forgeVoxels) {
      box.expandByPoint(new THREE.Vector3(v.x - half, v.y - half, v.z - half));
      box.expandByPoint(new THREE.Vector3(v.x + half, v.y + half, v.z + half));
    }
  } else {
    for (const part of meshParts) {
      const hx = part.sx / 2;
      const hy = part.sy / 2;
      const hz = part.sz / 2;
      box.expandByPoint(new THREE.Vector3(part.x - hx, part.y - hy, part.z - hz));
      box.expandByPoint(new THREE.Vector3(part.x + hx, part.y + hy, part.z + hz));
    }
  }

  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  }
  return box;
}

/** Clay silhouette assembles while tapping, then paints with rarity colors. */
export const ObjectMesh3D = forwardRef<ForgeMeshHandle, ObjectMesh3DProps>(function ObjectMesh3D({
  parts,
  shapeId,
  primaryColor,
  accentColor,
  progress = 0,
  revealed = false,
  size,
  onTap,
  autoSpin = true,
  interactive = true,
  forgeVoxelBuild = false,
  forgeTapRelaxed = false,
  opaqueBackground = false,
  performanceMode = false,
  onGlFailed,
  onGlContextLost,
}, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTapRef = useRef(onTap);
  const onGlFailedRef = useRef(onGlFailed);
  const onGlContextLostRef = useRef(onGlContextLost);
  onGlFailedRef.current = onGlFailed;
  onGlContextLostRef.current = onGlContextLost;
  const groupRef = useRef<THREE.Group | null>(null);
  const partsRef = useRef<MeshPart[]>([]);
  const voxelsRef = useRef<VoxelCell[]>([]);
  const voxelStepRef = useRef(FORGE_VOXEL_SIZE);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const assemblyRef = useRef(progress);
  const stateRef = useRef({ progress, revealed, primaryColor, accentColor });
  onTapRef.current = onTap;
  stateRef.current = { progress, revealed, primaryColor, accentColor };

  const meshParts = parts && parts.length > 0 ? parts : DEFAULT_PARTS;

  useImperativeHandle(ref, () => ({
    getIncomingVoxelTarget() {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const group = groupRef.current;
      const list = voxelsRef.current;
      if (!camera || !renderer || !group || list.length === 0) return null;

      const st = stateRef.current;
      const n = list.length;
      const placedCount = Math.min(n, Math.round(Math.min(1, Math.max(0, st.progress)) * n));
      if (placedCount <= 0) return null;

      const idx = placedCount - 1;
      const v = list[idx]!;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const vec = new THREE.Vector3(v.x, v.y, v.z);
      group.localToWorld(vec);
      vec.project(camera);
      if (!Number.isFinite(vec.x) || vec.z > 1) return null;

      const sx = vec.x * (w / 2);
      const sy = -vec.y * (h / 2);
      const half = voxelStepRef.current * 0.5;
      const edge = new THREE.Vector3(v.x + half, v.y + half, v.z);
      group.localToWorld(edge);
      edge.project(camera);
      const sizePx = Math.max(7, Math.min(22, Math.hypot((edge.x - vec.x) * w, (edge.y - vec.y) * h) * 1.15));

      return { x: sx, y: sy, color: forgeClayToneHex(v.id || idx), sizePx };
    },
    getPartScreenTargets(maxCount = 5) {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const group = groupRef.current;
      const list = voxelsRef.current.length > 0 ? voxelsRef.current : partsRef.current;
      if (!camera || !renderer || !group || list.length === 0) return [];

      const n = list.length;
      const assembly = assemblyRef.current;
      const scaledParts = assembly * n;
      const partsDone = Math.floor(scaledParts);
      const activePartFrac = scaledParts - partsDone;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const vec = new THREE.Vector3();
      const out: Array<{ x: number; y: number; strength?: number }> = [];

      const indices: number[] = [];
      if (partsDone < n) indices.push(partsDone);
      for (let j = 1; j < maxCount && partsDone + j < n; j++) indices.push(partsDone + j);
      if (indices.length === 0 && n > 0) indices.push(n - 1);

      for (let k = 0; k < indices.length && out.length < maxCount; k++) {
        const idx = indices[k]!;
        const part = list[idx]!;
        if (!part) continue;

        const dir = voxelsRef.current.length > 0
          ? new THREE.Vector3(0, 0, 0)
          : scatterDir((part as MeshPart).id);
        let lock = 0;
        if (idx < partsDone) {
          continue;
        } else if (idx === partsDone) {
          lock = 1;
        } else {
          lock = 0.12 + (k % 3) * 0.05;
        }

        const eased = lock * lock * (3 - 2 * lock);
        const scatter = voxelsRef.current.length > 0 ? 0 : (1 - eased) * 1.65;
        const px = voxelsRef.current.length > 0 ? (part as VoxelCell).x : (part as MeshPart).x;
        const py = voxelsRef.current.length > 0 ? (part as VoxelCell).y : (part as MeshPart).y;
        const pz = voxelsRef.current.length > 0 ? (part as VoxelCell).z : (part as MeshPart).z;
        vec.set(
          px + dir.x * scatter,
          py + dir.y * scatter * 0.55,
          pz + dir.z * scatter,
        );
        group.localToWorld(vec);

        vec.project(camera);
        if (!Number.isFinite(vec.x) || vec.z > 1) continue;
        let sx = vec.x * (w / 2);
        let sy = -vec.y * (h / 2);
        const minR = Math.min(w, h) * 0.26;
        const dist = Math.hypot(sx, sy);
        if (dist < minR) {
          const angle = dist < 0.5
            ? ((idx * 2.399963229728653) % (Math.PI * 2))
            : Math.atan2(sy, sx);
          sx = Math.cos(angle) * (minR + k * 8);
          sy = Math.sin(angle) * (minR + k * 8);
        }
        if (Math.hypot(sx, sy) < minR * 0.92) continue;
        const strength = idx === partsDone ? 1 : 0.55 - k * 0.08;
        out.push({ x: sx, y: sy, strength: Math.max(0.35, strength) });
      }

      return out;
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;

    const showcase = isShowcaseView(performanceMode, size, interactive, opaqueBackground, revealed, forgeVoxelBuild);
    const isStaticShowcase = showcase && revealed && !interactive;
    const useForgeVoxels = forgeVoxelBuild;
    const forgeSpaceMode = useForgeVoxels && !revealed;
    const pixelMode = showcase && revealed && !performanceMode;
    const geoDetail: GeoDetail = performanceMode
      ? "low"
      : pixelMode || (isStaticShowcase && size >= 140)
        ? "showcase"
        : showcase
          ? "showcase"
          : useForgeVoxels
            ? "standard"
            : "standard";
    const usePhysicalMats = showcase && revealed;

    const scene = new THREE.Scene();
    if (showcase) scene.background = new THREE.Color(0x060810);
    else if (forgeSpaceMode) scene.background = null;
    const camera = new THREE.PerspectiveCamera(showcase ? 38 : 42, 1, 0.1, 100);
    cameraRef.current = camera;
    const maxDpr = performanceMode
      ? 1.25
      : showcase
        ? Math.min(window.devicePixelRatio, size >= 140 ? 3 : 2.5)
        : (size > 90 ? 1.75 : 1.25);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: showcase || (!performanceMode && size > 90),
        alpha: !opaqueBackground,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      });
    } catch {
      onGlFailedRef.current?.();
      return;
    }
    setupRenderer(renderer, showcase);
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(size, size);
    if (opaqueBackground) {
      renderer.setClearColor(0x060810, 1);
      renderer.domElement.style.background = "#060810";
    } else {
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.background = "transparent";
    }
    renderer.domElement.style.display = "block";
    renderer.domElement.style.pointerEvents = interactive ? "auto" : "none";
    if (pixelMode) {
      renderer.domElement.style.imageRendering = "pixelated";
    }
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const pixelPass = pixelMode ? createPixelPass(renderer, size, !opaqueBackground) : null;
    const draw = (cam: THREE.Camera) => {
      if (pixelPass) pixelPass.renderScene(scene, cam);
      else renderer.render(scene, cam);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      onGlContextLostRef.current?.();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    let envMap: THREE.Texture | null = null;
    let groundExtras: THREE.Object3D[] = [];
    let glbRoot: THREE.Object3D | null = null;
    let disposed = false;

    if (showcase) {
      loadStudioHDRI(renderer)
        .then((tex) => {
          if (disposed) return;
          envMap = tex;
          scene.environment = tex;
          group.children.forEach((c) => {
            const m = c as THREE.Mesh;
            const mat = m.material as PartMaterial;
            if (mat instanceof THREE.MeshPhysicalMaterial) {
              mat.envMap = tex;
              mat.needsUpdate = true;
            }
          });
        })
        .catch(() => {
          if (disposed) return;
          envMap = createStudioEnvironment(renderer);
          scene.environment = envMap;
        });
    }

    const isStaticThumb = revealed && !interactive && !performanceMode;
    scene.add(new THREE.AmbientLight(0xffffff, forgeSpaceMode ? 0.55 : showcase ? 0.5 : opaqueBackground ? 0.55 : isStaticThumb ? 0.68 : 0.5));
    if (!performanceMode) {
      scene.add(new THREE.HemisphereLight(
        0xc8e0ff,
        forgeSpaceMode ? 0x060810 : 0x141820,
        showcase ? 0.55 : opaqueBackground ? 0.45 : isStaticThumb ? 0.38 : forgeSpaceMode ? 0.48 : 0.25,
      ));
    }
    const key = new THREE.DirectionalLight(
      0xfff8f0,
      showcase ? 1.75 : opaqueBackground ? 1.35 : isStaticThumb ? 1.25 : useForgeVoxels ? 1.55 : (performanceMode ? 0.95 : 1.05),
    );
    key.position.set(4, 8, 5);
    if (showcase) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0002;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -3;
      key.shadow.camera.right = 3;
      key.shadow.camera.top = 3;
      key.shadow.camera.bottom = -3;
    }
    scene.add(key);
    if (!performanceMode) {
      const fill = new THREE.DirectionalLight(0x8899cc, showcase ? 0.62 : opaqueBackground ? 0.5 : 0.35);
      fill.position.set(-5, 0, -3);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xe8f0ff, showcase ? 0.85 : opaqueBackground ? 0.45 : 0.2);
      rim.position.set(0, 3, -6);
      scene.add(rim);
      const accentLight = new THREE.PointLight(new THREE.Color(accentColor), showcase ? 1.15 : opaqueBackground ? 0.85 : 0.35, showcase ? 16 : 12);
      accentLight.position.set(-2.5, 3.5, 4.5);
      scene.add(accentLight);
      if (showcase) {
        const bounce = new THREE.PointLight(0x9ec5e8, 0.35, 10);
        bounce.position.set(2, -1, 3);
        scene.add(bounce);
      }
    }

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;
    partsRef.current = meshParts;

    let forgeVoxels: VoxelCell[] = [];
    let voxelStep = FORGE_VOXEL_SIZE;
    if (useForgeVoxels) {
      try {
        const voxelized = meshPartsToVoxels(meshParts);
        forgeVoxels = voxelized.voxels;
        voxelStep = voxelized.step;
      } catch (err) {
        console.warn("[ObjectMesh3D] voxelize failed, falling back to part assembly", err);
      }
    }
    voxelsRef.current = forgeVoxels;
    voxelStepRef.current = voxelStep;
    const voxelDummy = new THREE.Object3D();
    let voxelInst: THREE.InstancedMesh | null = null;
    const clayToneScratch = new THREE.Color();
    if (forgeVoxels.length > 0) {
      const cube = voxelStep * 0.98;
      const vGeo = new THREE.BoxGeometry(cube, cube, cube);
      // Lit material so faces read as white / grey / darker grey blocks.
      const vMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.06,
        toneMapped: false,
        flatShading: true,
      });
      voxelInst = new THREE.InstancedMesh(vGeo, vMat, forgeVoxels.length);
      voxelInst.frustumCulled = false;
      voxelInst.castShadow = false;
      voxelInst.receiveShadow = false;
      for (let vi = 0; vi < forgeVoxels.length; vi++) {
        const v = forgeVoxels[vi]!;
        voxelDummy.position.set(0, -999, 0);
        voxelDummy.scale.set(0, 0, 0);
        voxelDummy.updateMatrix();
        voxelInst.setMatrixAt(vi, voxelDummy.matrix);
        clayToneScratch.set(forgeClayToneHex(v.id || vi));
        voxelInst.setColorAt(vi, clayToneScratch);
      }
      voxelInst.count = 0;
      voxelInst.instanceMatrix.needsUpdate = true;
      if (voxelInst.instanceColor) voxelInst.instanceColor.needsUpdate = true;
      group.add(voxelInst);
    }

    const geos: THREE.BufferGeometry[] = [];
    for (const part of meshParts) {
      const geo = makeGeometry(part, geoDetail);
      geos.push(geo);
      const mat = createPartMaterial(part, showcase, envMap, usePhysicalMats, pixelMode);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.x, part.y, part.z);
      mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
      if (showcase) mesh.castShadow = true;
      mesh.userData["part"] = part;
      mesh.userData["dir"] = scatterDir(part.id);
      mesh.userData["lastLock"] = -1;
      mesh.userData["assembled"] = false;
      mesh.userData["lockedIn"] = false;
      mesh.visible = forgeVoxels.length === 0;
      group.add(mesh);
    }

    const box = computeForgeBounds(meshParts, forgeVoxels, voxelStep);
    const center = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z, 0.8);
    group.position.sub(center);
    if (showcase) {
      groundExtras = addShowcaseGround(scene, maxDim, accentColor);
    } else if (forgeSpaceMode) {
      groundExtras = addForgeSpaceGrid(scene, maxDim);
    }
    camera.position.set(maxDim * (showcase ? 1.22 : 1.35), maxDim * (showcase ? 0.82 : 0.95), maxDim * (showcase ? 1.48 : 1.7));
    camera.lookAt(0, 0, 0);

    const glbUrl = shapeId && isStaticShowcase && !pixelMode ? getShapeGlbUrl(shapeId) : null;
    if (glbUrl) {
      const loader = new GLTFLoader();
      loader.load(
        glbUrl,
        (gltf) => {
          if (disposed) return;
          glbRoot = gltf.scene;
          glbRoot.visible = false;
          const gBox = new THREE.Box3().setFromObject(glbRoot);
          const gCenter = gBox.getCenter(new THREE.Vector3());
          const gSize = gBox.getSize(new THREE.Vector3());
          const gMax = Math.max(gSize.x, gSize.y, gSize.z, 0.01);
          const scale = (maxDim * 1.05) / gMax;
          glbRoot.scale.setScalar(scale);
          glbRoot.position.set(-gCenter.x * scale, -gCenter.y * scale, -gCenter.z * scale);
          glbRoot.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              const m = node as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              mats.forEach((raw) => {
                if (raw instanceof THREE.MeshStandardMaterial || raw instanceof THREE.MeshPhysicalMaterial) {
                  raw.envMapIntensity = 1.35;
                  raw.needsUpdate = true;
                }
              });
            }
          });
          group.add(glbRoot);
          group.children.forEach((c) => {
            if (c !== glbRoot) c.visible = false;
          });
          glbRoot.visible = true;
          draw(camera);
        },
        undefined,
        () => { /* keep procedural fallback */ },
      );
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = interactive;
    controls.enableRotate = interactive;
    controls.minDistance = maxDim * 1.1;
    controls.maxDistance = maxDim * 4;
    controls.enableDamping = !performanceMode;
    controls.dampingFactor = performanceMode ? 0 : 0.08;
    controls.target.set(0, 0, 0);
    if (!interactive) {
      renderer.domElement.style.pointerEvents = "none";
    }

    let dragging = false;
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = false;
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && onTapRef.current) {
        e.stopPropagation();
        const rect = renderer.domElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        onTapRef.current({ x: e.clientX - cx, y: e.clientY - cy });
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let frameId = 0;
    let paintT = revealed && !interactive ? 1 : 0;
    let lastFrame = performance.now();
    let lastPlacedVoxels = Math.min(
      forgeVoxels.length,
      Math.round(Math.min(1, Math.max(0, progress)) * forgeVoxels.length),
    );
    let dropAnimStart = performance.now() - 300;
    const VOXEL_PARTICLE_MS = 520;
    const particleLandMs = () => (forgeTapRelaxed ? 900 : VOXEL_PARTICLE_MS) * 0.68;
    const smoothProgressRef = { current: progress };
    const clayDark = new THREE.Color("#6a6a6a");
    const clayLight = new THREE.Color(0xffffff);
    const painted = new THREE.Color();
    const mixed = new THREE.Color();

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;

      const dt = Math.min(32, now - lastFrame);
      lastFrame = now;
      const st = stateRef.current;
      const isLiveForge = interactive && !st.revealed;
      const list = partsRef.current;
      const n = Math.max(isLiveForge && voxelsRef.current.length > 0
        ? voxelsRef.current.length
        : list.length, 1);

      const targetP = st.revealed ? 1 : Math.min(1, Math.max(0, st.progress));
      const lerpK = 1 - Math.pow(0.001, dt / 16.67);
      const snap = performanceMode ? 0.95 : 0.55;
      // Keep the Minecraft voxel sculpture through waiting + reveal paint.
      const useVoxelForge = !!voxelInst && forgeVoxels.length > 0 && (isLiveForge || st.revealed || forgeVoxelBuild);
      if (useVoxelForge) {
        const placed = Math.min(forgeVoxels.length, Math.round(targetP * forgeVoxels.length));
        smoothProgressRef.current = placed / forgeVoxels.length;
        if (placed > lastPlacedVoxels) {
          lastPlacedVoxels = placed;
          dropAnimStart = now;
        }
      } else {
        smoothProgressRef.current += (targetP - smoothProgressRef.current) * lerpK * snap;
      }
      assemblyRef.current = smoothProgressRef.current;
      const assembly = smoothProgressRef.current;

      if (st.revealed && !interactive) {
        paintT = 1;
      } else if (st.revealed) {
        paintT = Math.min(1, paintT + (dt / 16.67) * 0.042);
      } else {
        paintT = 0;
      }

      const scaledParts = assembly * n;
      const partsDone = Math.floor(scaledParts + 0.0001);
      const activePartFrac = scaledParts - partsDone;
      let touchedMesh = false;

      if (useVoxelForge && voxelInst) {
        const voxMesh = voxelInst;
        voxMesh.visible = true;
        const placedCount = st.revealed
          ? forgeVoxels.length
          : Math.min(forgeVoxels.length, Math.round(targetP * forgeVoxels.length));
        const sinceDrop = now - dropAnimStart;
        const dropT = !st.revealed && placedCount > 0
          ? Math.min(1, Math.max(0, (sinceDrop - particleLandMs()) / 200))
          : 1;
        const dropEase = dropT * dropT * (3 - 2 * dropT);

        let visibleCount = 0;
        for (let i = 0; i < forgeVoxels.length; i++) {
          const v = forgeVoxels[i]!;
          const settled = st.revealed || i < placedCount - 1;
          const landing = !st.revealed && i === placedCount - 1 && placedCount > 0 && sinceDrop >= particleLandMs();

          if (!settled && !landing) {
            continue;
          }

          const lock = settled ? 1 : dropEase;
          const drop = settled ? 0 : (1 - lock) * 0.35;
          voxelDummy.position.set(v.x, v.y + drop, v.z);
          voxelDummy.scale.setScalar(Math.max(0.04, lock));
          voxelDummy.rotation.set(0, 0, 0);
          voxelDummy.updateMatrix();
          voxMesh.setMatrixAt(visibleCount, voxelDummy.matrix);

          clayToneScratch.set(forgeClayToneHex(v.id || i));
          if (paintT > 0) {
            painted.set(resolveColor(v.color, st.primaryColor, st.accentColor));
            clayToneScratch.lerp(painted, paintT);
          }
          voxMesh.setColorAt(visibleCount, clayToneScratch);
          visibleCount++;
        }
        voxMesh.count = visibleCount;
        voxMesh.instanceMatrix.needsUpdate = true;
        if (voxMesh.instanceColor) voxMesh.instanceColor.needsUpdate = true;
        touchedMesh = true;

        group.children.forEach((child) => {
          if (child === voxMesh) return;
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.userData["part"]) mesh.visible = false;
        });
      } else {
        if (voxelInst) voxelInst.visible = false;

      let partIndex = 0;
      group.children.forEach((child) => {
        if (child === voxelInst) return;
        const mesh = child as THREE.Mesh;
        const part = mesh.userData["part"] as MeshPart | undefined;
        if (!part) return;
        const i = partIndex++;
        const dir = mesh.userData["dir"] as THREE.Vector3;
        const mat = mesh.material as PartMaterial;

        let lock = 0;
        if (st.revealed) {
          lock = 1;
        } else if (mesh.userData["lockedIn"]) {
          lock = 1;
        } else if (i < partsDone) {
          lock = 1;
        } else if (i === partsDone) {
          lock = activePartFrac;
        }

        if (lock <= 0) {
          if (mesh.visible) mesh.visible = false;
          mesh.userData["assembled"] = false;
          mesh.userData["lastLock"] = -1;
          return;
        }

        mesh.visible = true;
        if (lock >= 0.999 && !st.revealed) {
          mesh.userData["lockedIn"] = true;
          mesh.userData["assembled"] = true;
          lock = 1;
        }

        const lastLock = mesh.userData["lastLock"] as number;
        const isLockedIn = mesh.userData["lockedIn"] as boolean;
        if (isLockedIn && !st.revealed && paintT === 0) {
          mesh.position.set(part.x, part.y, part.z);
          mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
          mesh.scale.setScalar(1);
          if (Math.abs(lock - lastLock) < 0.0004) return;
        }

        mesh.userData["lastLock"] = lock;
        touchedMesh = true;

        const eased = lock * lock * (3 - 2 * lock);
        const scatter = (1 - eased) * 1.65;
        mesh.position.set(
          part.x + dir.x * scatter,
          part.y + dir.y * scatter * 0.55,
          part.z + dir.z * scatter,
        );

        mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
        const clayBlend = Math.min(1, eased * 1.08);
        mesh.scale.setScalar(0.72 + clayBlend * 0.28);

        painted.set(resolveColor(part.color, st.primaryColor, st.accentColor));
        mixed.copy(clayDark).lerp(clayLight, clayBlend);
        if (paintT > 0) mixed.lerp(painted, paintT);
        mat.color.copy(mixed);
        mat.emissive.copy(painted);
        mat.emissiveIntensity = pixelMode
          ? Math.sin(paintT * Math.PI) * 0.08
          : Math.sin(paintT * Math.PI) * (showcase ? 0.38 : opaqueBackground ? 0.72 : 0.55);
        const fadeIn = Math.min(1, lock / MIN_PART_LOCK);
        const needsFade = (clayBlend < 0.98 && !st.revealed) || fadeIn < 1;
        if (mat.transparent !== needsFade) mat.transparent = needsFade;
        mat.opacity = st.revealed ? 1 : (0.55 + clayBlend * 0.45) * fadeIn;
        if (paintT > 0.5) {
          if (mat instanceof THREE.MeshPhysicalMaterial && showcase) {
            applyProfileToMaterial(mat, part, mixed, showcase, envMap);
            mat.emissive.copy(painted);
            mat.emissiveIntensity = Math.sin(paintT * Math.PI) * 0.1;
          } else {
            const baseMetal = part.metal ?? (showcase ? 0.35 : opaqueBackground ? 0.42 : 0.35);
            const baseRough = part.rough ?? (showcase ? 0.38 : opaqueBackground ? 0.38 : 0.45);
            mat.metalness = baseMetal;
            mat.roughness = baseRough;
            if ("clearcoat" in mat && showcase) {
              mat.clearcoat = isGlassPart(part) ? 0.55 : 0.28;
              mat.clearcoatRoughness = 0.16;
            }
            if (mat.envMap) mat.envMapIntensity = showcase ? 1.12 : 1;
          }
        } else {
          mat.metalness = 0.06 + clayBlend * 0.12;
          mat.roughness = 0.88 - clayBlend * 0.2;
        }
      });

      } // end voxel vs part forge branch

      if (autoSpin && !dragging) group.rotation.y += (dt / 16.67) * (showcase ? 0.0028 : 0.0035);
      if (dragging) controls.update();
      const stillMoving = Math.abs(targetP - assembly) > 0.0008 || (paintT > 0 && paintT < 1);
      if (isLiveForge || autoSpin || stillMoving || touchedMesh || dragging || st.revealed) {
        draw(camera);
      }
    };
    animate(performance.now());
    draw(camera);

    return () => {
      disposed = true;
      pixelPass?.dispose();
      groundExtras.forEach((obj) => {
        scene.remove(obj);
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
      });
      envMap?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      geos.forEach((g) => g.dispose());
      if (voxelInst) {
        voxelInst.geometry.dispose();
        (voxelInst.material as THREE.Material).dispose();
      }
      group.children.forEach((c) => {
        const m = c as THREE.Mesh;
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      groupRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [size, meshParts, shapeId, autoSpin, interactive, forgeVoxelBuild, forgeTapRelaxed, opaqueBackground, accentColor, performanceMode, revealed]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size, touchAction: "manipulation", background: "transparent", overflow: "visible" }}
      data-testid="object-mesh-3d"
    />
  );
});

export function ObjectThumb({
  shapeId,
  primaryColor,
  accentColor,
  size,
  autoSpin = true,
  performanceMode = false,
  onGlFailed,
  onGlContextLost,
}: {
  shapeId: string;
  primaryColor: string;
  accentColor: string;
  size: number;
  autoSpin?: boolean;
  performanceMode?: boolean;
  onGlFailed?: () => void;
  onGlContextLost?: () => void;
}) {
  const parts = useMemo(
    () => getMeshParts(shapeId, primaryColor, accentColor),
    [shapeId, primaryColor, accentColor],
  );
  const hiFi = !performanceMode && size >= 96;
  return (
    <div
      className="object-thumb"
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <div
        aria-hidden
        className="object-thumb-glow"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * (hiFi ? 1.05 : 0.95),
          height: size * (hiFi ? 1.05 : 0.95),
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: hiFi
            ? `radial-gradient(circle at 50% 40%, ${accentColor}66 0%, ${primaryColor}33 38%, transparent 70%)`
            : `radial-gradient(circle at 50% 42%, ${accentColor}50 0%, ${primaryColor}28 40%, transparent 72%)`,
          filter: hiFi ? "blur(0.5px)" : undefined,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, width: size, height: size }}>
        <ObjectMesh3D
          parts={parts}
          shapeId={shapeId}
          primaryColor={primaryColor}
          accentColor={accentColor}
          progress={1}
          revealed
          size={size}
          autoSpin={autoSpin}
          interactive={false}
          performanceMode={performanceMode}
          onGlFailed={onGlFailed}
          onGlContextLost={onGlContextLost}
        />
      </div>
    </div>
  );
}

export const MysteryModel3D = ObjectMesh3D;
