import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelVoxel } from "@workspace/game-models";

interface MysteryModel3DProps {
  voxels: ModelVoxel[];
  primaryColor: string;
  accentColor: string;
  /** 0–1 build progress during forge */
  progress?: number;
  /** When false, identity is hidden (wireframe / grey blocks) */
  revealed?: boolean;
  size: number;
  onTap?: () => void;
  autoSpin?: boolean;
}

const VOXEL_SIZE = 0.22;
const MYSTERY_COLOR = "#3a3a3a";

/** Progressive pixel-voxel build — mystery until revealed. */
export function MysteryModel3D({
  voxels,
  primaryColor,
  accentColor,
  progress = 0,
  revealed = false,
  size,
  onTap,
  autoSpin = true,
}: MysteryModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTapRef = useRef(onTap);
  const groupRef = useRef<THREE.Group | null>(null);
  onTapRef.current = onTap;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(1.8, 1.4, 2.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x888888, 0.3);
    fill.position.set(-3, -2, -4);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    const meshes: THREE.Mesh[] = [];

    for (const v of voxels) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(MYSTERY_COLOR),
        metalness: revealed ? 0.35 : 0.1,
        roughness: revealed ? 0.45 : 0.85,
        wireframe: !revealed,
        transparent: !revealed,
        opacity: revealed ? 1 : 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(v.x * VOXEL_SIZE, v.y * VOXEL_SIZE, v.z * VOXEL_SIZE);
      mesh.userData["targetColor"] = v.color;
      group.add(mesh);
      meshes.push(mesh);
    }

    if (meshes.length === 0) {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: MYSTERY_COLOR, wireframe: true }),
      );
      group.add(fallback);
      meshes.push(fallback);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 5.5;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.2, 0);

    let dragging = false;
    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = false;
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.hypot(dx, dy) < 8 && onTapRef.current) onTapRef.current();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (autoSpin && !dragging) group.rotation.y += 0.004;
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
      geo.dispose();
      meshes.forEach((m) => {
        (m.material as THREE.Material).dispose();
        m.removeFromParent();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      groupRef.current = null;
    };
  }, [size, voxels, autoSpin]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const visibleCount = Math.max(
      1,
      Math.floor(voxels.length * Math.min(Math.max(progress, 0.02), 1)),
    );

    group.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const show = i < visibleCount;
      mesh.visible = show;
      if (!show) return;

      if (revealed) {
        const target = (mesh.userData["targetColor"] as string) || primaryColor;
        mat.color.set(target);
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1;
        mat.metalness = 0.35;
        mat.roughness = 0.45;
      } else {
        mat.color.set(i % 3 === 0 ? accentColor : MYSTERY_COLOR);
        mat.wireframe = true;
        mat.transparent = true;
        mat.opacity = 0.5 + progress * 0.35;
      }
      mat.needsUpdate = true;
    });
  }, [progress, revealed, voxels.length, primaryColor, accentColor]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size, touchAction: "manipulation" }}
      data-testid="mystery-model-3d"
    />
  );
}
