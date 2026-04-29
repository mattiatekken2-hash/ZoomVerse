import { pgTable, text, integer, timestamp, real, boolean, index, serial, uniqueIndex, bigint, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  telegramId: text("telegram_id").primaryKey(),
  referralCount: integer("referral_count").notNull().default(0),
  // Hall of Fame — daily referral counter. Reset to 0 every day at 00:00 UTC
  // by a server cron that also distributes stardust prizes to the top 5
  // (100/75/50/25/25). Bumped together with referralCount whenever the
  // referrer is credited in /referral/register.
  dailyReferralCount: integer("daily_referral_count").notNull().default(0),
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
  // COMET — rarity sitting between EPIC and GOLD. Unlike all other planets
  // (which farm ZOOM), each COMET passively generates 25 STARDUST every 24h
  // and credits them straight to stardustBalance. Server is the single source
  // of truth; the client only reads. See `cometStardustSettledAtMs` and
  // `settleCometStardust()` in api-server/src/routes/stardust.ts.
  bonusComet: integer("bonus_comet").notNull().default(0),
  claimedMilestones: text("claimed_milestones").notNull().default(""),
  totalCraftedBasic: integer("total_crafted_basic").notNull().default(0),
  totalCraftedRare: integer("total_crafted_rare").notNull().default(0),
  totalCraftedEpic: integer("total_crafted_epic").notNull().default(0),
  totalCraftedGold: integer("total_crafted_gold").notNull().default(0),
  totalCraftedV1: integer("total_crafted_v1").notNull().default(0),
  totalCraftedComet: integer("total_crafted_comet").notNull().default(0),
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
  // Stardust — second currency. Accumulable but NOT spendable yet (its
  // utility is intentionally hidden until a future event/release). Players
  // collect floating yellow stars in the Lab, gated by SUN ownership and a
  // per-UTC-day cap to defeat farming bots.
  stardustBalance: integer("stardust_balance").notNull().default(0),
  stardustToday: integer("stardust_today").notNull().default(0),
  // UTC day key (YYYY-MM-DD) the today-counter belongs to. When the stored
  // key differs from today, today is reset to 0 before incrementing.
  stardustDayKey: text("stardust_day_key"),
  // Space Merchant — random alien encounter on LAB. Server-driven so the
  // 20–50 min cadence and the 3-fusion cap can't be bypassed client-side.
  // `merchantNextAt` = earliest moment the next merchant may spawn.
  // `merchantExpiresAt` = when the currently-visible merchant disappears.
  // `merchantFusionsUsed` = how many fusions consumed in the active visit.
  merchantNextAt: timestamp("merchant_next_at"),
  merchantExpiresAt: timestamp("merchant_expires_at"),
  merchantFusionsUsed: integer("merchant_fusions_used").notNull().default(0),
  // SUN cycle (24h farming) — server-side mirror of the client's sun.* fields.
  // Without this, losing localStorage (browser cache wipe, switching device,
  // certain Telegram WebView clears on iOS) would silently reset the SUN to
  // a fresh "FARM" state and the user would lose any time already farmed.
  // Stored as bigint epoch ms (matching collection_planets) to avoid float
  // quantisation. Default 0 means "never started" — the client treats >0 as
  // "cycle in progress" and gates the FARM/REACTIVATE button on whether
  // (now - sunFarmStartedAtMs) < 24h, exactly like the local-only path did
  // before. Cycle count is purely a stat (incremented per activation).
  sunFarmStartedAtMs: bigint("sun_farm_started_at_ms", { mode: "number" }).notNull().default(0),
  sunLastCollectedAtMs: bigint("sun_last_collected_at_ms", { mode: "number" }).notNull().default(0),
  sunCycleCount: integer("sun_cycle_count").notNull().default(0),
  // Server-side mirror of the client's regular planets array (everything
  // shown on the FarmPage main grid, including bonus, crafted, and bought
  // planets). Stored as JSONB so we can replace it atomically on every
  // change. The array order encodes slot positions on the FarmPage. This
  // is what makes the inventory survive cache wipes and follow the user
  // across devices. White / Earth Collection planets live in a separate
  // table because they have a deterministic identity tuple.
  planetsJson: jsonb("planets_json").notNull().default(sql`'[]'::jsonb`),
  // Server-side counter of how many bonus planets the client has already
  // materialized into planetsJson. Mirrors the local
  // `claimedBonusBasic/Rare/Epic/Gold/V1` so applyGrants on a fresh device
  // doesn't re-mint bonus planets the user already burned. Without this,
  // burning bonuses on the phone and then opening the PC would resurrect
  // them (server.bonusBasic stays high after burn-decrement only if the
  // notify call succeeded; this counter is the second line of defence).
  claimedBonusBasic: integer("claimed_bonus_basic").notNull().default(0),
  claimedBonusRare: integer("claimed_bonus_rare").notNull().default(0),
  claimedBonusEpic: integer("claimed_bonus_epic").notNull().default(0),
  claimedBonusGold: integer("claimed_bonus_gold").notNull().default(0),
  claimedBonusV1: integer("claimed_bonus_v1").notNull().default(0),
  claimedBonusComet: integer("claimed_bonus_comet").notNull().default(0),
  // Server-side high-water-mark for COMET stardust accrual. Each comet
  // produces 25 stardust every full 24h. On every read of /stardust/state
  // (and /stardust/collect), the server counts how many full 24h windows
  // elapsed since this watermark, credits `windows * 25 * cometCount` to
  // stardustBalance, and advances the watermark by exactly that many
  // windows. Stored as bigint epoch ms (matching the rest of the user
  // farming watermarks). 0 means "never settled" — the first read just
  // initialises the watermark to now() and credits nothing.
  cometStardustSettledAtMs: bigint("comet_stardust_settled_at_ms", { mode: "number" }).notNull().default(0),
  // Monotonic write-time used to fence out stale saves of `planets_json`.
  // The save endpoint rejects any incoming write whose `client_write_at_ms`
  // is <= the stored value. Using the client's clock is fine because a
  // single user is the only writer (server-clock skew across devices is
  // small) and we only care about ORDER, not absolute time.
  planetsUpdatedAtMs: bigint("planets_updated_at_ms", { mode: "number" }).notNull().default(0),
  // Last time the client credited regular-planet farming earnings, in epoch
  // ms. Server-side mirror of GameState.lastFarmingSettledAt — without it,
  // closing the app and reopening on a different device (or after a
  // Telegram WebView cache wipe) would lose every minute of offline
  // farming because the client defaults this to "now" on a fresh load.
  // Stored on the server and merged with GREATEST so any client opening
  // this account picks up where the last one left off and credits the
  // exact gap. Bigint to keep ms precision at epoch magnitudes (~1.7e12).
  lastFarmingSettledAtMs: bigint("last_farming_settled_at_ms", { mode: "number" }).notNull().default(0),
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

// Server-side persistence for White/Earth Collection planets. The CLIENT used
// to be the sole owner of slot placements and per-planet farming timers
// (stored in localStorage). When the client lost localStorage — PWA reinstall,
// browser cache wipe, switching device — the planets came back from
// /grants as fresh inventory items, dropping every placement and erasing any
// in-flight (uncollected) TON earnings. This table makes the SERVER the
// source of truth for that mutable state so it survives client resets.
//
// Identity is the deterministic tuple (telegramId, kind, bundleIndex,
// subIndex). The planet rarity (W1/W2/W3/W4 or E1/E2/E3/E4) and bundle
// origin are derivable from these indices, so we only store the bits that
// actually change at runtime.
export const collectionPlanetsTable = pgTable("collection_planets", {
  telegramId: text("telegram_id").notNull(),
  kind: text("kind").notNull(), // 'white' | 'earth'
  bundleIndex: integer("bundle_index").notNull(),
  subIndex: integer("sub_index").notNull(), // 0..3 within the bundle
  slotIndex: integer("slot_index"), // null = inventory; 0..N-1 = placed
  isFarmingActive: boolean("is_farming_active").notNull().default(false),
  // bigint (Postgres int8) so we keep millisecond precision at epoch
  // magnitudes (~1.7e12). `real` is a 32-bit float and would quantize
  // these timestamps to the minute level, breaking farming windows.
  farmStartedAtMs: bigint("farm_started_at_ms", { mode: "number" }).notNull().default(0),
  lastCollectedAtMs: bigint("last_collected_at_ms", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_coll_planets_user_kind_b_s").on(
    table.telegramId,
    table.kind,
    table.bundleIndex,
    table.subIndex,
  ),
  index("idx_coll_planets_user_kind").on(table.telegramId, table.kind),
]);

export type CollectionPlanet = typeof collectionPlanetsTable.$inferSelect;
