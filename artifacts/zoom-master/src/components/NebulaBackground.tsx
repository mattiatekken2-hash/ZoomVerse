// Distant planet micro-dots scattered through the crimson nebula.
// Each has its own pulsing glow on independent timing so the sky
// feels alive without any JS animation cost.
const DISTANT_PLANETS: Array<{
  top: string; left: string; size: number;
  color: string; glow: string; dur: number; delay: number;
}> = [
  { top: "12%", left: "71%", size: 4.0, color: "#ff7733", glow: "rgba(255,100,40,0.85)", dur: 3.2, delay: 0.0 },
  { top: "31%", left: "85%", size: 2.8, color: "#cc2244", glow: "rgba(200,25,55,0.80)",  dur: 4.7, delay: 1.4 },
  { top: "55%", left: "8%",  size: 4.5, color: "#ff5522", glow: "rgba(255,70,25,0.80)",  dur: 3.8, delay: 2.7 },
  { top: "73%", left: "58%", size: 2.2, color: "#991133", glow: "rgba(140,15,40,0.70)",  dur: 5.5, delay: 0.8 },
  { top: "20%", left: "20%", size: 3.0, color: "#ff6633", glow: "rgba(255,85,35,0.75)",  dur: 4.2, delay: 3.1 },
  { top: "86%", left: "30%", size: 2.5, color: "#dd3311", glow: "rgba(210,45,15,0.72)",  dur: 6.1, delay: 1.9 },
];

// Brighter "hero" stars with warm crimson-nebula tints.
const TWINKLE_STARS: Array<{
  top: string; left: string; size: number; dur: number; delay: number; tint: string;
}> = [
  { top: "8%",  left: "14%", size: 2.4, dur: 3.6, delay: 0.0, tint: "rgba(255,255,255,0.95)" },
  { top: "16%", left: "78%", size: 2.0, dur: 4.8, delay: 1.2, tint: "rgba(255,200,180,0.90)" },
  { top: "27%", left: "42%", size: 1.8, dur: 5.4, delay: 2.6, tint: "rgba(255,240,220,0.85)" },
  { top: "33%", left: "88%", size: 2.2, dur: 4.2, delay: 0.7, tint: "rgba(255,255,255,0.90)" },
  { top: "44%", left: "9%",  size: 1.6, dur: 6.1, delay: 3.4, tint: "rgba(255,170,150,0.85)" },
  { top: "52%", left: "62%", size: 2.6, dur: 3.9, delay: 1.9, tint: "rgba(255,255,255,0.95)" },
  { top: "65%", left: "22%", size: 1.8, dur: 5.7, delay: 4.1, tint: "rgba(255,200,170,0.85)" },
  { top: "72%", left: "84%", size: 2.0, dur: 4.5, delay: 2.2, tint: "rgba(255,235,210,0.90)" },
  { top: "82%", left: "48%", size: 2.2, dur: 5.0, delay: 0.4, tint: "rgba(255,255,255,0.90)" },
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

      {/* Dense crimson nebula gas cloud orbs */}
      <div className="nebula-orb nebula-orb-1" />
      <div className="nebula-orb nebula-orb-2" />
      <div className="nebula-orb nebula-orb-3" />
      <div className="nebula-orb nebula-orb-4" />
      <div className="nebula-orb nebula-orb-5" />
      <div className="nebula-orb nebula-orb-6" />
      <div className="nebula-orb nebula-orb-7" />
      <div className="nebula-orb nebula-orb-8" />

      {/* Central proto-star warm glow */}
      <div className="nebula-protostar" />

      {/* Tiny red planet fixed deep in the background */}
      <div className="red-planet" aria-hidden="true" />

      {/* Comets */}
      <div className="comet comet-1" />
      <div className="comet comet-2" />

      {/* Easter-egg UFOs */}
      <div className="ufo ufo-1" aria-hidden="true" />
      <div className="ufo ufo-2" aria-hidden="true" />
    </div>
  );
}
