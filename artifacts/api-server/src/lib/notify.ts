import { logger } from "./logger";

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";

// Channel/group where withdrawal confirmations get posted.
// Defaults match the ZoomVerse chat topic the team uses (t.me/ZoomVerse_Chat/7207).
// Overridable via env so we don't have to redeploy to retarget.
const WITHDRAWALS_CHAT_ID = process.env["WITHDRAWALS_CHAT_ID"] || "@ZoomVerse_Chat";
const WITHDRAWALS_THREAD_ID = Number(process.env["WITHDRAWALS_THREAD_ID"] || 7207) || undefined;

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

/**
 * Broadcast un messaggio del bot a TUTTI gli utenti che hanno mai aperto
 * il bot (ovvero tutte le righe in `users`). Usato per annunci globali —
 * es. notifica del vincitore del Lotto Stellare settimanale.
 *
 * Throttle: ~25 msg/sec (40ms di sleep tra ogni invio). Telegram impone
 * un limit globale di 30 msg/sec per il bot verso utenti diversi: stiamo
 * sotto il limit con margine.
 *
 * Fire-and-forget: la promise risolve quando tutti i messaggi sono stati
 * inviati (non bloccare la response HTTP del chiamante!). I 403 (utente
 * che ha bloccato il bot) sono ignorati silenziosamente. Errori di rete
 * vengono loggati ma non interrompono il broadcast.
 */
export async function broadcastBotMessageToAllUsers(text: string): Promise<{ sent: number; skipped: number }> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping broadcast");
    return { sent: 0, skipped: 0 };
  }
  // Lazy import per evitare cicli con i route handlers che importano notify.
  const { db, usersTable } = await import("@workspace/db");
  const rows = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    const ok = await sendBotMessage(row.telegramId, text);
    if (ok) sent++; else skipped++;
    // Throttle: 40ms tra invii ≈ 25 msg/sec.
    await new Promise((r) => setTimeout(r, 40));
  }
  logger.info({ total: rows.length, sent, skipped }, "[notify] broadcast complete");
  return { sent, skipped };
}

/**
 * Post a message to the withdrawals announcement chat / forum topic.
 * Used after a withdrawal is approved so the community sees the payout.
 * The bot must be a member of the chat with permission to send messages.
 */
export async function sendWithdrawalChannelMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping channel send");
    return false;
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: WITHDRAWALS_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (WITHDRAWALS_THREAD_ID) body["message_thread_id"] = WITHDRAWALS_THREAD_ID;

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      logger.warn({ status: res.status, responseBody }, "[notify] channel sendMessage non-OK");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "[notify] channel sendMessage failed");
    return false;
  }
}
