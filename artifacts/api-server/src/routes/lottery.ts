import { Router, type IRouter } from "express";
import { db } from "../db";
import { lotteryTable, ticketsTable } from "../db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ID = "8144744644";
const PRIZE_PCT = 0.9;   // 90% del raccolto va al vincitore
const PROFIT_PCT = 0.1;  // 10% rimane all'admin
// Frequenza estrazione automatica del Lotto Stellare. L'utente vuole
// una settimana esatta tra un draw e il successivo.
const DRAW_INTERVAL_DAYS = 7;

function isAdmin(adminId: string | undefined): boolean {
  return !!adminId && adminId === ADMIN_ID;
}

/**
 * Restituisce il round attivo, creandone uno nuovo se non esiste. Race-safe
 * grazie al partial UNIQUE index `uniq_lotto_active_round` su
 * lotto_rounds(status) WHERE status='active': se due chiamate concorrenti
 * tentano di INSERT, una vince e l'altra cade su ON CONFLICT DO NOTHING e
 * rilegge la riga creata dal vincitore. Niente advisory lock — quindi
 * nessun rischio di deadlock con transazioni esterne che hanno già preso
 * row-lock su altre tabelle (es. `transactions`).
 */
async function getOrCreateActiveRound(): Promise<{ id: number; totalCollectedTon: number; totalTickets: number; createdAt: Date }> {
  const [existing] = await db
    .select()
    .from(lottoRoundsTable)
    .where(eq(lottoRoundsTable.status, "active"))
    .limit(1);
  if (existing) return existing;

  // Tenta l'insert. ON CONFLICT DO NOTHING grazie al partial unique index.
  await db
    .insert(lottoRoundsTable)
    .values({ status: "active", totalCollectedTon: 0, totalTickets: 0 })
    .onConflictDoNothing();

  // Rileggi: o l'abbiamo creato noi, o l'ha creato un'altra richiesta in race.
  const [round] = await db
    .select()
    .from(lottoRoundsTable)
    .where(eq(lottoRoundsTable.status, "active"))
    .limit(1);
  if (!round) throw new Error("FAILED_TO_GET_ACTIVE_ROUND");
  return round;
}

/**
 * GET /lottery/state?telegramId=...
 * Dashboard utente: jackpot attuale, biglietti totali del round, biglietti
 * dell'utente, % di vincita.
 */
router.get("/lottery/state", async (req, res) => {
  try {
    // Identita' utente: preferiamo il telegramId verificato HMAC dall'initData
    // (impostato dal middleware `attachVerifiedTgUser`). Se la verifica HMAC
    // non e' disponibile (alcuni client Telegram producono firme che la nostra
    // implementazione non riesce a validare), accettiamo come fallback la
    // query string `telegramId` — esattamente lo stesso modello di sicurezza
    // di tutti gli altri endpoint GET dell'app (es. `/profile/:id`,
    // `/balance/:id`). I dati esposti sono solo: numero di biglietti propri e
    // % di vincita, nessun dato sensibile.
    const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : "";
    const queryIdRaw = req.query.telegramId;
    const queryId = typeof queryIdRaw === "string" ? queryIdRaw.trim() : "";
    const telegramId = verifiedId || queryId;
    const round = await getOrCreateActiveRound();

    // Biglietti dell'utente nel round attivo (somma).
    let userTickets = 0;
    if (telegramId) {
      const [row] = await db
        .select({ s: sql<number>`COALESCE(SUM(${lottoTicketsTable.ticketCount}), 0)::int` })
        .from(lottoTicketsTable)
        .where(sql`${lottoTicketsTable.roundId} = ${round.id} AND ${lottoTicketsTable.telegramId} = ${telegramId}`);
      userTickets = Number(row?.s ?? 0);
    }

    const total = Number(round.totalTickets || 0);
    const jackpotTon = Number(round.totalCollectedTon || 0) * PRIZE_PCT;
    const winChance = total > 0 ? (userTickets / total) * 100 : 0;

    res.set("Cache-Control", "no-store");
    res.json({
      roundId: round.id,
      jackpotTon,
      totalCollectedTon: Number(round.totalCollectedTon || 0),
      totalTickets: total,
      userTickets,
      winChancePct: winChance,
      // Timestamp ISO della prossima estrazione automatica. Il client può
      // mostrare un countdown e gli utenti sanno quando aspettarsi il draw.
      nextDrawAt: round.nextDrawAt instanceof Date
        ? round.nextDrawAt.toISOString()
        : new Date(round.nextDrawAt as unknown as string).toISOString(),
      bundles: [
        { id: "lotto_ticket_1",  tickets: 1,  tonPrice: 0.1 },
        { id: "lotto_ticket_15", tickets: 15, tonPrice: 1.0 },
        { id: "lotto_ticket_40", tickets: 40, tonPrice: 2.5 },
      ],
    });
  } catch (err) {
    logger.error({ err }, "[lottery/state] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * GET /admin/lottery/dashboard?adminId=...
 * Dashboard admin con totali del round attivo + storico ultimi round chiusi.
 */
router.get("/admin/lottery/dashboard", async (req, res) => {
  try {
    const adminId = (req.query["adminId"] as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const round = await getOrCreateActiveRound();
    const totalCollected = Number(round.totalCollectedTon || 0);
    const prizeToPay = totalCollected * PRIZE_PCT;
    const myNetProfit = totalCollected * PROFIT_PCT;

    // Top buyers del round attivo (max 10).
    const topBuyersRows = await db
      .select({
        telegramId: lottoTicketsTable.telegramId,
        tickets: sql<number>`COALESCE(SUM(${lottoTicketsTable.ticketCount}), 0)::int`,
        ton: sql<number>`COALESCE(SUM(${lottoTicketsTable.tonPaid}), 0)::float`,
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(lottoTicketsTable)
      .leftJoin(usersTable, eq(usersTable.telegramId, lottoTicketsTable.telegramId))
      .where(eq(lottoTicketsTable.roundId, round.id))
      .groupBy(lottoTicketsTable.telegramId, usersTable.username, usersTable.firstName)
      .orderBy(sql`SUM(${lottoTicketsTable.ticketCount}) DESC`)
      .limit(10);

    // Numero di partecipanti distinti.
    const [participantsRow] = await db
      .select({ c: sql<number>`COUNT(DISTINCT ${lottoTicketsTable.telegramId})::int` })
      .from(lottoTicketsTable)
      .where(eq(lottoTicketsTable.roundId, round.id));

    // Storico ultimi round chiusi.
    const history = await db
      .select()
      .from(lottoRoundsTable)
      .where(eq(lottoRoundsTable.status, "drawn"))
      .orderBy(desc(lottoRoundsTable.drawnAt))
      .limit(10);

    res.set("Cache-Control", "no-store");
    res.json({
      round: {
        id: round.id,
        createdAt: round.createdAt,
        nextDrawAt: round.nextDrawAt instanceof Date
          ? round.nextDrawAt.toISOString()
          : new Date(round.nextDrawAt as unknown as string).toISOString(),
        totalTickets: Number(round.totalTickets || 0),
        participants: Number(participantsRow?.c ?? 0),
      },
      totalCollectedTon: totalCollected,
      prizeToPayTon: prizeToPay,
      myNetProfitTon: myNetProfit,
      topBuyers: topBuyersRows,
      history,
    });
  } catch (err) {
    logger.error({ err }, "[admin/lottery/dashboard] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /admin/lottery/draw
 * Estrazione ponderata: ogni biglietto pesa 1, il vincitore è scelto con
 * probabilità proporzionale alla somma dei biglietti posseduti nel round.
 *
 * Implementazione SQL-based (server-side):
 *   - Calcola il total = SUM(ticket_count) del round
 *   - Estrae un cursore casuale in [0, total)
 *   - Scorre le righe lotto_tickets ordinate per id e trova quella in cui
 *     il cumulativo supera il cursore.
 *
 * Tutto in una transazione con advisory lock: se due admin cliccano "Draw"
 * contemporaneamente, solo uno completa il sorteggio. L'altro vede già
 * `status='drawn'` e riceve l'esito esistente (idempotency).
 */
/**
 * Risultato dell'estrazione. `kind` discrimina cosa fare: "drawn" = abbiamo
 * estratto un vincitore (broadcast), "no_tickets" = nessuno ha comprato
 * questa settimana e abbiamo riprogrammato il next_draw_at +7d, "no_round"
 * = nessun round attivo (caso anomalo, non dovrebbe accadere).
 */
export type DrawOutcome =
  | {
      kind: "drawn";
      roundId: number;
      winnerTelegramId: string;
      winnerTickets: number;
      winnerName: string | null;
      totalCollectedTon: number;
      prizeTon: number;
      profitTon: number;
      nextRoundId: number;
    }
  | { kind: "no_tickets"; roundId: number; rescheduledTo: Date }
  | { kind: "no_round" };

/**
 * Esegue l'estrazione del round attivo. Riutilizzabile sia dall'endpoint
 * admin manuale (`POST /admin/lottery/draw`) che dal cron settimanale
 * automatico (`startLotteryDrawCron` in index.ts). `executorId` viene
 * salvato nel campo `drawn_by` per audit ("system" per il cron).
 *
 * Idempotency: se due esecuzioni concorrenti partono (es. cron + click
 * admin nello stesso istante), l'advisory lock 7913042100 le serializza;
 * l'UPDATE ... WHERE status='active' garantisce che solo una vinca la
 * race e l'altra trovi il round già `drawn` ritornando `no_round`.
 */
export async function executeLotteryDraw(executorId: string): Promise<DrawOutcome> {
  // Caso speciale "no_tickets": il round non ha vendite. NON estraiamo
  // (non c'è nulla da estrarre) ma riprogrammiamo next_draw_at di altri 7
  // giorni, così la settimana successiva il cron riproverà.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042100)`);

    const [round] = await tx
      .select()
      .from(lottoRoundsTable)
      .where(eq(lottoRoundsTable.status, "active"))
      .limit(1);
    if (!round) return { kind: "no_round" as const };

    const total = Number(round.totalTickets || 0);
    if (total <= 0) {
      // Nessun biglietto venduto: prolunga e ritorna "no_tickets".
      const newNextDraw = new Date(Date.now() + DRAW_INTERVAL_DAYS * 24 * 3600 * 1000);
      await tx
        .update(lottoRoundsTable)
        .set({ nextDrawAt: newNextDraw })
        .where(eq(lottoRoundsTable.id, round.id));
      return { kind: "no_tickets" as const, roundId: round.id, rescheduledTo: newNextDraw };
    }

    const cursor = Math.floor(Math.random() * total);
    const rows = await tx
      .select({
        id: lottoTicketsTable.id,
        telegramId: lottoTicketsTable.telegramId,
        ticketCount: lottoTicketsTable.ticketCount,
      })
      .from(lottoTicketsTable)
      .where(eq(lottoTicketsTable.roundId, round.id))
      .orderBy(lottoTicketsTable.id);

    let acc = 0;
    let winnerTelegramId: string | null = null;
    for (const r of rows) {
      acc += Number(r.ticketCount || 0);
      if (cursor < acc) { winnerTelegramId = r.telegramId; break; }
    }
    if (!winnerTelegramId && rows.length > 0) {
      winnerTelegramId = rows[rows.length - 1].telegramId;
    }
    if (!winnerTelegramId) {
      // Anomalia: total>0 ma rows vuoto. Trattiamo come no_tickets.
      const newNextDraw = new Date(Date.now() + DRAW_INTERVAL_DAYS * 24 * 3600 * 1000);
      await tx
        .update(lottoRoundsTable)
        .set({ nextDrawAt: newNextDraw })
        .where(eq(lottoRoundsTable.id, round.id));
      return { kind: "no_tickets" as const, roundId: round.id, rescheduledTo: newNextDraw };
    }

    const [winRow] = await tx
      .select({ s: sql<number>`COALESCE(SUM(${lottoTicketsTable.ticketCount}), 0)::int` })
      .from(lottoTicketsTable)
      .where(sql`${lottoTicketsTable.roundId} = ${round.id} AND ${lottoTicketsTable.telegramId} = ${winnerTelegramId}`);
    const winnerTickets = Number(winRow?.s ?? 0);

    const totalCollected = Number(round.totalCollectedTon || 0);
    const prizeTon = totalCollected * PRIZE_PCT;
    const profitTon = totalCollected * PROFIT_PCT;

    const [updated] = await tx
      .update(lottoRoundsTable)
      .set({
        status: "drawn",
        winnerTelegramId,
        winnerTickets,
        prizeTon,
        profitTon,
        drawnAt: new Date(),
        drawnBy: executorId,
      })
      .where(sql`${lottoRoundsTable.id} = ${round.id} AND ${lottoRoundsTable.status} = 'active'`)
      .returning();

    // Crea il prossimo round attivo. Il default DB di next_draw_at è
    // NOW() + INTERVAL '7 days', quindi il prossimo draw automatico cadrà
    // esattamente una settimana dopo questo.
    const [nextRound] = await tx
      .insert(lottoRoundsTable)
      .values({ status: "active", totalCollectedTon: 0, totalTickets: 0 })
      .returning();

    const [u] = await tx
      .select({ firstName: usersTable.firstName, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.telegramId, winnerTelegramId))
      .limit(1);

    return {
      kind: "drawn" as const,
      roundId: updated.id,
      winnerTelegramId,
      winnerTickets,
      winnerName: u?.firstName || (u?.username ? `@${u.username}` : null),
      totalCollectedTon: totalCollected,
      prizeTon,
      profitTon,
      nextRoundId: nextRound.id,
    };
  });
}

/**
 * Costruisce il messaggio Telegram di annuncio del vincitore. Usato sia
 * dal draw manuale che dal draw automatico settimanale.
 */
export function buildWinnerBroadcastMessage(outcome: Extract<DrawOutcome, { kind: "drawn" }>): string {
  const winnerLabel = outcome.winnerName || `User ${outcome.winnerTelegramId.slice(-4)}`;
  const prize = outcome.prizeTon.toFixed(3).replace(/\.?0+$/, "");
  const total = outcome.totalCollectedTon.toFixed(3).replace(/\.?0+$/, "");
  return [
    "STELLAR LOTTERY — This week's draw",
    "",
    `Winner: ${winnerLabel}`,
    `Prize: ${prize} TON`,
    `Round closed: #${outcome.roundId}`,
    `Total pool: ${total} TON`,
    `Winner's tickets: ${outcome.winnerTickets}`,
    "",
    "The next round is already open. Buy your tickets for next week and try your luck!",
  ].join("\n");
}

/**
 * Tick del cron settimanale: se esiste un round attivo con next_draw_at
 * gia' scaduto, esegue il draw e fa broadcast a tutti gli utenti del bot.
 * Esportato per essere chiamato da index.ts ogni 60 secondi.
 */
export async function runScheduledLotteryDrawTick(): Promise<void> {
  // Selezione rapida read-only: c'e' qualcosa da estrarre adesso?
  const [due] = await db
    .select({ id: lottoRoundsTable.id })
    .from(lottoRoundsTable)
    .where(sql`${lottoRoundsTable.status} = 'active' AND ${lottoRoundsTable.nextDrawAt} <= NOW()`)
    .limit(1);
  if (!due) return;

  const outcome = await executeLotteryDraw("system");
  if (outcome.kind === "drawn") {
    logger.info(
      { roundId: outcome.roundId, winnerTelegramId: outcome.winnerTelegramId, prizeTon: outcome.prizeTon },
      "[lotto-cron] auto-draw executed",
    );
    // Broadcast disabilitato per richiesta admin — l'annuncio del vincitore
    // viene inviato manualmente dall'admin tramite Telegram. Lasciamo il
    // builder del messaggio importato per future riattivazioni rapide.
  } else if (outcome.kind === "no_tickets") {
    logger.info(
      { roundId: outcome.roundId, rescheduledTo: outcome.rescheduledTo },
      "[lotto-cron] no tickets sold, rescheduled +7d",
    );
  }
}

router.post("/admin/lottery/draw", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const outcome = await executeLotteryDraw(adminId);
    if (outcome.kind === "no_round") { res.status(409).json({ ok: false, error: "NO_ACTIVE_ROUND" }); return; }
    if (outcome.kind === "no_tickets") { res.status(409).json({ ok: false, error: "NO_TICKETS_SOLD" }); return; }

    // Broadcast disabilitato per richiesta admin — l'annuncio del vincitore
    // viene inviato manualmente dall'admin tramite Telegram.

    res.json({
      ok: true,
      roundId: outcome.roundId,
      winnerTelegramId: outcome.winnerTelegramId,
      winnerTickets: outcome.winnerTickets,
      winnerName: outcome.winnerName,
      totalCollectedTon: outcome.totalCollectedTon,
      prizeTon: outcome.prizeTon,
      profitTon: outcome.profitTon,
      nextRoundId: outcome.nextRoundId,
    });
  } catch (err: unknown) {
    logger.error({ err }, "[admin/lottery/draw] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;

/**
 * Helper esposto verso stars.ts per registrare un acquisto biglietti dentro
 * la stessa transazione del credit. Riceve la transaction Drizzle attiva, il
 * telegramId, il numero di biglietti del bundle, i TON pagati e l'id della
 * transazione finanziaria — quest'ultimo è UNIQUE su lotto_tickets, quindi
 * un secondo tentativo di credito sullo stesso txnId solleva 23505 e fa
 * rollback dell'intero credit (idempotency end-to-end).
 */
export async function registerLottoTicketPurchase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  args: { telegramId: string; ticketCount: number; tonPaid: number; bundleId: string; txnId: number },
): Promise<{ roundId: number; ticketsAfter: number }> {
  // Risolvi (o crea) il round attivo SENZA advisory lock — il partial UNIQUE
  // index `uniq_lotto_active_round` garantisce che possa esistere al massimo
  // un round con status='active'. Evitare l'advisory lock qui è importante
  // perché siamo dentro una transazione esterna (stars.ts/atomicCreditIfPending)
  // che ha già preso row-lock su `transactions`: prendere un lock aggiuntivo
  // dopo creerebbe un potenziale ciclo di deadlock con flussi futuri.
  let [round] = await tx
    .select()
    .from(lottoRoundsTable)
    .where(eq(lottoRoundsTable.status, "active"))
    .limit(1);
  if (!round) {
    await tx
      .insert(lottoRoundsTable)
      .values({ status: "active", totalCollectedTon: 0, totalTickets: 0 })
      .onConflictDoNothing();
    [round] = await tx
      .select()
      .from(lottoRoundsTable)
      .where(eq(lottoRoundsTable.status, "active"))
      .limit(1);
    if (!round) throw new Error("LOTTO_NO_ACTIVE_ROUND");
  }

  // Inserisci la riga ticket: UNIQUE(txn_id) garantisce l'idempotency.
  await tx.insert(lottoTicketsTable).values({
    roundId: round.id,
    telegramId: args.telegramId,
    ticketCount: args.ticketCount,
    tonPaid: args.tonPaid,
    bundleId: args.bundleId,
    txnId: args.txnId,
  });

  // Aggiorna i contatori cumulativi del round.
  await tx
    .update(lottoRoundsTable)
    .set({
      totalCollectedTon: sql`${lottoRoundsTable.totalCollectedTon} + ${args.tonPaid}`,
      totalTickets: sql`${lottoRoundsTable.totalTickets} + ${args.ticketCount}`,
    })
    .where(eq(lottoRoundsTable.id, round.id));

  return { roundId: round.id, ticketsAfter: round.totalTickets + args.ticketCount };
}
