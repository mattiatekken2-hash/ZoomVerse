import { useEffect, useRef, useState } from "react";

interface PlanetCanvasProps {
  onPunch?: () => void;
  progress: number;
  goal: number;
  planetColor?: string;
  isRevealing?: boolean;
}

const DEFAULT_COLOR = "#4facfe";
const GREY = "#8892b0";

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

function CSSFallback({ color, size, pct, fractured }: { color: string; size: number; pct: number; fractured: boolean }) {
  const [s0, s1, s2, s3, s4] = getLabStops(color);
  const planetSize = size * (0.12 + pct * 0.88);
  const showNebula = pct < 0.04;
  return (
    <div className="planet-wrap" style={{ width: size, height: size }}>
      {showNebula && (
        <div
          style={{
            position: "absolute",
            width: size * 0.9, height: size * 0.9,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,210,255,0.45) 0%, rgba(120,140,200,0.18) 35%, transparent 70%)",
            filter: `blur(${size * 0.08}px)`,
            animation: "nebulaPulse 2.4s ease-in-out infinite",
          }}
        />
      )}
      <div
        className="planet-outer-glow"
        style={{
          width: planetSize * 2.2, height: planetSize * 2.2,
          background: `radial-gradient(circle, ${color}55 0%, ${color}20 40%, transparent 70%)`,
          filter: `blur(${planetSize * 0.15}px)`,
          opacity: pct,
        }}
      />
      <div
        className="planet-sphere"
        style={{
          width: planetSize, height: planetSize,
          background: `radial-gradient(circle at 40% 35%, ${s0} 0%, ${s1} 15%, ${s2} 35%, ${s3} 60%, ${s4} 85%, ${s4} 100%)`,
          boxShadow: `0 0 ${planetSize * 0.4}px ${color}99, 0 0 ${planetSize * 0.8}px ${color}44, inset -${planetSize * 0.06}px -${planetSize * 0.04}px ${planetSize * 0.12}px rgba(0,0,0,0.25)`,
          transition: "width 0.25s ease-out, height 0.25s ease-out",
        }}
      >
        {fractured && (
          <div
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: `repeating-conic-gradient(from 0deg, transparent 0deg, ${color} 2deg, transparent 4deg, transparent 30deg)`,
              mixBlendMode: "screen", opacity: 0.55,
              animation: "crackPulse 1.4s ease-in-out infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}

interface ThreeRefs {
  planetGroup: any;
  planetMesh: any;
  cracksMesh: any;
  nebulaPoints: any;
  nebulaMaterial: any;
  fragments: Array<{ mesh: any; vel: { x: number; y: number; z: number }; life: number; maxLife: number }>;
  scene: any;
  THREE: any;
  pointLight: any;
  innerMesh: any;
}

function ThreeScene({
  onPunch,
  planetColor,
  progress,
  goal,
  size,
  isRevealing,
}: {
  onPunch?: () => void;
  planetColor: string;
  progress: number;
  goal: number;
  size: number;
  isRevealing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<ThreeRefs | null>(null);
  const frameRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);
  const lastProgressRef = useRef(progress);
  const targetScaleRef = useRef(0.12);
  const fracturedRef = useRef(false);
  const colorRef = useRef(planetColor);
  const onPunchRef = useRef(onPunch);

  useEffect(() => { onPunchRef.current = onPunch; }, [onPunch]);

  useEffect(() => {
    let mounted = true;
    let cleanupFn: (() => void) | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        const gsapMod = await import("gsap");
        const gsap = gsapMod.default;
        const container = containerRef.current;
        if (!container || !mounted) return;

        let renderer: any;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false });
        } catch { if (mounted) setFailed(true); return; }

        renderer.setSize(size, size);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
        camera.position.z = 4.5;

        // --- Stars
        const starsGeo = new THREE.BufferGeometry();
        const starPositions: number[] = [];
        for (let i = 0; i < 800; i++) {
          starPositions.push((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
        }
        starsGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.45 }));
        scene.add(stars);

        // --- Lights
        const ambient = new THREE.AmbientLight(0x222244, 1.5);
        scene.add(ambient);
        const keyLight = new THREE.PointLight(0xffffff, 2.5);
        keyLight.position.set(5, 5, 5);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(new THREE.Color(planetColor), 2);
        rimLight.position.set(-4, -3, 2);
        scene.add(rimLight);

        // --- Nebula (initial primordial light)
        const nebulaGeo = new THREE.BufferGeometry();
        const nebPositions: number[] = [];
        const nebColors: number[] = [];
        const nebCount = 350;
        for (let i = 0; i < nebCount; i++) {
          const r = 0.6 + Math.random() * 1.5;
          const t = Math.random() * Math.PI * 2;
          const p = (Math.random() - 0.5) * Math.PI;
          nebPositions.push(r * Math.cos(p) * Math.cos(t), r * Math.cos(p) * Math.sin(t), r * Math.sin(p));
          const tint = 0.6 + Math.random() * 0.4;
          nebColors.push(0.7 * tint, 0.78 * tint, 1.0 * tint);
        }
        nebulaGeo.setAttribute("position", new THREE.Float32BufferAttribute(nebPositions, 3));
        nebulaGeo.setAttribute("color", new THREE.Float32BufferAttribute(nebColors, 3));
        const nebulaMaterial = new THREE.PointsMaterial({
          size: 0.12, vertexColors: true, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const nebulaPoints = new THREE.Points(nebulaGeo, nebulaMaterial);
        scene.add(nebulaPoints);

        // --- Planet group
        const planetGroup = new THREE.Group();
        planetGroup.scale.setScalar(0.12);
        scene.add(planetGroup);

        const color = new THREE.Color(planetColor);
        const planetGeo = new THREE.IcosahedronGeometry(1.6, 5);
        const planetMat = new THREE.MeshStandardMaterial({
          color, wireframe: true, emissive: color, emissiveIntensity: 0.4,
        });
        const planetMesh = new THREE.Mesh(planetGeo, planetMat);
        planetGroup.add(planetMesh);

        const innerGeo = new THREE.IcosahedronGeometry(1.55, 3);
        const innerMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.08, side: THREE.BackSide });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        planetGroup.add(innerMesh);

        // --- Cracks (visible when fractured)
        const crackGeo = new THREE.BufferGeometry();
        const crackPositions: number[] = [];
        const lineCount = 14;
        for (let i = 0; i < lineCount; i++) {
          const start = new THREE.Vector3().setFromSphericalCoords(1.62, Math.random() * Math.PI, Math.random() * Math.PI * 2);
          let cur = start.clone();
          crackPositions.push(cur.x, cur.y, cur.z);
          const segCount = 6 + Math.floor(Math.random() * 4);
          for (let s = 0; s < segCount; s++) {
            const next = cur.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
            next.setLength(1.62 + (Math.random() - 0.5) * 0.05);
            crackPositions.push(next.x, next.y, next.z);
            crackPositions.push(next.x, next.y, next.z);
            cur = next;
          }
          crackPositions.push(cur.x, cur.y, cur.z);
        }
        crackGeo.setAttribute("position", new THREE.Float32BufferAttribute(crackPositions, 3));
        const crackMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const cracksMesh = new THREE.LineSegments(crackGeo, crackMat);
        planetGroup.add(cracksMesh);

        refs.current = {
          planetGroup, planetMesh, cracksMesh, nebulaPoints, nebulaMaterial,
          fragments: [], scene, THREE, pointLight: rimLight, innerMesh,
        };

        // --- Click handler with fragment burst
        const handleClick = () => {
          if (!onPunchRef.current) return;
          onPunchRef.current();
          gsap.fromTo(planetGroup.scale,
            { x: targetScaleRef.current * 1.18, y: targetScaleRef.current * 1.18, z: targetScaleRef.current * 1.18 },
            { x: targetScaleRef.current, y: targetScaleRef.current, z: targetScaleRef.current, duration: 0.35, ease: "elastic.out(1,0.4)" });
        };
        container.addEventListener("click", handleClick);
        container.addEventListener("touchstart", (e) => { e.preventDefault(); handleClick(); }, { passive: false });

        const clock = new THREE.Clock();

        function animate() {
          frameRef.current = requestAnimationFrame(animate);
          const dt = Math.min(clock.getDelta(), 0.05);
          const t = clock.elapsedTime;

          // Smooth scale
          const cur = planetGroup.scale.x;
          const next = cur + (targetScaleRef.current - cur) * Math.min(1, dt * 6);
          planetGroup.scale.setScalar(next);

          // Rotate
          planetMesh.rotation.y += 0.005;
          planetMesh.rotation.x += 0.0015;
          innerMesh.rotation.y -= 0.003;
          stars.rotation.y += 0.0003;

          // Nebula pulse + fade
          const nebOpacity = nebulaMaterial.opacity;
          const targetNeb = next > 0.16 ? 0 : 0.85;
          nebulaMaterial.opacity = nebOpacity + (targetNeb - nebOpacity) * Math.min(1, dt * 3);
          nebulaPoints.rotation.y += 0.002;
          nebulaPoints.rotation.x += 0.0008;
          const pulse = 0.95 + Math.sin(t * 2.4) * 0.08;
          nebulaPoints.scale.setScalar(pulse);

          // Cracks pulse
          if (fracturedRef.current) {
            const target = 0.55 + Math.sin(t * 3.5) * 0.25;
            crackMat.opacity = crackMat.opacity + (target - crackMat.opacity) * Math.min(1, dt * 4);
          } else {
            crackMat.opacity = crackMat.opacity * (1 - Math.min(1, dt * 4));
          }

          // Fragments
          const refsCur = refs.current;
          if (refsCur) {
            for (let i = refsCur.fragments.length - 1; i >= 0; i--) {
              const f = refsCur.fragments[i];
              f.life += dt;
              const k = Math.min(1, f.life / f.maxLife);
              // Move toward center (ease-in)
              f.mesh.position.x += (0 - f.mesh.position.x) * Math.min(1, dt * (2 + k * 8));
              f.mesh.position.y += (0 - f.mesh.position.y) * Math.min(1, dt * (2 + k * 8));
              f.mesh.position.z += (0 - f.mesh.position.z) * Math.min(1, dt * (2 + k * 8));
              const s = (1 - k) * 0.18;
              f.mesh.scale.setScalar(s);
              f.mesh.material.opacity = 1 - k;
              if (f.life >= f.maxLife) {
                planetGroup.add(f.mesh); planetGroup.remove(f.mesh);
                scene.remove(f.mesh);
                f.mesh.geometry.dispose();
                f.mesh.material.dispose();
                refsCur.fragments.splice(i, 1);
                // Tiny bump on impact
                gsap.fromTo(planetGroup.scale,
                  { x: next * 1.06, y: next * 1.06, z: next * 1.06 },
                  { x: targetScaleRef.current, y: targetScaleRef.current, z: targetScaleRef.current, duration: 0.18, ease: "power2.out" });
              }
            }
          }

          renderer.render(scene, camera);
        }
        animate();

        cleanupFn = () => {
          container.removeEventListener("click", handleClick);
          cancelAnimationFrame(frameRef.current);
          renderer.dispose();
          if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        };
      } catch {
        if (mounted) setFailed(true);
      }
    })();

    return () => {
      mounted = false;
      if (cleanupFn) cleanupFn();
    };
  }, [size]);

  // --- React to progress changes: spawn fragments + update target scale + fracture
  useEffect(() => {
    const r = refs.current;
    if (!r) { lastProgressRef.current = progress; return; }
    const THREE = r.THREE;
    const delta = progress - lastProgressRef.current;
    lastProgressRef.current = progress;

    const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
    targetScaleRef.current = 0.12 + pct * 0.88;
    fracturedRef.current = pct >= 0.999 || isRevealing;

    if (delta > 0) {
      const burst = Math.min(8, Math.max(3, Math.round(delta * 4)));
      for (let i = 0; i < burst; i++) {
        const geo = new THREE.SphereGeometry(0.12, 8, 8);
        const c = new THREE.Color(colorRef.current);
        const mat = new THREE.MeshBasicMaterial({
          color: c, transparent: true, opacity: 1,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const dist = 2.4 + Math.random() * 1.2;
        mesh.position.set(
          dist * Math.cos(phi) * Math.cos(theta),
          dist * Math.cos(phi) * Math.sin(theta),
          dist * Math.sin(phi),
        );
        r.scene.add(mesh);
        r.fragments.push({
          mesh, vel: { x: 0, y: 0, z: 0 },
          life: 0, maxLife: 0.55 + Math.random() * 0.25,
        });
      }
    }
  }, [progress, goal, isRevealing]);

  // --- React to color changes
  useEffect(() => {
    colorRef.current = planetColor;
    const r = refs.current;
    if (!r) return;
    const THREE = r.THREE;
    const c = new THREE.Color(planetColor);
    if (r.planetMesh?.material) {
      r.planetMesh.material.color = c;
      r.planetMesh.material.emissive = c;
    }
    if (r.innerMesh?.material) r.innerMesh.material.color = c;
    if (r.cracksMesh?.material) r.cracksMesh.material.color = c;
    if (r.pointLight) r.pointLight.color = c;
  }, [planetColor]);

  if (failed) {
    const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
    return <CSSFallback color={planetColor} size={size} pct={pct} fractured={pct >= 0.999 || isRevealing} />;
  }
  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size, cursor: onPunch ? "pointer" : "default", touchAction: "manipulation" }}
      data-testid="planet-canvas"
    />
  );
}

export function PlanetCanvas({ onPunch, progress, goal, planetColor, isRevealing = false }: PlanetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(260);
  const color = planetColor || DEFAULT_COLOR;
  const pct = goal > 0 ? Math.min(progress / goal, 1) : 0;
  const isPrimordial = pct < 0.04 && !isRevealing;
  const isFractured = pct >= 0.999 || isRevealing;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      setSize(Math.min(w * 0.78, h * 0.78, 340));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const accent = isFractured ? color : isPrimordial ? "rgba(180,200,255,0.85)" : color;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col items-center justify-center">
      <div
        className="flex items-center justify-center"
        onClick={onPunch}
        style={{ width: size, height: size, cursor: onPunch ? "pointer" : "default" }}
        data-testid="planet-wrap"
      >
        <ThreeScene
          onPunch={onPunch}
          planetColor={color === GREY ? "#8892b0" : color}
          progress={progress}
          goal={goal}
          size={size}
          isRevealing={isRevealing}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-semibold tracking-wider uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            {isPrimordial ? "Primordial Light" : isFractured ? "Core Fractured" : "Forging Mass"}
          </span>
          <span className="font-bold" style={{ color: accent, textShadow: isFractured ? `0 0 10px ${color}` : "none" }}>
            {progress}/{goal}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="progress-bar-fill"
            style={{
              width: `${pct * 100}%`,
              background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 0 10px ${accent}`,
              transition: "width 0.25s ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
