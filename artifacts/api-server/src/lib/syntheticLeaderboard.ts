/**
 * Display-only ghosts for Season rank + Craft board.
 * Not in `users`, no airdrop, no ★ prizes.
 *
 * Revert: SYNTHETIC_LEADERBOARD=0 on the API, or set ENABLED to false.
 */
export const SYNTHETIC_LEADERBOARD_ENABLED =
  process.env.SYNTHETIC_LEADERBOARD !== "0"
  && process.env.SYNTHETIC_LEADERBOARD !== "false"
  && process.env.SYNTHETIC_LEADERBOARD !== "off";

export const SYNTHETIC_ID_PREFIX = "zsynth-";

export function isSyntheticTelegramId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SYNTHETIC_ID_PREFIX);
}

export const SYNTHETIC_PLAYERS = [
  { id: `${SYNTHETIC_ID_PREFIX}01`, name: "Gio", photo: "/avatars/synth-alex.svg", zoom: 178, labPoints: 1 },
  { id: `${SYNTHETIC_ID_PREFIX}02`, name: "chiara", photo: "/avatars/synth-mila.svg", zoom: 156, labPoints: 1 },
  { id: `${SYNTHETIC_ID_PREFIX}03`, name: "Niko.", photo: "/avatars/synth-diego.svg", zoom: 134, labPoints: 1 },
  { id: `${SYNTHETIC_ID_PREFIX}04`, name: "Lory", photo: "/avatars/synth-kenji.svg", zoom: 112, labPoints: 1 },
  { id: `${SYNTHETIC_ID_PREFIX}05`, name: "m4rco", photo: "/avatars/synth-sara.svg", zoom: 88, labPoints: 1 },
  { id: `${SYNTHETIC_ID_PREFIX}06`, name: "Vale", photo: "/avatars/synth-omar.svg", zoom: 61, labPoints: 1 },
] as const;

export function syntheticPlayerCount(): number {
  return SYNTHETIC_LEADERBOARD_ENABLED ? SYNTHETIC_PLAYERS.length : 0;
}

export function mergeSeasonLeaderboard<T extends {
  telegramId: string;
  firstName: string;
  photoUrl: string | null;
  zoomBalance: number;
  vipLevel?: string | null;
  rank: number;
}>(rows: T[]): T[] {
  if (!SYNTHETIC_LEADERBOARD_ENABLED) return rows;
  const extra = SYNTHETIC_PLAYERS.map((p) => ({
    telegramId: p.id,
    firstName: p.name,
    photoUrl: p.photo,
    zoomBalance: p.zoom,
    vipLevel: "NONE" as const,
    rank: 0,
  })) as T[];
  return [...rows, ...extra]
    .sort((a, b) => b.zoomBalance - a.zoomBalance || a.telegramId.localeCompare(b.telegramId))
    .slice(0, 100)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

export function mergeCraftLeaderboard<T extends {
  telegramId: string;
  name: string;
  labPoints: number;
  photoUrl: string | null;
  tonPrize: number;
  rank: number;
}>(rows: T[], prizeForRank: (rank: number) => number): T[] {
  if (!SYNTHETIC_LEADERBOARD_ENABLED) return rows;
  const extra = SYNTHETIC_PLAYERS.map((p) => ({
    telegramId: p.id,
    name: p.name,
    labPoints: p.labPoints,
    photoUrl: p.photo,
    tonPrize: 0,
    rank: 0,
  })) as T[];
  return [...rows, ...extra]
    .sort((a, b) => b.labPoints - a.labPoints || a.telegramId.localeCompare(b.telegramId))
    .slice(0, 100)
    .map((row, i) => {
      const rank = i + 1;
      const synthetic = isSyntheticTelegramId(row.telegramId);
      return { ...row, rank, tonPrize: synthetic ? 0 : prizeForRank(rank) };
    });
}
