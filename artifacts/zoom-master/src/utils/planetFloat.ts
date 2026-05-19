// Client-side helpers for the "Float" perfection bar.
//
// A planet's `float` is a decimal in [0, 1] inspired by CS:GO skin
// floats — purely cosmetic, only set on regular planets (BASIC / RARE
// / EPIC / GOLD / V1). White / Earth / SUN never have one.
//
// Display rule: if the planet has a stored `float`, use it. If not
// (legacy planet from before the feature shipped, or a server response
// that hasn't backfilled yet), derive a STABLE value from the planet
// id. This matches the deterministic seed the server uses for
// backfill, so the value the user sees on first load is the same one
// the server eventually persists — no jumping number after a refresh.

import type { Planet } from "../hooks/useGameState";

export const FLOAT_PLANET_TYPES = new Set(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1"]);

export function isFloatablePlanet(p: { name: string }): boolean {
  return FLOAT_PLANET_TYPES.has(String(p.name).toUpperCase());
}

// Truly random float for newly crafted/granted planets. The server
// preserves the FIRST value it sees on save, so the user gets the
// instant cosmetic feedback (no flicker) and the server still owns the
// canonical value going forward.
export function generateRandomFloat(): number {
  return Math.round(Math.random() * 1000) / 1000;
}

// FNV-1a 32-bit, mirrored from server lib/planetFloat.ts and
// utils/planetNames.ts so the deterministic backfill is identical
// across all three.
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
  return Math.round((h / 0x1_0000_0000) * 1000) / 1000;
}

// What the UI should show. Always returns a value in [0, 1].
export function getDisplayFloat(p: { id: string; float?: number | null }): number {
  if (typeof p.float === "number" && Number.isFinite(p.float) && p.float >= 0 && p.float <= 1) {
    return Math.round(p.float * 1000) / 1000;
  }
  return deterministicFloatFromId(p.id);
}

// Listings-flavored helper — server returns a snapshot in `planetFloat`,
// otherwise we fall back to the deterministic seed using the listing
// id (for legacy listings that pre-date the schema column).
export function getListingDisplayFloat(l: { id: number | string; planetFloat?: number | null }): number {
  if (typeof l.planetFloat === "number" && Number.isFinite(l.planetFloat) && l.planetFloat >= 0 && l.planetFloat <= 1) {
    return Math.round(l.planetFloat * 1000) / 1000;
  }
  return deterministicFloatFromId(`listing-${l.id}`);
}

// CS:GO-flavored tier labels. Picked thresholds match common skin-grading
// brackets but with slightly more generous "Pristine" / "Perfect" bands
// because our distribution is uniform (no Gaussian skew like CS:GO).
export interface FloatTier {
  label: string;
  short: string; // very short tag for tight rows (marketplace card)
  color: string;
}
export function getFloatTier(value: number): FloatTier {
  // Perfect is reserved for the absolute maximum: float === 1.000
  // (≈ 1 in 1001 craft, ~0.10%). Everything below — even 0.999 — is
  // Pristine. This makes the gold card a true "lottery" rarity.
  if (value >= 1)    return { label: "Perfect",        short: "PFCT", color: "#ffd700" };
  if (value >= 0.80) return { label: "Pristine",       short: "PRST", color: "#00f2fe" };
  if (value >= 0.50) return { label: "Field-Tested",   short: "FT",   color: "#4facfe" };
  if (value >= 0.20) return { label: "Well-Worn",      short: "WW",   color: "#c471ed" };
  return                     { label: "Battle-Scarred", short: "BS",  color: "#ff5252" };
}

// Display string. 3 decimals like CS:GO ("0.847").
export function formatFloat(value: number): string {
  return value.toFixed(3);
}
