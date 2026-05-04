/**
 * Global $ZOOM price index.
 *
 * The price is a single global numeric value shared by every user. It starts
 * at the genesis value of 0.01 and increases by small per-action deltas:
 *   - market buy:    +0.0010
 *   - market list:   +0.0005
 *   - planet cycle:  +0.0002 (per /farm/start activation)
 *   - craft mint:    +0.0003 (per /craft/record)
 *
 * Storage uses the existing `app_settings` table to avoid a new migration:
 *   - key="zoom_price_micro"  -> value_num = price * 1_000_000 (atomic +=)
 *   - key="zoom_price_chart"  -> value_text = JSON array of last N points
 *                                ([{t, p}, ...] where t = epoch ms, p = micro)
 *
 * Concurrency:
 *   - Price increment uses a single SQL UPDATE so concurrent bumps are
 *     atomic and never lose a delta.
 *   - The chart array is read/modify/written inside a transaction with
 *     `FOR UPDATE` on the chart row to prevent lost points under load.
 *   - Chart writes are throttled: a new point is appended only if the last
 *     point is older than `CHART_THROTTLE_MS` (10s). Otherwise the latest
 *     point's `p` is overwritten with the post-bump price so the chart
 *     still reflects current value without exploding row size.
 *
 * Public API: `getZoomPriceMicro()`, `getZoomChart()`, `bumpZoomPrice()`.
 * Bumps are fire-and-forget at call sites; failures are logged but never
 * surfaced to the user (price is decorative — never blocks gameplay).
 */
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger";

const PRICE_KEY = "zoom_price_micro";
const CHART_KEY = "zoom_price_chart";

// Genesis: 1 ZOOM = 0.01. Stored as micro-units (price * 1e6).
export const GENESIS_PRICE_MICRO = 10_000;

/**
 * Per-user, per-action cooldown (ms). Anti-spam: a single user can only
 * contribute ONE price bump per action per cooldown window. This kills
 * the trivial manipulation vector of looping /farm/start or /craft/record
 * to artificially pump the global price index. Market trades are
 * naturally cost-bound (require real $ZOOM debit) so they have a much
 * shorter cooldown — the cap is mainly to stop runaway DB load under
 * legitimate market bursts, not abuse.
 */
const COOLDOWN_MS: Record<PriceAction, number> = {
  market_buy: 1_000,   // cost-bound; tiny cooldown just for DB protection
  market_list: 1_000,  // cost-bound (planet inventory limit)
  farm_cycle: 60_000,  // 1 minute per user — spam-prone, lock down
  craft: 30_000,       // 30s per user — spam-prone, lock down
};

/**
 * Per-user × per-action last-bump timestamp. In-memory only (resets on
 * server restart, which is acceptable — at worst a user gets one extra
 * bump after a redeploy). Bounded by an LRU-style trim to MAX_COOLDOWN_KEYS
 * to prevent unbounded growth under heavy traffic.
 */
const cooldownMap = new Map<string, number>();
const MAX_COOLDOWN_KEYS = 5_000;

function checkCooldown(action: PriceAction, userId: string | null | undefined): boolean {
  if (!userId) return true; // anonymous-system bumps (none currently) bypass
  const key = `${action}:${userId}`;
  const now = Date.now();
  const last = cooldownMap.get(key) ?? 0;
  if (now - last < COOLDOWN_MS[action]) return false;
  cooldownMap.set(key, now);
  if (cooldownMap.size > MAX_COOLDOWN_KEYS) {
    // Cheap trim: drop the oldest ~10% of entries when we hit the cap.
    // O(n) but only fires occasionally; safer than letting the map grow
    // unbounded and starve memory.
    const toDrop = Math.floor(MAX_COOLDOWN_KEYS * 0.1);
    const it = cooldownMap.keys();
    for (let i = 0; i < toDrop; i += 1) {
      const k = it.next().value;
      if (k === undefined) break;
      cooldownMap.delete(k);
    }
  }
  return true;
}
// Hard ceiling so a runaway loop or admin bug can't drive the price into
// astronomical territory. 100.0 = 100_000_000 micro.
const MAX_PRICE_MICRO = 100_000_000;
// Per-action deltas (micro = price * 1e6).
export const DELTA = {
  market_buy: 1000,    // +0.0010
  market_list: 500,    // +0.0005
  farm_cycle: 200,     // +0.0002
  craft: 300,          // +0.0003
} as const;
export type PriceAction = keyof typeof DELTA;

// Chart sizing.
const CHART_MAX_POINTS = 240;
const CHART_THROTTLE_MS = 10_000;

interface ChartPoint { t: number; p: number }

/**
 * One-shot genesis bootstrap. The first caller does the INSERT ... ON
 * CONFLICT DO NOTHING; subsequent calls return immediately. The promise
 * is cached so multiple concurrent first-callers all await the same
 * underlying inserts (no thundering herd of identical no-op inserts on
 * every request).
 */
let genesisPromise: Promise<void> | null = null;
async function ensureGenesis(): Promise<void> {
  if (genesisPromise) return genesisPromise;
  genesisPromise = (async () => {
    const now = Date.now();
    await db
      .insert(appSettingsTable)
      .values({ key: PRICE_KEY, valueNum: GENESIS_PRICE_MICRO, valueText: null })
      .onConflictDoNothing({ target: appSettingsTable.key });
    await db
      .insert(appSettingsTable)
      .values({
        key: CHART_KEY,
        valueNum: null,
        valueText: JSON.stringify([{ t: now, p: GENESIS_PRICE_MICRO } satisfies ChartPoint]),
      })
      .onConflictDoNothing({ target: appSettingsTable.key });
  })().catch((err) => {
    // If init fails we let the next call retry rather than caching the
    // failure forever (which would brick the price feed across restarts
    // of the in-process cache).
    genesisPromise = null;
    throw err;
  });
  return genesisPromise;
}

/**
 * Read the current price in micro-units. Returns the genesis value if the
 * row is somehow missing (defensive — `ensureGenesis` is also called).
 */
export async function getZoomPriceMicro(): Promise<number> {
  await ensureGenesis();
  const [row] = await db
    .select({ v: appSettingsTable.valueNum })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, PRICE_KEY))
    .limit(1);
  const v = row?.v;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return GENESIS_PRICE_MICRO;
}

/**
 * Read the chart history as an array of points. Returns at least the
 * genesis point if storage is empty/corrupt.
 */
export async function getZoomChart(): Promise<ChartPoint[]> {
  await ensureGenesis();
  const [row] = await db
    .select({ v: appSettingsTable.valueText })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, CHART_KEY))
    .limit(1);
  const raw = row?.v;
  if (!raw || typeof raw !== "string") {
    const cur = await getZoomPriceMicro();
    return [{ t: Date.now(), p: cur }];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const cur = await getZoomPriceMicro();
      return [{ t: Date.now(), p: cur }];
    }
    // Defensive shape filter — drop anything that isn't a {t,p} number pair.
    const clean: ChartPoint[] = [];
    for (const it of parsed) {
      if (it && typeof it === "object") {
        const t = Number((it as { t?: unknown }).t);
        const p = Number((it as { p?: unknown }).p);
        if (Number.isFinite(t) && Number.isFinite(p) && t > 0 && p > 0) {
          clean.push({ t, p });
        }
      }
    }
    if (clean.length === 0) {
      const cur = await getZoomPriceMicro();
      return [{ t: Date.now(), p: cur }];
    }
    return clean;
  } catch {
    const cur = await getZoomPriceMicro();
    return [{ t: Date.now(), p: cur }];
  }
}

/**
 * Apply an action's price delta and update the chart history. Designed to
 * be called fire-and-forget from request handlers (callers do not await).
 *
 * Returns the new price in micro-units, or `null` on failure (callers
 * ignore — the price is decorative). Internal failures are logged.
 */
export async function bumpZoomPrice(action: PriceAction, userId?: string | null): Promise<number | null> {
  const delta = DELTA[action];
  if (!delta || delta <= 0) return null;
  // Per-user × per-action cooldown — see COOLDOWN_MS for rationale.
  // Spam attempts return null (silently no-op) without any DB work.
  if (!checkCooldown(action, userId)) return null;
  try {
    await ensureGenesis();
    // Atomic clamp: increase by `delta` but never exceed MAX_PRICE_MICRO.
    // LEAST() handles the cap in one statement so concurrent bumps that
    // would race past the ceiling all settle on the same value.
    const updated = await db
      .update(appSettingsTable)
      .set({
        valueNum: sql`LEAST(${MAX_PRICE_MICRO}, COALESCE(${appSettingsTable.valueNum}, ${GENESIS_PRICE_MICRO}) + ${delta})`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(appSettingsTable.key, PRICE_KEY))
      .returning({ v: appSettingsTable.valueNum });
    const newPrice = Number(updated[0]?.v ?? GENESIS_PRICE_MICRO);

    // Chart maintenance — read/modify/write inside a tx with row lock so
    // concurrent bumps don't lose points or duplicate them.
    await db.transaction(async (tx) => {
      const sel = await tx.execute(sql`
        SELECT value_text FROM app_settings WHERE key = ${CHART_KEY} FOR UPDATE
      `);
      const rows = (sel as unknown as { rows: Array<{ value_text?: string | null }> }).rows;
      const raw = rows?.[0]?.value_text ?? null;
      let arr: ChartPoint[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) arr = parsed.filter((it): it is ChartPoint =>
            !!it && typeof it === "object" &&
            Number.isFinite((it as ChartPoint).t) &&
            Number.isFinite((it as ChartPoint).p));
        } catch { arr = []; }
      }
      const now = Date.now();
      const last = arr[arr.length - 1];
      if (last && now - last.t < CHART_THROTTLE_MS) {
        // Throttle: overwrite last point's price (so the line stays current
        // without ballooning the array).
        last.p = newPrice;
      } else {
        arr.push({ t: now, p: newPrice });
        if (arr.length > CHART_MAX_POINTS) {
          arr = arr.slice(arr.length - CHART_MAX_POINTS);
        }
      }
      await tx.execute(sql`
        UPDATE app_settings
           SET value_text = ${JSON.stringify(arr)},
               updated_at = NOW()
         WHERE key = ${CHART_KEY}
      `);
    });

    return newPrice;
  } catch (err) {
    logger.warn({ err, action }, "[zoomPrice] bump failed");
    return null;
  }
}

/**
 * Convenience wrapper for fire-and-forget call sites that don't want to
 * await. Logs but never throws. Pass `userId` to opt into the per-user
 * cooldown (spam protection); omit/null to bypass (system-driven bumps,
 * which currently we don't have).
 */
export function bumpZoomPriceFireAndForget(action: PriceAction, userId?: string | null): void {
  void bumpZoomPrice(action, userId).catch((err) => {
    logger.warn({ err, action }, "[zoomPrice] fire-and-forget bump rejected");
  });
}
