/** Monochrome high-contrast palette — no original game colors in 3D layer. */
export const MONO = {
  bg: "#000000",
  void: "#050505",
  surface: "#111111",
  panel: "#1a1a1a",
  line: "#333333",
  muted: "#666666",
  mid: "#999999",
  bright: "#cccccc",
  white: "#ffffff",
} as const;

export const RARITY_GRAY: Record<string, number> = {
  BASIC: 0.35,
  RARE: 0.45,
  EPIC: 0.55,
  MYTHIC: 0.65,
  PLASMA: 0.7,
  GOLD: 0.85,
  NOVA: 0.75,
  MUSHROOM: 0.5,
  V1: 0.95,
  V1_NFT: 1,
  SUN: 1,
  PRISM: 0.92,
  VOID: 0.98,
  default: 0.4,
};

export function rarityShade(type: string | null | undefined): number {
  if (!type) return RARITY_GRAY.default;
  return RARITY_GRAY[type] ?? RARITY_GRAY.default;
}

/** Camera positions per tab in continuous space (x, y, z). */
export const TAB_CAMERA: Record<string, [number, number, number]> = {
  lab: [0, 1.2, 5.5],
  farm: [0, 2, 7],
  market: [4, 1.5, 6],
  earn: [-4, 1.5, 6],
  pvp: [0, 1, 8],
  rank: [0, 3, 9],
  shop: [3, 1, 5],
  wallet: [-3, 1, 5],
  home: [0, 0.5, 6],
};
