// ────────────────────────────────────────────────────────────────────────
// Shared pixel-art astronaut sprites. Originally lived inline in
// HomePage.tsx (Phase 3); extracted in Phase 4 so the LAB status pill
// can render the same character with the same style guarantees.
//
// Everything here is a tiny SVG with `image-rendering: pixelated`, so
// the sprite stays crisp at any rendered size without bitmap assets.
// ────────────────────────────────────────────────────────────────────────

// Shared palette so every variant agrees on colors.
const C = {
  helmet: "#dfe6f0",
  visor: "#0a1a3d",
  visorShine: "#7fdfff",
  suit: "#f3f4f6",
  suitShade: "#b9bcc4",
  accent: "#00f2fe",
  skinDark: "#3a2a1f",
  sheet: "#7da7d9",
  sheetShade: "#5e8bbd",
  sleepLine: "#1a3a5c",
};

interface AstronautProps {
  /** "stand" = normal, "sit" = legs tucked (chair), "snack" = holding cookie */
  pose?: "stand" | "sit" | "snack";
  /** "side" = visor highlight on the right (looking sideways),
   *  "up"   = visor highlight centered (looking forward / up at window) */
  facing?: "side" | "up";
  /** Walk-cycle leg frame. When set, legs alternate to suggest a step.
   *  "a" = left leg lifted, "b" = right leg lifted. */
  legFrame?: "a" | "b";
  /** Rendered width in CSS pixels. Sprite is 8×12 logical, height keeps
   *  the same aspect (×1.5). */
  width?: number;
}

export function PixelAstronaut({ pose = "stand", facing = "side", legFrame, width = 28 }: AstronautProps) {
  const legBaseY = pose === "sit" ? 8 : 9;
  const legBaseH = pose === "sit" ? 1 : 2;
  // Walk frames: lift one leg by 1 pixel (y-1, h+0) — the "lifted" leg
  // looks higher off the ground, the planted leg stays at base.
  const lLegY = legFrame === "a" ? legBaseY - 1 : legBaseY;
  const lLegH = legBaseH;
  const rLegY = legFrame === "b" ? legBaseY - 1 : legBaseY;
  const rLegH = legBaseH;
  const height = Math.round((width * 12) / 8);
  return (
    <svg viewBox="0 0 8 12" width={width} height={height} style={{ imageRendering: "pixelated", display: "block" }}>
      {/* Backpack */}
      <rect x="6" y="4" width="2" height="3" fill={C.suitShade} />
      {/* Helmet */}
      <rect x="1" y="0" width="6" height="4" fill={C.helmet} />
      {/* Visor */}
      <rect x="2" y="1" width="4" height="2" fill={C.visor} />
      {facing === "up" ? (
        <rect x="3" y="1" width="2" height="1" fill={C.visorShine} />
      ) : (
        <rect x="4" y="1" width="1" height="1" fill={C.visorShine} />
      )}
      {/* Body */}
      <rect x="2" y="4" width="4" height="4" fill={C.suit} />
      {/* Chest patch */}
      <rect x="3" y="5" width="2" height="1" fill={C.accent} />
      {/* Belt */}
      <rect x="2" y="7" width="4" height="1" fill={C.suitShade} />
      {/* Arms / props */}
      {pose === "snack" ? (
        <>
          <rect x="1" y="4" width="1" height="2" fill={C.suit} />
          <rect x="6" y="3" width="1" height="3" fill={C.suit} />
          <rect x="6" y="2" width="2" height="2" fill="#c89060" />
          <rect x="6" y="2" width="1" height="1" fill={C.skinDark} />
        </>
      ) : pose === "sit" ? (
        <>
          <rect x="1" y="5" width="1" height="2" fill={C.suit} />
          <rect x="6" y="5" width="1" height="2" fill={C.suit} />
          <rect x="5" y="6" width="2" height="2" fill="#ffffff" />
          <rect x="5" y="7" width="2" height="1" fill="#8a5a2a" />
        </>
      ) : (
        <>
          <rect x="1" y="4" width="1" height="3" fill={C.suit} />
          <rect x="6" y="4" width="1" height="3" fill={C.suit} />
        </>
      )}
      {/* Legs */}
      <rect x="2" y={lLegY} width="2" height={lLegH} fill={C.suit} />
      <rect x="4" y={rLegY} width="2" height={rLegH} fill={C.suit} />
      {/* Boots — only when standing. Boots follow the leg they belong to
          so a lifted leg also lifts its boot. */}
      {pose !== "sit" && (
        <>
          <rect x="2" y={lLegY + lLegH} width="2" height="1" fill={C.suitShade} />
          <rect x="4" y={rLegY + rLegH} width="2" height="1" fill={C.suitShade} />
        </>
      )}
    </svg>
  );
}

/** WALK animation — two leg frames swapped via opacity at 0.4 s/frame
 *  to suggest stepping. The wrapper sits at the same footprint as a
 *  normal `PixelAstronaut`, so callers can drop it in interchangeably. */
export function WalkingAstronaut({ width = 28 }: { width?: number }) {
  const height = Math.round((width * 12) / 8);
  return (
    <div style={{ position: "relative", width, height }}>
      <div style={{ position: "absolute", inset: 0, animation: "home-astro-step-a 0.4s steps(1) infinite" }}>
        <PixelAstronaut pose="stand" legFrame="a" width={width} />
      </div>
      <div style={{ position: "absolute", inset: 0, animation: "home-astro-step-b 0.4s steps(1) infinite" }}>
        <PixelAstronaut pose="stand" legFrame="b" width={width} />
      </div>
    </div>
  );
}

/** EXERCISE — jumping jacks. Two frames swapped at 0.45 s/frame:
 *  rest pose → arms-up + legs-spread pose. Pure 2-frame pixel loop. */
export function ExercisingAstronaut({ width = 28 }: { width?: number }) {
  const height = Math.round((width * 12) / 8);
  return (
    <div style={{ position: "relative", width, height }}>
      {/* Frame A — rest: arms tight, legs together */}
      <div style={{ position: "absolute", inset: 0, animation: "home-astro-step-a 0.45s steps(1) infinite" }}>
        <ExerciseFrameRest width={width} />
      </div>
      {/* Frame B — open: arms up, legs spread */}
      <div style={{ position: "absolute", inset: 0, animation: "home-astro-step-b 0.45s steps(1) infinite" }}>
        <ExerciseFrameOpen width={width} />
      </div>
    </div>
  );
}

function ExerciseFrameRest({ width }: { width: number }) {
  const height = Math.round((width * 12) / 8);
  return (
    <svg viewBox="0 0 8 12" width={width} height={height} style={{ imageRendering: "pixelated", display: "block" }}>
      <rect x="1" y="0" width="6" height="4" fill={C.helmet} />
      <rect x="2" y="1" width="4" height="2" fill={C.visor} />
      <rect x="4" y="1" width="1" height="1" fill={C.visorShine} />
      <rect x="2" y="4" width="4" height="4" fill={C.suit} />
      <rect x="3" y="5" width="2" height="1" fill={C.accent} />
      <rect x="2" y="7" width="4" height="1" fill={C.suitShade} />
      {/* Arms tight along the body */}
      <rect x="1" y="4" width="1" height="3" fill={C.suit} />
      <rect x="6" y="4" width="1" height="3" fill={C.suit} />
      {/* Legs together (centered) */}
      <rect x="3" y="9" width="1" height="2" fill={C.suit} />
      <rect x="4" y="9" width="1" height="2" fill={C.suit} />
      <rect x="3" y="11" width="1" height="1" fill={C.suitShade} />
      <rect x="4" y="11" width="1" height="1" fill={C.suitShade} />
    </svg>
  );
}

function ExerciseFrameOpen({ width }: { width: number }) {
  const height = Math.round((width * 12) / 8);
  return (
    <svg viewBox="0 0 8 12" width={width} height={height} style={{ imageRendering: "pixelated", display: "block" }}>
      {/* Helmet */}
      <rect x="1" y="0" width="6" height="4" fill={C.helmet} />
      <rect x="2" y="1" width="4" height="2" fill={C.visor} />
      <rect x="4" y="1" width="1" height="1" fill={C.visorShine} />
      {/* Body */}
      <rect x="2" y="4" width="4" height="4" fill={C.suit} />
      <rect x="3" y="5" width="2" height="1" fill={C.accent} />
      <rect x="2" y="7" width="4" height="1" fill={C.suitShade} />
      {/* Arms RAISED — diagonal up: shoulder pixel, elbow pixel,
          hand pixel reaching above the helmet line */}
      <rect x="1" y="3" width="1" height="1" fill={C.suit} />
      <rect x="0" y="2" width="1" height="1" fill={C.suit} />
      <rect x="0" y="0" width="1" height="2" fill={C.suit} />
      <rect x="6" y="3" width="1" height="1" fill={C.suit} />
      <rect x="7" y="2" width="1" height="1" fill={C.suit} />
      <rect x="7" y="0" width="1" height="2" fill={C.suit} />
      {/* Legs spread */}
      <rect x="1" y="9" width="1" height="2" fill={C.suit} />
      <rect x="6" y="9" width="1" height="2" fill={C.suit} />
      <rect x="0" y="11" width="2" height="1" fill={C.suitShade} />
      <rect x="6" y="11" width="2" height="1" fill={C.suitShade} />
    </svg>
  );
}

/** Helmet-only sprite (no body). Used by the LAB status pill where we
 *  only have room for the face. Variants:
 *  - "side"  : visor highlight on the right (looking sideways)
 *  - "up"    : visor highlight centered (looking forward / up)
 *  - "sleep" : dim closed-eye line, no shine
 */
export function PixelAstronautHead({
  variant = "side",
  width = 28,
}: {
  variant?: "side" | "up" | "sleep";
  width?: number;
}) {
  const helmet = "#dfe6f0";
  const visor = "#0a1a3d";
  const visorShine = "#7fdfff";
  const sleepLine = "#1a3a5c";
  const height = Math.round((width * 4) / 8);
  return (
    <svg
      viewBox="0 0 8 4"
      width={width}
      height={height}
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {/* Helmet */}
      <rect x="1" y="0" width="6" height="4" fill={helmet} />
      {/* Visor */}
      <rect x="2" y="1" width="4" height="2" fill={visor} />
      {variant === "sleep" ? (
        <rect x="3" y="2" width="2" height="1" fill={sleepLine} />
      ) : variant === "up" ? (
        <rect x="3" y="1" width="2" height="1" fill={visorShine} />
      ) : (
        <rect x="4" y="1" width="1" height="1" fill={visorShine} />
      )}
    </svg>
  );
}

/** Astronaut lying horizontally on the bed — helmet on the left over
 *  the pillow, body covered by a sheet. Plus 3 staggered floating Z's
 *  drifting up from the helmet. Sprite is 14×4 logical (helmet 4×4 +
 *  sheet 10×3 with a darker fold). */
export function SleepingAstronaut({ width = 56 }: { width?: number }) {
  const height = Math.round((width * 4) / 14);
  return (
    <div style={{ position: "relative", width, height: height + 8 }}>
      <svg
        viewBox="0 0 14 4"
        width={width}
        height={height}
        style={{ imageRendering: "pixelated", display: "block", position: "absolute", left: 0, bottom: 0 }}
      >
        {/* Helmet (lying sideways on the pillow) */}
        <rect x="0" y="0" width="4" height="4" fill={C.helmet} />
        {/* Visor — closed-eye line, dim */}
        <rect x="1" y="1" width="2" height="2" fill={C.visor} />
        <rect x="1" y="2" width="2" height="1" fill={C.sleepLine} />
        {/* Sheet covering the body */}
        <rect x="4" y="1" width="10" height="3" fill={C.sheet} />
        {/* Sheet fold (darker stripe along the bottom) */}
        <rect x="4" y="3" width="10" height="1" fill={C.sheetShade} />
        {/* Tiny lump suggesting the chest */}
        <rect x="6" y="0" width="3" height="1" fill={C.sheet} />
      </svg>
      {[0, 1.1, 2.2].map((delay, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: Math.round(width * 0.2),
            top: -6,
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

/** Astronaut facing left, drinking from a small can/bottle. Used by the
 *  FRIDGE activity — paired with a PixelFridge in the room SVG and an
 *  open-door overlay so it reads as "took a drink out of the fridge". */
export function DrinkingAstronaut({ width = 28 }: { width?: number }) {
  const height = Math.round((width * 12) / 8);
  const drink = "#3a78d8";
  const drinkHi = "#7fb6ff";
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        animation: "home-fridge-sip 2.4s ease-in-out infinite",
      }}
    >
      <svg viewBox="0 0 8 12" width={width} height={height} style={{ imageRendering: "pixelated", display: "block" }}>
        {/* Backpack */}
        <rect x="0" y="4" width="2" height="3" fill={C.suitShade} />
        {/* Helmet */}
        <rect x="1" y="0" width="6" height="4" fill={C.helmet} />
        {/* Visor */}
        <rect x="2" y="1" width="4" height="2" fill={C.visor} />
        {/* Visor shine on the LEFT — facing the fridge */}
        <rect x="3" y="1" width="1" height="1" fill={C.visorShine} />
        {/* Body */}
        <rect x="2" y="4" width="4" height="4" fill={C.suit} />
        <rect x="3" y="5" width="2" height="1" fill={C.accent} />
        <rect x="2" y="7" width="4" height="1" fill={C.suitShade} />
        {/* Right arm at side */}
        <rect x="6" y="4" width="1" height="3" fill={C.suit} />
        {/* Left arm raised holding a can */}
        <rect x="1" y="3" width="1" height="2" fill={C.suit} />
        {/* Can */}
        <rect x="0" y="2" width="2" height="2" fill={drink} />
        <rect x="0" y="2" width="2" height="1" fill={drinkHi} />
        {/* Legs */}
        <rect x="2" y="9" width="2" height="2" fill={C.suit} />
        <rect x="4" y="9" width="2" height="2" fill={C.suit} />
        <rect x="2" y="11" width="2" height="1" fill={C.suitShade} />
        <rect x="4" y="11" width="2" height="1" fill={C.suitShade} />
      </svg>
    </div>
  );
}

/** Astronaut head + bare shoulders inside the shower stall, with three
 *  staggered water drops falling from above. Visually paired with the
 *  PixelShower stall in the room SVG — the body is hidden by the glass. */
export function ShoweringAstronaut({ width = 28 }: { width?: number }) {
  const height = Math.round((width * 12) / 8);
  const skin = "#f3d4b4";
  return (
    <div style={{ position: "relative", width, height }}>
      {/* Head + shoulders only — body is "behind" the shower glass */}
      <svg
        viewBox="0 0 8 12"
        width={width}
        height={height}
        style={{ imageRendering: "pixelated", display: "block" }}
      >
        <rect x="1" y="3" width="6" height="4" fill={C.helmet} />
        <rect x="2" y="4" width="4" height="2" fill={C.visor} />
        {/* Closed eye line — eyes shut to keep water out */}
        <rect x="2" y="5" width="4" height="1" fill={C.sleepLine} />
        {/* Bare shoulders */}
        <rect x="2" y="7" width="4" height="2" fill={skin} />
      </svg>
      {/* Falling water drops from the showerhead */}
      {[
        { left: "30%", delay: 0 },
        { left: "50%", delay: 0.35 },
        { left: "70%", delay: 0.7 },
      ].map(({ left, delay }, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left,
            top: -8,
            width: Math.max(2, Math.round(width * 0.06)),
            height: Math.max(4, Math.round(width * 0.14)),
            background: "#7fc8ff",
            borderRadius: 1,
            opacity: 0.9,
            animation: `home-water-drop 0.9s linear ${delay}s infinite`,
          }}
        />
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
