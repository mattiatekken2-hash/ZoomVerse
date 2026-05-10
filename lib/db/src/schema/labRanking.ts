import { pgTable, text, integer, timestamp, real, index, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * MONTHLY LAB LEADERBOARD
 *
 * Stagione di un mese (chiusura manuale dall'admin). Ogni utente paga
 * 1 TON per iscriversi, deve possedere SUN, e accumula `lab_points`
 * (+1 per ogni pianeta forgiato nel Lab — vedi /craft/record).
 *
 * Il pool TON cumula tutte le quote d'iscrizione del round attivo.
 * Alla chiusura: 80% al #1 (pagato manualmente dall'admin), 20% profit;
 * Stardust auto-payouts per i ranghi 2-20.
 *
 * Race-safety: partial UNIQUE su status='active' garantisce un solo round
 * attivo alla volta (stesso pattern di lotto_rounds).
 */
export const labRoundsTable = pgTable("lab_rounds", {
  id: serial("id").primaryKey(),
  // active | closed
  status: text("status").notNull().default("active"),
  participants: integer("participants").notNull().default(0),
  poolTon: real("pool_ton").notNull().default(0),
  // Soglia di attivazione della Top100 (default 20 — cambiando qui il
  // valore di default NON modifica i round già esistenti).
  threshold: integer("threshold").notNull().default(20),
  // Compilati alla chiusura
  winnerTelegramId: text("winner_telegram_id"),
  winnerLabPoints: integer("winner_lab_points"),
  prizeTon: real("prize_ton"),
  profitTon: real("profit_ton"),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_lab_rounds_status").on(table.status),
  uniqueIndex("uniq_lab_active_round").on(table.status).where(sql`status = 'active'`),
]);

export type LabRound = typeof labRoundsTable.$inferSelect;
