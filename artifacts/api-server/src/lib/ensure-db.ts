import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/** Season 3 anchor — matches RankPage / ExchangeWidget fallback. */
export const DEFAULT_SEASON_EPOCH_MS = Date.UTC(2026, 7, 24);
const PREV_SEASON_3_EPOCH_MS = Date.UTC(2026, 7, 15);
/** Bump this to take a new rank snapshot. 2026-08-24 16:00Z restores
 *  LIVE SEASON RANK to current ZOOM wallets (start = 0). */
const SEASON_RANK_SNAPSHOT_MS = Date.UTC(2026, 7, 24, 16);

async function usersTableReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 FROM users LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

async function seedDefaults(): Promise<void> {
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: "season_epoch", valueNum: DEFAULT_SEASON_EPOCH_MS })
      .onConflictDoNothing();
    await db.execute(sql`
      UPDATE app_settings
         SET value_num = ${DEFAULT_SEASON_EPOCH_MS},
             updated_at = NOW()
       WHERE key = 'season_epoch'
         AND value_num <= ${PREV_SEASON_3_EPOCH_MS}
    `);
  } catch (err) {
    logger.warn({ err }, "[ensure-db] season_epoch seed skipped");
  }

  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS season_zoom_start real NOT NULL DEFAULT 0
    `);
    await db
      .insert(appSettingsTable)
      .values({ key: "season_rank_snapshot", valueNum: 0 })
      .onConflictDoNothing();
    const [snapRow] = await db
      .select({ valueNum: appSettingsTable.valueNum })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "season_rank_snapshot"))
      .limit(1);
    if ((snapRow?.valueNum ?? 0) < SEASON_RANK_SNAPSHOT_MS) {
      await db.execute(sql`
        UPDATE users SET season_zoom_start = 0
      `);
      await db
        .update(appSettingsTable)
        .set({ valueNum: SEASON_RANK_SNAPSHOT_MS, updatedAt: new Date() })
        .where(eq(appSettingsTable.key, "season_rank_snapshot"));
      logger.info("[ensure-db] live season rank snapshot taken — board cleared");
    }
  } catch (err) {
    logger.warn({ err }, "[ensure-db] season rank snapshot skipped");
  }

  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS ton_wallet_address text,
        ADD COLUMN IF NOT EXISTS vip_level text NOT NULL DEFAULT 'NONE',
        ADD COLUMN IF NOT EXISTS zmc_balance_nano text NOT NULL DEFAULT '0'
    `);
    await db.execute(sql`
      ALTER TABLE market_listings
        ADD COLUMN IF NOT EXISTS seller_wallet_address text
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS treasury_ledger (
        id serial PRIMARY KEY,
        tx_hash text NOT NULL,
        type text NOT NULL,
        amount_zmc real NOT NULL,
        user_id text,
        timestamp timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_tx_hash ON treasury_ledger (tx_hash)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_treasury_user ON treasury_ledger (user_id)
    `);
    logger.info("[ensure-db] treasury ledger / VIP / seller wallet columns OK");
  } catch (err) {
    logger.warn({ err }, "[ensure-db] treasury/VIP schema skipped");
  }
}

/**
 * Boot-time DB sanity check. Schema is created via `pnpm --filter @workspace/db
 * run push` (locally or CI) — NOT during Render build, because production
 * NODE_ENV skips devDependencies (drizzle-kit) and pnpm is unavailable at
 * runtime in the Node start container.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (!(await usersTableReady())) {
    logger.error(
      "[ensure-db] users table missing — run `pnpm --filter @workspace/db run push` against DATABASE_URL",
    );
    return;
  }
  await seedDefaults();
}
