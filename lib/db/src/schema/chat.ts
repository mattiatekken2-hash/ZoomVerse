import { pgTable, text, integer, timestamp, serial, index } from "drizzle-orm/pg-core";

/**
 * GLOBAL HOME CHAT — Phase 5b.
 *
 * Append-only chat log shared across the whole game. Every entry carries
 * the verified Telegram identity of the sender so we can render an
 * avatar/name and so abuse can be traced back to a real account.
 *
 * Anti-abuse:
 *  - The route layer enforces a 3-second cooldown per telegram_id (the
 *    cheapest check that scales without an extra table) and a 200-char
 *    cap on text content.
 *  - `text` is stored verbatim AFTER server-side sanitisation: control
 *    chars stripped, length clamped, surrounding whitespace trimmed.
 *
 * Reads:
 *  - `id` is monotonic (serial), so the client polls with `?since=<id>`
 *    and the server returns rows with `id > since` ordered by id ASC.
 *  - The composite `created_at DESC` index also serves the initial
 *    "give me the last 50" load.
 */
export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    // Display name shown in the chat bubble. We snapshot it at send-time
    // so renaming a Telegram username later doesn't rewrite history.
    username: text("username").notNull().default(""),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byCreatedAt: index("chat_messages_created_at_desc_idx").on(t.createdAt.desc()),
    byTelegramId: index("chat_messages_telegram_id_idx").on(t.telegramId),
  }),
);
