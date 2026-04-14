import { useEffect, useRef, useState } from "react";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
}

function CSSPlanet({ color, onClick }: { color: string; onClick?: () => void }) {
  const [pulse, setPulse] = useState(false);

  const handleClick = () => {
    if (!onClick) return;
    setPulse(true);
    setTimeout(() => setPulse(false), 300);
    onClick();
  };

  return (
    <div
      className="relative flex items-center justify-center w-full h-full cursor-pointer"
      onClick={handleClick}
      data-testid="planet-css"
    >
      <div className="relative" style={{ width: 180, height: 180 }}>
        <div
          className="absolute inset-0 rounded-full transition-transform duration-200"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}44 50%, ${color}11 80%, transparent)`,
            boxShadow: `0 0 40px ${color}50, 0 0 80px ${color}25, inset 0 0 40px ${color}20`,
            transform: pulse ? "scale(0.88)" : "scale(1)",
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(transparent 60%, ${color}22 80%, transparent 90%)`,
            animation: "spin 6s linear infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: "140%",
            height: "20%",
            top: "40%",
            left: "-20%",
            background: `linear-gradient(90deg, transparent, ${color}30, ${color}50, ${color}30, transparent)`,
            transform: "rotateX(70deg)",
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.15) 0%, transparent 50%)`,
          }}
        />
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ThreePlanet({ onPunch, planetColor }: { onPunch?: () => void; planetColor?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<unknown>(null);
  const planetRef = useRef<unknown>(null);
  const frameRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const THREE = await import("three");
        const gsapMod = await import("gsap");
        const gsap = gsapMod.default;

        const container = containerRef.current;
        if (!container || !mounted) return;

        const w = container.clientWidth;
        const h = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
        camera.position.z = 4;

        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false });
        } catch {
          if (mounted) setFailed(true);
          return;
        }

        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const color = new THREE.Color(planetColor || "#00f2fe");
        const geometry = new THREE.IcosahedronGeometry(1.5, 5);
        const material = new THREE.MeshStandardMaterial({
          color,
          wireframe: true,
          emissive: color,
          emissiveIntensity: 0.3,
        });
        const planet = new THREE.Mesh(geometry, material);
        scene.add(planet);
        planetRef.current = planet;

        const innerGeo = new THREE.IcosahedronGeometry(1.35, 3);
        const innerMat = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.05,
          side: THREE.BackSide,
        });
        scene.add(new THREE.Mesh(innerGeo, innerMat));

        const light1 = new THREE.PointLight(0xffffff, 3);
        light1.position.set(5, 5, 5);
        scene.add(light1);
        const light2 = new THREE.PointLight(0x00f2fe, 1.5);
        light2.position.set(-4, -3, 2);
        scene.add(light2);
        scene.add(new THREE.AmbientLight(0x111122, 1.5));

        const starsGeo = new THREE.BufferGeometry();
        const positions: number[] = [];
        for (let i = 0; i < 800; i++) {
          positions.push(
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80
          );
        }
        starsGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const stars = new THREE.Points(
          starsGeo,
          new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 })
        );
        scene.add(stars);

        const handleClick = () => {
          if (!onPunch) return;
          onPunch();
          gsap.fromTo(
            planet.scale,
            { x: 1.15, y: 1.15, z: 1.15 },
            { x: 1, y: 1, z: 1, duration: 0.25, ease: "elastic.out(1, 0.3)" }
          );
        };

        container.addEventListener("click", handleClick);

        function animate() {
          frameRef.current = requestAnimationFrame(animate);
          planet.rotation.y += 0.006;
          planet.rotation.x += 0.002;
          stars.rotation.y += 0.0005;
          renderer.render(scene, camera);
        }
        animate();

        const handleResize = () => {
          const w2 = container.clientWidth;
          const h2 = container.clientHeight;
          camera.aspect = w2 / h2;
          camera.updateProjectionMatrix();
          renderer.setSize(w2, h2);
        };
        window.addEventListener("resize", handleResize);

        return () => {
          container.removeEventListener("click", handleClick);
          window.removeEventListener("resize", handleResize);
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
  }, []);

  useEffect(() => {
    const planet = planetRef.current as { material?: { color: unknown; emissive: unknown } } | null;
    if (!planet?.material) return;
    import("three").then((THREE) => {
      const color = new THREE.Color(planetColor || "#00f2fe");
      (planet.material as { color: typeof color; emissive: typeof color }).color = color;
      (planet.material as { color: typeof color; emissive: typeof color }).emissive = color;
    });
  }, [planetColor]);

  if (failed) {
    return (
      <CSSPlanet color={planetColor || "#00f2fe"} onClick={onPunch} />
    );
  }

  return <div ref={containerRef} className="w-full h-full cursor-pointer" data-testid="planet-canvas" />;
}

export function PlanetCanvas({ onPunch, progress, goal, planetColor }: PlanetCanvasProps) {
  const pct = Math.min(progress / goal, 1);

  return (
    <div className="relative w-full h-full">
      <ThreePlanet onPunch={onPunch} planetColor={planetColor} />
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground font-semibold tracking-wider uppercase">Craft Progress</span>
          <span className="neon-text font-bold">{progress}/{goal}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${pct * 100}%`,
              background: "linear-gradient(90deg, #00f2fe, #4facfe)",
              boxShadow: "0 0 8px rgba(0,242,254,0.6)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
