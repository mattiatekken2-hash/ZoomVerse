import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/** Season 3 anchor — matches RankPage / ExchangeWidget fallback. */
export const DEFAULT_SEASON_EPOCH_MS = Date.UTC(2026, 7, 15);
const SEASON_2_EPOCH_MS = Date.UTC(2026, 3, 14);

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
         AND value_num <= ${SEASON_2_EPOCH_MS}
    `);
  } catch (err) {
    logger.warn({ err }, "[ensure-db] season_epoch seed skipped");
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
