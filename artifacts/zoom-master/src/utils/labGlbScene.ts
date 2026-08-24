import * as THREE from "three";

/**
 * Vertical forge wall only — floor stays put.
 * Angled behind-left like the old “muro laterale”, short enough that it
 * never swings in front of the camera.
 */
export function poseForgeSideWall(backGrid: THREE.Object3D, maxDim: number) {
  backGrid.rotation.set(Math.PI / 2, 0.82, 0);
  backGrid.position.set(-maxDim * 0.95, maxDim * 0.05, -maxDim * 1.2);
}

/** Slow floor spin (rad / ms) — same in Lab and Create your model. Time-based so 120 Hz stays smooth, not faster. */
export const FORGE_FLOOR_SPIN_PER_MS = 0.00012;

/** Target max axis length after fit — same in picker, reveal card, and forge morph. */
export const LAB_GLB_FIT_SIZE = 1.65;

/** Auto-spin rad/frame @ ~60fps — lab picker / reveal. */
export const LAB_GLB_SPIN_RATE = 0.0042;

/** Slower spin for farm slot cards — easier on the eyes. */
export const FARM_GLB_SPIN_RATE = 0.0026;

/** Center a loaded GLB at origin and uniform-scale to target max dimension. */
export function fitGlbToCenter(root: THREE.Object3D, targetMaxDim = LAB_GLB_FIT_SIZE): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let hasMesh = false;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const meshBox = new THREE.Box3().setFromObject(mesh);
    if (!meshBox.isEmpty()) {
      box.union(meshBox);
      hasMesh = true;
    }
  });
  if (!hasMesh) {
    box.setFromObject(root);
  }
  if (box.isEmpty()) {
    root.position.set(0, 0, 0);
    root.scale.setScalar(1);
    return targetMaxDim;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetMaxDim / maxAxis;
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  root.updateMatrixWorld(true);
  return targetMaxDim;
}

/** Rough triangle count — skip heavy line-art on scene GLBs. */
export function glbTriangleCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    n += mesh.geometry.attributes.position.count / 3;
  });
  return n;
}

export function addForgeSpaceGrid(scene: THREE.Scene, maxDim: number): THREE.Object3D[] {
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

  const floorGrid = new THREE.GridHelper(span, cells, 0xb8c0cc, 0x6a7280);
  tuneGrid(floorGrid, 0.38);
  floorGrid.position.y = -maxDim * 0.46;
  floorGrid.userData.isForgeFloor = true;
  scene.add(floorGrid);
  extras.push(floorGrid);

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
    }),
  );
  stars.renderOrder = -20;
  scene.add(stars);
  extras.push(stars);

  return extras;
}

/** Path-colored edge lines — picker studio, keeps GLB base colors. */
export function applyPathLineArt(
  root: THREE.Object3D,
  lineHex: number,
  thresholdAngle = 32,
): THREE.Object3D[] {
  const extras: THREE.Object3D[] = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
    const seg = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: lineHex,
        transparent: true,
        opacity: 0.52,
        depthTest: true,
        depthWrite: false,
      }),
    );
    seg.renderOrder = 3;
    mesh.add(seg);
    extras.push(seg);
  });
  return extras;
}

/** Soft ambient fill for floating picker preview — no floor disc. */
export function addStudioAmbient(
  scene: THREE.Scene,
  maxDim: number,
  glowHex = 0xaabbcc,
): THREE.Object3D[] {
  const key = new THREE.PointLight(glowHex, 0.2, maxDim * 4.5);
  key.position.set(0.35, 0.55, 1.1);
  scene.add(key);
  const rim = new THREE.PointLight(glowHex, 0.12, maxDim * 3.2);
  rim.position.set(-0.8, 0.2, -0.6);
  scene.add(rim);
  return [key, rim];
}

export function disposeSceneObject(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const line = node as THREE.LineSegments;
    if (line.isLineSegments) {
      line.geometry?.dispose?.();
      const mat = line.material;
      if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
      else mat?.dispose?.();
      return;
    }
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m?.dispose?.());
  });
}
