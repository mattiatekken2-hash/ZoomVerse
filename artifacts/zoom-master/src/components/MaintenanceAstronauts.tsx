import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const HOT_SUN_GLB = "/assets/models/hot_sun.glb";

export function MaintenanceAstronauts() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const size = Math.min(mount.clientWidth, mount.clientHeight, 360);
    if (size <= 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff0d0, 1.65);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8844, 0.85);
    rim.position.set(-3, 1, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xffaa44, 1.1, 20);
    fill.position.set(0, -2, 3);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    let frameId = 0;
    let disposed = false;

    const fitModel = (model: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const dim = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(dim.x, dim.y, dim.z, 0.01);
      model.position.sub(center);
      model.scale.setScalar(2.4 / maxDim);
      root.add(model);
      camera.position.set(0, 0.15, 4.2);
      camera.lookAt(0, 0, 0);
    };

    const state = { renderSize: size };
    camera.aspect = 1;
    camera.updateProjectionMatrix();

    const applySize = (next: number) => {
      if (next <= 0) return;
      state.renderSize = next;
      renderer.setSize(next, next);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader();
    loader.load(
      HOT_SUN_GLB,
      (gltf) => {
        if (disposed) return;
        fitModel(gltf.scene);
        renderer.render(scene, camera);
      },
      undefined,
      () => { /* keep empty canvas if load fails */ },
    );

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) return;
      root.rotation.y += 0.008;
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const next = Math.min(mount.clientWidth, mount.clientHeight, 360);
      if (Math.abs(next - state.renderSize) < 2) return;
      applySize(next);
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(frameId);
      root.traverse((node) => {
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
  }, []);

  return (
    <div
      aria-hidden="true"
      ref={mountRef}
      style={{
        position: "absolute",
        top: "8%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(78vw, 340px)",
        height: "min(78vw, 340px)",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
