// ─────────────────────────────────────────────────────────────────
// LAB ITEMS — 20 cosmetic drop variants of a crafted planet.
//
// An "item" is NOT a separate asset class: it reuses the SAME rarity as a
// planet and therefore inherits the SAME $ZOOM/hr rate, color, glow, craft
// cost, float, and ALL behavior (farming / burn / sell + marketplace). The
// ONLY difference is the rendered visual — an ItemOrb glyph instead of the
// PlanetOrb disc. An item is identified purely by the cosmetic `itemKind`
// tag on a Planet; every gameplay value stays keyed on the planet rarity.
// ─────────────────────────────────────────────────────────────────

export const ITEM_KINDS = [
  "cat",
  "dog",
  "ufo",
  "spaceship",
  "computer",
  "helmet",
  "boot",
  "flag",
  "backpack",
  "glove",
  "radar",
  "satellite",
  "telescope",
  "lighthouse",
  "happyplanet",
  "starmap",
  "alien",
  "human_male",
  "human_female",
  "dragon",
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

const ITEM_KIND_SET: ReadonlySet<string> = new Set(ITEM_KINDS);

/** Type guard — true when an unknown value is one of the 20 known item kinds. */
export function isItemKind(v: unknown): v is ItemKind {
  return typeof v === "string" && ITEM_KIND_SET.has(v);
}

/**
 * Probability that a COMPLETED craft yields an ITEM instead of a PLANET.
 * Spec: ~80% items / ~20% planets. The item rolls at WHATEVER rarity the
 * craft already produced — it inherits that rarity's rate/color/etc.
 */
export const ITEM_DROP_CHANCE = 0.8;

/** Pick a uniformly-random item kind. */
export function rollItemKind(): ItemKind {
  return ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
}

/** i18n key for an item's localized display name (e.g. `item.cat`). */
export function itemNameKey(kind: string): string {
  return `item.${kind}`;
}

/**
 * Resolve an item's localized display name through the translate fn. Falls
 * back to the raw key when the dictionary lacks the entry (translate already
 * returns the key in that case).
 */
export function getItemDisplayName(kind: string, t: (k: string) => string): string {
  return t(itemNameKey(kind));
}
