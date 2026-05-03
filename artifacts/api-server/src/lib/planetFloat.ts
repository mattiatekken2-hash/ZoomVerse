// Server-side helpers for the "Float" feature — a CS:GO-style decimal
// (0.000 — 1.000) that gives every regular planet a unique perfection
// score. Purely cosmetic: drives the perfection bar in the Lab and the
// marketplace card, but does NOT affect rate, yield, price, or any
// other economic value (per product decision — "Solo estetico").
//
// Source-of-truth model:
//   • A planet's float is generated ONCE and stored on the planet
//     object inside `users.planets_json`. After that it never changes.
//   • The first /regular-planets/save after deploy backfills floats for
//     all pre-existing regular planets that don't have one yet, using
//     a DETERMINISTIC seed from the planet id so the value the user
//     saw in the UI on first load (computed client-side from the same
//     seed) matches what the server persists. No "float jumped after
//     reload" bug.
//   • For brand-new planets created after deploy the client supplies a
//     truly random float at creation time and the server preserves it
//     on the very first save (server-merge: keep stored, accept
//     incoming for new, generate from id as last resort).

// Only these planet types get a float — matches the rename feature's
// RENAMABLE_TYPES (regulars only; white / earth / sun are excluded).
export const FLOAT_PLANET_TYPES = new Set(["BASIC", "RARE", "EPIC", "GOLD", "V1"]);

export const FLOAT_MIN = 0;
export const FLOAT_MAX = 1;

// Truly random in [0, 1) with 3 decimals, used by the server when it
// has to backfill from scratch (no incoming, no stored value, AND no
// id to seed from — should be rare).
export function generateRandomFloat(): number {
  return Math.round(Math.random() * 1000) / 1000;
}

// Deterministic float in [0, 1) derived from the planet id. Same id →
// same float forever. This is the client-side fallback we mirror so a
// planet's perfection bar doesn't change when the server backfills it
// for the first time. FNV-1a 32-bit, identical to the one used by the
// rename feature in `lib/planetNames.ts`.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
export function deterministicFloatFromId(planetId: string): number {
  const h = fnv1a(planetId || "anon");
  // h is uint32 → divide by 2^32 to land in [0, 1), then 3-decimal
  // round so the displayed bar value matches across client/server.
  return Math.round((h / 0x1_0000_0000) * 1000) / 1000;
}

// Clamp + sanitize an incoming float from a client save. Anything
// outside [0, 1] or non-finite is rejected (returns undefined so the
// caller falls back to the deterministic-from-id seed).
export function sanitizeIncomingFloat(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < FLOAT_MIN || value > FLOAT_MAX) return undefined;
  return Math.round(value * 1000) / 1000;
}
