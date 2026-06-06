// Profile XP/level curve driven by cumulative lifetime LAB taps.
//
// Per-level requirement grows smoothly so the climb to level 100 feels
// prestigious. Level 1->2 costs ~100 taps; level 99->100 costs ~50,000.
//
// requirement(level) = round(BASE * r^(level-1)) with r chosen so that
// requirement(1) ~= 100 and requirement(99) ~= 50,000.
//   r = (50000 / 100)^(1/98) = 500^(1/98) ~= 1.0655

export const MAX_LEVEL = 100;
const BASE_REQ = 100;
const GROWTH = Math.pow(500, 1 / 98);

/** Taps required to go from `level` to `level + 1`. Valid for level 1..99. */
export function tapsForLevel(level: number): number {
  if (level < 1) return BASE_REQ;
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(BASE_REQ * Math.pow(GROWTH, level - 1));
}

export interface LevelInfo {
  /** Current level, 1..100. */
  level: number;
  /** Taps accumulated into the current level. */
  xpIntoLevel: number;
  /** Taps required to reach the next level (Infinity at max level). */
  xpForNextLevel: number;
  /** Progress toward the next level in [0, 1]. 1 when maxed. */
  progress: number;
  /** True once level 100 is reached. */
  isMax: boolean;
}

/**
 * Map a cumulative lifetime tap count to level/XP info. Deterministic and
 * pure so it can be unit-tested and called on every render cheaply.
 */
export function levelFromTaps(totalTaps: number): LevelInfo {
  const taps = Math.max(0, Math.floor(totalTaps || 0));
  let level = 1;
  let remaining = taps;

  while (level < MAX_LEVEL) {
    const need = tapsForLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }

  if (level >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      xpIntoLevel: 0,
      xpForNextLevel: 0,
      progress: 1,
      isMax: true,
    };
  }

  const xpForNextLevel = tapsForLevel(level);
  const progress = xpForNextLevel > 0 ? remaining / xpForNextLevel : 0;
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progress: Math.min(1, Math.max(0, progress)),
    isMax: false,
  };
}
