// Distant planet micro-dots — trimmed to 3 (was 6) to cut animated DOM nodes.
// Each pulsing dot was an independent GPU layer; half as many = half the work.
const DISTANT_PLANETS: Array<{
  top: string; left: string; size: number;
  color: string; glow: string; dur: number; delay: number;
}> = [
  { top: "12%", left: "71%", size: 4.0, color: "#ff7733", glow: "rgba(255,100,40,0.85)", dur: 5.5, delay: 0.0 },
  { top: "55%", left: "8%",  size: 4.5, color: "#ff5522", glow: "rgba(255,70,25,0.80)",  dur: 6.2, delay: 2.0 },
  { top: "20%", left: "20%", size: 3.0, color: "#ff6633", glow: "rgba(255,85,35,0.75)",  dur: 7.0, delay: 1.5 },
];

// Hero stars — trimmed to 5 (was 10). Finite animation (stops after N cycles)
// so the GPU fully idles on these elements once animation completes.
const TWINKLE_STARS: Array<{
  top: string; left: string; size: number; dur: number; delay: number; tint: string;
}> = [
  { top: "8%",  left: "14%", size: 2.4, dur: 3.6, delay: 0.0, tint: "rgba(255,255,255,0.95)" },
  { top: "27%", left: "42%", size: 1.8, dur: 5.4, delay: 2.6, tint: "rgba(255,240,220,0.85)" },
  { top: "52%", left: "62%", size: 2.6, dur: 3.9, delay: 1.9, tint: "rgba(255,255,255,0.95)" },
  { top: "72%", left: "84%", size: 2.0, dur: 4.5, delay: 2.2, tint: "rgba(255,235,210,0.90)" },
  { top: "90%", left: "12%", size: 1.6, dur: 6.4, delay: 3.0, tint: "rgba(255,170,150,0.80)" },
];

export function NebulaBackground() {
  return (
    <div className="nebula-bg" aria-hidden="true">
      <div className="star-field star-field-a" />
      <div className="star-field star-field-b" />
      <div className="star-field star-field-c" />

      {/* Distant crimson-nebula planets — micro-dots with pulsing glows */}
      {DISTANT_PLANETS.map((p, i) => (
        <div
          key={i}
          className="distant-planet"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle at 35% 35%, ${p.color}cc 0%, ${p.color} 55%, ${p.color}44 100%)`,
            boxShadow: `0 0 ${p.size * 2}px ${p.glow}, 0 0 ${p.size * 5}px ${p.glow}`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* Hero twinkle stars */}
      {TWINKLE_STARS.map((s, i) => (
        <div
          key={i}
          className="twinkle-star"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            background: s.tint,
            boxShadow: `0 0 ${s.size * 3}px ${s.tint}, 0 0 ${s.size * 6}px ${s.tint}`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}

      {/* Nebula gas cloud orbs — reduced from 8 to 4 to halve GPU layer count.
          These are the heaviest elements: large blurred divs on animated layers. */}
      <div className="nebula-orb nebula-orb-1" />
      <div className="nebula-orb nebula-orb-3" />
      <div className="nebula-orb nebula-orb-5" />
      <div className="nebula-orb nebula-orb-7" />

      {/* Central proto-star warm glow */}
      <div className="nebula-protostar" />

      {/* Comets removed — off-screen most of the cycle but still consume GPU */}
    </div>
  );
}
