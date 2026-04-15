import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";

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
});

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

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const deployDomain = process.env["REPLIT_DOMAINS"];
  const domain = deployDomain?.split(",")[0] || devDomain;

  if (!domain) {
    logger.warn("No domain available for webhook registration");
    return;
  }

  const webhookUrl = `https://${domain}/api/stars/webhook`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "pre_checkout_query"],
      }),
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
