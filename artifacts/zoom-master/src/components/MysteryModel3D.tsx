import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getMeshParts, mysteryKitParts, type MeshPart } from "@workspace/game-models";

const DEFAULT_PARTS = mysteryKitParts();

interface ObjectMesh3DProps {
  parts?: MeshPart[];
  primaryColor: string;
  accentColor: string;
  /** 0–1 assembly progress */
  progress?: number;
  revealed?: boolean;
  size: number;
  onTap?: (point?: { x: number; y: number }) => void;
  autoSpin?: boolean;
  interactive?: boolean;
  /** Solid dark backdrop instead of transparent canvas (Farm detail view). */
  opaqueBackground?: boolean;
  /** Lower GPU cost for live Lab forging. */
  performanceMode?: boolean;
}

function resolveColor(c: MeshPart["color"], primary: string, accent: string): string {
  if (c === "p") return primary;
  if (c === "a") return accent;
  return c;
}

function makeGeometry(part: MeshPart, lowDetail = false): THREE.BufferGeometry {
  if (lowDetail) {
    switch (part.prim) {
      case "sphere":
        return new THREE.SphereGeometry(part.sx, 10, 8);
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
  switch (part.prim) {
    case "sphere":
      return new THREE.SphereGeometry(part.sx, 18, 14);
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

function scatterDir(id: string): THREE.Vector3 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 628) / 100;
  const b = (((h >>> 8) % 314) / 100) - 0.5;
  return new THREE.Vector3(Math.cos(a), 0.4 + b, Math.sin(a)).normalize();
}

/** Clay silhouette assembles while tapping, then paints with rarity colors. */
export function ObjectMesh3D({
  parts,
  primaryColor,
  accentColor,
  progress = 0,
  revealed = false,
  size,
  onTap,
  autoSpin = true,
  interactive = true,
  opaqueBackground = false,
  performanceMode = false,
}: ObjectMesh3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTapRef = useRef(onTap);
  const groupRef = useRef<THREE.Group | null>(null);
  const partsRef = useRef<MeshPart[]>([]);
  const stateRef = useRef({ progress, revealed, primaryColor, accentColor });
  onTapRef.current = onTap;
  stateRef.current = { progress, revealed, primaryColor, accentColor };

  const meshParts = parts && parts.length > 0 ? parts : DEFAULT_PARTS;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const maxDpr = performanceMode ? 1.25 : (size > 90 ? 1.75 : 1.25);
    const renderer = new THREE.WebGLRenderer({
      antialias: !performanceMode && size > 90,
      alpha: !opaqueBackground,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
    renderer.setSize(size, size);
    if (opaqueBackground) {
      renderer.setClearColor(0x060810, 1);
      renderer.domElement.style.background = "#060810";
    } else {
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.background = "transparent";
    }
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, opaqueBackground ? 0.55 : 0.5));
    if (!performanceMode) {
      scene.add(new THREE.HemisphereLight(0xaaccff, 0x221122, opaqueBackground ? 0.45 : 0.25));
    }
    const key = new THREE.DirectionalLight(0xffffff, opaqueBackground ? 1.35 : (performanceMode ? 0.95 : 1.05));
    key.position.set(4, 7, 5);
    scene.add(key);
    if (!performanceMode) {
      const fill = new THREE.DirectionalLight(0x8899cc, opaqueBackground ? 0.5 : 0.35);
      fill.position.set(-4, -1, -3);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffffff, opaqueBackground ? 0.45 : 0.2);
      rim.position.set(0, 2, -5);
      scene.add(rim);
      const accentLight = new THREE.PointLight(new THREE.Color(accentColor), opaqueBackground ? 0.85 : 0.35, 12);
      accentLight.position.set(-2, 3, 4);
      scene.add(accentLight);
    }

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;
    partsRef.current = meshParts;

    const geos: THREE.BufferGeometry[] = [];
    for (const part of meshParts) {
      const geo = makeGeometry(part, performanceMode);
      geos.push(geo);
      const mat = new THREE.MeshStandardMaterial({
        color: "#3a3a3a",
        metalness: part.metal ?? 0.25,
        roughness: part.rough ?? 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.x, part.y, part.z);
      mesh.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
      mesh.userData["part"] = part;
      mesh.userData["dir"] = scatterDir(part.id);
      mesh.userData["lastLock"] = -1;
      mesh.userData["assembled"] = false;
      group.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(dim.x, dim.y, dim.z, 0.8);
    group.position.sub(center);
    camera.position.set(maxDim * 1.35, maxDim * 0.95, maxDim * 1.7);
    camera.lookAt(0, 0, 0);

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
    let paintT = 0;
    let lastFrame = performance.now();
    const smoothProgressRef = { current: progress };
    const clayDark = new THREE.Color("#6a6a6a");
    const clayLight = new THREE.Color("#c8c8c8");
    const painted = new THREE.Color();
    const mixed = new THREE.Color();

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;

      const dt = Math.min(32, now - lastFrame);
      lastFrame = now;
      const st = stateRef.current;
      const list = partsRef.current;
      const n = Math.max(list.length, 1);

      const targetP = st.revealed ? 1 : Math.min(1, Math.max(0, st.progress));
      const lerpK = 1 - Math.pow(0.001, dt / 16.67);
      smoothProgressRef.current += (targetP - smoothProgressRef.current) * lerpK * 0.55;
      const assembly = smoothProgressRef.current;

      if (st.revealed) paintT = Math.min(1, paintT + (dt / 16.67) * 0.042);
      else paintT = 0;

      const scaledParts = assembly * n;
      const partsDone = Math.floor(scaledParts);
      const activePartFrac = scaledParts - partsDone;
      let touchedMesh = false;

      group.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        const part = mesh.userData["part"] as MeshPart;
        const dir = mesh.userData["dir"] as THREE.Vector3;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const assembled = mesh.userData["assembled"] as boolean;

        let lock = 0;
        if (st.revealed) {
          lock = 1;
        } else if (i < partsDone) {
          lock = 1;
        } else if (i === partsDone) {
          lock = activePartFrac;
        }

        if (lock <= 0.008) {
          if (mesh.visible) mesh.visible = false;
          mesh.userData["assembled"] = false;
          mesh.userData["lastLock"] = -1;
          return;
        }

        if (assembled && !st.revealed && paintT === 0 && i < partsDone) {
          if (!mesh.visible) mesh.visible = true;
          return;
        }

        const lastLock = mesh.userData["lastLock"] as number;
        if (Math.abs(lock - lastLock) < 0.0004 && paintT === 0 && lock >= 0.999 && !st.revealed) {
          mesh.userData["assembled"] = true;
          if (!mesh.visible) mesh.visible = true;
          return;
        }
        mesh.userData["lastLock"] = lock;
        touchedMesh = true;

        mesh.visible = true;

        const eased = lock * lock * (3 - 2 * lock);
        const scatter = (1 - eased) * 1.35;
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
        mat.emissiveIntensity = Math.sin(paintT * Math.PI) * (opaqueBackground ? 0.72 : 0.55);
        const needsFade = clayBlend < 0.98 && !st.revealed;
        if (mat.transparent !== needsFade) mat.transparent = needsFade;
        mat.opacity = st.revealed ? 1 : 0.55 + clayBlend * 0.45;
        if (paintT > 0.5) {
          mat.metalness = part.metal ?? (opaqueBackground ? 0.42 : 0.35);
          mat.roughness = part.rough ?? (opaqueBackground ? 0.38 : 0.45);
        } else {
          mat.metalness = 0.06 + clayBlend * 0.12;
          mat.roughness = 0.88 - clayBlend * 0.2;
        }

        if (lock >= 0.999 && !st.revealed && paintT === 0) {
          mesh.userData["assembled"] = true;
        }
      });

      if (autoSpin && !dragging) group.rotation.y += (dt / 16.67) * 0.0035;
      if (dragging) controls.update();
      const stillMoving = Math.abs(targetP - assembly) > 0.0008 || paintT > 0 && paintT < 1;
      if (autoSpin || stillMoving || touchedMesh || dragging || st.revealed) {
        renderer.render(scene, camera);
      }
    };
    animate(performance.now());

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      controls.dispose();
      geos.forEach((g) => g.dispose());
      group.children.forEach((c) => {
        const m = c as THREE.Mesh;
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      groupRef.current = null;
    };
  }, [size, meshParts, autoSpin, interactive, opaqueBackground, accentColor, performanceMode]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size, touchAction: "manipulation", background: "transparent" }}
      data-testid="object-mesh-3d"
    />
  );
}

export function ObjectThumb({
  shapeId,
  primaryColor,
  accentColor,
  size,
  autoSpin = true,
  opaqueBackground = false,
}: {
  shapeId: string;
  primaryColor: string;
  accentColor: string;
  size: number;
  autoSpin?: boolean;
  opaqueBackground?: boolean;
}) {
  const parts = useMemo(
    () => getMeshParts(shapeId, primaryColor, accentColor),
    [shapeId, primaryColor, accentColor],
  );
  return (
    <ObjectMesh3D
      parts={parts}
      primaryColor={primaryColor}
      accentColor={accentColor}
      progress={1}
      revealed
      size={size}
      autoSpin={autoSpin}
      interactive={false}
      opaqueBackground={opaqueBackground}
    />
  );
}

export const MysteryModel3D = ObjectMesh3D;
