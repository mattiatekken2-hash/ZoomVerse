/**
 * Lab forge space backdrop for non-Lab tabs — starfield only, no grid.
 * Matches the ambient void + distant stars from the Lab WebGL scene.
 */
const LAB_STAR_COLOR = "#c8d8f0";

/** Deterministic star field — stable across mounts (no layout shift). */
const LAB_STARS: Array<{ top: string; left: string; size: number; opacity: number }> = (() => {
  const out: Array<{ top: string; left: string; size: number; opacity: number }> = [];
  let seed = 0x1ab5eed;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 96; i++) {
    out.push({
      top: `${(rnd() * 92 + 4).toFixed(2)}%`,
      left: `${(rnd() * 96 + 2).toFixed(2)}%`,
      size: rnd() * 1.8 + 0.6,
      opacity: rnd() * 0.35 + 0.18,
    });
  }
  return out;
})();

export function LabSpaceBackground() {
  return (
    <div className="lab-space-bg" aria-hidden="true" data-testid="lab-space-bg">
      <div className="lab-space-bg__void" />
      {LAB_STARS.map((star, i) => (
        <div
          key={i}
          className="lab-space-bg__star"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            background: LAB_STAR_COLOR,
            boxShadow: `0 0 ${star.size * 2}px rgba(200, 216, 240, 0.45)`,
          }}
        />
      ))}
      <div className="lab-space-bg__vignette" />
    </div>
  );
}
