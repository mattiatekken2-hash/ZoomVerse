// ─────────────────────────────────────────────────────────────────────
// PixelPlant — pixel-art plant that grows through 10 levels.
//
//   level 1  → a freshly planted seed (just dirt + a tiny brown speck)
//   level 2  → a small green sprout breaking the soil
//   level 3  → a stem with the first pair of leaves
//   level 4  → taller stem with two leaf pairs
//   level 5  → bushy stem with four leaves
//   level 6  → first bud appearing at the top
//   level 7  → bigger bud
//   level 8  → bud opening (petals start to show)
//   level 9  → full bloom (pink flower)
//   level 10 → "Stellar Plant" — golden flower with a soft glow + spark
//
// Every level shares the same 16×16 viewBox so the slot rendering stays
// pixel-aligned regardless of growth stage. The clay pot at the bottom
// (rows 11–15) is identical across all levels — only what grows out of
// it changes.
// ─────────────────────────────────────────────────────────────────────

interface PixelPlantProps {
  /** 1..10 — clamped at the boundaries. */
  level: number;
  /** Pixel size of the rendered sprite (square). */
  size?: number;
  /** When true, draws a soft glow halo behind a level-10 plant. */
  glowing?: boolean;
}

// Palette
const POT = "#9c5a2b";
const POT_DARK = "#5a3014";
const POT_RIM = "#b8743e";
const SOIL = "#3a2412";
const SOIL_HL = "#5a3a22";
const SEED = "#8a5a2c";
const STEM = "#3da33d";
const STEM_DARK = "#1f6b22";
const LEAF = "#4dc14d";
const LEAF_DARK = "#2d8a30";
const BUD_GREEN = "#5fd05f";
const BUD_PINK = "#ff8fb3";
const PETAL = "#ff5f8a";
const PETAL_HL = "#ffb3c8";
const PETAL_GOLD = "#ffd740";
const PETAL_GOLD_HL = "#fff4a3";
const STAR = "#fffae0";

export function PixelPlant({ level, size = 56, glowing = false }: PixelPlantProps) {
  const lv = Math.max(1, Math.min(10, Math.round(level)));

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Glow halo behind a mature plant */}
      {glowing && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,215,64,0.35) 0%, rgba(255,179,71,0.18) 45%, rgba(255,179,71,0) 75%)",
            filter: "blur(2px)",
            pointerEvents: "none",
          }}
        />
      )}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        style={{ imageRendering: "pixelated", display: "block", position: "relative" }}
      >
        {/* ─── Pot (rows 11–15) ───────────────────────────────────── */}
        {/* Pot rim */}
        <rect x="3" y="11" width="10" height="1" fill={POT_RIM} />
        {/* Pot body */}
        <rect x="4" y="12" width="8" height="3" fill={POT} />
        {/* Pot shadow */}
        <rect x="4" y="14" width="8" height="1" fill={POT_DARK} />
        <rect x="11" y="12" width="1" height="2" fill={POT_DARK} />
        {/* Soil top inside pot rim */}
        <rect x="4" y="11" width="8" height="1" fill={SOIL} />
        <rect x="5" y="11" width="1" height="1" fill={SOIL_HL} />
        <rect x="9" y="11" width="1" height="1" fill={SOIL_HL} />

        {/* ─── Growth ─────────────────────────────────────────────── */}
        {lv === 1 && (
          // Tiny seed sitting on the soil
          <>
            <rect x="7" y="10" width="2" height="1" fill={SEED} />
            <rect x="8" y="10" width="1" height="1" fill={POT_DARK} />
          </>
        )}

        {lv === 2 && (
          // Small green sprout
          <>
            <rect x="8" y="9" width="1" height="2" fill={STEM} />
            <rect x="9" y="9" width="1" height="1" fill={LEAF} />
            <rect x="7" y="9" width="1" height="1" fill={LEAF} />
          </>
        )}

        {lv === 3 && (
          // Stem with first leaf pair
          <>
            <rect x="8" y="7" width="1" height="4" fill={STEM} />
            <rect x="6" y="8" width="2" height="1" fill={LEAF} />
            <rect x="9" y="8" width="2" height="1" fill={LEAF} />
            <rect x="6" y="9" width="1" height="1" fill={LEAF_DARK} />
            <rect x="10" y="9" width="1" height="1" fill={LEAF_DARK} />
          </>
        )}

        {lv === 4 && (
          // Taller stem, two leaf pairs
          <>
            <rect x="8" y="5" width="1" height="6" fill={STEM} />
            <rect x="6" y="6" width="2" height="1" fill={LEAF} />
            <rect x="9" y="6" width="2" height="1" fill={LEAF} />
            <rect x="5" y="9" width="3" height="1" fill={LEAF} />
            <rect x="9" y="9" width="3" height="1" fill={LEAF} />
            <rect x="6" y="7" width="1" height="1" fill={LEAF_DARK} />
            <rect x="10" y="7" width="1" height="1" fill={LEAF_DARK} />
          </>
        )}

        {lv === 5 && (
          // Bushy plant with four leaves
          <>
            <rect x="8" y="4" width="1" height="7" fill={STEM} />
            <rect x="5" y="5" width="3" height="1" fill={LEAF} />
            <rect x="9" y="5" width="3" height="1" fill={LEAF} />
            <rect x="5" y="6" width="1" height="1" fill={LEAF_DARK} />
            <rect x="11" y="6" width="1" height="1" fill={LEAF_DARK} />
            <rect x="4" y="8" width="4" height="1" fill={LEAF} />
            <rect x="9" y="8" width="4" height="1" fill={LEAF} />
            <rect x="4" y="9" width="1" height="1" fill={LEAF_DARK} />
            <rect x="12" y="9" width="1" height="1" fill={LEAF_DARK} />
          </>
        )}

        {lv === 6 && (
          // First bud appearing on top
          <>
            <rect x="8" y="4" width="1" height="7" fill={STEM_DARK} />
            <rect x="5" y="6" width="3" height="1" fill={LEAF} />
            <rect x="9" y="6" width="3" height="1" fill={LEAF} />
            <rect x="4" y="9" width="4" height="1" fill={LEAF} />
            <rect x="9" y="9" width="4" height="1" fill={LEAF} />
            {/* small bud */}
            <rect x="7" y="3" width="3" height="1" fill={BUD_GREEN} />
            <rect x="8" y="2" width="1" height="1" fill={BUD_GREEN} />
          </>
        )}

        {lv === 7 && (
          // Bigger bud
          <>
            <rect x="8" y="5" width="1" height="6" fill={STEM_DARK} />
            <rect x="5" y="7" width="3" height="1" fill={LEAF} />
            <rect x="9" y="7" width="3" height="1" fill={LEAF} />
            <rect x="4" y="9" width="4" height="1" fill={LEAF} />
            <rect x="9" y="9" width="4" height="1" fill={LEAF} />
            {/* bigger bud */}
            <rect x="7" y="2" width="3" height="3" fill={BUD_GREEN} />
            <rect x="8" y="1" width="1" height="1" fill={BUD_GREEN} />
            <rect x="8" y="3" width="1" height="1" fill={BUD_PINK} />
          </>
        )}

        {lv === 8 && (
          // Bud opening: petals start showing
          <>
            <rect x="8" y="5" width="1" height="6" fill={STEM_DARK} />
            <rect x="5" y="7" width="3" height="1" fill={LEAF} />
            <rect x="9" y="7" width="3" height="1" fill={LEAF} />
            <rect x="4" y="9" width="4" height="1" fill={LEAF} />
            <rect x="9" y="9" width="4" height="1" fill={LEAF} />
            {/* opening flower */}
            <rect x="7" y="2" width="3" height="3" fill={PETAL} />
            <rect x="8" y="1" width="1" height="1" fill={PETAL_HL} />
            <rect x="6" y="3" width="1" height="1" fill={PETAL} />
            <rect x="10" y="3" width="1" height="1" fill={PETAL} />
            <rect x="8" y="3" width="1" height="1" fill={PETAL_HL} />
          </>
        )}

        {lv === 9 && (
          // Full bloom — pink flower
          <>
            <rect x="8" y="5" width="1" height="6" fill={STEM_DARK} />
            <rect x="5" y="7" width="3" height="1" fill={LEAF} />
            <rect x="9" y="7" width="3" height="1" fill={LEAF} />
            <rect x="4" y="9" width="4" height="1" fill={LEAF} />
            <rect x="9" y="9" width="4" height="1" fill={LEAF} />
            {/* full flower 5x5 */}
            <rect x="6" y="2" width="5" height="3" fill={PETAL} />
            <rect x="7" y="1" width="3" height="1" fill={PETAL} />
            <rect x="7" y="5" width="3" height="1" fill={PETAL} />
            <rect x="8" y="3" width="1" height="1" fill={PETAL_HL} />
            <rect x="7" y="2" width="1" height="1" fill={PETAL_HL} />
            <rect x="9" y="4" width="1" height="1" fill={PETAL_HL} />
          </>
        )}

        {lv === 10 && (
          // Stellar Plant — glowing golden flower with sparkles
          <>
            <rect x="8" y="5" width="1" height="6" fill={STEM_DARK} />
            <rect x="5" y="7" width="3" height="1" fill={LEAF} />
            <rect x="9" y="7" width="3" height="1" fill={LEAF} />
            <rect x="4" y="9" width="4" height="1" fill={LEAF} />
            <rect x="9" y="9" width="4" height="1" fill={LEAF} />
            {/* golden flower 5x5 */}
            <rect x="6" y="2" width="5" height="3" fill={PETAL_GOLD} />
            <rect x="7" y="1" width="3" height="1" fill={PETAL_GOLD} />
            <rect x="7" y="5" width="3" height="1" fill={PETAL_GOLD} />
            <rect x="8" y="3" width="1" height="1" fill={PETAL_GOLD_HL} />
            <rect x="7" y="2" width="1" height="1" fill={PETAL_GOLD_HL} />
            <rect x="9" y="4" width="1" height="1" fill={PETAL_GOLD_HL} />
            {/* sparkles around the flower */}
            <rect x="3" y="1" width="1" height="1" fill={STAR} />
            <rect x="13" y="3" width="1" height="1" fill={STAR} />
            <rect x="2" y="5" width="1" height="1" fill={STAR} />
            <rect x="13" y="6" width="1" height="1" fill={STAR} />
          </>
        )}
      </svg>
    </div>
  );
}
