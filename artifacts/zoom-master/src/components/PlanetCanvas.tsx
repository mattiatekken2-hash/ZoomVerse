import { useEffect, useRef, useState } from "react";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  isRevealing?: boolean;
}

const DEFAULT_COLOR = "#4facfe";

const LAB_GRADIENTS: Record<string, string[]> = {
  "#8892b0": ["#d0d4e0", "#b0b8cc", "#8892b0", "#6b7394", "#4a5270"],
  "#4facfe": ["#e0f0ff", "#a0d4ff", "#4facfe", "#2d8bdb", "#1a5fa0"],
  "#c471ed": ["#f0d4ff", "#d898f0", "#c471ed", "#a050cc", "#7a30a0"],
  "#ffd700": ["#fff8e1", "#ffe082", "#ffd700", "#e6b800", "#b8860b"],
};

function getLabStops(color: string): string[] {
  return LAB_GRADIENTS[color] || [
    lighten(color, 0.5), lighten(color, 0.25), color, darken(color, 0.2), darken(color, 0.4)
  ];
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`;
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

function CSSSphere({
  color,
  size,
  isRevealing,
}: {
  color: string;
  size: number;
  isRevealing: boolean;
}) {
  const [s0, s1, s2, s3, s4] = getLabStops(color);

  return (
    <div className="planet-wrap" style={{ width: size, height: size }}>
      <div
        className="planet-outer-glow"
        style={{
          width: size * 2.2,
          height: size * 2.2,
          background: `radial-gradient(circle, ${color}55 0%, ${color}20 40%, transparent 70%)`,
          filter: `blur(${size * 0.15}px)`,
        }}
      />
      <div
        className={`planet-sphere ${isRevealing ? "reveal-in" : ""}`}
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
          boxShadow: `
            0 0 ${size * 0.4}px ${color}99,
            0 0 ${size * 0.8}px ${color}44,
            0 0 ${size * 1.3}px ${color}18,
            inset -${size * 0.06}px -${size * 0.04}px ${size * 0.12}px rgba(0,0,0,0.25)
          `,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "8%",
            left: "12%",
            width: "38%",
            height: "38%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.15) 50%, transparent 75%)",
            filter: `blur(${size * 0.03}px)`,
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        className="scan-line"
        style={{ top: 0, zIndex: 10, opacity: 0.4, mixBlendMode: "screen" }}
      />
    </div>
  );
}

function ThreePlanet({
  onPunch,
  planetColor,
  isRevealing,
  size,
}: {
  onPunch?: () => void;
  planetColor: string;
  isRevealing: boolean;
  size: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const meshRef = useRef<unknown>(null);
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
        const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
        camera.position.z = 4.2;

        const color = new THREE.Color(planetColor);
        const geo = new THREE.IcosahedronGeometry(1.6, 6);
        const mat = new THREE.MeshStandardMaterial({
          color,
          wireframe: true,
          emissive: color,
          emissiveIntensity: 0.35,
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        meshRef.current = mesh;

        const innerGeo = new THREE.IcosahedronGeometry(1.45, 3);
        const innerMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.06, side: THREE.BackSide });
        scene.add(new THREE.Mesh(innerGeo, innerMat));

        const l1 = new THREE.PointLight(0xffffff, 3); l1.position.set(5, 5, 5); scene.add(l1);
        const l2 = new THREE.PointLight(new THREE.Color(planetColor), 2); l2.position.set(-4, -3, 2); scene.add(l2);
        scene.add(new THREE.AmbientLight(0x111122, 2));

        const starsGeo = new THREE.BufferGeometry();
        const positions: number[] = [];
        for (let i = 0; i < 1000; i++) {
          positions.push((Math.random()-0.5)*80, (Math.random()-0.5)*80, (Math.random()-0.5)*80);
        }
        starsGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.5 }));
        scene.add(stars);

        const handleClick = () => {
          if (!onPunch) return;
          onPunch();
          gsap.fromTo(mesh.scale, { x:1.18, y:1.18, z:1.18 }, { x:1, y:1, z:1, duration:0.3, ease:"elastic.out(1,0.3)" });
        };
        container.addEventListener("click", handleClick);

        function animate() {
          frameRef.current = requestAnimationFrame(animate);
          mesh.rotation.y += 0.006;
          mesh.rotation.x += 0.002;
          stars.rotation.y += 0.0004;
          renderer.render(scene, camera);
        }
        animate();

        return () => {
          container.removeEventListener("click", handleClick);
          cancelAnimationFrame(frameRef.current);
          renderer.dispose();
          if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        };
      } catch { if (mounted) setFailed(true); }
    }
    const cleanup = init();
    return () => { mounted = false; cleanup.then(fn => fn?.()); };
  }, []);

  useEffect(() => {
    const mesh = meshRef.current as { material?: { color: unknown; emissive: unknown } } | null;
    if (!mesh?.material) return;
    import("three").then((THREE) => {
      const c = new THREE.Color(planetColor);
      (mesh.material as { color: typeof c; emissive: typeof c }).color = c;
      (mesh.material as { color: typeof c; emissive: typeof c }).emissive = c;
    });
  }, [planetColor]);

  if (failed) {
    return <CSSSphere color={planetColor} size={size} isRevealing={isRevealing} />;
  }
  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size, cursor: onPunch ? "pointer" : "default" }}
      data-testid="planet-canvas"
    />
  );
}

export function PlanetCanvas({ onPunch, progress, goal, planetColor, isRevealing = false }: PlanetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(220);
  const color = planetColor || DEFAULT_COLOR;
  const pct = Math.min(progress / goal, 1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      setSize(Math.min(w * 0.72, h * 0.72, 300));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
        className="flex items-center justify-center cursor-pointer"
        onClick={onPunch}
        style={{ width: size, height: size }}
        data-testid="planet-wrap"
      >
        <CSSSphere color={color} size={size} isRevealing={isRevealing} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            Craft Progress
          </span>
          <span className="font-bold" style={{ color }}>
            {progress}/{goal}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="progress-bar-fill" style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, boxShadow: `0 0 10px ${color}` }} />
        </div>
      </div>
    </div>
  );
}
