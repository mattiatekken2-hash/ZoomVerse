import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { lottoRoundsTable, lottoTicketsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ID = "8144744644";
const PRIZE_PCT = 0.9;   // 90% del raccolto va al vincitore
const PROFIT_PCT = 0.1;  // 10% rimane all'admin

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
    // Privacy: usiamo SOLO il telegramId verificato dall'initData di Telegram
    // (impostato dal middleware `attachVerifiedTgUser`). La query string
    // `telegramId` è ignorata: senza questa difesa un utente potrebbe leggere
    // i biglietti di altri utenti enumerando ID. Quando l'app gira fuori da
    // Telegram (dev, browser locale) `req.tgUser` è null e cadiamo in modalità
    // anonima dove `userTickets`/`winChancePct` restano a 0 — i totali del
    // round sono comunque pubblici.
    const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : "";
    const round = await getOrCreateActiveRound();

    // Biglietti dell'utente nel round attivo (somma).
    let userTickets = 0;
    const telegramId = verifiedId;
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
router.post("/admin/lottery/draw", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042100)`);

      // Round attivo o nessun round = nulla da estrarre.
      const [round] = await tx
        .select()
        .from(lottoRoundsTable)
        .where(eq(lottoRoundsTable.status, "active"))
        .limit(1);
      if (!round) throw new Error("NO_ACTIVE_ROUND");

      const total = Number(round.totalTickets || 0);
      if (total <= 0) throw new Error("NO_TICKETS_SOLD");

      // Cursore casuale in [0, total).
      const cursor = Math.floor(Math.random() * total);

      // Tutte le righe del round ordinate per id, calcolando il cumulativo.
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
      // Fallback estremo (non dovrebbe mai accadere): ultimo se per qualche
      // motivo il cursore eccede la somma a causa di concorrenza.
      if (!winnerTelegramId && rows.length > 0) {
        winnerTelegramId = rows[rows.length - 1].telegramId;
      }
      if (!winnerTelegramId) throw new Error("NO_TICKETS_SOLD");

      // Tickets totali del vincitore in questo round (peso effettivo).
      const [winRow] = await tx
        .select({ s: sql<number>`COALESCE(SUM(${lottoTicketsTable.ticketCount}), 0)::int` })
        .from(lottoTicketsTable)
        .where(sql`${lottoTicketsTable.roundId} = ${round.id} AND ${lottoTicketsTable.telegramId} = ${winnerTelegramId}`);
      const winnerTickets = Number(winRow?.s ?? 0);

      const totalCollected = Number(round.totalCollectedTon || 0);
      const prizeTon = totalCollected * PRIZE_PCT;
      const profitTon = totalCollected * PROFIT_PCT;

      // Marca il round come drawn.
      const [updated] = await tx
        .update(lottoRoundsTable)
        .set({
          status: "drawn",
          winnerTelegramId,
          winnerTickets,
          prizeTon,
          profitTon,
          drawnAt: new Date(),
          drawnBy: adminId,
        })
        .where(sql`${lottoRoundsTable.id} = ${round.id} AND ${lottoRoundsTable.status} = 'active'`)
        .returning();

      // Crea immediatamente il prossimo round attivo per non lasciare il
      // sistema "scoperto" tra un draw e il successivo acquisto.
      const [nextRound] = await tx
        .insert(lottoRoundsTable)
        .values({ status: "active", totalCollectedTon: 0, totalTickets: 0 })
        .returning();

      // Recupera display name del vincitore (non bloccante, best effort).
      const [u] = await tx
        .select({ firstName: usersTable.firstName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.telegramId, winnerTelegramId))
        .limit(1);

      return {
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

    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_ACTIVE_ROUND" || msg === "NO_TICKETS_SOLD") {
      res.status(409).json({ ok: false, error: msg });
      return;
    }
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
