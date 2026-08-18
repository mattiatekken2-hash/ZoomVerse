import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  size?: number;
  shaking?: boolean;
  className?: string;
}

/** Voxel coords + hex color — chunky retro pixel-art alien in 3D. */
type VoxelDef = [number, number, number, number, "skin" | "eye" | "helmet" | "rim" | "antenna"];

const VOXEL_UNIT = 0.11;

/** Front-facing pixel alien: big head, black eyes, glass helmet, tiny antenna. */
const ALIEN_VOXELS: VoxelDef[] = [
  // Antenna
  [0, 6, 0, 0x6dff6d, "antenna"],
  [0, 5, 0, 0x4ade80, "antenna"],
  // Helmet bubble (cyan glass ring)
  [-2, 4, 0, 0x8ed4f0, "helmet"], [2, 4, 0, 0x8ed4f0, "helmet"],
  [-2, 3, 1, 0x7ec8e3, "helmet"], [2, 3, 1, 0x7ec8e3, "helmet"],
  [-1, 4, 1, 0x9ee5ff, "helmet"], [0, 4, 1, 0x9ee5ff, "helmet"], [1, 4, 1, 0x9ee5ff, "helmet"],
  [-2, 3, -1, 0x7ec8e3, "helmet"], [2, 3, -1, 0x7ec8e3, "helmet"],
  [-1, 4, -1, 0x9ee5ff, "helmet"], [0, 4, -1, 0x9ee5ff, "helmet"], [1, 4, -1, 0x9ee5ff, "helmet"],
  [0, 4, 2, 0x7ec8e3, "helmet"],
  [0, 4, -2, 0x7ec8e3, "helmet"],
  // Helmet rim
  [-2, 2, 1, 0x5a9fb8, "rim"], [2, 2, 1, 0x5a9fb8, "rim"],
  [-2, 2, -1, 0x5a9fb8, "rim"], [2, 2, -1, 0x5a9fb8, "rim"],
  [-1, 2, 2, 0x5a9fb8, "rim"], [0, 2, 2, 0x5a9fb8, "rim"], [1, 2, 2, 0x5a9fb8, "rim"],
  [-1, 2, -2, 0x5a9fb8, "rim"], [0, 2, -2, 0x5a9fb8, "rim"], [1, 2, -2, 0x5a9fb8, "rim"],
  // Head (white)
  [-1, 3, 0, 0xf4f4f4, "skin"], [0, 3, 0, 0xffffff, "skin"], [1, 3, 0, 0xf4f4f4, "skin"],
  [-2, 3, 0, 0xececec, "skin"], [2, 3, 0, 0xececec, "skin"],
  [-1, 2, 0, 0xffffff, "skin"], [0, 2, 0, 0xffffff, "skin"], [1, 2, 0, 0xffffff, "skin"],
  [-2, 2, 0, 0xe8e8e8, "skin"], [2, 2, 0, 0xe8e8e8, "skin"],
  [-1, 1, 0, 0xf0f0f0, "skin"], [0, 1, 0, 0xffffff, "skin"], [1, 1, 0, 0xf0f0f0, "skin"],
  // Eyes (black pixels)
  [-1, 2, 1, 0x0a0a0a, "eye"], [1, 2, 1, 0x0a0a0a, "eye"],
  [-1, 3, 1, 0x050505, "eye"], [1, 3, 1, 0x050505, "eye"],
  // Body
  [0, 0, 0, 0xffffff, "skin"],
  [-1, 0, 0, 0xececec, "skin"], [1, 0, 0, 0xececec, "skin"],
  [0, -1, 0, 0xf0f0f0, "skin"],
  // Feet
  [-1, -2, 0, 0xe0e0e0, "skin"], [1, -2, 0, 0xe0e0e0, "skin"],
  // Arms
  [-2, 0, 0, 0xeeeeee, "skin"], [2, 0, 0, 0xeeeeee, "skin"],
];

function makeVoxelMaterial(kind: VoxelDef[4]): THREE.MeshLambertMaterial {
  switch (kind) {
    case "eye":
      return new THREE.MeshLambertMaterial({ color: 0x0a0a0a, flatShading: true });
    case "helmet":
      return new THREE.MeshLambertMaterial({
        color: 0x9ee5ff,
        transparent: true,
        opacity: 0.55,
        flatShading: true,
      });
    case "rim":
      return new THREE.MeshLambertMaterial({ color: 0x5a9fb8, flatShading: true });
    case "antenna":
      return new THREE.MeshLambertMaterial({ color: 0x6dff6d, flatShading: true, emissive: 0x224422, emissiveIntensity: 0.35 });
    default:
      return new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  }
}

/** Retro pixel-art alien — low-res render scaled up with crisp pixels. */
export function AlienScrapper3D({ size = 72, shaking = false, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const shakingRef = useRef(shaking);
  shakingRef.current = shaking;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const PIXEL = 96;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 30);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(PIXEL, PIXEL, false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.imageRendering = "pixelated";
    mount.appendChild(canvas);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.45);
    fill.position.set(-3, 1, -2);
    scene.add(fill);

    const alien = new THREE.Group();
    scene.add(alien);

    const cubeGeo = new THREE.BoxGeometry(VOXEL_UNIT * 0.94, VOXEL_UNIT * 0.94, VOXEL_UNIT * 0.94);
    const matCache = new Map<string, THREE.MeshLambertMaterial>();

    for (const [ix, iy, iz, hex, kind] of ALIEN_VOXELS) {
      const keyMat = kind;
      let mat = matCache.get(keyMat);
      if (!mat) {
        mat = makeVoxelMaterial(kind);
        matCache.set(keyMat, mat);
      }
      const mesh = new THREE.Mesh(cubeGeo, mat);
      mesh.position.set(ix * VOXEL_UNIT, iy * VOXEL_UNIT, iz * VOXEL_UNIT);
      alien.add(mesh);
    }

    alien.position.y = -0.15;
    camera.position.set(2.2, 1.4, 3.4);
    camera.lookAt(0, 0.35, 0);

    let frameId = 0;
    let t0 = performance.now();
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;
      const t = (now - t0) / 1000;
      const bob = Math.sin(t * 2.4) * 0.05;
      alien.position.y = -0.15 + bob;

      if (shakingRef.current) {
        alien.rotation.z = Math.sin(t * 30) * 0.1;
        alien.rotation.x = Math.sin(t * 24) * 0.06;
      } else {
        alien.rotation.z = Math.sin(t * 1.1) * 0.04;
        alien.rotation.x = 0;
        alien.rotation.y = Math.sin(t * 0.85) * 0.18;
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
        }
      });
      cubeGeo.dispose();
      matCache.forEach((m) => m.dispose());
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      aria-hidden
      style={{
        width: size,
        height: size,
        pointerEvents: "none",
        imageRendering: "pixelated",
      }}
    />
  );
}
