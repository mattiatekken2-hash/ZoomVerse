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
  /** "stand"  = normal, "sit" = legs tucked (chair), "snack" = holding cookie,
   *  "coffee" = standing, mug held to chest (same full-height sprite). */
  pose?: "stand" | "sit" | "snack" | "coffee";
  /** "side"  = visor highlight on the right (looking sideways),
   *  "up"    = visor highlight centered (looking forward / up at window),
   *  "sleep" = dim closed-eye line (used by the SleepingAstronaut wrapper) */
  facing?: "side" | "up" | "sleep";
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
      {facing === "sleep" ? (
        <rect x="2" y="2" width="4" height="1" fill={C.sleepLine} />
      ) : facing === "up" ? (
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
      ) : pose === "coffee" ? (
        <>
          {/* Right arm raised to chest, holding the mug. Left arm at side. */}
          <rect x="1" y="4" width="1" height="3" fill={C.suit} />
          <rect x="6" y="5" width="1" height="2" fill={C.suit} />
          {/* Mug — white cup with brown coffee top, sits at chest height
              just in front of the visor. Same scale as `snack` so the
              full body remains the same height as `stand`. */}
          <rect x="3" y="4" width="2" height="2" fill="#ffffff" />
          <rect x="3" y="4" width="2" height="1" fill="#8a5a2a" />
          {/* Tiny mug handle on the right side */}
          <rect x="5" y="5" width="1" height="1" fill="#ffffff" />
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

/** Astronaut sleeping in the bed, tucked UNDER the covers. The helmet
 *  pokes out at the pillow end (so the player still recognises the
 *  character — same helmet sprite as every other activity, closed-eye
 *  visor variant) while the rest of the body is hidden under a sheet
 *  stripe with a small chest bump. Three Z's drift up from the helmet.
 *
 *  Layout (logical units, the wrapper is `width` long × `helmetH+pad`
 *  tall): helmet on the LEFT (over the pillow), sheet extending RIGHT
 *  for the rest of the bed length. */
export function SleepingAstronaut({ width = 70 }: { width?: number }) {
  // Helmet sprite is 8 wide × 4 tall (PixelAstronautHead ratio). Size
  // it so it occupies ~30% of the total bed length — that matches the
  // pillow proportions in the PixelBed SVG.
  const helmetW = Math.round(width * 0.3);
  const helmetH = Math.round((helmetW * 4) / 8);
  // Sheet covers the remaining ~70% of the bed length, ending just
  // shy of the foot board.
  const sheetW = width - helmetW;
  const sheetH = Math.round(helmetH * 1.1);
  // Total wrapper height keeps room above the helmet for the Z's.
  const wrapperH = helmetH + 6;
  return (
    <div style={{ position: "relative", width, height: wrapperH }}>
      {/* Sheet covering the body — anchored to the BOTTOM of the
          wrapper so the lower edge lines up with the bed's sheet line. */}
      <div
        style={{
          position: "absolute",
          left: helmetW - 1,
          bottom: 0,
          width: sheetW,
          height: sheetH,
          background: C.sheet,
          // Darker fold along the bottom — same trick as the bed sprite,
          // so the covers visually melt into the bed sheet.
          boxShadow: `inset 0 -2px 0 ${C.sheetShade}`,
        }}
      />
      {/* Tiny chest bump suggesting the body under the covers, sits on
          top of the sheet near the helmet end. */}
      <div
        style={{
          position: "absolute",
          left: helmetW + Math.round(sheetW * 0.1),
          bottom: sheetH - 2,
          width: Math.round(sheetW * 0.35),
          height: 3,
          background: C.sheet,
        }}
      />
      {/* Helmet poking out of the covers — same closed-eye sprite used
          by the LAB sleep pill, so the character reads as the SAME
          astronaut, just tucked in. */}
      <div style={{ position: "absolute", left: 0, bottom: 0 }}>
        <PixelAstronautHead variant="sleep" width={helmetW} />
      </div>
      {/* Floating Z's drifting up from the helmet area. */}
      {[0, 1.1, 2.2].map((delay, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: Math.round(helmetW * 0.45) + i * 2,
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

/** Astronaut inside the shower stall, with three staggered water drops
 *  falling on him from above. Uses the SAME PixelAstronaut sprite as
 *  every other activity (helmet + full suit) — no bare-skin swap — so
 *  the character stays consistent. */
export function ShoweringAstronaut({ width = 28 }: { width?: number }) {
  const height = Math.round((width * 12) / 8);
  return (
    <div style={{ position: "relative", width, height }}>
      <PixelAstronaut pose="stand" facing="up" width={width} />
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

/** ─── PHASE 5 — Space Slime pet companion ──────────────────────────
 *  A tiny green hovering creature that lives in the room with the
 *  astronaut. Two eyes, a single antenna with a yellow spark, and a
 *  gentle vertical bob to suggest hovering. State drives the eyes /
 *  mouth so it can sleep, eat or just look around. */
export function PixelPet({
  state = "idle",
  width = 32,
}: {
  state?: "idle" | "sleep" | "eat";
  width?: number;
}) {
  // Sprite is 8 wide × 7 tall (1 antenna row + 6 body rows).
  const height = Math.round((width * 7) / 8);
  const body = "#6dd66d";
  const bodyShade = "#3da33d";
  const eye = "#0a1a3d";
  const eyeShine = "#ffffff";
  const spark = "#ffd740";
  return (
    <div
      style={{
        position: "relative",
        width,
        height: height + 6,
        animation: "home-pet-float 2.4s ease-in-out infinite",
      }}
    >
      <svg
        viewBox="0 0 8 7"
        width={width}
        height={height}
        style={{ imageRendering: "pixelated", display: "block" }}
      >
        {/* Antenna spark + stem */}
        <rect x="3" y="0" width="2" height="1" fill={spark} />
        <rect x="3" y="1" width="1" height="1" fill={bodyShade} />
        {/* Body — rounded blob */}
        <rect x="2" y="2" width="4" height="1" fill={body} />
        <rect x="1" y="3" width="6" height="1" fill={body} />
        <rect x="0" y="4" width="8" height="2" fill={body} />
        <rect x="1" y="6" width="6" height="1" fill={bodyShade} />
        {/* Eyes */}
        {state === "sleep" ? (
          <>
            <rect x="2" y="4" width="2" height="1" fill={bodyShade} />
            <rect x="4" y="4" width="2" height="1" fill={bodyShade} />
          </>
        ) : (
          <>
            <rect x="2" y="4" width="1" height="1" fill={eye} />
            <rect x="5" y="4" width="1" height="1" fill={eye} />
            {/* Tiny shine on the right eye */}
            <rect x="5" y="4" width="1" height="1" fill={eyeShine} opacity="0.35" />
          </>
        )}
        {/* Mouth — only when eating, a small dark chomp */}
        {state === "eat" && <rect x="3" y="5" width="2" height="1" fill={eye} />}
      </svg>
      {/* Floating "z" only when asleep */}
      {state === "sleep" && (
        <span
          style={{
            position: "absolute",
            left: Math.round(width * 0.7),
            top: -4,
            fontSize: 9,
            fontWeight: 900,
            color: "#cfe2ff",
            textShadow: "0 0 3px rgba(0,0,0,0.6)",
            animation: "home-z-float 3.3s ease-in-out infinite",
          }}
        >
          z
        </span>
      )}
    </div>
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
