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
  onTap?: () => void;
  autoSpin?: boolean;
  interactive?: boolean;
}

function resolveColor(c: MeshPart["color"], primary: string, accent: string): string {
  if (c === "p") return primary;
  if (c === "a") return accent;
  return c;
}

function makeGeometry(part: MeshPart): THREE.BufferGeometry {
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
    const renderer = new THREE.WebGLRenderer({ antialias: size > 90, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, size > 90 ? 1.75 : 1.25));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.background = "transparent";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899aa, 0.35);
    fill.position.set(-4, -1, -3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(0, 2, -5);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;
    partsRef.current = meshParts;

    const geos: THREE.BufferGeometry[] = [];
    for (const part of meshParts) {
      const geo = makeGeometry(part);
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
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
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && onTapRef.current) onTapRef.current();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let frameId = 0;
    let paintT = 0;
    const clayDark = new THREE.Color("#6a6a6a");
    const clayLight = new THREE.Color("#c8c8c8");
    const painted = new THREE.Color();
    const mixed = new THREE.Color();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const st = stateRef.current;
      const list = partsRef.current;
      const n = Math.max(list.length, 1);

      if (st.revealed) paintT = Math.min(1, paintT + 0.042);
      else paintT = 0;

      group.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh;
        const part = mesh.userData["part"] as MeshPart;
        const dir = mesh.userData["dir"] as THREE.Vector3;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const stagger = (i / n) * 0.18;
        const lock = st.revealed ? 1 : Math.min(1, Math.max(0, (st.progress - stagger) / 0.82));
        mesh.visible = true;

        const scatter = (1 - lock) * 1.15;
        mesh.position.set(
          part.x + dir.x * scatter,
          part.y + dir.y * scatter * 0.7,
          part.z + dir.z * scatter,
        );
        mesh.rotation.set(
          (part.rx ?? 0) + (1 - lock) * dir.y * 0.6,
          (part.ry ?? 0) + (1 - lock) * dir.x * 0.8,
          part.rz ?? 0,
        );

        painted.set(resolveColor(part.color, st.primaryColor, st.accentColor));
        mixed.copy(lock < 0.62 ? clayDark : clayLight).lerp(painted, paintT);
        mat.color.copy(mixed);
        mat.emissive.copy(painted);
        mat.emissiveIntensity = Math.sin(paintT * Math.PI) * 0.55;
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1;
        mat.metalness = paintT > 0.5 ? (part.metal ?? 0.35) : 0.08;
        mat.roughness = paintT > 0.5 ? (part.rough ?? 0.45) : 0.82;
      });

      if (autoSpin && !dragging) group.rotation.y += 0.008;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
  }, [size, meshParts, autoSpin, interactive]);

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
}: {
  shapeId: string;
  primaryColor: string;
  accentColor: string;
  size: number;
  autoSpin?: boolean;
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
    />
  );
}

export const MysteryModel3D = ObjectMesh3D;
