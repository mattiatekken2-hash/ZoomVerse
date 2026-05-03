// Procedural galactic planet names.
//
// Two helpers:
//  • generateRandomPlanetName(): a fresh random epic name (used by the
//    "re-roll" rename action and by any future code that wants a brand
//    new name).
//  • getPlanetDisplayName(planet): the name to actually show in the UI.
//    If the planet has an explicit `displayName` (set by a rename), use
//    it; otherwise derive a STABLE name deterministically from the
//    planet's id so every device shows the same name for the same
//    planet without any server round-trip or migration.

import type { Planet } from "../hooks/useGameState";

// Word banks. Picked to feel sci-fi / mythic without being too long.
// Avoid real-life proper nouns that could be sensitive.
const PREFIXES = [
  "Xenon", "Nova", "Aether", "Limbus", "Orbis", "Astra", "Helio", "Lyra",
  "Cygnus", "Vega", "Altair", "Polaris", "Nemesis", "Tycho", "Erebos",
  "Phoenix", "Drakon", "Zephyr", "Chronos", "Pyra", "Cryos", "Volt",
  "Ion", "Kyber", "Seraph", "Mornir", "Vesper", "Nyx", "Solis", "Lunae",
  "Boreas", "Argo", "Cetus", "Draco", "Hydra", "Orion", "Perseus",
  "Sirius", "Andromeda", "Quasar", "Pulsar", "Nebul", "Magnar", "Vortex",
  "Eos", "Tartar", "Olymp", "Titan", "Cosmo", "Zenith",
];

const SUFFIXES = [
  "Prime", "Major", "Minor", "Nova", "Rex", "Lux", "Ultima", "Maxima",
  "Vesper", "Halo", "Veil", "Crown", "Reach", "Spire", "Dawn", "Eclipse",
  "Forge", "Heart", "Edge", "Rift", "Throne", "Echo", "Bloom", "Cipher",
  "Storm", "Aegis", "Pyre", "Bastion", "Apex", "Helix", "Ember", "Tide",
];

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// Cheap, deterministic 32-bit hash (FNV-1a). Same input → same output
// across every device, every browser, every server. Used to seed the
// fallback name from the planet's id.
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned 32-bit.
  return h >>> 0;
}

// IMPORTANT: JS `%` returns a negative result for negative dividends, and
// our XOR-derived seeds frequently flip the sign bit. Without the
// `+ len) % len` step we'd index with a negative number and get
// `undefined`, producing names like "Xenon-undefined". Always use this
// helper, never raw `%`.
function pick<T>(arr: T[], seed: number): T {
  const i = ((seed % arr.length) + arr.length) % arr.length;
  return arr[i]!;
}

function modPositive(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// Three name shapes, weighted equally:
//   0  → "Prefix-Suffix"          (Xenon-Prime)
//   1  → "Prefix Roman"           (Aether VII)
//   2  → "Prefix-Number"          (Nova-742)
function buildName(seed: number): string {
  const shape = modPositive(seed, 3);
  // Spread the seed across multiple "lanes" so consecutive ids don't
  // collide on the same word.
  const a = pick(PREFIXES, Math.floor(seed / 3));
  if (shape === 0) {
    const b = pick(SUFFIXES, Math.floor(seed / 7) ^ 0x9e3779b1);
    return `${a}-${b}`;
  }
  if (shape === 1) {
    const r = pick(ROMANS, Math.floor(seed / 11) ^ 0x85ebca6b);
    return `${a} ${r}`;
  }
  const n = modPositive(Math.floor(seed / 13) ^ 0xc2b2ae35, 999) + 1;
  return `${a}-${n}`;
}

// Returns a STABLE name derived from the planet id. Same id → same name.
export function deterministicNameFromId(planetId: string): string {
  return buildName(fnv1a(planetId || "anon"));
}

// Returns a fresh random name. Re-rolled by the user via the rename popup.
export function generateRandomPlanetName(): string {
  // Pull entropy from Math.random + the high-resolution clock so two
  // re-rolls in the same millisecond don't collide.
  const seed = ((Math.random() * 0xffffffff) >>> 0) ^ ((Date.now() & 0xffffffff) >>> 0);
  return buildName(seed);
}

// What the UI should show. Custom rename wins; otherwise the stable
// id-derived fallback.
export function getPlanetDisplayName(planet: Pick<Planet, "id" | "displayName">): string {
  const explicit = (planet.displayName ?? "").trim();
  if (explicit.length > 0) return explicit;
  return deterministicNameFromId(planet.id);
}

// Validation rules shared by the rename UI. The server enforces them
// again as the source of truth.
export const RENAME_MIN_LEN = 2;
export const RENAME_MAX_LEN = 24;
// Letters (incl. accented), digits, space, dash, dot, apostrophe.
export const RENAME_ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N} '.\-]*$/u;
export const RENAME_RANDOM_COST = 100;
export const RENAME_CUSTOM_COST = 500;

export function validateCustomNameClient(name: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = name.trim();
  if (trimmed.length < RENAME_MIN_LEN) return { ok: false, reason: `Name too short (min ${RENAME_MIN_LEN})` };
  if (trimmed.length > RENAME_MAX_LEN) return { ok: false, reason: `Name too long (max ${RENAME_MAX_LEN})` };
  if (!RENAME_ALLOWED_RE.test(trimmed)) return { ok: false, reason: "Letters, numbers, spaces and - . ' only" };
  return { ok: true };
}
