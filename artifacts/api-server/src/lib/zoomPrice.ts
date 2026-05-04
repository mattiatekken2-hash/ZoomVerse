/**
 * Global $ZOOM price index.
 *
 * The price is a single global numeric value shared by every user. It starts
 * at the genesis value of 0.0001 and increases by tiny PERCENTAGE-based
 * per-action deltas (rebalanced May 2026 to v4: percentage curve so the
 * relative impact of each action stays constant — at low prices the bump
 * is small in absolute terms, at high prices it scales naturally):
 *   - market buy:    +0.30%   (cost-bound — real $ZOOM debit)
 *   - market list:   +0.15%   (cost-bound — planet inventory)
 *   - planet cycle:  +0.05%   (per /farm/start, cooldown 60s/user)
 *   - craft mint:    +0.10%   (per /craft/record, cooldown 30s/user)
 *
 * A floor of +1 micro per bump guarantees the chart still moves at the
 * very lowest prices (otherwise rounding would zero out tiny percentages).
 * Combined with the MAX_PRICE_MICRO ceiling at $1.00 the curve is bounded:
 * grows visibly early, asymptotically slows near the top.
 *
 * Storage uses the existing `app_settings` table to avoid a new migration:
 *   - key="zoom_price_micro"  -> value_num = price * 1_000_000 (atomic +=)
 *   - key="zoom_price_chart"  -> value_text = JSON array of last N points
 *                                ([{t, p}, ...] where t = epoch ms, p = micro)
 *   - key="zoom_price_version" -> value_num = GENESIS_VERSION; if missing or
 *                                  stale, the price + chart rows are reset
 *                                  to the new genesis on first request after
 *                                  redeploy (one-shot, idempotent).
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
const VERSION_KEY = "zoom_price_version";

// Genesis: 1 ZOOM = 0.0001. Stored as micro-units (price * 1e6).
// Lowered May 2026 from 10_000 ($0.01) to 100 ($0.0001) so that holders of
// large $ZOOM bags see a realistic Portfolio Value rather than a misleading
// "I have $900" framing — the token is decorative, not real money.
export const GENESIS_PRICE_MICRO = 100;

/**
 * Bump this whenever the genesis or delta scale changes. On the first
 * request after redeploy with a new GENESIS_VERSION, `ensureGenesis()`
 * wipes the stored price + chart and reseeds them at the current genesis.
 * Without this, the old higher price (e.g. $0.0105 from the 0.01-genesis
 * era) would persist forever and the new genesis would have no effect.
 *
 * Version history:
 *   1 = (implicit) original genesis $0.01 with large deltas
 *   2 = first attempt at the rebalance (had a bootstrap bug — never ran
 *       the reset on DBs that already had price rows)
 *   3 = genesis $0.0001, slow FIXED-micro deltas, fixed migration logic
 *   4 = current — same genesis, percentage-based deltas (gentler curve
 *       that scales with current price). NOTE: we intentionally do NOT
 *       bump GENESIS_VERSION here because we want the price to continue
 *       from wherever it currently is, just growing more slowly going
 *       forward — resetting back to $0.0001 would erase legitimate
 *       portfolio gains players have already earned.
 */
const GENESIS_VERSION = 3;

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
// astronomical territory. With the new genesis (100 micro = $0.0001) and
// the slower deltas below, hitting this cap requires an enormous amount
// of legitimate activity, but we keep it as a safety belt. 1.0 = 1_000_000
// micro is plenty of headroom for the rebalanced economy.
const MAX_PRICE_MICRO = 1_000_000;
// Per-action deltas in BASIS POINTS (1 bp = 0.01% of current price).
// Rebalanced May 2026 to a percentage curve: each action moves the price
// by a small relative amount instead of a fixed micro value. This keeps
// the perceived "+X%" steady regardless of the current price level —
// early game grows in tiny absolute steps, late game grows in larger
// absolute steps, but the relative pace stays the same.
//
// Effective floor of +1 micro per bump (enforced in the SQL UPDATE) so
// the chart still moves visibly at genesis when ROUND(price * bp / 10k)
// would otherwise round to zero.
export const DELTA_BP = {
  market_buy: 30,   // +0.30% (cost-bound — real $ZOOM debit)
  market_list: 15,  // +0.15% (cost-bound — planet inventory limit)
  farm_cycle: 5,    // +0.05% (cooldown 60s/user — see COOLDOWN_MS)
  craft: 10,        // +0.10% (cooldown 30s/user — see COOLDOWN_MS)
} as const;
export type PriceAction = keyof typeof DELTA_BP;

// Chart sizing.
const CHART_MAX_POINTS = 240;
const CHART_THROTTLE_MS = 10_000;

interface ChartPoint { t: number; p: number }

/**
 * One-shot genesis bootstrap + version migration. The first caller after
 * a process start (or after a GENESIS_VERSION bump) does the work; all
 * subsequent calls return the cached promise.
 *
 * Behaviour:
 *   1. Inserts the version row if missing.
 *   2. If the stored version is OLDER than GENESIS_VERSION, this is the
 *      first request after a genesis-rescale deploy: the price + chart
 *      rows are RESET (not just reseeded) to the new genesis value, then
 *      the version row is updated. This is idempotent — once the version
 *      matches, the reset block is skipped.
 *   3. If the version matches and the rows already exist, the inserts
 *      below are no-ops thanks to ON CONFLICT DO NOTHING.
 *
 * Run in a single transaction so a partial failure can't leave the
 * version bumped while the price still sits at the old value.
 */
let genesisPromise: Promise<void> | null = null;
async function ensureGenesis(): Promise<void> {
  if (genesisPromise) return genesisPromise;
  genesisPromise = (async () => {
    const now = Date.now();
    const initialChart = JSON.stringify([{ t: now, p: GENESIS_PRICE_MICRO } satisfies ChartPoint]);

    await db.transaction(async (tx) => {
      // Read current stored version (if any). FOR UPDATE so two concurrent
      // bootstraps can't both run the reset. A missing version row is
      // treated as version 1 — that covers DBs whose price/chart rows were
      // created BEFORE we introduced versioning, so they still get the
      // rescale reset on the first deploy that bumps GENESIS_VERSION.
      const verSel = await tx.execute(sql`
        SELECT value_num FROM app_settings WHERE key = ${VERSION_KEY} FOR UPDATE
      `);
      const verRows = (verSel as unknown as { rows: Array<{ value_num?: number | string | null }> }).rows;
      const storedVersion = verRows?.[0]?.value_num != null ? Number(verRows[0].value_num) : 1;

      if (storedVersion >= GENESIS_VERSION) {
        // Up to date — nothing to do.
        return;
      }

      // Either fresh DB (no rows yet) or stale-version DB. UPSERT the
      // price + chart to the current genesis values, then UPSERT the
      // version row so this branch can never run again until the next
      // intentional GENESIS_VERSION bump. Idempotent + safe under retry.
      await tx.execute(sql`
        INSERT INTO app_settings (key, value_num, value_text)
        VALUES (${PRICE_KEY}, ${GENESIS_PRICE_MICRO}, NULL)
        ON CONFLICT (key) DO UPDATE
          SET value_num = EXCLUDED.value_num,
              value_text = NULL,
              updated_at = NOW()
      `);
      await tx.execute(sql`
        INSERT INTO app_settings (key, value_num, value_text)
        VALUES (${CHART_KEY}, NULL, ${initialChart})
        ON CONFLICT (key) DO UPDATE
          SET value_num = NULL,
              value_text = EXCLUDED.value_text,
              updated_at = NOW()
      `);
      await tx.execute(sql`
        INSERT INTO app_settings (key, value_num, value_text)
        VALUES (${VERSION_KEY}, ${GENESIS_VERSION}, NULL)
        ON CONFLICT (key) DO UPDATE
          SET value_num = EXCLUDED.value_num,
              value_text = NULL,
              updated_at = NOW()
      `);
    });
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
  const bp = DELTA_BP[action];
  if (!bp || bp <= 0) return null;
  // Per-user × per-action cooldown — see COOLDOWN_MS for rationale.
  // Spam attempts return null (silently no-op) without any DB work.
  if (!checkCooldown(action, userId)) return null;
  try {
    await ensureGenesis();
    // Atomic percentage-based bump:
    //   new = LEAST(MAX, current + GREATEST(1, ROUND(current * bp / 10000)))
    // - bp is basis points (1 bp = 0.01%) so dividing by 10_000 gives a
    //   plain percentage multiplier.
    // - GREATEST(1, ...) is the +1 micro floor so the curve still moves
    //   at very low prices where the percentage would round to 0.
    // - LEAST(MAX, ...) caps at MAX_PRICE_MICRO so concurrent bumps near
    //   the ceiling all settle on the same final value.
    // Done in a single SQL statement so concurrent bumps stay atomic.
    const updated = await db
      .update(appSettingsTable)
      .set({
        valueNum: sql`LEAST(
          ${MAX_PRICE_MICRO},
          COALESCE(${appSettingsTable.valueNum}, ${GENESIS_PRICE_MICRO})
          + GREATEST(
              1,
              ROUND(COALESCE(${appSettingsTable.valueNum}, ${GENESIS_PRICE_MICRO}) * ${bp}::numeric / 10000)
            )
        )`,
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
