import { pgTable, text, integer, timestamp, real, boolean, index, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  telegramId: text("telegram_id").primaryKey(),
  referralCount: integer("referral_count").notNull().default(0),
  referredBy: text("referred_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  zoomBalance: real("zoom_balance").notNull().default(0),
  balanceEpoch: integer("balance_epoch").notNull().default(0),
  firstName: text("first_name"),
  username: text("username"),
  bonusSlots: integer("bonus_slots").notNull().default(0),
  bonusSun: boolean("bonus_sun").notNull().default(false),
  sunCount: integer("sun_count").notNull().default(0),
  bonusBasic: integer("bonus_basic").notNull().default(0),
  bonusRare: integer("bonus_rare").notNull().default(0),
  bonusEpic: integer("bonus_epic").notNull().default(0),
  bonusGold: integer("bonus_gold").notNull().default(0),
  bonusV1: integer("bonus_v1").notNull().default(0),
  claimedMilestones: text("claimed_milestones").notNull().default(""),
  totalCraftedBasic: integer("total_crafted_basic").notNull().default(0),
  totalCraftedRare: integer("total_crafted_rare").notNull().default(0),
  totalCraftedEpic: integer("total_crafted_epic").notNull().default(0),
  totalCraftedGold: integer("total_crafted_gold").notNull().default(0),
  totalCraftedV1: integer("total_crafted_v1").notNull().default(0),
  wheelSpins: integer("wheel_spins").notNull().default(0),
  lastWheelDailyAt: timestamp("last_wheel_daily_at"),
  dailyStreakDay: integer("daily_streak_day").notNull().default(0),
  dailyStreakCycle: integer("daily_streak_cycle").notNull().default(0),
  lastDailyClaimAt: timestamp("last_daily_claim_at"),
  hasAutoTap: boolean("has_auto_tap").notNull().default(false),
  whiteCollectionUnlocked: boolean("white_collection_unlocked").notNull().default(false),
  whiteCollectionBundles: integer("white_collection_bundles").notNull().default(0),
  earthCollectionUnlocked: boolean("earth_collection_unlocked").notNull().default(false),
  earthCollectionBundles: integer("earth_collection_bundles").notNull().default(0),
  tonBalance: real("ton_balance").notNull().default(0),
  language: text("language").notNull().default("en"),
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
  award: text("award"),
  telegramPaymentId: text("telegram_payment_id").unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_txn_telegram_id").on(table.telegramId),
  index("idx_txn_status").on(table.status),
  index("idx_txn_payment_id").on(table.telegramPaymentId),
]);

export const marketListingsTable = pgTable("market_listings", {
  id: serial("id").primaryKey(),
  sellerTelegramId: text("seller_telegram_id").notNull(),
  sellerName: text("seller_name"),
  planetType: text("planet_type").notNull(),
  planetRate: integer("planet_rate").notNull(),
  price: integer("price").notNull(),
  status: text("status").notNull().default("active"),
  buyerTelegramId: text("buyer_telegram_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  soldAt: timestamp("sold_at"),
  lastActivatedAt: timestamp("last_activated_at"),
}, (table) => [
  index("idx_market_status").on(table.status),
  index("idx_market_seller").on(table.sellerTelegramId),
]);

export const insertMarketListingSchema = createInsertSchema(marketListingsTable).omit({ id: true, createdAt: true, soldAt: true });
export type InsertMarketListing = z.infer<typeof insertMarketListingSchema>;
export type MarketListing = typeof marketListingsTable.$inferSelect;

export const tonWithdrawalsTable = pgTable("ton_withdrawals", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  amountTon: real("amount_ton").notNull(),
  feeTon: real("fee_ton").notNull().default(0),
  walletAddress: text("wallet_address").notNull(),
  // pending | paid | rejected
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  processedBy: text("processed_by"),
}, (table) => [
  index("idx_withdrawals_telegram_id").on(table.telegramId),
  index("idx_withdrawals_status").on(table.status),
  index("idx_withdrawals_created_at").on(table.createdAt),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

export type TonWithdrawal = typeof tonWithdrawalsTable.$inferSelect;

export const farmCyclesTable = pgTable("farm_cycles", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  planetId: text("planet_id").notNull(),
  planetType: text("planet_type").notNull(),
  isWhite: boolean("is_white").notNull().default(false),
  activatedAt: timestamp("activated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  collectedAt: timestamp("collected_at"),
  notifiedAt: timestamp("notified_at"),
}, (table) => [
  uniqueIndex("uq_farm_cycles_telegram_planet").on(table.telegramId, table.planetId),
  index("idx_farm_cycles_expires_at").on(table.expiresAt),
  index("idx_farm_cycles_notified_at").on(table.notifiedAt),
]);

export type FarmCycle = typeof farmCyclesTable.$inferSelect;
