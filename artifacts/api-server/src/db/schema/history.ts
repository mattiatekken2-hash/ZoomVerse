import { pgTable, text, serial, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * HISTORY — Cronologia personale delle azioni dell'utente.
 *
 * Ogni riga rappresenta un evento monetario o di stato (claim farming,
 * acquisto/vendita marketplace, deposito TON, reward admin, spin ruota,
 * ecc.). Mostrata nel frontend cliccando sul balance ZOOM. Retention
 * automatica a 48h via cron in `api-server/src/index.ts`
 * (`startHistoryCleanupCron`).
 *
 * Modello "best-effort": gli helper `recordHistory*` non bloccano mai il
 * flusso monetario principale. Se l'INSERT fallisce per qualunque motivo
 * il log dell'azione si perde ma la transazione monetaria resta valida.
 */
export const historyTable = pgTable("history", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  // Codice evento, es. "farming_claim", "market_buy", "market_sale",
  // "wheel_prize", "daily_claim", "stardust_collect", "deposit",
  // "withdraw", "admin_reward", "admin_remove", "redeem_code",
  // "ton_purchase", "stars_purchase", "plant_buy", "plant_water",
  // "plant_claim", "computer_buy", "computer_claim", "lottery_buy",
  // "staking_start", "merchant_fuse".
  kind: text("kind").notNull(),
  // Variazione SIGNED del bilancio nella valuta indicata. 0 se è un
  // semplice marker di evento (es. "staking_start").
  delta: real("delta").notNull().default(0),
  // "zoom" | "ton" | "stardust" | "stars" | "spins" | "planet" | "none"
  currency: text("currency").notNull().default("zoom"),
  // Metadati opzionali per render lato client (es. nome pianeta, prezzo,
  // raro). Mai usati per logica monetaria.
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Lookup principale: tutte le azioni di un utente in ordine cronologico
  // discendente — query di /history/list.
  index("idx_history_user_time").on(table.telegramId, table.createdAt),
  // Sweep 48h: la cron gira ogni ora ed elimina rows con createdAt < now-48h
  // a colpi di batch. L'indice rende il DELETE O(rows-cancellate) anziché
  // O(N) sulla tabella intera.
  index("idx_history_created_at").on(table.createdAt),
]);

export type HistoryRow = typeof historyTable.$inferSelect;
export type HistoryInsert = typeof historyTable.$inferInsert;
