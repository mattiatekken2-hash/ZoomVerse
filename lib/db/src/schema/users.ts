import { pgTable, text, integer, timestamp, real, boolean, index, serial, uniqueIndex, bigint, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  bonusMythic: integer("bonus_mythic").notNull().default(0),
  bonusPlasma: integer("bonus_plasma").notNull().default(0),
  bonusV1: integer("bonus_v1").notNull().default(0),
  // V1 NFT Platinum Edition — esclusivo NFT, max 5 venduti globalmente
  // (cap atomico in creditUserTx via WHERE-guard sulla SOMMA della colonna).
  // Pagamento solo TON (20 TON). Genera 275 $ZOOM/h in farm. Non droppabile
  // dal Lab (chance: 0 in PLANET_CONFIG.V1_NFT). Mirrored claim-counter
  // sotto (claimed_bonus_v1_nft_platinum) come gli altri pianeti bonus.
  bonusV1NftPlatinum: integer("bonus_v1_nft_platinum").notNull().default(0),
  claimedMilestones: text("claimed_milestones").notNull().default(""),
  // Long-term Earn tasks (planet-build milestones + sponsor tasks).
  // CSV of claimed task ids ("planets_200", "planets_500", "planets_1000",
  // "planets_2000", "sponsor_coinflip"). Mirrors the claimed_milestones
  // pattern so we don't introduce a new table for a tiny set of flags.
  claimedTasks: text("claimed_tasks").notNull().default(""),
  // Monotonic count of planets the user has ever forged/crafted/fused.
  // Persisted to make the Earn-page planet-build tasks survive cache wipes
  // and device switches. Updated via GREATEST(stored, incoming) on every
  // /regular-planets/save (so a stale save can never lower it). On the
  // very first save after deploy, the client sends its localStorage
  // craftsCompleted, which gives us full retroactivity for existing users.
  totalPlanetsBuilt: integer("total_planets_built").notNull().default(0),
  totalCraftedBasic: integer("total_crafted_basic").notNull().default(0),
  totalCraftedRare: integer("total_crafted_rare").notNull().default(0),
  totalCraftedEpic: integer("total_crafted_epic").notNull().default(0),
  totalCraftedGold: integer("total_crafted_gold").notNull().default(0),
  totalCraftedMythic: integer("total_crafted_mythic").notNull().default(0),
  totalCraftedPlasma: integer("total_crafted_plasma").notNull().default(0),
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
  // BLACK Collection — ultra-exclusive tier (max 3 bundles globally, 40 TON each).
  // 4 black planets per bundle, combined output ~0.333 TON/day. Same pattern as
  // white/earth: unlocked flag + bundle counter; planet state lives in
  // collection_planets with kind='black'.
  blackCollectionUnlocked: boolean("black_collection_unlocked").notNull().default(false),
  blackCollectionBundles: integer("black_collection_bundles").notNull().default(0),
  // Earned TON balance — credited by staking accrual, collection-planet
  // collections, admin /credit-ton, and withdrawal refunds. ONLY this balance
  // can be withdrawn. NEVER credited from external deposits.
  // NOTE: column name kept as `ton_balance` for backward compatibility with
  // existing production data; semantically this is now "earned balance".
  tonBalance: real("ton_balance").notNull().default(0),
  // Deposit TON balance — credited exclusively by external TonConnect deposits
  // (/ton/deposit/confirm). ONLY this balance can be spent in the Shop. NEVER
  // withdrawable to an external wallet (one-way: deposit → spend in-game).
  depositBalance: real("deposit_balance").notNull().default(0),
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
  // HALL OF FAME — Daily Referrals.
  // `dailyReferralCount` is the number of *new* successful referrals this
  // user has earned during the current UTC day. `dailyReferralDayKey` is
  // the YYYY-MM-DD UTC key the counter belongs to: when a new referral comes
  // in and the stored key differs from today, the counter resets to 1 in
  // the same atomic UPDATE (mirror of the stardust day-key reset pattern).
  // A nightly cron reads the top 5 by this counter at 00:00 UTC, credits
  // stardust prizes (100/75/50/25/25), then zeros the counter for everyone.
  // Naming note: the singular `daily_referral_count` already existed as an
  // empty orphan column in production; we reuse it instead of creating a
  // new `daily_referrals_count`, both to avoid leaving two ghost columns
  // and to keep the migration purely additive (only the new day_key column
  // is created by ALTER TABLE).
  dailyReferralCount: integer("daily_referral_count").notNull().default(0),
  dailyReferralDayKey: text("daily_referral_day_key"),
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
  claimedBonusMythic: integer("claimed_bonus_mythic").notNull().default(0),
  claimedBonusPlasma: integer("claimed_bonus_plasma").notNull().default(0),
  claimedBonusV1: integer("claimed_bonus_v1").notNull().default(0),
  claimedBonusV1NftPlatinum: integer("claimed_bonus_v1_nft_platinum").notNull().default(0),
  // ─────────────────────────────────────────────────────────────────────
  // HOME — pixel-art Comfort Zone (Phase 1: server foundations).
  //
  // Gated room with 3 display slots (A/B/C) where the user can place
  // shop-bought items. Unlock cost = 1000 stardust ONE-TIME, additionally
  // gated on owning the SUN (sun_count >= 1). Once unlocked it stays
  // unlocked forever (no re-charge). Slot columns store an item id
  // (e.g. "computer") or NULL for empty. Currently only "computer" is a
  // valid item id; future items will extend the validation list.
  //
  // COMPUTER item (sold in Shop for 5000 stardust): owning a computer
  // unlocks a 24h farming cycle that produces 25 stardust per claim.
  // `computerOwnedAt` is set on purchase (and never cleared — items
  // are non-refundable). `computerLastClaimAt` is set on purchase
  // (so the first claim is exactly 24h after buying, not instant) and
  // reset to now() on every successful claim. Both are NULL while the
  // user has not bought the computer yet, which is also the cheapest
  // "owned?" check (`computerOwnedAt IS NOT NULL`).
  // ─────────────────────────────────────────────────────────────────────
  homeUnlocked: boolean("home_unlocked").notNull().default(false),
  homeUnlockedAt: timestamp("home_unlocked_at"),
  homeSlotA: text("home_slot_a"),
  homeSlotB: text("home_slot_b"),
  homeSlotC: text("home_slot_c"),
  computerOwnedAt: timestamp("computer_owned_at"),
  computerLastClaimAt: timestamp("computer_last_claim_at"),
  // Easter-egg: tapping the COMPUTER on the HOME screen can drop a
  // one-off 200 $ZOOM bonus once every 24h (in addition to the regular
  // 25 stardust claim). Tracked server-side so a cache wipe or extra
  // device cannot re-claim. NULL = never claimed yet → first tap drops
  // the bonus immediately.
  computerZoomBonusLastAt: timestamp("computer_zoom_bonus_last_at"),

  // ─────────────────────────────────────────────────────────────────────
  // PLANT item (sold in Shop for 10,000 stardust): a virtual pixel-art
  // plant the user grows by watering. 10 levels (1=seed → 10=Stellar
  // Plant). Each watering costs 100 stardust, gives +10 XP, with a
  // 12h cooldown. 100 XP per level → exactly 10 waterings per level.
  //
  // Once the plant reaches level 10 it stops accepting water and starts
  // generating 0.1 TON every 30 days, claimable on demand (mirrors the
  // computer claim flow). On the 9→10 transition we stamp
  // `plantLastClaimAt = NOW()` so the first TON drop is exactly 30 days
  // after maturing, not instant.
  //
  // All five columns are NULL/default for a user that hasn't bought the
  // seed yet (`plantOwnedAt IS NULL` is the cheapest "owned?" check).
  // ─────────────────────────────────────────────────────────────────────
  plantOwnedAt: timestamp("plant_owned_at"),
  plantLevel: integer("plant_level").notNull().default(1),
  plantXp: integer("plant_xp").notNull().default(0),
  plantLastWaterAt: timestamp("plant_last_water_at"),
  plantLastClaimAt: timestamp("plant_last_claim_at"),

  // ─────────────────────────────────────────────────────────────────────
  // ANTI-ABUSE — disable flag.
  //
  // Set TRUE by admin to lock an account out of money-impacting flows:
  //   • cannot LIST a planet on the marketplace
  //   • cannot BUY a planet on the marketplace
  //   • cannot REQUEST a TON withdrawal
  // The user can still log in and see their UI; they just can't move
  // value in/out. Used to freeze accounts caught running referral-farm
  // alts that buy from their own referrer to launder ZOOM into TON.
  // ─────────────────────────────────────────────────────────────────────
  isDisabled: boolean("is_disabled").notNull().default(false),

  // Monotonic write-time used to fence out stale saves of `planets_json`.
  // The save endpoint rejects any incoming write whose `client_write_at_ms`
  // is <= the stored value. Using the client's clock is fine because a
  // single user is the only writer (server-clock skew across devices is
  // small) and we only care about ORDER, not absolute time.
  planetsUpdatedAtMs: bigint("planets_updated_at_ms", { mode: "number" }).notNull().default(0),

  // ─────────────────────────────────────────────────────────────────────
  // LEGACY / DEPRECATED COLUMNS — DO NOT REMOVE.
  //
  // These columns were created in production by past iterations of the
  // schema and are no longer read or written by any code path. They are
  // declared here ONLY so the Replit Publishing migration validator does
  // NOT propose dropping them — DROP COLUMN is a destructive change and
  // would fail the publish check (it's also irreversible without a DB
  // restore). Leaving them alone is harmless; Postgres just stores zeros
  // / NULLs for them. If you're certain they can go, write an explicit
  // migration to drop them in a separate, reviewed deploy.
  // ─────────────────────────────────────────────────────────────────────
  bonusComet: integer("bonus_comet").notNull().default(0),
  totalCraftedComet: integer("total_crafted_comet").notNull().default(0),
  claimedBonusComet: integer("claimed_bonus_comet").notNull().default(0),
  cometStardustSettledAtMs: bigint("comet_stardust_settled_at_ms", { mode: "number" }).notNull().default(0),
  pendingWheelClaim: jsonb("pending_wheel_claim"),
  lastFarmingSettledAtMs: bigint("last_farming_settled_at_ms", { mode: "number" }).notNull().default(0),

  // ─────────────────────────────────────────────────────────────────────
  // TON STAKING — V1 set & SUN set.
  //
  // The user can lock 4 V1 (or 4 SUN) into a "staking set" that yields a
  // FIXED 0.5 TON / 30 days for the entire set (NOT per planet). The
  // server only stores the activation timestamp; the live counter and the
  // claimable amount are derived: accrued = (now - startedAt) / 30d * 0.5.
  //
  // 0 = "not staking". > 0 = epoch ms of the activation. The eligibility
  // (≥4 V1 or ≥4 SUN) is re-checked at start-time only — once the set is
  // staked, selling/burning the underlying planets does not auto-stop the
  // accrual (admin can intervene if abused). This mirrors how SUN_FARM_*
  // is treated as a pure timestamp pair, not a denormalised counter.
  // ─────────────────────────────────────────────────────────────────────
  stakingV1StartedAtMs: bigint("staking_v1_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingV1AccruedTon: real("staking_v1_accrued_ton").notNull().default(0),
  stakingV1LastSettledAtMs: bigint("staking_v1_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  stakingSunStartedAtMs: bigint("staking_sun_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingSunAccruedTon: real("staking_sun_accrued_ton").notNull().default(0),
  stakingSunLastSettledAtMs: bigint("staking_sun_last_settled_at_ms", { mode: "number" }).notNull().default(0),

  // ─────────────────────────────────────────────────────────────────────
  // TON STAKING — extended rarities (BASIC / RARE / EPIC / MYTHIC / GOLD).
  //
  // Unlike V1 / SUN (continuous accrual after activation), these tiers
  // require all 4 underlying planets to be ACTIVELY FARMING (within the
  // 24h cycle, not listed on the marketplace) for accrual to progress.
  // We therefore can't compute reward as `(now - startedAt) * rate`;
  // we maintain a settled snapshot (`*AccruedTon`) plus the timestamp
  // of the last settle (`*LastSettledAtMs`). Each /staking/status call
  // settles the delta IF eligibility holds at that moment, otherwise
  // it just advances `*LastSettledAtMs` without crediting (so the gap
  // is silently skipped). `*StartedAtMs` > 0 is the on/off sentinel
  // (kept once activated even if planets later go inactive — user can
  // resume by reactivating their farms).
  //
  // SUN-in-inventory requirement is enforced ONLY at /staking/start
  // for these tiers (mirrors how V1 / SUN don't auto-stop on later
  // changes to the underlying planets).
  // ─────────────────────────────────────────────────────────────────────
  stakingBasicStartedAtMs: bigint("staking_basic_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingBasicAccruedTon: real("staking_basic_accrued_ton").notNull().default(0),
  stakingBasicLastSettledAtMs: bigint("staking_basic_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  stakingRareStartedAtMs: bigint("staking_rare_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingRareAccruedTon: real("staking_rare_accrued_ton").notNull().default(0),
  stakingRareLastSettledAtMs: bigint("staking_rare_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  stakingEpicStartedAtMs: bigint("staking_epic_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingEpicAccruedTon: real("staking_epic_accrued_ton").notNull().default(0),
  stakingEpicLastSettledAtMs: bigint("staking_epic_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  stakingMythicStartedAtMs: bigint("staking_mythic_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingMythicAccruedTon: real("staking_mythic_accrued_ton").notNull().default(0),
  stakingMythicLastSettledAtMs: bigint("staking_mythic_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  stakingGoldStartedAtMs: bigint("staking_gold_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingGoldAccruedTon: real("staking_gold_accrued_ton").notNull().default(0),
  stakingGoldLastSettledAtMs: bigint("staking_gold_last_settled_at_ms", { mode: "number" }).notNull().default(0),
  // PLASMA — new rarity between Mythic and Gold. 0.25 TON/month staking reward
  // with 4 active PLASMA planets + active SUN. Same gated-accrual model as gold.
  stakingPlasmaStartedAtMs: bigint("staking_plasma_started_at_ms", { mode: "number" }).notNull().default(0),
  stakingPlasmaAccruedTon: real("staking_plasma_accrued_ton").notNull().default(0),
  stakingPlasmaLastSettledAtMs: bigint("staking_plasma_last_settled_at_ms", { mode: "number" }).notNull().default(0),

  // ─────────────────────────────────────────────────────────────────────
  // PENDING ZOOM CREDITS — race-free server→client credit channel.
  //
  // PROBLEM: a marketplace sale credits the seller via
  // `zoom_balance += price; balance_epoch += 1`, but the client's
  // /balance/sync uses CASE WHEN epoch > ce THEN stored ELSE GREATEST(0, client).
  // For an ACTIVELY-PLAYING seller whose local balance has grown past the
  // server's stored value (active farming/tap-crafting between syncs),
  // the next sync's ELSE branch overwrites the server-credited value
  // with the higher local value, silently losing the sale price.
  //
  // FIX: marketplace seller credits are written here INSTEAD of directly
  // bumping zoom_balance/balance_epoch. /balance/sync atomically adds
  // this field on top of the post-CASE balance and zeroes it (Postgres
  // UPDATE SET reads OLD column values on the RHS, so the read-clear is
  // race-free against concurrent credit appends, which serialize on the
  // row lock). The next sync after a sale therefore always shows the
  // credit, regardless of how active the seller was in between.
  // ─────────────────────────────────────────────────────────────────────
  pendingZoomCredits: real("pending_zoom_credits").notNull().default(0),

  // ─────────────────────────────────────────────────────────────────────
  // MONTHLY LAB LEADERBOARD
  //
  // `labPoints` accumula +1 per ogni pianeta forgiato nel Lab (claim
  // confermato), gated server-side da /craft/record SOLO se l'utente:
  //   1. possiede almeno 1 SUN (sun_count > 0)
  //   2. ha pagato la quota d'iscrizione del round attivo corrente
  //      (labRoundId == lab_rounds.id WHERE status='active')
  //
  // Alla chiusura del round (manuale, admin), labPoints viene resettato
  // a 0 per TUTTI gli utenti e si apre un nuovo round con id diverso —
  // così il check `labRoundId == active_round.id` cade automaticamente
  // e nessuno accumula punti finché non rip-aga.
  // ─────────────────────────────────────────────────────────────────────
  labPoints: integer("lab_points").notNull().default(0),
  labRoundId: integer("lab_round_id").notNull().default(0),
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
  // Anchors the listing to a specific planet inside the seller's
  // `users.planets_json` array. Required for all NEW listings (the
  // /market/list handler validates ownership against this id), nullable
  // because pre-existing rows from before the ownership-check fix do
  // not have it. The unique partial index below uses this column to
  // close the "list the same planet twice" / "re-list a sold planet"
  // money exploits.
  planetId: text("planet_id"),
  // Snapshot of the planet's "Float" value (0.000 — 1.000) at listing
  // time, in the spirit of CS:GO skin floats. Purely cosmetic, drives
  // the perfection bar shown on the marketplace card. Nullable for
  // legacy listings created before the feature shipped — the client
  // falls back to a deterministic value derived from planet_id when
  // missing, so old listings still render without an "empty" gap.
  planetFloat: real("planet_float"),
  // Snapshot of the planet's user-chosen displayName at listing time
  // (set by the paid /planets/rename endpoint). Lets the marketplace
  // card show "Eos-Prime" instead of the bare rarity "Basic" without
  // a join back to the seller's planets_json. Nullable for legacy
  // listings AND for planets that were never renamed (UI then falls
  // back to the rarity label).
  planetDisplayName: text("planet_display_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  soldAt: timestamp("sold_at"),
  lastActivatedAt: timestamp("last_activated_at"),
}, (table) => [
  index("idx_market_status").on(table.status),
  index("idx_market_seller").on(table.sellerTelegramId),
  // CRITICAL anti-exploit constraint. A planet that has ever been
  // listed (currently active OR already sold) by a given seller can
  // never appear in a NEW active listing from that same seller. This
  // is what stops:
  //   • selling the same planet to two different buyers
  //   • re-listing a planet after it was sold (would let the seller
  //     receive multiple ZOOM payments for what is effectively one
  //     planet, and ZOOM converts to TON — real money loss)
  // Delisted listings are intentionally NOT in the partial filter so
  // a seller can take back a planet and re-list it later. NULL
  // planet_id rows (legacy, pre-fix) are excluded so they don't
  // collide with anything.
  uniqueIndex("uq_market_seller_planet_active_sold")
    .on(table.sellerTelegramId, table.planetId)
    .where(sql`status IN ('active', 'sold') AND planet_id IS NOT NULL`),
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
