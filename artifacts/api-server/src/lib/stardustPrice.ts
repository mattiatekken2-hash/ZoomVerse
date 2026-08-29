/**
 * Global STARDUST index — decorative market price driven by real in-game
 * spend/collect activity (mirrors zoomPrice.ts, lighter scale).
 *
 * Genesis index = 1.000000. Stored as micro-units (index * 1e6).
 * Grows continuously from player activity — no tight daily band or resets.
 */
import { db } from "@workspace/db";
import { appSettingsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const INDEX_KEY = "stardust_index_micro";
const CHART_KEY = "stardust_index_chart";
const VERSION_KEY = "stardust_index_version";

export const STARDUST_SCALE = 1_000_000;
export const STARDUST_GENESIS_MICRO = 1_000_000; // 1.0
/** Safety ceiling — asymptotic cap far above normal play. */
export const STARDUST_INDEX_MAX_MICRO = 10_000_000; // 10.0
/** Never below genesis once seeded. */
export const STARDUST_INDEX_MIN_MICRO = STARDUST_GENESIS_MICRO;
/** Global cooldown between bumps — stops convert→stake double-pump bursts. */
const BUMP_COOLDOWN_MS = 30_000;
/** At index 1.0: 1 GRAM → 100 STARDUST (shop + convert baseline). */
export const STARDUST_PER_GRAM_BASE = 100;

function clampIndexMicro(micro: number): number {
  return Math.min(STARDUST_INDEX_MAX_MICRO, Math.max(STARDUST_INDEX_MIN_MICRO, micro));
}

function indexFromMicro(indexMicro: number): number {
  return clampIndexMicro(indexMicro) / STARDUST_SCALE;
}

export function stardustPriceForGram(gramAmount: number, indexMicro: number): number {
  const index = indexFromMicro(indexMicro);
  return Math.max(1, Math.ceil(gramAmount * STARDUST_PER_GRAM_BASE * index));
}

export function gramToStardust(gramAmount: number, indexMicro: number): number {
  const index = indexFromMicro(indexMicro);
  return Math.max(1, Math.floor((gramAmount * STARDUST_PER_GRAM_BASE) / index));
}

/** Reverse convert spread — users receive 85% of nominal GRAM value. */
export const STARDUST_TO_GRAM_SPREAD = 0.85;

export function stardustToGram(stardustAmount: number, indexMicro: number): number {
  const index = indexFromMicro(indexMicro);
  const nominal = (stardustAmount * index) / STARDUST_PER_GRAM_BASE;
  const gram = nominal * STARDUST_TO_GRAM_SPREAD;
  return Math.max(0, Math.round(gram * 1_000_000) / 1_000_000);
}

const GENESIS_VERSION = 3;
const CHART_MAX = 240;
const CHART_THROTTLE_MS = 10_000;

type ChartPoint = { t: number; p: number };

/**
 * Player-activity pressure — upward only. More players farming/spending
 * pushes the index higher over time; no nightly reset or downward ticks.
 */
const ACTION_BP: Record<string, number> = {
  spend: 2,
  earn: 1,
  stake: 0,
  unstake: 0,
  convert: 1,
  convert_out: 0,
};

function applyBp(current: number, bp: number): number {
  if (bp <= 0 || current >= STARDUST_INDEX_MAX_MICRO) return current;
  const delta = Math.max(1, Math.round((current * bp) / 10_000));
  return clampIndexMicro(current + delta);
}

async function ensureGenesis(): Promise<void> {
  const [ver] = await db
    .select({ valueNum: appSettingsTable.valueNum })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, VERSION_KEY))
    .limit(1);
  if (Number(ver?.valueNum ?? 0) >= GENESIS_VERSION) return;

  await db.transaction(async (tx) => {
    const genesisChart = JSON.stringify([{ t: Date.now(), p: STARDUST_GENESIS_MICRO }]);
    await tx
      .insert(appSettingsTable)
      .values({ key: INDEX_KEY, valueNum: STARDUST_GENESIS_MICRO })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueNum: STARDUST_GENESIS_MICRO, updatedAt: new Date() },
      });
    await tx
      .insert(appSettingsTable)
      .values({ key: CHART_KEY, valueText: genesisChart })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueText: genesisChart, updatedAt: new Date() },
      });
    await tx
      .insert(appSettingsTable)
      .values({ key: VERSION_KEY, valueNum: GENESIS_VERSION })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueNum: GENESIS_VERSION, updatedAt: new Date() },
      });
  });
}

async function appendChartPoint(indexMicro: number): Promise<void> {
  const now = Date.now();
  const [row] = await db
    .select({ valueText: appSettingsTable.valueText })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, CHART_KEY))
    .limit(1);

  let points: ChartPoint[] = [];
  try {
    points = JSON.parse(row?.valueText ?? "[]") as ChartPoint[];
    if (!Array.isArray(points)) points = [];
  } catch {
    points = [];
  }

  const last = points[points.length - 1];
  if (last && now - last.t < CHART_THROTTLE_MS) {
    last.p = indexMicro;
    last.t = now;
  } else {
    points.push({ t: now, p: indexMicro });
    if (points.length > CHART_MAX) points = points.slice(-CHART_MAX);
  }

  await db
    .insert(appSettingsTable)
    .values({ key: CHART_KEY, valueText: JSON.stringify(points) })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { valueText: JSON.stringify(points), updatedAt: new Date() },
    });
}

export async function getStardustIndexMicro(): Promise<number> {
  await ensureGenesis();
  const [row] = await db
    .select({ valueNum: appSettingsTable.valueNum })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, INDEX_KEY))
    .limit(1);
  const raw = Number(row?.valueNum ?? STARDUST_GENESIS_MICRO);
  return clampIndexMicro(raw);
}

export async function getStardustChart(): Promise<ChartPoint[]> {
  await ensureGenesis();
  const [row] = await db
    .select({ valueText: appSettingsTable.valueText })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, CHART_KEY))
    .limit(1);
  try {
    const pts = JSON.parse(row?.valueText ?? "[]") as ChartPoint[];
    if (Array.isArray(pts) && pts.length > 0) {
      return pts.map((pt) => ({ t: pt.t, p: clampIndexMicro(pt.p) }));
    }
  } catch { /**/ }

  const indexMicro = await getStardustIndexMicro();
  const seed: ChartPoint[] = [{ t: Date.now(), p: indexMicro }];
  await db
    .insert(appSettingsTable)
    .values({ key: CHART_KEY, valueText: JSON.stringify(seed) })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { valueText: JSON.stringify(seed), updatedAt: new Date() },
    });
  return seed;
}

/** Pad chart for UI when only one point exists. */
export function normalizeStardustChartPoints(points: ChartPoint[]): ChartPoint[] {
  const clamped = points.map((pt) => ({ t: pt.t, p: clampIndexMicro(pt.p) }));
  if (clamped.length === 0) return [];
  if (clamped.length === 1) {
    const p = clamped[0];
    return [
      { t: p.t - 3_600_000, p: p.p },
      { t: p.t, p: p.p },
    ];
  }
  return clamped;
}

async function lastChartBumpMs(): Promise<number> {
  const [row] = await db
    .select({ valueText: appSettingsTable.valueText })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, CHART_KEY))
    .limit(1);
  try {
    const pts = JSON.parse(row?.valueText ?? "[]") as ChartPoint[];
    if (Array.isArray(pts) && pts.length > 0) return pts[pts.length - 1]!.t;
  } catch { /**/ }
  return 0;
}

export async function bumpStardustIndex(action: keyof typeof ACTION_BP): Promise<void> {
  try {
    await ensureGenesis();
    const bp = ACTION_BP[action] ?? 0;
    if (bp === 0) return;

    const lastBump = await lastChartBumpMs();
    if (lastBump > 0 && Date.now() - lastBump < BUMP_COOLDOWN_MS) return;

    const current = await getStardustIndexMicro();
    const next = applyBp(current, bp);
    if (next === current) return;

    await db
      .insert(appSettingsTable)
      .values({ key: INDEX_KEY, valueNum: next })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueNum: next, updatedAt: new Date() },
      });

    await appendChartPoint(next);
  } catch (err) {
    logger.warn({ err, action }, "[stardustIndex] bump failed");
  }
}

/** Staked notional is principal. Mature withdraw pays a fixed bonus (not index PnL). */
export const STARDUST_STAKE_LOCK_MS = 30 * 24 * 60 * 60 * 1000;
/** +8% of principal, paid only when withdrawing after the 30-day lock. */
export const STARDUST_STAKE_BONUS_BPS = 800;

export function stardustStakePayout(staked: number): number {
  const n = Math.max(0, Math.floor(staked));
  if (n <= 0) return 0;
  return Math.floor((n * (10_000 + STARDUST_STAKE_BONUS_BPS)) / 10_000);
}

export function stardustValueAtIndex(staked: number, _stakeIndexMicro?: number, _indexMicro?: number): number {
  return Math.max(0, Math.floor(staked));
}

export async function readGlobalStakedTotal(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${usersTable.stardustStaked}), 0)` })
      .from(usersTable);
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}
