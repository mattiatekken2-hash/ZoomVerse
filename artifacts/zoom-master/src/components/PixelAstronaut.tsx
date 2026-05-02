// ────────────────────────────────────────────────────────────────────────
// Shared pixel-art astronaut sprites. Originally lived inline in
// HomePage.tsx (Phase 3); extracted in Phase 4 so the LAB status pill
// can render the same character with the same style guarantees.
//
// Everything here is a tiny SVG with `image-rendering: pixelated`, so
// the sprite stays crisp at any rendered size without bitmap assets.
// ────────────────────────────────────────────────────────────────────────

interface AstronautProps {
  /** "stand" = normal, "sit" = legs tucked (chair), "snack" = holding cookie */
  pose?: "stand" | "sit" | "snack";
  /** "side" = visor highlight on the right (looking sideways),
   *  "up"   = visor highlight centered (looking forward / up at window) */
  facing?: "side" | "up";
  /** Rendered width in CSS pixels. Sprite is 8×12 logical, height keeps
   *  the same aspect (×1.5). */
  width?: number;
}

export function PixelAstronaut({ pose = "stand", facing = "side", width = 28 }: AstronautProps) {
  const helmet = "#dfe6f0";
  const visor = "#0a1a3d";
  const visorShine = "#7fdfff";
  const suit = "#f3f4f6";
  const suitShade = "#b9bcc4";
  const accent = "#00f2fe";
  const skinDark = "#3a2a1f";
  const legY = pose === "sit" ? 8 : 9;
  const legH = pose === "sit" ? 1 : 2;
  const height = Math.round((width * 12) / 8);
  return (
    <svg viewBox="0 0 8 12" width={width} height={height} style={{ imageRendering: "pixelated", display: "block" }}>
      {/* Backpack */}
      <rect x="6" y="4" width="2" height="3" fill={suitShade} />
      {/* Helmet */}
      <rect x="1" y="0" width="6" height="4" fill={helmet} />
      {/* Visor */}
      <rect x="2" y="1" width="4" height="2" fill={visor} />
      {facing === "up" ? (
        <rect x="3" y="1" width="2" height="1" fill={visorShine} />
      ) : (
        <rect x="4" y="1" width="1" height="1" fill={visorShine} />
      )}
      {/* Body */}
      <rect x="2" y="4" width="4" height="4" fill={suit} />
      {/* Chest patch — same neon used by the LAB avatar so the two
          characters read as the same player. */}
      <rect x="3" y="5" width="2" height="1" fill={accent} />
      {/* Belt */}
      <rect x="2" y="7" width="4" height="1" fill={suitShade} />
      {/* Arms / props */}
      {pose === "snack" ? (
        <>
          <rect x="1" y="4" width="1" height="2" fill={suit} />
          <rect x="6" y="3" width="1" height="3" fill={suit} />
          <rect x="6" y="2" width="2" height="2" fill="#c89060" />
          <rect x="6" y="2" width="1" height="1" fill={skinDark} />
        </>
      ) : pose === "sit" ? (
        <>
          <rect x="1" y="5" width="1" height="2" fill={suit} />
          <rect x="6" y="5" width="1" height="2" fill={suit} />
          <rect x="5" y="6" width="2" height="2" fill="#ffffff" />
          <rect x="5" y="7" width="2" height="1" fill="#8a5a2a" />
        </>
      ) : (
        <>
          <rect x="1" y="4" width="1" height="3" fill={suit} />
          <rect x="6" y="4" width="1" height="3" fill={suit} />
        </>
      )}
      {/* Legs */}
      <rect x="2" y={legY} width="2" height={legH} fill={suit} />
      <rect x="4" y={legY} width="2" height={legH} fill={suit} />
      {/* Boots — only when standing */}
      {pose !== "sit" && (
        <>
          <rect x="2" y="10" width="2" height="1" fill={suitShade} />
          <rect x="4" y="10" width="2" height="1" fill={suitShade} />
        </>
      )}
    </svg>
  );
}

/** Helmet-only resting on a pillow + 3 staggered floating Z's. Used by
 *  the SLEEP activity in HOME. The wrapper container is sized 28×28 so
 *  it slots into the same overlay positioning grid as the other poses. */
export function SleepingAstronaut({ width = 28 }: { width?: number }) {
  const headW = width;
  const headH = Math.round((width * 4) / 8);
  return (
    <div style={{ position: "relative", width, height: width }}>
      <svg
        viewBox="0 0 8 4"
        width={headW}
        height={headH}
        style={{ imageRendering: "pixelated", display: "block", position: "absolute", left: 0, bottom: 6 }}
      >
        <rect x="1" y="0" width="6" height="4" fill="#dfe6f0" />
        <rect x="2" y="1" width="4" height="2" fill="#0a1a3d" />
        <rect x="3" y="2" width="2" height="1" fill="#1a3a5c" />
      </svg>
      {[0, 1.1, 2.2].map((delay, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: 18,
            top: 0,
            fontSize: 10,
            fontWeight: 900,
            color: "#cfe2ff",
            textShadow: "0 0 4px rgba(0,0,0,0.6)",
            animation: `home-z-float 3.3s ease-in-out ${delay}s infinite`,
          }}
        >
          z
        </span>
      ))}
    </div>
  );
}

/** Three little steam puffs rising from a coffee mug. Positioned with
 *  absolute coords relative to a positioned parent (the COFFEE pose
 *  wrapper). */
export function CoffeeSteam() {
  return (
    <>
      {[0, 0.6, 1.2].map((delay, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: 22,
            top: 18,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            animation: `home-steam-rise 1.8s ease-out ${delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

/** Tiny "M" wing silhouette — a passing bird in the window sky. */
export function PixelBird() {
  return (
    <svg viewBox="0 0 6 3" width={12} height={6} style={{ imageRendering: "pixelated", display: "block" }}>
      <rect x="0" y="1" width="1" height="1" fill="#1a1a1a" />
      <rect x="1" y="0" width="1" height="1" fill="#1a1a1a" />
      <rect x="2" y="1" width="1" height="1" fill="#1a1a1a" />
      <rect x="3" y="0" width="1" height="1" fill="#1a1a1a" />
      <rect x="4" y="1" width="1" height="1" fill="#1a1a1a" />
    </svg>
  );
}
