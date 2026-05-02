import { useEffect, useState } from "react";

// 10 brighter "hero" stars sprinkled across the canvas, each with its own
// twinkle phase so they shimmer independently and feel alive instead of
// pulsing in unison with the layered star fields.
const TWINKLE_STARS: Array<{ top: string; left: string; size: number; dur: number; delay: number; tint: string }> = [
  { top: "8%",  left: "14%", size: 2.4, dur: 3.6, delay: 0.0,  tint: "rgba(255,255,255,0.95)" },
  { top: "16%", left: "78%", size: 2.0, dur: 4.8, delay: 1.2,  tint: "rgba(220,235,255,0.9)"  },
  { top: "27%", left: "42%", size: 1.8, dur: 5.4, delay: 2.6,  tint: "rgba(255,250,235,0.85)" },
  { top: "33%", left: "88%", size: 2.2, dur: 4.2, delay: 0.7,  tint: "rgba(255,255,255,0.9)"  },
  { top: "44%", left: "9%",  size: 1.6, dur: 6.1, delay: 3.4,  tint: "rgba(200,220,255,0.85)" },
  { top: "52%", left: "62%", size: 2.6, dur: 3.9, delay: 1.9,  tint: "rgba(255,255,255,0.95)" },
  { top: "65%", left: "22%", size: 1.8, dur: 5.7, delay: 4.1,  tint: "rgba(220,235,255,0.85)" },
  { top: "72%", left: "84%", size: 2.0, dur: 4.5, delay: 2.2,  tint: "rgba(255,250,235,0.9)"  },
  { top: "82%", left: "48%", size: 2.2, dur: 5.0, delay: 0.4,  tint: "rgba(255,255,255,0.9)"  },
  { top: "90%", left: "12%", size: 1.6, dur: 6.4, delay: 3.0,  tint: "rgba(200,220,255,0.8)"  },
];

export function NebulaBackground() {
  // Pause every CSS animation in this background subtree (star fields,
  // twinkles, nebula orbs, comets, UFOs) when the document is hidden —
  // e.g. user backgrounds the Telegram Mini App or a fullscreen overlay
  // covers the screen. Most browsers throttle hidden-tab animations
  // already, but Telegram WebView (especially iOS) is not consistent
  // about it, so we enforce it explicitly. When the document becomes
  // visible again we drop the class and the animations resume from
  // exactly where they left off (CSS animation-play-state semantics).
  const [paused, setPaused] = useState<boolean>(() =>
    typeof document !== "undefined" && document.visibilityState === "hidden",
  );
  useEffect(() => {
    const onVis = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return (
    <div className={paused ? "nebula-bg paused" : "nebula-bg"} aria-hidden="true">
      <div className="star-field star-field-a" />
      <div className="star-field star-field-b" />
      <div className="star-field star-field-c" />
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
      <div className="nebula-orb nebula-orb-1" />
      <div className="nebula-orb nebula-orb-2" />
      <div className="nebula-orb nebula-orb-3" />
      <div className="nebula-orb nebula-orb-4" />
      <div className="nebula-orb nebula-orb-5" />
      <div className="nebula-orb nebula-orb-6" />
      {/* Comets — long animation cycles so they cross the sky only every
          30-60 seconds, never feeling spammy. */}
      <div className="comet comet-1" />
      <div className="comet comet-2" />
      {/* Easter-egg UFOs — very long cycles with brief visibility windows so
          they feel like rare random sightings, never disturbing gameplay. */}
      <div className="ufo ufo-1" aria-hidden="true" />
      <div className="ufo ufo-2" aria-hidden="true" />
    </div>
  );
}
