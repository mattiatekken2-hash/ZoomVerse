import { pgTable, text, integer, timestamp, real, index, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * CRAFT (LAB) LEADERBOARD
 *
 * Stagione a tempo fisso di 60 giorni, gratuita e aperta a TUTTI: nessuna
 * quota d'iscrizione, nessun requisito SUN. Ogni utente parte da 0 e
 * accumula `lab_points` (+1 per ogni pianeta forgiato nel Lab — vedi
 * /craft/record), iscrivendosi automaticamente al round attivo al primo
 * craft.
 *
 * Montepremi fisso di 60 ★ (Stardust) distribuito alla Top 30 alla chiusura
 * (1°=12, 2°=8, 3°=6, 4°-10°=2, 11°-30°=1 — somma 60). I premi
 * vengono accreditati automaticamente sul saldo Stardust in-app. Alla
 * scadenza dei 60 giorni un cron chiude il round, paga, azzera i punti
 * di tutti e apre un nuovo round con un nuovo `ends_at`.
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
  // Soglia legacy (non più usata come gate; mantenuta per compatibilità
  // dello storico round già esistenti).
  threshold: integer("threshold").notNull().default(20),
  // Scadenza del round: createdAt + 60 giorni. Nullable per i round
  // legacy creati prima di questa colonna — il backfill avviene in
  // getOrCreateActiveLabRound / nel cron di settlement.
  endsAt: timestamp("ends_at"),
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
