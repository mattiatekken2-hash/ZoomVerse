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
export type BotSendResult = "ok" | "blocked" | "fail";

/**
 * Send a plain-text Telegram message to a user via the bot.
 * Silently no-ops when BOT_TOKEN isn't configured (dev) or the user has
 * never started the bot (Telegram returns 403 — expected and not an error
 * we want to noisy-log).
 */
export async function sendBotMessageStatus(telegramId: string, text: string): Promise<BotSendResult> {
  if (!BOT_TOKEN) {
    logger.warn({ telegramId }, "[notify] BOT_TOKEN not set — skipping send");
    return "fail";
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
      // 403 = user blocked the bot or never /start'd.
      if (status === 403) return "blocked";
      const body = await res.text().catch(() => "");
      logger.warn({ telegramId, status, body }, "[notify] sendMessage non-OK");
      return "fail";
    }
    return "ok";
  } catch (err) {
    logger.warn({ telegramId, err }, "[notify] sendMessage failed");
    return "fail";
  }
}

export async function sendBotMessage(telegramId: string, text: string): Promise<boolean> {
  return (await sendBotMessageStatus(telegramId, text)) === "ok";
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

// Telegram channel/group for the Space Merchant (alien) radar + landed messages.
const ALIEN_CHAT_ID = process.env["ALIEN_CHAT_ID"] || "@ZoomVerse_Chat";
const ALIEN_THREAD_ID = Number(process.env["ALIEN_THREAD_ID"] || "87675") || 87675;

// Telegram chat ID of the admin/owner. Hardcoded because it's the same
// person who owns the bot — overridable via env if ever needed.
const ADMIN_NOTIFY_CHAT_ID = process.env["ADMIN_NOTIFY_CHAT_ID"] || "8144744644";

/**
 * Notifica all'admin (sul bot personale) ogni acquisto Stars completato.
 * Serve a sapere in tempo reale quando un pagamento entra (sia via webhook
 * che via /admin/reconcile-stars). Fire-and-forget, errori non fatali.
 */
export async function notifyAdminPurchase(params: {
  txnId: number;
  itemName: string;
  starsAmount: number;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  source: "webhook" | "reconcile";
}): Promise<void> {
  if (!BOT_TOKEN) return;
  const who = params.username
    ? `@${params.username}`
    : (params.firstName || params.telegramId);
  const tag = params.source === "reconcile" ? "♻️ RECONCILE" : "★ WEBHOOK";
  const text =
    `${tag}\n` +
    `Acquisto: ${params.itemName}\n` +
    `★ ${params.starsAmount}\n` +
    `Da: ${who}\n` +
    `ID: ${params.telegramId}\n` +
    `Txn: #${params.txnId}`;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_NOTIFY_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    logger.warn({ err, txnId: params.txnId }, "[notify] admin purchase notify failed");
  }
}

/**
 * Notify the admin on their personal bot chat when a GRAM (TON) deposit
 * is verified on-chain and credited in-app.
 */
export async function notifyAdminGramDeposit(params: {
  txnId: number;
  amountTon: number;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  destinationWallet: string;
}): Promise<void> {
  if (!BOT_TOKEN) return;
  const who = params.username
    ? `@${params.username}`
    : (params.firstName || params.telegramId);
  const text =
    `💎 <b>Deposito GRAM</b>\n` +
    `\u2003• Importo: <b>${params.amountTon.toFixed(4)} GRAM</b>\n` +
    `\u2003• Wallet progetto: <code>${params.destinationWallet}</code>\n` +
    `\u2003• Utente: ${who} (ID: <code>${params.telegramId}</code>)\n` +
    `\u2003• Txn: #${params.txnId}`;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_NOTIFY_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    logger.warn({ err, txnId: params.txnId }, "[notify] admin GRAM deposit notify failed");
  }
}

/**
 * Notify the admin on their personal bot chat when a new withdrawal
 * request arrives. Includes inline buttons so the admin can approve
 * or reject directly from Telegram without opening the web dashboard.
 */
export async function notifyAdminWithdrawalRequest(params: {
  withdrawalId: number;
  amountTon: number;
  walletAddress: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
}): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping admin withdrawal notify");
    return false;
  }
  const who = params.username
    ? `@${params.username}`
    : (params.firstName || params.telegramId);
  const text =
    `🔴 <b>Prelievo richiesto</b>\n` +
    `\u2003• Importo: <b>${params.amountTon.toFixed(4)} TON</b>\n` +
    `\u2003• Wallet: <code>${params.walletAddress}</code>\n` +
    `\u2003• Utente: ${who} (ID: <code>${params.telegramId}</code>)`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_NOTIFY_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Approva", callback_data: `withdraw_approve:${params.withdrawalId}` },
            { text: "❌ Rifiuta", callback_data: `withdraw_reject:${params.withdrawalId}` },
          ]],
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "[notify] admin withdrawal notify non-OK");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "[notify] admin withdrawal notify failed");
    return false;
  }
}

// Telegram group/channel where players share marketplace listings.
// Defaults to the public ZoomVerse community chat; overridable via env so we
// can retarget (or point at a specific forum topic) without redeploying.
const MARKET_SHARE_CHAT_ID = process.env["MARKET_SHARE_CHAT_ID"] || "@ZoomVerse_Chat";
const MARKET_SHARE_THREAD_ID = Number(process.env["MARKET_SHARE_THREAD_ID"] || "7406") || undefined;

/**
 * Post a marketplace listing to Market P2P (t.me/ZoomVerse_Chat/7406).
 * Prefers an uploaded looping GIF of the exact GLB; falls back to a remote
 * animation URL. sendAnimation autoplays muted GIF/MP4 on loop.
 */
async function telegramMethod(
  method: string,
  payload: FormData | Record<string, unknown>,
): Promise<boolean> {
  const isForm = payload instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
  // Telegram returns HTTP 200 with { ok: false } for most Bot API errors.
  if (!data.ok) {
    logger.warn({ method, status: res.status, description: data.description }, "[notify] telegram method failed");
    return false;
  }
  return true;
}

function marketShareMarkup(buttonText: string, buttonUrl: string) {
  return JSON.stringify({
    inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
  });
}

function marketShareTextBody(caption: string, markup: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    chat_id: MARKET_SHARE_CHAT_ID,
    text: caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: JSON.parse(markup),
  };
  if (MARKET_SHARE_THREAD_ID) body["message_thread_id"] = MARKET_SHARE_THREAD_ID;
  return body;
}

export async function sendMarketShareToGroup(params: {
  animationUrl?: string;
  animationGif?: Buffer;
  caption: string;
  buttonText: string;
  buttonUrl: string;
}): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping market share");
    return false;
  }
  const markup = marketShareMarkup(params.buttonText, params.buttonUrl);
  try {
    if (params.animationGif && params.animationGif.length > 32) {
      const form = new FormData();
      form.append("chat_id", MARKET_SHARE_CHAT_ID);
      if (MARKET_SHARE_THREAD_ID) form.append("message_thread_id", String(MARKET_SHARE_THREAD_ID));
      form.append("caption", params.caption);
      form.append("parse_mode", "HTML");
      form.append("reply_markup", markup);
      const bytes = new Uint8Array(params.animationGif);
      const file = typeof File !== "undefined"
        ? new File([bytes], "model-spin.gif", { type: "image/gif" })
        : new Blob([bytes], { type: "image/gif" });
      form.append("animation", file, "model-spin.gif");
      const gifOk = await telegramMethod("sendAnimation", form);
      if (gifOk) return true;
      logger.warn("[notify] market share GIF rejected — falling back to text");
    } else if (params.animationUrl) {
      const body: Record<string, unknown> = {
        chat_id: MARKET_SHARE_CHAT_ID,
        animation: params.animationUrl,
        caption: params.caption,
        parse_mode: "HTML",
        reply_markup: JSON.parse(markup),
      };
      if (MARKET_SHARE_THREAD_ID) body["message_thread_id"] = MARKET_SHARE_THREAD_ID;
      const animOk = await telegramMethod("sendAnimation", body);
      if (animOk) return true;
      logger.warn("[notify] market share animation URL rejected — falling back to text");
    }

    return telegramMethod("sendMessage", marketShareTextBody(params.caption, markup));
  } catch (err) {
    logger.warn({ err }, "[notify] market share send failed");
    return false;
  }
}

/**
 * Send a message to the Alien chat channel (community updates).
 * Used for radar countdown and landing alerts for the Space Merchant.
 */
export async function sendAlienChannelMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping alien channel send");
    return false;
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: ALIEN_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (ALIEN_THREAD_ID) body["message_thread_id"] = ALIEN_THREAD_ID;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      logger.warn({ status: res.status, responseBody }, "[notify] alien channel sendMessage non-OK");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "[notify] alien channel sendMessage failed");
    return false;
  }
}

/**
 * Post a message to the WITHDRAWALS forum topic
 * (https://t.me/ZoomVerse_Chat/7207). Never falls back to the main group:
 * if the topic post fails we log it so the payout isn't announced in the
 * wrong thread.
 */
export async function sendWithdrawalChannelMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    logger.warn("[notify] BOT_TOKEN not set — skipping channel send");
    return false;
  }

  const body: Record<string, unknown> = {
    chat_id: WITHDRAWALS_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (WITHDRAWALS_THREAD_ID) body["message_thread_id"] = WITHDRAWALS_THREAD_ID;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
    if (data.ok) return true;
    logger.warn(
      { desc: data.description, chat: WITHDRAWALS_CHAT_ID, thread: WITHDRAWALS_THREAD_ID },
      "[notify] withdrawal topic sendMessage failed",
    );
    return false;
  } catch (err) {
    logger.warn({ err }, "[notify] withdrawal topic sendMessage error");
    return false;
  }
}
