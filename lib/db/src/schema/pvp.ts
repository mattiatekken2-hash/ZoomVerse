import { pgTable, text, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * PvP BATTLES — Duelli planet-to-planet.
 *
 * Ogni riga rappresenta una battaglia completata (o in corso). Il matchmaking
 * attivo vive in memoria (non in DB) per evitare round-trip PostgreSQL ad ogni
 * secondo. Solo lo stato finale viene persistito.
 *
 * Status: 'pending' → 'confirmed' → 'roulette' → 'completed' | 'cancelled'
 */
export const pvpBattlesTable = pgTable("pvp_battles", {
  id: serial("id").primaryKey(),
  // Player 1 (chi ha creato la coda)
  player1TelegramId: text("player1_telegram_id").notNull(),
  player1PlanetId: text("player1_planet_id").notNull(),
  player1PlanetName: text("player1_planet_name").notNull(),
  player1PlanetRarity: text("player1_planet_rarity").notNull(),
  // Player 2 (avversario trovato)
  player2TelegramId: text("player2_telegram_id").notNull(),
  player2PlanetId: text("player2_planet_id").notNull(),
  player2PlanetName: text("player2_planet_name").notNull(),
  player2PlanetRarity: text("player2_planet_rarity").notNull(),
  // Stato
  status: text("status").notNull().default("pending"),
  // Vincitore
  winnerTelegramId: text("winner_telegram_id"),
  // Chi ha confermato (bitmask: 1 = p1, 2 = p2, 3 = entrambi)
  confirmedMask: integer("confirmed_mask").notNull().default(0),
  // Timestamp
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  // Lookup per partecipante
  index("idx_pvp_player1").on(table.player1TelegramId, table.createdAt),
  index("idx_pvp_player2").on(table.player2TelegramId, table.createdAt),
  // Status per query admin
  index("idx_pvp_status").on(table.status),
]);

export type PvpBattleRow = typeof pvpBattlesTable.$inferSelect;
export type PvpBattleInsert = typeof pvpBattlesTable.$inferInsert;

/**
 * PvP DAILY PAIRS — anti-win-trading guard.
 *
 * Conta quante volte `winner` ha battuto lo stesso `opponent` nello stesso
 * giorno UTC (`dayKey`). Il sistema assegna +1 punto in classifica solo per
 * le prime N vittorie (MAX_POINTS_PER_OPPONENT) contro lo stesso avversario;
 * le vittorie successive nello stesso giorno non danno punti (ma il pianeta
 * viene comunque trasferito). Le righe stantie (dayKey < oggi) vengono
 * eliminate dal cron di reset notturno insieme allo zeramento dei contatori.
 */
export const pvpDailyPairsTable = pgTable("pvp_daily_pairs", {
  id: serial("id").primaryKey(),
  winnerTelegramId: text("winner_telegram_id").notNull(),
  opponentTelegramId: text("opponent_telegram_id").notNull(),
  dayKey: text("day_key").notNull(),
  winCount: integer("win_count").notNull().default(0),
}, (table) => [
  uniqueIndex("pvp_daily_pairs_uniq").on(
    table.winnerTelegramId,
    table.opponentTelegramId,
    table.dayKey,
  ),
  index("idx_pvp_pairs_daykey").on(table.dayKey),
]);

export type PvpDailyPairRow = typeof pvpDailyPairsTable.$inferSelect;
export type PvpDailyPairInsert = typeof pvpDailyPairsTable.$inferInsert;
