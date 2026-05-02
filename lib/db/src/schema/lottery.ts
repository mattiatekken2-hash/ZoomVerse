import { pgTable, text, integer, timestamp, real, index, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * LOTTO STELLARE — Sistema di lotteria a probabilità ponderate.
 *
 * Modello a "round":
 *  - Esiste sempre un round con `status='active'`. Tutti i biglietti acquistati
 *    via TON entrano in quel round.
 *  - Quando l'admin esegue `/admin/lottery/draw`, il round viene marcato
 *    `status='drawn'`, viene scelto un vincitore con peso = ticket_count
 *    (sorteggio ponderato), e viene creato automaticamente un nuovo round
 *    attivo per le vendite future.
 *  - L'accredito del premio TON al vincitore è MANUALE (effettuato dall'admin
 *    fuori-app dal proprio wallet personale).
 *
 * Anti-doppio-credito:
 *  - `txn_id` ha un UNIQUE CONSTRAINT che fa riferimento alla riga in
 *    `transactions` (creata dal flusso /ton/confirm già rodato). La
 *    transaction esterna garantisce l'idempotency: ogni BOC TON valido
 *    produce esattamente UNA riga in `lotto_tickets`.
 *
 * Contatori cumulativi:
 *  - `total_collected_ton` e `total_tickets` sul round vengono incrementati
 *    nella STESSA transazione DB del credit, quindi non possono mai
 *    divergere dalla somma dei ticket associati.
 */

export const lottoRoundsTable = pgTable("lotto_rounds", {
  id: serial("id").primaryKey(),
  // active | drawn
  status: text("status").notNull().default("active"),
  // Somma di tutti i pagamenti TON ricevuti per i biglietti del round.
  totalCollectedTon: real("total_collected_ton").notNull().default(0),
  // Somma di tutte le "voci" (ticket_count) del round.
  totalTickets: integer("total_tickets").notNull().default(0),
  // Compilato solo dopo l'estrazione.
  winnerTelegramId: text("winner_telegram_id"),
  // Numero di biglietti che il vincitore aveva al momento dell'estrazione.
  winnerTickets: integer("winner_tickets"),
  // Premio dovuto al vincitore (90% del raccolto al momento del draw).
  prizeTon: real("prize_ton"),
  // Profitto netto admin (10% del raccolto al momento del draw).
  profitTon: real("profit_ton"),
  drawnAt: timestamp("drawn_at"),
  // Admin che ha effettuato il draw (audit). Per i draw automatici del cron
  // settimanale viene salvata la stringa "system".
  drawnBy: text("drawn_by"),
  // Quando il cron settimanale deve estrarre questo round automaticamente.
  // Default = NOW() + 7 giorni. Per round già esistenti al momento del
  // ALTER TABLE, PostgreSQL backfilla con il valore corrente di NOW()+7d
  // (cioè 7 giorni dopo il push della migration), quindi il primo draw
  // automatico parte una settimana dal deploy. Quando il cron riscontra
  // un round senza biglietti venduti, prolunga `next_draw_at` di 7 giorni
  // anziché estrarre, evitando draw vuoti.
  nextDrawAt: timestamp("next_draw_at").notNull().default(sql`NOW() + INTERVAL '7 days'`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_lotto_rounds_status").on(table.status),
  index("idx_lotto_rounds_created_at").on(table.createdAt),
  // Partial UNIQUE index: garantisce che possa esistere AL MASSIMO un round
  // con status='active' in qualunque momento. Questo elimina la necessità
  // dell'advisory lock dentro registerLottoTicketPurchase (che era pericoloso
  // perché veniva acquisito DOPO le row-lock su transactions, creando un
  // potenziale ciclo di deadlock con flussi futuri). Adesso l'inserimento
  // del round attivo iniziale può usare INSERT...ON CONFLICT DO NOTHING in
  // modo lock-free e race-safe.
  uniqueIndex("uniq_lotto_active_round").on(table.status).where(sql`status = 'active'`),
]);

export const lottoTicketsTable = pgTable("lotto_tickets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull(),
  telegramId: text("telegram_id").notNull(),
  // Numero di biglietti acquistati con QUESTO singolo pagamento. Il bundle
  // 1 = 1, bundle 15 = 15, bundle 40 = 40. Il "peso" totale dell'utente in
  // un round è la SOMMA di questa colonna su tutte le sue righe del round.
  ticketCount: integer("ticket_count").notNull(),
  // TON pagati per questo bundle (server-authoritative).
  tonPaid: real("ton_paid").notNull(),
  // Bundle id (lotto_ticket_1 | lotto_ticket_15 | lotto_ticket_40).
  bundleId: text("bundle_id").notNull(),
  // FK logica a transactions.id — UNIQUE garantisce idempotency end-to-end.
  txnId: integer("txn_id").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_lotto_tickets_round").on(table.roundId),
  index("idx_lotto_tickets_telegram").on(table.telegramId),
  index("idx_lotto_tickets_round_telegram").on(table.roundId, table.telegramId),
]);

export type LottoRound = typeof lottoRoundsTable.$inferSelect;
export type LottoTicket = typeof lottoTicketsTable.$inferSelect;
