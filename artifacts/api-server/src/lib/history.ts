import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Currency / valore associato all'evento. "none" per i marker (es.
 * staking_start) che non muovono nessun bilancio ma che vogliamo
 * comunque mostrare nella cronologia personale dell'utente.
 */
export type HistoryCurrency =
  | "zoom"
  | "ton"
  | "stardust"
  | "stars"
  | "spins"
  | "planet"
  | "none";

export interface RecordHistoryParams {
  telegramId: string;
  kind: string;
  delta: number;
  currency: HistoryCurrency;
  meta?: Record<string, unknown> | null;
}

/**
 * Best-effort insert nella cronologia personale.
 *
 * Garanzie:
 *  - NON throwa MAI: qualunque errore viene loggato e ingoiato per non
 *    rompere il flusso monetario principale (claim, buy, sale, ecc.).
 *  - Skippa silenziosamente input invalidi (telegramId vuoto, delta
 *    non finito) anziché inserire righe rotte.
 *  - Usa `db.execute(sql)` per restare disaccoppiato dal tipo
 *    `PgTransaction` di Drizzle — può essere chiamato dopo un commit
 *    o accanto a un'altra transazione senza problemi.
 *
 * Volutamente NON wrappata in nessuna transazione del chiamante: il
 * logging deve sopravvivere a un rollback monetario solo quando il
 * chiamante lo decide. Per ora viene chiamata dopo che il flusso
 * monetario è committato → se l'INSERT fallisce, perdiamo solo la
 * riga di history per quell'azione.
 */
export async function recordHistory(params: RecordHistoryParams): Promise<void> {
  const { telegramId, kind, currency } = params;
  const delta = Number.isFinite(params.delta) ? params.delta : 0;
  if (!telegramId || !kind) return;
  try {
    const metaJson = params.meta ? JSON.stringify(params.meta) : null;
    await db.execute(sql`
      INSERT INTO history (telegram_id, kind, delta, currency, meta)
      VALUES (${telegramId}, ${kind}, ${delta}, ${currency}, ${metaJson}::jsonb)
    `);
  } catch (err) {
    logger.warn({ err, kind, telegramId }, "[history] insert failed (ignored)");
  }
}

/**
 * Variante fire-and-forget: non bloccare il caller. Comodo dopo un
 * res.json() per scrivere in background senza aggiungere latenza alla
 * response. Errori già gestiti dentro `recordHistory`.
 */
export function recordHistoryAsync(params: RecordHistoryParams): void {
  void recordHistory(params);
}

/**
 * Sweep di retention: cancella tutte le righe più vecchie di
 * `RETENTION_HOURS`. Idempotente, safe-to-spam — l'indice
 * `idx_history_created_at` rende il DELETE proporzionale al numero di
 * righe scadute, non alla dimensione totale della tabella.
 */
export const HISTORY_RETENTION_HOURS = 48;

export async function purgeExpiredHistory(): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM history
    WHERE created_at < NOW() - (${HISTORY_RETENTION_HOURS}::int || ' hours')::interval
  `);
  // node-postgres reports affected row count on `rowCount`.
  const r = result as unknown as { rowCount?: number };
  return r.rowCount ?? 0;
}
