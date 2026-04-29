import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { sendBotMessage } from "./lib/notify";
import { fetchPendingFarmNotifications, markFarmNotified } from "./routes/farm";
import { runDailyReferralReset } from "./routes/hallOfFame";

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

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  startKeepAlive();
  registerTelegramWebhook();
  startFarmNotificationCron();
  startHallOfFameDailyCron();
});

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

function startHallOfFameDailyCron() {
  // Daily Hall of Fame reset — distributes stardust prizes to the top 5
  // referrers of the day, then zeroes everyone's daily counter. The reset
  // is keyed to the UTC day; runDailyReferralReset() is idempotent within
  // the day, so ticking every minute is safe and only does real work the
  // first minute past 00:00 UTC.
  //
  // We tick every minute (rather than computing the exact next-midnight
  // delay) so a daylight-savings or process-freeze event can't make us
  // miss the window: the first tick after midnight will run the reset,
  // and every subsequent tick that day is a cheap fast-path no-op.
  const intervalMs = 60 * 1000;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runDailyReferralReset();
      if (result.ran) {
        logger.info(
          { today: result.today, awarded: result.awarded?.length ?? 0 },
          "[hall-of-fame] daily reset executed",
        );
      }
    } catch (err) {
      logger.warn({ err }, "[hall-of-fame] cron tick failed");
    } finally {
      inFlight = false;
    }
  };
  // Fire once 8s after boot so a same-day-restart still catches up if the
  // previous instance crashed between 00:00 UTC and the first scheduled
  // tick. Slightly after the farm cron's 5s to spread DB load.
  setTimeout(tick, 8_000).unref();
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

  if (process.env["NODE_ENV"] === "development") {
    logger.info("Skipping webhook registration in dev mode (production webhook preserved)");
    return;
  }

  const deployDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0];

  if (!deployDomain) {
    logger.warn("No domain available for webhook registration");
    return;
  }

  const webhookUrl = `https://${deployDomain}/api/stars/webhook`;
  const secretToken = process.env["TELEGRAM_WEBHOOK_SECRET"] || "";

  try {
    const body: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ["message", "pre_checkout_query"],
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

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
