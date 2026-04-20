import { logger } from "./logger";

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";

/**
 * Send a plain-text Telegram message to a user via the bot.
 * Silently no-ops when BOT_TOKEN isn't configured (dev) or the user has
 * never started the bot (Telegram returns 403 — expected and not an error
 * we want to noisy-log).
 */
export async function sendBotMessage(telegramId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn({ telegramId }, "[notify] BOT_TOKEN not set — skipping send");
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const status = res.status;
      // 403 = user blocked the bot or never /start'd. Not an error worth alerting on.
      if (status === 403) return false;
      const body = await res.text().catch(() => "");
      logger.warn({ telegramId, status, body }, "[notify] sendMessage non-OK");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ telegramId, err }, "[notify] sendMessage failed");
    return false;
  }
}
