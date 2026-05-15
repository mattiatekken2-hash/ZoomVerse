import { pgTable, text, integer, timestamp, serial, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Admin-generated redeem codes.
 *
 * Each row is a single redeemable code created by an admin. The code can
 * grant one of three reward kinds (zoom / stardust / spins) with a fixed
 * amount baked in at creation time, expires 24h after creation, and can
 * be redeemed by any user — but only ONCE per user (enforced by the
 * unique index on `redeem_code_uses`).
 */
export const redeemCodesTable = pgTable("redeem_codes", {
  code: text("code").primaryKey(),
  rewardType: text("reward_type").notNull(), // "zoom" | "stardust" | "spins"
  rewardAmount: integer("reward_amount").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
}, (t) => [
  index("idx_redeem_codes_expires_at").on(t.expiresAt),
]);

/**
 * Per-user redemption ledger. The unique index on (code, telegram_id)
 * is what enforces "one redemption per code per user" at the DB level —
 * a duplicate INSERT raises a unique-violation that the route handler
 * catches and returns as ALREADY_USED.
 */
export const redeemCodeUsesTable = pgTable("redeem_code_uses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  telegramId: text("telegram_id").notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_redeem_code_uses_user_code").on(t.code, t.telegramId),
  index("idx_redeem_code_uses_telegram_id").on(t.telegramId),
]);

export type RedeemCode = typeof redeemCodesTable.$inferSelect;
export type RedeemCodeUse = typeof redeemCodeUsesTable.$inferSelect;
