/** Semantic voxel color tokens — resolved at reveal from rarity primary/accent. */
export type VoxelColorToken =
  | "p"
  | "a"
  | "pd"
  | "pl"
  | "ad"
  | "al"
  | "k"
  | "w";

const TOKEN_SET = new Set<string>(["p", "a", "pd", "pl", "ad", "al", "k", "w"]);

export function isVoxelColorToken(c: string): c is VoxelColorToken {
  return TOKEN_SET.has(c);
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function lighten(hex: string, amt: number): string {
  return mix(hex, "#ffffff", amt);
}

function darken(hex: string, amt: number): string {
  return mix(hex, "#000000", amt);
}

/** Checkerboard primary texture — two tones of the rarity main color. */
export function primaryTone(x: number, y: number, z: number): VoxelColorToken {
  return (x + y + z) % 2 === 0 ? "pl" : "pd";
}

/** Checkerboard accent texture. */
export function accentTone(x: number, y: number, z: number): VoxelColorToken {
  return (x + y + z) % 2 === 0 ? "al" : "ad";
}

/** Resolve blueprint token or literal hex using the model's rarity palette. */
export function resolveVoxelPaintColor(token: string, primary: string, accent: string): string {
  switch (token) {
    case "p":
      return primary;
    case "a":
      return accent;
    case "pd":
      return darken(primary, 0.28);
    case "pl":
      return lighten(primary, 0.22);
    case "ad":
      return darken(accent, 0.28);
    case "al":
      return lighten(accent, 0.22);
    case "k":
      return "#141414";
    case "w":
      return "#f4f4f4";
    default:
      return token;
  }
}
