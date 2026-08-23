import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { FORGE_CLAY, FORGE_VOXEL_SIZE } from "@workspace/game-models";
import type { VoxelCoord } from "../utils/voxelStudioStore";

/** Same cube fill + edge as Lab forge voxels in MysteryModel3D. */
const CUBE_FILL = 0.98;
const VOXEL = FORGE_VOXEL_SIZE;
const EDGE = 0x454545;
const MAX_VOXELS = 900;

function vkey(v: VoxelCoord) {
  return `${v.x},${v.y},${v.z}`;
}

function addLabGrid(scene: THREE.Scene): THREE.Group {
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
  gridPivot.userData.isForgeGridPivot = true;

  const floorGrid = new THREE.GridHelper(span, cells, 0xb8c0cc, 0x6a7280);
  tuneGrid(floorGrid, 0.38);
  floorGrid.position.y = -1.25;
  gridPivot.add(floorGrid);

  const backGrid = new THREE.GridHelper(span, cells, 0xa0a8b8, 0x505868);
  tuneGrid(backGrid, 0.2);
  backGrid.rotation.x = Math.PI / 2;
  backGrid.position.set(0, -0.55, -1.35);
  gridPivot.add(backGrid);
  scene.add(gridPivot);

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
  return gridPivot;
}

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

export function VoxelStudioCanvas({
  voxels,
  onAdd,
  onRemove,
  onPaint,
  paintColor,
  preview,
}: {
  voxels: VoxelCoord[];
  onAdd?: (v: VoxelCoord) => void;
  onRemove?: (v: VoxelCoord) => void;
  onPaint?: (v: VoxelCoord) => void;
  paintColor?: number | null;
  preview?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const voxelsRef = useRef(voxels);
  const onAddRef = useRef(onAdd);
  const onRemoveRef = useRef(onRemove);
  const onPaintRef = useRef(onPaint);
  const paintColorRef = useRef(paintColor);
  voxelsRef.current = voxels;
  onAddRef.current = onAdd;
  onRemoveRef.current = onRemove;
  onPaintRef.current = onPaint;
  paintColorRef.current = paintColor;
  const syncRef = useRef<(next: VoxelCoord[]) => void>(() => {});

  const handleHostClick = useCallback(() => {
    /* raycast lives on pointerup */
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(preview ? 42 : 42, 1, 0.08, 40);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    host.style.overflow = "hidden";
    host.appendChild(canvas);

    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x909098, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 1.65);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-3, 2, -4);
    scene.add(fill);

    const gridPivot = preview ? null : addLabGrid(scene);

    const cube = VOXEL * CUBE_FILL;
    const geo = new THREE.BoxGeometry(cube, cube, cube);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_VOXELS);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    scene.add(mesh);
    const tint = new THREE.Color();

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

    const dummy = new THREE.Object3D();
    const focus = new THREE.Vector3();
    const camDir = new THREE.Vector3(1.35, 0.95, 1.7).normalize();
    let dist = preview ? 1.85 : 3.2;
    let distUser = false;
    let theta = Math.atan2(camDir.x, camDir.z);
    let phi = Math.acos(Math.min(1, Math.max(-1, camDir.y)));

    const orbitCam = () => {
      camera.position.set(
        focus.x + dist * Math.sin(phi) * Math.sin(theta),
        focus.y + dist * Math.cos(phi),
        focus.z + dist * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(focus);
    };

    const sync = (list: VoxelCoord[]) => {
      const n = Math.min(list.length, MAX_VOXELS);
      for (let i = 0; i < n; i++) {
        const v = list[i]!;
        dummy.position.set(v.x * VOXEL, v.y * VOXEL, v.z * VOXEL);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.setHex(typeof v.color === "number" ? v.color : FORGE_CLAY);
        mesh.setColorAt(i, tint);
        const base = i * UNIT_BOX_EDGES.length;
        for (let j = 0; j < UNIT_BOX_EDGES.length; j += 3) {
          edgeBuf[base + j] = dummy.position.x + UNIT_BOX_EDGES[j]! * cube;
          edgeBuf[base + j + 1] = dummy.position.y + UNIT_BOX_EDGES[j + 1]! * cube;
          edgeBuf[base + j + 2] = dummy.position.z + UNIT_BOX_EDGES[j + 2]! * cube;
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      edgeGeo.setDrawRange(0, n * edgeVertCount);
      const posAttr = edgeGeo.getAttribute("position") as THREE.BufferAttribute;
      posAttr.needsUpdate = true;

      focus.copy(worldCenter(list));
      if (!preview && list.length > 0 && !distUser) {
        let maxR = 0.4;
        for (const v of list) {
          const dx = v.x * VOXEL - focus.x;
          const dy = v.y * VOXEL - focus.y;
          const dz = v.z * VOXEL - focus.z;
          maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
        dist = Math.min(6.2, Math.max(2.4, maxR * 5.4 + 1.35));
      }
      orbitCam();
    };
    syncRef.current = sync;
    sync(voxelsRef.current);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let holdTimer: number | null = null;
    let holdFired = false;
    let holdTarget: VoxelCoord | null = null;

    const clearHold = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartCamDist = dist;
    let pinching = false;
    let pinchUsed = false;

    const pinchDistance = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    };

    const hitAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(mesh);
      const hit = hits[0];
      if (!hit || hit.instanceId == null) return null;
      const src = voxelsRef.current[hit.instanceId];
      if (!src) return null;
      return { src, hit };
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        pinching = true;
        pinchUsed = true;
        distUser = true;
        pinchStartDist = pinchDistance() || 1;
        pinchStartCamDist = dist;
        dragging = false;
        clearHold();
        return;
      }
      dragging = true;
      moved = 0;
      holdFired = false;
      holdTarget = null;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
      if (preview) return;
      const found = hitAt(e.clientX, e.clientY);
      holdTarget = found?.src ?? null;
      if (!holdTarget || !onRemoveRef.current) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        if (!holdTarget || moved > 10 || pinchUsed) return;
        if (voxelsRef.current.length <= 1) return;
        holdFired = true;
        onRemoveRef.current?.(holdTarget);
        try { navigator.vibrate?.(12); } catch { /* */ }
      }, 380);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching && pointers.size >= 2) {
        const d = pinchDistance();
        if (d > 0 && pinchStartDist > 0) {
          dist = Math.min(6.2, Math.max(1.05, pinchStartCamDist * (pinchStartDist / d)));
        }
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 10) clearHold();
      theta -= dx * 0.008;
      phi = Math.min(Math.PI - 0.12, Math.max(0.18, phi - dy * 0.008));
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinching = false;
      if (pointers.size === 0) {
        dragging = false;
        const skipAdd = pinchUsed;
        pinchUsed = false;
        clearHold();
        if (preview || holdFired || skipAdd || moved > 8) return;
        const found = hitAt(e.clientX, e.clientY);
        if (!found) return;
        const paint = paintColorRef.current;
        if (paint != null && onPaintRef.current) {
          onPaintRef.current({ ...found.src, color: paint });
          return;
        }
        if (!onAddRef.current) return;
        const nrm = found.hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
        const next: VoxelCoord = {
          x: found.src.x + Math.round(nrm.x),
          y: found.src.y + Math.round(nrm.y),
          z: found.src.z + Math.round(nrm.z),
        };
        const list = voxelsRef.current;
        const occ = new Set(list.map(vkey));
        if (occ.has(vkey(next)) || list.length >= MAX_VOXELS) return;
        onAddRef.current(next);
        return;
      }
      dragging = false;
      clearHold();
    };
    const onPointerCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinching = false;
      if (pointers.size === 0) {
        dragging = false;
        pinchUsed = false;
      }
      clearHold();
    };
    const onWheel = (e: WheelEvent) => {
      if (preview) return;
      e.preventDefault();
      distUser = true;
      dist = Math.min(6.2, Math.max(1.05, dist + e.deltaY * 0.004));
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerCancel);
    host.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    let lastFrame = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(32, now - lastFrame);
      lastFrame = now;
      if (preview) theta += 0.006;
      if (gridPivot) gridPivot.rotation.y += (Math.PI * 2 * dt) / 100_000;
      orbitCam();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerCancel);
      host.removeEventListener("wheel", onWheel);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      geo.dispose();
      mat.dispose();
      edgeGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [preview]);

  useEffect(() => {
    syncRef.current(voxels);
  }, [voxels]);

  return (
    <div
      ref={hostRef}
      onClick={handleHostClick}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    />
  );
}
