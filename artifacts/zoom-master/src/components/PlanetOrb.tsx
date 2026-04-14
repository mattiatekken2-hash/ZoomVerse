import { useEffect, useRef, useState } from "react";
import type { Planet } from "../hooks/useGameState";

interface PlanetOrbProps {
  planet: Planet;
  size?: number;
}

function CSSOrb({ planet, size }: { planet: Planet; size: number }) {
  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center">
      <div
        className="rounded-full"
        style={{
          width: size * 0.8,
          height: size * 0.8,
          background: `radial-gradient(circle at 35% 35%, ${planet.color}cc, ${planet.color}44 50%, ${planet.color}11 80%, transparent)`,
          boxShadow: `0 0 ${size * 0.3}px ${planet.color}50, inset 0 0 ${size * 0.2}px ${planet.color}20`,
          animation: "orb-spin 4s linear infinite",
        }}
      />
      <style>{`@keyframes orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function PlanetOrb({ planet, size = 60 }: PlanetOrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const THREE = await import("three");
        const container = containerRef.current;
        if (!container || !mounted) return;

        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false });
        } catch {
          if (mounted) setFailed(true);
          return;
        }

        renderer.setSize(size, size);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.z = 3.5;

        const geo = new THREE.IcosahedronGeometry(1.2, 3);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(planet.color),
          wireframe: true,
          emissive: new THREE.Color(planet.color),
          emissiveIntensity: 0.4,
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const light = new THREE.PointLight(0xffffff, 2);
        light.position.set(3, 3, 3);
        scene.add(light);

        function animate() {
          frameRef.current = requestAnimationFrame(animate);
          mesh.rotation.y += 0.02;
          mesh.rotation.x += 0.005;
          renderer.render(scene, camera);
        }
        animate();

        return () => {
          cancelAnimationFrame(frameRef.current);
          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        };
      } catch {
        if (mounted) setFailed(true);
      }
    }

    const cleanup = init();
    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
    };
  }, [planet.color, size]);

  if (failed) {
    return <CSSOrb planet={planet} size={size} />;
  }

  return <div ref={containerRef} style={{ width: size, height: size }} />;
}
