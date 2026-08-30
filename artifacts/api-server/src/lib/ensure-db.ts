import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { VIP_PRO_PASS_GIFT_UNTIL_KEY, VIP_PRO_PASS_LAUNCH_GIFTED_KEY, VIP_PRO_PASS_MS } from "@workspace/game-models";
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
        ADD COLUMN IF NOT EXISTS zmc_balance_nano text NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS vip_pro_pass_until_ms bigint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vip_pro_pass_gifted boolean NOT NULL DEFAULT false
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

  try {
    const now = Date.now();
    const giftUntil = now + VIP_PRO_PASS_MS;
    await db
      .insert(appSettingsTable)
      .values({ key: VIP_PRO_PASS_GIFT_UNTIL_KEY, valueNum: giftUntil })
      .onConflictDoNothing();
    await db
      .insert(appSettingsTable)
      .values({ key: VIP_PRO_PASS_LAUNCH_GIFTED_KEY, valueNum: 0 })
      .onConflictDoNothing();
    const [giftedFlag] = await db
      .select({ valueNum: appSettingsTable.valueNum })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, VIP_PRO_PASS_LAUNCH_GIFTED_KEY))
      .limit(1);
    if ((giftedFlag?.valueNum ?? 0) < 1) {
      const granted = await db.execute(sql`
        UPDATE users
        SET vip_pro_pass_until_ms =
              GREATEST(COALESCE(vip_pro_pass_until_ms, 0), ${now}) + ${VIP_PRO_PASS_MS},
            vip_pro_pass_gifted = true
        WHERE vip_level = 'PRO'
          AND vip_pro_pass_gifted = false
      `);
      await db
        .update(appSettingsTable)
        .set({ valueNum: 1, updatedAt: new Date() })
        .where(eq(appSettingsTable.key, VIP_PRO_PASS_LAUNCH_GIFTED_KEY));
      logger.info({ rowCount: granted.rowCount }, "[ensure-db] VIP PRO PASS launch gift granted to existing PRO holders");
    }
  } catch (err) {
    logger.warn({ err }, "[ensure-db] VIP PRO PASS launch gift skipped");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS studio_gallery (
        id serial PRIMARY KEY,
        telegram_id text NOT NULL,
        project_id text NOT NULL,
        title text NOT NULL,
        voxels jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'public',
        vote_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (telegram_id, project_id)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_studio_gallery_public
        ON studio_gallery (status, vote_count DESC, id DESC)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS studio_gallery_reports (
        listing_id integer NOT NULL REFERENCES studio_gallery(id) ON DELETE CASCADE,
        reporter_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (listing_id, reporter_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS studio_gallery_votes (
        listing_id integer NOT NULL REFERENCES studio_gallery(id) ON DELETE CASCADE,
        voter_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (listing_id, voter_id)
      )
    `);
    logger.info("[ensure-db] studio gallery tables OK");
  } catch (err) {
    logger.warn({ err }, "[ensure-db] studio gallery schema skipped");
  }

  try {
    await db.execute(sql`
      ALTER TABLE users
        ALTER COLUMN stardust_balance TYPE real USING stardust_balance::real
    `);
  } catch (err) {
    logger.warn({ err }, "[ensure-db] stardust_balance real migrate skipped");
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
