import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  size?: number;
  shaking?: boolean;
  className?: string;
}

/** White alien with black eyes + glass space helmet (procedural Three.js). */
export function AlienScrapper3D({ size = 72, shaking = false, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shakingRef = useRef(shaking);
  shakingRef.current = shaking;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 4, 3.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88ccff, 0.55);
    rim.position.set(-3, 1, -2);
    scene.add(rim);

    const alien = new THREE.Group();
    scene.add(alien);

    const skin = new THREE.MeshStandardMaterial({
      color: 0xf8f8f8,
      roughness: 0.42,
      metalness: 0.04,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.25,
      metalness: 0.1,
    });
    const helmetGlass = new THREE.MeshPhysicalMaterial({
      color: 0xdaf4ff,
      roughness: 0.04,
      metalness: 0,
      transmission: 0.88,
      thickness: 0.35,
      transparent: true,
      opacity: 0.92,
    });
    const helmetRim = new THREE.MeshStandardMaterial({
      color: 0xb8d4e8,
      roughness: 0.35,
      metalness: 0.55,
    });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), skin);
    head.scale.set(1, 1.08, 0.92);
    head.position.y = 0.05;
    alien.add(head);

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 20), eyeMat);
    leftEye.scale.set(0.85, 1.35, 0.55);
    leftEye.position.set(-0.14, 0.12, 0.34);
    alien.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.14;
    alien.add(rightEye);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 8, 16), skin);
    body.position.y = -0.52;
    alien.add(body);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 32), helmetGlass);
    helmet.scale.set(1, 1.05, 1);
    helmet.position.y = 0.08;
    alien.add(helmet);

    const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 12, 40), helmetRim);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(0, -0.18, 0.02);
    alien.add(rimMesh);

    camera.position.set(0, 0.05, 2.35);
    camera.lookAt(0, 0, 0);

    let frameId = 0;
    let t0 = performance.now();
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;
      const t = (now - t0) / 1000;
      const bob = Math.sin(t * 2.2) * 0.04;
      alien.position.y = bob;
      if (shakingRef.current) {
        alien.rotation.z = Math.sin(t * 28) * 0.08;
        alien.rotation.x = Math.sin(t * 22) * 0.04;
      } else {
        alien.rotation.z = Math.sin(t * 0.9) * 0.04;
        alien.rotation.x = 0;
        alien.rotation.y = Math.sin(t * 0.7) * 0.12;
      }
      renderer.render(scene, camera);
    };
    animate(t0);

    return () => {
      cancelAnimationFrame(frameId);
      alien.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      aria-hidden
      style={{ width: size, height: size, pointerEvents: "none" }}
    />
  );
}
