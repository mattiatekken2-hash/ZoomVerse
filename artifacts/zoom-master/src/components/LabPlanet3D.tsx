import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface LabPlanet3DProps {
  color: string;
  size: number;
  progress?: number;
  onTap?: () => void;
  autoSpin?: boolean;
}

/** Lab-only 3D planet — drag to rotate, pinch/wheel to zoom. No orbit rings. */
export function LabPlanet3D({
  color,
  size,
  progress = 0,
  onTap,
  autoSpin = true,
}: LabPlanet3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onTapRef = useRef(onTap);
  const meshRef = useRef<THREE.Mesh | null>(null);
  onTapRef.current = onTap;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || size <= 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(5, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x888888, 0.28);
    fill.position.set(-4, -2, -3);
    scene.add(fill);

    const threeColor = new THREE.Color(color);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({
        color: threeColor,
        metalness: 0.82,
        roughness: 0.22,
        emissive: threeColor,
        emissiveIntensity: 0.14,
      }),
    );
    scene.add(mesh);
    meshRef.current = mesh;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 2.1;
    controls.maxDistance = 6;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

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
      if (!dragging && dx * dx + dy * dy < 36) {
        e.stopPropagation();
        onTapRef.current?.();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > 36) dragging = true;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (autoSpin) mesh.rotation.y += 0.004;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      meshRef.current = null;
    };
  }, [size, autoSpin]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const c = new THREE.Color(color);
    mat.color.copy(c);
    mat.emissive.copy(c);
    const scale = 0.72 + Math.min(1, progress) * 0.28;
    mesh.scale.setScalar(scale);
  }, [color, progress]);

  return (
    <div
      ref={mountRef}
      style={{
        width: size,
        height: size,
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        touchAction: "none",
      }}
      data-testid="lab-planet-3d"
    />
  );
}
