// Server-side validation + profanity filter + random-name generator
// for the /planets/rename endpoint. The SERVER is the source of truth:
//   • mode:"random"  → ignores any client-supplied name and generates
//                      a fresh procedural name itself, so a user can't
//                      buy a custom name at the random-mode price.
//   • mode:"custom"  → accepts the user-typed name, validates length,
//                      charset, profanity, then persists.

export const RENAME_MIN_LEN = 2;
export const RENAME_MAX_LEN = 24;
// Letters (incl. accented), digits, space, dash, dot, apostrophe.
const ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N} '.\-]*$/u;

export const RENAME_RANDOM_COST = 100;
export const RENAME_CUSTOM_COST = 500;

// Planet rarities that can be renamed. White / Earth Collection planets
// and the SUN are intentionally excluded.
export const RENAMABLE_TYPES = new Set<string>(["BASIC", "RARE", "EPIC", "GOLD", "V1"]);

// Compact blocklist. Covers high-impact English + Italian slurs and
// crude profanity. Matched after normalization (lowercase, accents
// stripped, repeated chars collapsed, non-alnum removed) so simple
// obfuscations like "f.u.c.k", "cazzzo", "merdâ" still get caught.
//
// We err on the side of catching MORE than necessary — this is a kids-
// friendly Telegram mini-app and these names appear publicly in the
// marketplace. False positives (legitimate names rejected) are
// recoverable; a slur in Hall of Fame is not.
const BLOCKED_SUBSTRINGS: readonly string[] = [
  // EN — sexual / vulgar
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut",
  "asshole", "bastard", "wanker", "twat", "boner", "jerkoff", "blowjob",
  // EN — slurs (racial / homophobic / ableist)
  "nigger", "nigga", "faggot", "fag", "tranny", "retard", "kike", "spic",
  "chink", "gook", "dyke",
  // IT — vulgar / sexual
  "cazzo", "stronz", "merda", "puttana", "puttan", "troia", "vaffan",
  "coglion", "porcodio", "porco dio", "dio cane", "diocane", "mignotta",
  "zoccola", "minchia", "fica", "figa", "culo", "pompino", "checca",
  // IT — slurs / hate
  "frocio", "negro", "ricchione", "terrone", "ebreo di merda", "mongolo",
  "handicapp", "ritardato",
  // Hate symbols / nazi
  "hitler", "nazi", "kkk", "1488", "heilhitler",
];

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "");
}

// Collapse repeated letters ("fuuuuck" → "fuck") and remove anything
// that isn't a letter/digit so spacers like dots / dashes / spaces don't
// hide a slur.
function normalizeForFilter(s: string): string {
  const lower = stripDiacritics(s.toLowerCase());
  const collapsed = lower.replace(/(.)\1{2,}/g, "$1$1");
  return collapsed.replace(/[^a-z0-9]+/g, "");
}

export function containsProfanity(name: string): boolean {
  const haystack = normalizeForFilter(name);
  if (haystack.length === 0) return false;
  for (const needle of BLOCKED_SUBSTRINGS) {
    const n = normalizeForFilter(needle);
    if (n.length > 0 && haystack.includes(n)) return true;
  }
  return false;
}

export type RenameValidationError =
  | { ok: false; code: "too_short"; message: string }
  | { ok: false; code: "too_long"; message: string }
  | { ok: false; code: "bad_chars"; message: string }
  | { ok: false; code: "blocked_word"; message: string };

// ─── Procedural name generator (server-authoritative for "random") ────
// Mirrors the client-side generator in zoom-master/src/utils/planetNames.ts
// — kept intentionally simple and dependency-free so we don't pull a
// shared lib into both packages just for this. The two generators don't
// need to produce IDENTICAL names (they're seeded differently); they
// only need to draw from compatible-feeling word banks.
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

// Always positive modulo. JS `%` returns the sign of the dividend, and
// our XOR-mixed seeds are routinely negative — without this we'd index
// with a negative number and pick `undefined`.
function modPos(n: number, m: number): number {
  return ((n % m) + m) % m;
}
function pickFrom<T>(arr: T[], seed: number): T {
  return arr[modPos(seed, arr.length)]!;
}

export function generateRandomPlanetName(): string {
  // Mix Math.random with the high-resolution clock so two re-rolls in
  // the same millisecond can't collide.
  const seed = ((Math.random() * 0xffffffff) >>> 0) ^ ((Date.now() & 0xffffffff) >>> 0);
  const shape = modPos(seed, 3);
  const a = pickFrom(PREFIXES, Math.floor(seed / 3));
  if (shape === 0) {
    const b = pickFrom(SUFFIXES, Math.floor(seed / 7) ^ 0x9e3779b1);
    return `${a}-${b}`;
  }
  if (shape === 1) {
    const r = pickFrom(ROMANS, Math.floor(seed / 11) ^ 0x85ebca6b);
    return `${a} ${r}`;
  }
  const n = modPos(Math.floor(seed / 13) ^ 0xc2b2ae35, 999) + 1;
  return `${a}-${n}`;
}

export function validateRenameName(
  raw: string,
): { ok: true; name: string } | RenameValidationError {
  const name = String(raw ?? "").trim();
  if (name.length < RENAME_MIN_LEN) {
    return { ok: false, code: "too_short", message: `Name too short (min ${RENAME_MIN_LEN})` };
  }
  if (name.length > RENAME_MAX_LEN) {
    return { ok: false, code: "too_long", message: `Name too long (max ${RENAME_MAX_LEN})` };
  }
  if (!ALLOWED_RE.test(name)) {
    return { ok: false, code: "bad_chars", message: "Letters, numbers, spaces and - . ' only" };
  }
  if (containsProfanity(name)) {
    return { ok: false, code: "blocked_word", message: "Name not allowed" };
  }
  return { ok: true, name };
}
