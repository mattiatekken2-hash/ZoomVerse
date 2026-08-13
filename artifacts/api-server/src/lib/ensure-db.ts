import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/** Matches RankPage / ExchangeWidget fallback season anchor. */
export const DEFAULT_SEASON_EPOCH_MS = Date.UTC(2026, 3, 14);

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function usersTableReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 FROM users LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

function runDrizzlePush(): boolean {
  const root = repoRoot();
  logger.warn({ root }, "[ensure-db] users table missing — running drizzle push");
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["--filter", "@workspace/db", "run", "push"],
    {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    logger.error(
      {
        status: result.status,
        stderr: result.stderr?.slice(0, 2000),
        stdout: result.stdout?.slice(0, 2000),
      },
      "[ensure-db] drizzle push failed",
    );
    return false;
  }
  logger.info("[ensure-db] drizzle push completed");
  return true;
}

async function seedDefaults(): Promise<void> {
  try {
    await db
      .insert(appSettingsTable)
      .values({ key: "season_epoch", valueNum: DEFAULT_SEASON_EPOCH_MS })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn({ err }, "[ensure-db] season_epoch seed skipped");
  }
}

/**
 * Fresh Neon/Render deploys often ship before anyone runs `pnpm db push`
 * locally. Without the `users` table every gameplay route 500s while
 * `/healthz` still looks fine. Run push once at boot when the table is
 * missing, then seed the season epoch so exchange/rank timers render.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (!(await usersTableReady())) {
    if (!runDrizzlePush()) {
      logger.error("[ensure-db] database schema still missing — API routes will fail until drizzle push succeeds");
      return;
    }
    if (!(await usersTableReady())) {
      logger.error("[ensure-db] users table still missing after drizzle push");
      return;
    }
  }
  await seedDefaults();
}
