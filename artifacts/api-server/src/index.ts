import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { sendBotMessage, sendAlienChannelMessage } from "./lib/notify";
import { fetchPendingFarmNotifications, markFarmNotified } from "./routes/farm";
import { runScheduledLotteryDrawTick } from "./routes/lottery";
import { runScheduledLabSettlementTick } from "./routes/labRanking";
import { purgeExpiredHistory } from "./lib/history";
import { db, usersTable, pvpDailyPairsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { readGlobal, readNotifiedExpiresAtMs, writeNotifiedExpiresAtMs, advanceGlobal } from "./routes/merchant";
import { ensureDatabaseReady } from "./lib/ensure-db";

const FARM_FULL_MESSAGE = "⚡ Your Farm is full! Collect your TON and restart the engines to keep earning.";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0;

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.warn({ port }, "Port already in use — retrying in 3 s");
    setTimeout(() => {
      server.close();
      server.listen(port);
    }, 3_000);
  } else {
    logger.error({ err }, "Server error");
    process.exit(1);
  }
});

// ─── Boot-time additive schema migrations ─────────────────────────────────
// Any ALTER TABLE ADD COLUMN IF NOT EXISTS here is idempotent and safe to run
// on every boot. New columns are added here so a freshly-deployed build never
// fails at runtime because the live DB is one schema revision behind the ORM.
async function runBootMigrations() {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS items_json         jsonb         NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS items_updated_at_ms bigint        NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS models_json         jsonb         NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS models_updated_at_ms bigint        NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE market_listings
        ADD COLUMN IF NOT EXISTS model_id text,
        ADD COLUMN IF NOT EXISTS shape_id text
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS weekly_redstar_day integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_weekly_redstar_claim_date text NOT NULL DEFAULT ''
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stardust_staked integer NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stardust_stake_index_micro integer NOT NULL DEFAULT 1000000
    `);
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stardust_stake_locked_until_ms bigint NOT NULL DEFAULT 0
    `);
    logger.info("[boot-migration] items_json / models_json / stardust stake columns OK");
  } catch (err) {
    logger.error({ err }, "[boot-migration] failed to add items columns — items routes may error");
  }
}

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  void ensureDatabaseReady().then(() => runBootMigrations());
  startKeepAlive();
  registerTelegramWebhook();
  startFarmNotificationCron();
  startHallOfFameResetCron();
  startPvpLeaderboardResetCron();
  startLotteryDrawCron();
  startLabSettlementCron();
  startStarsReconcileCron();
  startHistoryCleanupCron();
  startAlienMerchantCron();
});

/**
 * Cron pulizia cronologia personale.
 *
 * Ogni ora elimina dalla tabella `history` tutte le righe più vecchie
 * della retention di 48h (cap allineato con `HISTORY_RETENTION_HOURS`
 * in `lib/history.ts` e con il filtro server-side in /history/list).
 * Idempotente — la query DELETE è O(rows-eliminate) grazie all'indice
 * `idx_history_created_at`. Single-flight per evitare overlap se il DB
 * è momentaneamente lento. Primo tick ~30s dopo il boot così che un
 * deploy "freddo" pulisca subito eventuali residui invece di aspettare
 * un'ora intera.
 */
function startHistoryCleanupCron() {
  const intervalMs = 60 * 60 * 1000;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const removed = await purgeExpiredHistory();
      if (removed > 0) {
        logger.info({ removed }, "[history-cron] purged expired rows");
      }
    } catch (err) {
      logger.warn({ err }, "[history-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, intervalMs).unref();
}

/**
 * Cron del Lotto Stellare. Ogni 60 secondi controlla se il round attivo
 * ha `next_draw_at <= NOW()`; in tal caso esegue l'estrazione automatica
 * (drawn_by="system"), apre il prossimo round con next_draw_at = NOW()+7d
 * e manda un broadcast Telegram a tutti gli utenti del bot col vincitore
 * e il montepremi.
 *
 * Single-flight: se un tick e' ancora in corso (DB lento o broadcast
 * lungo), lo skippiamo per non doppio-eseguire.
 */
function startLotteryDrawCron() {
  const intervalMs = 60 * 1000;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runScheduledLotteryDrawTick();
    } catch (err) {
      logger.warn({ err }, "[lotto-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };
  // Primo tick ~10 secondi dopo il boot (evita di sovraccaricare lo startup).
  setTimeout(tick, 10_000).unref();
  setInterval(tick, intervalMs).unref();
}

/**
 * Cron della Classifica Craft (Lab). Ogni 60 secondi controlla se il round
 * attivo ha `ends_at <= NOW()`; in tal caso esegue il settlement automatico
 * (accredito premi TON alla Top 30 sul saldo ritirabile, reset punti, apertura
 * nuovo round +60 giorni). Single-flight per evitare overlap se il DB è lento.
 */
function startLabSettlementCron() {
  const intervalMs = 60 * 1000;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runScheduledLabSettlementTick();
    } catch (err) {
      logger.warn({ err }, "[lab-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };
  // Primo tick ~15 secondi dopo il boot (dopo lotto, evita picco di startup).
  setTimeout(tick, 15_000).unref();
  setInterval(tick, intervalMs).unref();
}

function startFarmNotificationCron() {
  // Scan every 60s for cycles whose 24h has elapsed and that the user
  // hasn't already collected. Send the bot reminder, then stamp notified_at
  // so we don't re-send. Re-activation by the user resets notified_at via
  // /farm/start, which makes the next cycle eligible again.
  const intervalMs = 60 * 1000;
  // Single-flight guard: if a previous tick is still running (slow Telegram
  // or DB), skip this one so we never fetch the same rows twice and double-
  // send notifications.
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const rows = await fetchPendingFarmNotifications(500);
      if (rows.length === 0) return;
      // Group all pending cycles by user so we send ONE consolidated message
      // per user per tick, no matter how many planets are full. This prevents
      // the "8 messages in 4 minutes" spam when several bundles ripen together.
      const byUser = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = byUser.get(row.telegramId) ?? [];
        list.push(row);
        byUser.set(row.telegramId, list);
      }
      for (const [telegramId, userRows] of byUser) {
        const count = userRows.length;
        const message =
          count === 1
            ? FARM_FULL_MESSAGE
            : `⚡ ${count} of your planets are ready! Collect your TON and restart the engines to keep earning.`;
        const ok = await sendBotMessage(telegramId, message);
        // Always mark notified — even on failure (403/blocked) — so we don't
        // hammer Telegram on every cron tick for users who blocked the bot.
        // Pass each row's expiresAt so we don't accidentally stamp a freshly
        // reactivated cycle (same id, new expiresAt) as already notified.
        await Promise.all(
          userRows.map((row) =>
            markFarmNotified(row.id, row.expiresAt).catch((e) =>
              logger.warn({ err: e, id: row.id }, "[farm-cron] markNotified failed"),
            ),
          ),
        );
        if (ok) logger.info({ telegramId, count }, "[farm-cron] sent consolidated farm-full notification");
      }
    } catch (err) {
      logger.warn({ err }, "[farm-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };
  // Fire once 5s after boot so devs can see logs quickly.
  setTimeout(tick, 5_000).unref();
  setInterval(tick, intervalMs).unref();
}

function startHallOfFameResetCron() {
  // HALL OF FAME — Daily Referrals nightly settlement.
  //
  // Runs every 60s. The settlement logic is STATELESS and self-healing:
  // we don't store a "last reset day" anywhere. Instead, on every tick we
  // ask the DB "is there any user whose stored day_key is older than today
  // and still has a positive count?". If yes, those users are yesterday's
  // (or older) leaderboard waiting to be settled — we credit prizes to the
  // top 5 and zero everyone with a stale key in one shot. If no, the tick
  // is a cheap no-op (single indexed COUNT-style query).
  //
  // Why stateless instead of "track last reset day in app_settings":
  //   • No drift if the server restarts at midnight.
  //   • No "missed reset" bug if the cron is paused or the box is asleep
  //     for >24h: the next tick after wake-up settles the most recent
  //     stale leaderboard correctly.
  //   • Idempotent — a second tick within the same minute finds nothing
  //     stale and does nothing.
  //
  // Acknowledged race window: between 00:00:00 UTC and the first cron
  // tick of the new day (≤60s), the public leaderboard endpoint will
  // briefly return an empty list (because it filters by `day_key = today`
  // and yesterday's winners haven't been settled+zeroed yet). This is
  // acceptable — the prize math is unaffected and the UI just shows
  // "no entries yet" for under a minute.
  const PRIZES = [100, 75, 50, 25, 25] as const;
  const intervalMs = 60 * 1000;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const today = utcDayKeyForCron();

      // ALL-OR-NOTHING SETTLEMENT
      //
      // Wrap winner-credit + stale-reset in a single DB transaction so a
      // crash / DB error mid-loop rolls everything back. Without this, if
      // the process died after crediting some (but not all) winners and
      // before the final stale-reset UPDATE, the next tick would re-select
      // the same stale leaders (their day_key is still yesterday, count
      // still > 0) and credit them a SECOND time. Since stardust is real
      // in-game value (and thereafter convertible to TON via wheel/etc),
      // a double-credit equals real money inflation — non-negotiable.
      //
      // Idempotency property: after a successful COMMIT, every settled row
      // has day_key=NULL (so the WHERE clause no longer matches them).
      // After a failed/rolled-back transaction, no row was changed, so the
      // next tick replays the same settlement cleanly.
      //
      // A deterministic tie-breaker (telegramId ASC) keeps prize ordering
      // stable when two users have the same count.
      const winnersInfo = await db.transaction(async (tx) => {
        const winners = await tx
          .select({
            telegramId: usersTable.telegramId,
            count: usersTable.dailyReferralCount,
            dayKey: usersTable.dailyReferralDayKey,
          })
          .from(usersTable)
          .where(
            sql`${usersTable.dailyReferralDayKey} IS NOT NULL
                AND ${usersTable.dailyReferralDayKey} < ${today}
                AND ${usersTable.dailyReferralCount} > 0`,
          )
          .orderBy(desc(usersTable.dailyReferralCount), usersTable.telegramId)
          .limit(5);

        if (winners.length === 0) return { winners: [] as typeof winners, settled: 0 };

        for (let i = 0; i < winners.length; i++) {
          const winner = winners[i]!;
          const prize = PRIZES[i]!;
          await tx
            .update(usersTable)
            .set({
              stardustBalance: sql`${usersTable.stardustBalance} + ${prize}`,
              balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
            })
            .where(eq(usersTable.telegramId, winner.telegramId));
        }

        // Zero EVERY user whose key is stale (not just the top 5). Setting
        // day_key back to NULL takes them out of competition until they
        // earn a fresh referral, which is exactly the daily-reset intent.
        const settled = await tx
          .update(usersTable)
          .set({ dailyReferralCount: 0, dailyReferralDayKey: null })
          .where(
            sql`${usersTable.dailyReferralDayKey} IS NOT NULL
                AND ${usersTable.dailyReferralDayKey} < ${today}`,
          );

        return {
          winners,
          settled: (settled as { rowCount?: number }).rowCount ?? winners.length,
        };
      });

      if (winnersInfo.winners.length === 0) return;

      for (let i = 0; i < winnersInfo.winners.length; i++) {
        const w = winnersInfo.winners[i]!;
        logger.info(
          { telegramId: w.telegramId, rank: i + 1, prize: PRIZES[i], count: w.count, dayKey: w.dayKey },
          "[hof-cron] credited daily-referrals prize",
        );
      }
      logger.info(
        { winners: winnersInfo.winners.length, settled: winnersInfo.settled },
        "[hof-cron] daily reset complete",
      );
    } catch (err) {
      logger.warn({ err }, "[hof-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };

  setTimeout(tick, 7_000).unref();
  setInterval(tick, intervalMs).unref();
}

function startPvpLeaderboardResetCron() {
  // PvP DAILY LEADERBOARD — nightly settlement at 00:00 UTC.
  //
  // Identical stateless / self-healing design as startHallOfFameResetCron:
  // every 60s we look for users whose stored pvp_day_key is older than today
  // and still have a positive points count. Those are a finished day's
  // leaderboard waiting to be settled — we credit stardust to the top 10,
  // then zero every stale row in one all-or-nothing transaction. If nothing
  // is stale, the tick is a cheap no-op.
  //
  // Prize split (1st→10th): 10/7/5/4/3/2/2/1/1/1 redstar.
  // Deterministic tie-breaker (telegramId ASC) keeps prize ordering stable.
  const PVP_PRIZES = [10, 7, 5, 4, 3, 2, 2, 1, 1, 1] as const;
  const intervalMs = 60 * 1000;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const today = utcDayKeyForCron();

      const winnersInfo = await db.transaction(async (tx) => {
        const winners = await tx
          .select({
            telegramId: usersTable.telegramId,
            count: usersTable.pvpDailyPoints,
            dayKey: usersTable.pvpDayKey,
          })
          .from(usersTable)
          .where(
            sql`${usersTable.pvpDayKey} IS NOT NULL
                AND ${usersTable.pvpDayKey} < ${today}
                AND ${usersTable.pvpDailyPoints} > 0`,
          )
          .orderBy(desc(usersTable.pvpDailyPoints), usersTable.telegramId)
          .limit(PVP_PRIZES.length);

        // Purge stale pair-counters regardless of whether anyone scored, so
        // the anti-win-trading table doesn't grow unbounded across days.
        await tx.delete(pvpDailyPairsTable).where(sql`${pvpDailyPairsTable.dayKey} < ${today}`);

        if (winners.length === 0) return { winners: [] as typeof winners, settled: 0 };

        for (let i = 0; i < winners.length; i++) {
          const winner = winners[i]!;
          const prize = PVP_PRIZES[i]!;
          await tx
            .update(usersTable)
            .set({
              redStarBalance: sql`${usersTable.redStarBalance} + ${prize}`,
              balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
            })
            .where(eq(usersTable.telegramId, winner.telegramId));
        }

        // Zero EVERY user whose key is stale (not just the top 10).
        const settled = await tx
          .update(usersTable)
          .set({ pvpDailyPoints: 0, pvpDayKey: null })
          .where(
            sql`${usersTable.pvpDayKey} IS NOT NULL
                AND ${usersTable.pvpDayKey} < ${today}`,
          );

        return {
          winners,
          settled: (settled as { rowCount?: number }).rowCount ?? winners.length,
        };
      });

      if (winnersInfo.winners.length === 0) return;

      for (let i = 0; i < winnersInfo.winners.length; i++) {
        const w = winnersInfo.winners[i]!;
        logger.info(
          { telegramId: w.telegramId, rank: i + 1, prize: PVP_PRIZES[i], count: w.count, dayKey: w.dayKey },
          "[pvp-cron] credited daily-pvp prize",
        );
      }
      logger.info(
        { winners: winnersInfo.winners.length, settled: winnersInfo.settled },
        "[pvp-cron] daily reset complete",
      );
    } catch (err) {
      logger.warn({ err }, "[pvp-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };

  setTimeout(tick, 9_000).unref();
  setInterval(tick, intervalMs).unref();
}

function utcDayKeyForCron(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Auto-riconciliazione pagamenti Stars.
 *
 * Telegram occasionalmente non consegna l'update `successful_payment` al
 * webhook (problema noto di cold-start del loro sistema): l'utente paga,
 * Telegram conferma il pagamento ma il nostro server non viene avvertito,
 * quindi l'oggetto non viene accreditato finché l'admin non preme il
 * pulsante "RICONCILIA PAGAMENTI STARS".
 *
 * Questo cron fa la stessa cosa automaticamente ogni 2 minuti:
 * 1. Chiede a Telegram l'elenco delle ultime transazioni Stars
 *    (getStarTransactions, fino a 100 per pagina).
 * 2. Per ogni transazione di tipo invoice_payment, prova a riconciliarla.
 *    `reconcilePendingStarPayment` è idempotente — se la txn è già stata
 *    accreditata dal webhook, ritorna `already_done` senza effetti.
 * 3. Le transazioni effettivamente recuperate emettono la notifica
 *    "♻️ RECONCILE" sul bot dell'admin (stesso flusso del pulsante manuale).
 *
 * Single-flight: se un tick è ancora in corso (es. tante txn da riconciliare),
 * il successivo viene saltato per evitare double-work.
 */
function startStarsReconcileCron() {
  const intervalMs = 2 * 60 * 1000;
  const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
  if (!BOT_TOKEN) {
    logger.warn("[stars-cron] BOT_TOKEN not set — skipping stars reconcile cron");
    return;
  }
  let inFlight = false;

  type StarsTx = {
    id: string;
    date: number;
    source?: { transaction_type?: string; invoice_payload?: string };
  };

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const { reconcilePendingStarPayment } = await import("./routes/stars-reconcile");

      // Walk forward through the last few pages of Stars transactions.
      // 3 pages * 100 = 300 most-recent transactions, ampiamente sufficiente
      // per coprire anche picchi di volume su una finestra di 2 minuti.
      const collected: StarsTx[] = [];
      let offset = 0;
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getStarTransactions?limit=100&offset=${offset}`);
        const data = await r.json() as { ok: boolean; result?: { transactions?: StarsTx[] } };
        const page = data?.result?.transactions || [];
        if (page.length === 0) break;
        collected.push(...page);
        if (page.length < 100) break;
        offset += page.length;
      }

      let credited = 0;
      let alreadyDone = 0;
      let errors = 0;
      for (const t of collected) {
        if (t.source?.transaction_type !== "invoice_payment") continue;
        const payload = t.source?.invoice_payload;
        if (!payload) continue;
        let parsed: { txnId?: number; itemId?: string; telegramId?: string };
        try { parsed = JSON.parse(payload); } catch { continue; }
        if (typeof parsed.txnId !== "number" || !parsed.itemId || !parsed.telegramId) continue;
        const r = await reconcilePendingStarPayment(parsed.txnId, parsed.itemId, parsed.telegramId, t.id);
        if (r.status === "credited") credited++;
        else if (r.status === "already_done") alreadyDone++;
        else if (r.status === "error") errors++;
      }
      if (credited > 0 || errors > 0) {
        logger.info({ scanned: collected.length, credited, alreadyDone, errors }, "[stars-cron] reconcile tick");
      }
    } catch (err) {
      logger.warn({ err }, "[stars-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };

  // Primo tick 30s dopo il boot per coprire subito eventuali pagamenti
  // arrivati durante il restart.
  setTimeout(tick, 30_000).unref();
  setInterval(tick, intervalMs).unref();
}

function startKeepAlive() {
  const intervalMs = 60 * 1000;

  setInterval(() => {
    const req = http.request(
      { hostname: "localhost", port, path: "/api/ping", method: "GET" },
      (res) => {
        res.resume();
        logger.debug({ status: res.statusCode }, "Keep-alive ping OK");
      },
    );
    req.on("error", (err) => {
      logger.warn({ err: err.message }, "Keep-alive ping failed");
    });
    req.end();
  }, intervalMs).unref();
}

async function registerTelegramWebhook() {
  const botToken = process.env["BOT_TOKEN"];
  if (!botToken) {
    logger.warn("BOT_TOKEN not set — skipping webhook registration");
    return;
  }

  // ONLY the published deployment may touch the Telegram webhook. In a Replit
  // dev workspace `REPLIT_DOMAINS` points at a SHORT-LIVED preview hostname
  // (e.g. *.janeway.replit.dev / *.repl.run); calling setWebhook from dev
  // overwrites production with that ephemeral URL, Telegram then receives
  // 500 errors and queues `successful_payment` updates that are never
  // processed — silently breaking every Stars purchase until the next prod
  // restart. `REPLIT_DEPLOYMENT === "1"` is the canonical signal that we're
  // running inside the published deployment (NODE_ENV is unreliable: it is
  // empty in this dev workspace). Belt-and-suspenders: also refuse to
  // register if the resolved domain still looks like an ephemeral preview.
  if (process.env["REPLIT_DEPLOYMENT"] !== "1") {
    logger.info("Skipping webhook registration: not running in published deployment (production webhook preserved)");
    return;
  }

  const deployDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0];

  if (!deployDomain) {
    logger.warn("No domain available for webhook registration");
    return;
  }

  if (deployDomain.includes(".janeway.") || deployDomain.includes(".repl.run") || deployDomain.includes(".replit.dev")) {
    logger.warn({ deployDomain }, "Refusing to register webhook on what looks like an ephemeral preview domain (production webhook preserved)");
    return;
  }

  const webhookUrl = `https://${deployDomain}/api/stars/webhook`;
  const secretToken = process.env["TELEGRAM_WEBHOOK_SECRET"] || "";

  try {
    const body: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ["message", "pre_checkout_query", "callback_query"],
    };
    if (secretToken) body["secret_token"] = secretToken;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (data.ok) {
      logger.info({ webhookUrl }, "Telegram webhook registered");
    } else {
      logger.error({ description: data.description }, "Failed to register Telegram webhook");
    }

    try {
      const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const infoData = await infoRes.json() as {
        ok: boolean;
        result?: {
          url?: string;
          has_custom_certificate?: boolean;
          pending_update_count?: number;
          last_error_date?: number;
          last_error_message?: string;
          last_synchronization_error_date?: number;
          max_connections?: number;
          allowed_updates?: string[];
        };
      };
      if (infoData.ok && infoData.result) {
        logger.info({
          url: infoData.result.url,
          pending: infoData.result.pending_update_count,
          lastErrorDate: infoData.result.last_error_date,
          lastErrorMessage: infoData.result.last_error_message,
          lastSyncErrorDate: infoData.result.last_synchronization_error_date,
          allowedUpdates: infoData.result.allowed_updates,
          maxConnections: infoData.result.max_connections,
        }, "Telegram webhook info");
      } else {
        logger.warn({ infoData }, "getWebhookInfo returned non-ok");
      }
    } catch (err) {
      logger.error({ err }, "Failed to fetch getWebhookInfo");
    }
  } catch (err) {
    logger.error({ err }, "Error registering Telegram webhook");
  }
}

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — continuing");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — continuing");
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

/**
 * Alien Merchant (Space Scrapper) channel cron.
 *
 * Runs every 30 minutes. Sends TWO types of messages to the ALIEN chat:
 *
 * 1. RADAR COUNTDOWN (while merchant is NOT active):
 *    Reads the global spawn state, computes time until nextAtMs, and sends
 *    a stylised "radar" message so the community knows when the ship is
 *    due. If the spawn has already happened (nextAtMs <= now) but the
 *    visit hasn't started yet, the countdown just says "ARRIVING NOW".
 *
 * 2. LANDING FLASH (when merchant first lands):
 *    When the merchant spawns (expiresAtMs becomes active) we check a
 *    per-visit DB flag `merchant.notified` — if the current expiresAtMs
 *    hasn't been posted yet, we send an urgent "LANDED" message to the
 *    ALIEN chat and stamp the flag. This is idempotent (flag cleared
 *    automatically when the visit ends because the key is never reused).
 *
 * Single-flight, no-drift: the cron itself advances the global state so
 * it sees the same values as the client endpoints.
 */
function startAlienMerchantCron() {
  const intervalMs = 30 * 60 * 1000; // 30 minutes
  const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
  if (!BOT_TOKEN) {
    logger.warn("[alien-cron] BOT_TOKEN not set — skipping alien merchant cron");
    return;
  }
  // The alien radar posts to a FIXED public channel (ALIEN_CHAT_ID), shared by
  // every environment. If the dev workspace ran this cron too, dev + production
  // would both post to the same channel — producing duplicate, off-cadence
  // messages (the exact symptom: two near-identical radar pings ~12 min apart
  // instead of one every 30 min). Same gate the Telegram webhook uses: only the
  // production deployment is allowed to broadcast.
  if (process.env["REPLIT_DEPLOYMENT"] !== "1") {
    logger.info("[alien-cron] not a deployment — skipping alien merchant cron (dev never posts to the live channel)");
    return;
  }
  let inFlight = false;

  // `isBoot` is true only for the one-shot tick fired shortly after the server
  // starts. On boot we still want to catch a LANDING that happened during
  // downtime (time-critical + idempotent), but we must NOT emit a radar
  // countdown: every restart/redeploy would otherwise fire an off-schedule
  // message and break the clean 30-minute cadence. Radar countdowns are sent
  // exclusively by the 30-minute interval.
  const tick = async (isBoot = false) => {
    if (inFlight) return;
    inFlight = true;
    try {
      const now = Date.now();
      const g = await advanceGlobal(now);

      // CASE 2: Merchant is active RIGHT NOW — landing flash
      if (g.expiresAtMs != null && g.expiresAtMs > now) {
        const lastNotified = await readNotifiedExpiresAtMs();
        if (lastNotified !== g.expiresAtMs) {
          const remainingMin = Math.ceil((g.expiresAtMs - now) / 60000);
          const text =
            `🚀 <b>STARDUST SCRAPPER LANDED</b> 🚀\n\n` +
            `The alien ship is now active in the LAB!\n` +
            `Scrap your idle planets for Stardust before it departs.`;
          await sendAlienChannelMessage(text);
          await writeNotifiedExpiresAtMs(g.expiresAtMs);
          logger.info({ expiresAtMs: g.expiresAtMs, remainingMin }, "[alien-cron] sent landing flash");
        }
        return;
      }

      // Radar countdowns (CASE 1) are periodic, not time-critical. Skip them on
      // the boot tick so a restart/redeploy never injects an off-schedule ping —
      // the next one arrives on the regular 30-minute interval.
      if (isBoot) return;

      // CASE 1: Merchant is NOT active — radar countdown
      const nextAtMs = g.nextAtMs;
      if (nextAtMs == null || nextAtMs <= now) {
        // Either no spawn scheduled or it's already past — the next visit
        // is being handled by the idle->active transition above, so just
        // send a generic "radar scanning" heartbeat.
        await sendAlienChannelMessage(
          `📡 <b>SPACE RADAR</b>\n\n` +
          `Scanning sector...\n` +
          `No alien signals detected. The Stardust Scrapper is currently on patrol.`
        );
        return;
      }

      const remainingMs = nextAtMs - now;
      const h = Math.floor(remainingMs / 3600000);
      const m = Math.ceil((remainingMs % 3600000) / 60000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const countdown = h > 0 ? `${pad(h)}h ${pad(m)}m` : `${pad(m)}m`;

      const text =
        `📡 <b>SPACE RADAR — Alien Signal Detected</b> 📡\n\n` +
        `Estimated time to arrival:\n` +
        `<b>${countdown}</b>\n\n` +
        `Prepare your idle planets — the Stardust Scrapper will exchange them for Stardust.`;

      await sendAlienChannelMessage(text);
      logger.info({ h, m, nextAtMs }, "[alien-cron] sent radar countdown");
    } catch (err) {
      logger.warn({ err }, "[alien-cron] tick failed");
    } finally {
      inFlight = false;
    }
  };

  // First tick ~60s after boot so it doesn't collide with startup logs. Boot
  // tick only handles a missed landing flash; the radar countdown is emitted
  // solely by the 30-minute interval to keep the cadence exact.
  setTimeout(() => tick(true), 60_000).unref();
  setInterval(() => tick(false), intervalMs).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
