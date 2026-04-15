import { pgTable, text, integer, timestamp, real, boolean, index, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  telegramId: text("telegram_id").primaryKey(),
  referralCount: integer("referral_count").notNull().default(0),
  referredBy: text("referred_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  zoomBalance: real("zoom_balance").notNull().default(0),
  firstName: text("first_name"),
  bonusSlots: integer("bonus_slots").notNull().default(0),
  bonusSun: boolean("bonus_sun").notNull().default(false),
  bonusBasic: integer("bonus_basic").notNull().default(0),
  bonusRare: integer("bonus_rare").notNull().default(0),
  bonusEpic: integer("bonus_epic").notNull().default(0),
  bonusGold: integer("bonus_gold").notNull().default(0),
}, (table) => [
  index("idx_users_zoom_balance").on(table.zoomBalance),
  index("idx_users_referred_by").on(table.referredBy),
]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull(),
  amount: integer("amount").notNull(),
  starsAmount: integer("stars_amount"),
  tonAmount: real("ton_amount"),
  itemId: text("item_id"),
  itemName: text("item_name"),
  telegramPaymentId: text("telegram_payment_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_txn_telegram_id").on(table.telegramId),
  index("idx_txn_status").on(table.status),
  index("idx_txn_payment_id").on(table.telegramPaymentId),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
