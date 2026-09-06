import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { labRoundsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { resolveTargetTelegramId } from "./admin";
import { recordHistoryAsync } from "../lib/history";
import {
  isSyntheticTelegramId,
  mergeCraftLeaderboard,
  syntheticCraftAbove,
  syntheticPlayerCount,
} from "../lib/syntheticLeaderboard";

const router: IRouter = Router();

const ADMIN_ID = "8144744644";

// Montepremi FISSO: 100 ★. Forge ZOOM = 12 ★, daily Earn = 1–7 ★, invite = 2 ★.
// #1 vince 12 ★ = 1 forge extra dopo 60 giorni — premio, non jackpot.
export const LAB_POOL_STARDUST = 100;
/** @deprecated alias — values are stardust, kept so existing API field names stay stable. */
export const LAB_POOL_TON = LAB_POOL_STARDUST;
export const LAB_POOL_ZMC = LAB_POOL_STARDUST;

// Durata fissa del round: 60 giorni.
export const LAB_ROUND_DURATION_MS = 60 * 24 * 60 * 60 * 1000;

// Lock advisory condiviso da TUTTI i percorsi di settlement (cron + admin)
// così non possono mai sovrapporsi e doppio-pagare.
const LAB_SETTLE_LOCK = 7913042200;

/**
 * Premio ★ per rango. Somma Top 50 = 100:
 *   #1=12, #2=8, #3=6, #4..10=2 (×7=14), #11..30=2 (×20=40), #31..50=1 (×20=20).
 */
function stardustPrizeForRank(rank: number): number {
  if (rank === 1) return 12;
  if (rank === 2) return 8;
  if (rank === 3) return 6;
  if (rank >= 4 && rank <= 10) return 2;
  if (rank >= 11 && rank <= 30) return 2;
  if (rank >= 31 && rank <= 50) return 1;
  return 0;
}

function tonPrizeForRank(rank: number): number {
  return stardustPrizeForRank(rank);
}

function labPrizeBreakdown(): Array<{ label: string; ton: number }> {
  return [
    { label: "#1", ton: 12 },
    { label: "#2", ton: 8 },
    { label: "#3", ton: 6 },
    { label: "#4–10", ton: 2 },
    { label: "#11–30", ton: 2 },
    { label: "#31–50", ton: 1 },
  ];
}

function isAdmin(adminId: string | undefined): boolean {
  return !!adminId && adminId === ADMIN_ID;
}

/**
 * Risolve il round attivo, creandone uno se non esiste. Race-safe grazie
 * al partial UNIQUE index `uniq_lab_active_round`. Esegue anche il backfill
 * di `ends_at` per i round legacy creati prima dell'introduzione della
 * colonna (createdAt + 60 giorni).
 */
export async function getOrCreateActiveLabRound() {
  const [existing] = await db
    .select()
    .from(labRoundsTable)
    .where(eq(labRoundsTable.status, "active"))
    .limit(1);
  if (existing) {
    if (!existing.endsAt) {
      const ends = new Date(new Date(existing.createdAt).getTime() + LAB_ROUND_DURATION_MS);
      await db
        .update(labRoundsTable)
        .set({ endsAt: ends })
        .where(eq(labRoundsTable.id, existing.id));
      existing.endsAt = ends;
    }
    return existing;
  }
  const ends = new Date(Date.now() + LAB_ROUND_DURATION_MS);
  await db.insert(labRoundsTable).values({ status: "active", endsAt: ends }).onConflictDoNothing();
  const [round] = await db
    .select()
    .from(labRoundsTable)
    .where(eq(labRoundsTable.status, "active"))
    .limit(1);
  if (!round) throw new Error("FAILED_TO_GET_ACTIVE_LAB_ROUND");
  return round;
}

/**
 * Conta i partecipanti reali del round: ogni utente associato al round
 * (lab_round_id = round.id). L'iscrizione è automatica al primo craft.
 */
async function countParticipants(roundId: number): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.labRoundId, roundId));
  return Number(row?.c ?? 0) + syntheticPlayerCount();
}

type SettleOutcome =
  | { kind: "no_round" }
  | {
      kind: "already_closed";
      roundId: number;
      winner: { telegramId: string; name: string; labPoints: number } | null;
      poolTon: number;
      prizeTon: number;
      profitTon: number;
      credited: Array<{ rank: number; telegramId: string; ton: number }>;
    }
  | {
      kind: "closed";
      roundId: number;
      newRoundId: number;
      winner: { telegramId: string; name: string; labPoints: number } | null;
      poolTon: number;
      prizeTon: number;
      profitTon: number;
      credited: Array<{ rank: number; telegramId: string; ton: number }>;
    };

/**
 * Routine di settlement CONDIVISA (cron automatico + chiusura manuale admin).
 *
 * Tutto in un'unica transazione protetta da advisory lock:
 *   1. Seleziona il round da chiudere (per id, oppure il round attivo —
 *      opzionalmente solo se `ends_at <= NOW()` per il path automatico).
 *   2. Classifica la Top 50 (lab_points > 0) e accredita il premio ★
 *      sul saldo stardust in-app, bumpando balance_epoch.
 *   3. Registra vincitore/pool/premi sul round e lo marca 'closed'.
 *   4. Azzera lab_points di TUTTI gli utenti.
 *   5. Apre un nuovo round attivo con ends_at = NOW() + 60 giorni.
 *
 * Idempotenza: se viene passato un `targetRoundId` già chiuso, restituisce
 * lo snapshot storico senza side-effect (replay-safe per i retry admin).
 */
async function settleLabRoundCore(opts: {
  targetRoundId?: number;
  requireDue?: boolean;
  closedBy: string;
}): Promise<SettleOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LAB_SETTLE_LOCK})`);

    let round: typeof labRoundsTable.$inferSelect | undefined;

    if (opts.targetRoundId) {
      // Replay-safe: round già chiuso → snapshot, nessun side-effect.
      const [closed] = await tx
        .select()
        .from(labRoundsTable)
        .where(sql`${labRoundsTable.id} = ${opts.targetRoundId} AND ${labRoundsTable.status} = 'closed'`)
        .limit(1);
      if (closed) {
        return {
          kind: "already_closed",
          roundId: closed.id,
          winner: closed.winnerTelegramId
            ? { telegramId: closed.winnerTelegramId, name: closed.winnerTelegramId, labPoints: Number(closed.winnerLabPoints || 0) }
            : null,
          poolTon: Number(closed.poolTon || 0),
          prizeTon: Number(closed.prizeTon || 0),
          profitTon: Number(closed.profitTon || 0),
          credited: [],
        };
      }
      [round] = await tx
        .select()
        .from(labRoundsTable)
        .where(sql`${labRoundsTable.id} = ${opts.targetRoundId} AND ${labRoundsTable.status} = 'active'`)
        .limit(1);
    } else {
      const cond = opts.requireDue
        ? sql`${labRoundsTable.status} = 'active' AND ${labRoundsTable.endsAt} IS NOT NULL AND ${labRoundsTable.endsAt} <= NOW()`
        : sql`${labRoundsTable.status} = 'active'`;
      [round] = await tx.select().from(labRoundsTable).where(cond).limit(1);
    }

    if (!round) return { kind: "no_round" };

    // Top 50 del round (solo chi ha almeno 1 punto). Tie-break deterministico
    // su telegram_id per un ordinamento stabile dei premi.
    const ranking = await tx
      .select({
        telegramId: usersTable.telegramId,
        labPoints: usersTable.labPoints,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.labPoints} > 0`)
      .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
      .limit(50);

    const credited: Array<{ rank: number; telegramId: string; ton: number }> = [];
    let prizeTotal = 0;
    for (let i = 0; i < ranking.length; i++) {
      const rank = i + 1;
      const stars = stardustPrizeForRank(rank);
      if (stars <= 0) continue;
      const r = ranking[i]!;
      if (isSyntheticTelegramId(r.telegramId)) continue;
      await tx
        .update(usersTable)
        .set({
          stardustBalance: sql`${usersTable.stardustBalance} + ${stars}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, r.telegramId));
      credited.push({ rank, telegramId: r.telegramId, ton: stars });
      prizeTotal += stars;
    }

    const winner = ranking[0] ?? null;
    const profitTon = LAB_POOL_STARDUST - prizeTotal;

    // Chiudi round — UPDATE gated su status='active' = idempotency.
    await tx
      .update(labRoundsTable)
      .set({
        status: "closed",
        winnerTelegramId: winner?.telegramId ?? null,
        winnerLabPoints: winner ? Number(winner.labPoints || 0) : null,
        poolTon: LAB_POOL_STARDUST,
        prizeTon: prizeTotal,
        profitTon,
        closedAt: new Date(),
        closedBy: opts.closedBy,
      })
      .where(sql`${labRoundsTable.id} = ${round.id} AND ${labRoundsTable.status} = 'active'`);

    // Reset lab_points per TUTTI. lab_round_id viene lasciato com'è — diventa
    // stale di default rispetto al nuovo round con id diverso.
    await tx.update(usersTable).set({ labPoints: 0 });

    // Apri nuovo round con scadenza fresca (+60 giorni).
    const ends = new Date(Date.now() + LAB_ROUND_DURATION_MS);
    const [newRound] = await tx
      .insert(labRoundsTable)
      .values({ status: "active", endsAt: ends })
      .returning();

    return {
      kind: "closed",
      roundId: round.id,
      newRoundId: newRound!.id,
      winner: winner
        ? {
            telegramId: winner.telegramId,
            name: winner.firstName || (winner.username ? `@${winner.username}` : winner.telegramId),
            labPoints: Number(winner.labPoints || 0),
          }
        : null,
      poolTon: LAB_POOL_STARDUST,
      prizeTon: prizeTotal,
      profitTon,
      credited,
    };
  });
}

function recordLabPrizeHistory(credited: Array<{ telegramId: string; ton: number; rank: number }>): void {
  for (const c of credited) {
    recordHistoryAsync({
      telegramId: c.telegramId,
      kind: "lab_prize",
      delta: c.ton,
      currency: "stardust",
      meta: { rank: c.rank },
    });
  }
}

/**
 * Tick del cron di settlement automatico. Chiamato da index.ts ogni 60s.
 * Garantisce prima che il round attivo abbia un `ends_at` (backfill legacy),
 * poi — se è scaduto — esegue la routine condivisa con closedBy="system".
 */
export async function runScheduledLabSettlementTick(): Promise<void> {
  await getOrCreateActiveLabRound();

  const [due] = await db
    .select({ id: labRoundsTable.id })
    .from(labRoundsTable)
    .where(sql`${labRoundsTable.status} = 'active' AND ${labRoundsTable.endsAt} IS NOT NULL AND ${labRoundsTable.endsAt} <= NOW()`)
    .limit(1);
  if (!due) return;

  const outcome = await settleLabRoundCore({ requireDue: true, closedBy: "system" });
  if (outcome.kind === "closed") {
    recordLabPrizeHistory(outcome.credited);
    logger.info(
      {
        roundId: outcome.roundId,
        newRoundId: outcome.newRoundId,
        winners: outcome.credited.length,
        prizeTon: outcome.prizeTon,
      },
      "[lab-cron] auto-settlement executed",
    );
  }
}

/**
 * GET /lab-rank/state?telegramId=
 * Stato pubblico del round attivo: pool fisso 100 ★, ripartizione premi
 * Top 50, conto alla rovescia (ends_at), Top 100 live, punti e rank utente.
 */
router.get("/lab-rank/state", async (req, res) => {
  try {
    const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : "";
    const queryIdRaw = req.query["telegramId"];
    const queryId = typeof queryIdRaw === "string" ? queryIdRaw.trim() : "";
    const telegramId = verifiedId || queryId;

    const round = await getOrCreateActiveLabRound();
    const participants = await countParticipants(round.id);

    let userPoints = 0;
    if (telegramId) {
      const [u] = await db
        .select({ labPoints: usersTable.labPoints, labRoundId: usersTable.labRoundId })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      // Mostra i punti solo se l'utente appartiene al round corrente.
      if (u && Number(u.labRoundId || 0) === round.id) {
        userPoints = Number(u.labPoints || 0);
      }
    }

    // Classifica aperta a TUTTI i partecipanti del round (nessun filtro SUN).
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        labPoints: usersTable.labPoints,
        firstName: usersTable.firstName,
        username: usersTable.username,
        photoUrl: usersTable.photoUrl,
      })
      .from(usersTable)
      .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.labPoints} > 0`)
      .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
      .limit(100);
    const top100 = mergeCraftLeaderboard(rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      name: r.firstName || (r.username ? `@${r.username}` : `User ${r.telegramId.slice(-4)}`),
      labPoints: Number(r.labPoints || 0),
      photoUrl: r.photoUrl || null,
      tonPrize: tonPrizeForRank(i + 1),
    })), tonPrizeForRank);

    let userRank: number | null = null;
    if (telegramId && userPoints > 0) {
      const mergedIdx = top100.findIndex((r) => r.telegramId === telegramId);
      if (mergedIdx >= 0) {
        userRank = top100[mergedIdx].rank;
      } else {
        const [rk] = await db
          .select({ c: sql<number>`COUNT(*)::int` })
          .from(usersTable)
          .where(sql`${usersTable.labRoundId} = ${round.id}
            AND ${usersTable.labPoints} > 0
            AND (${usersTable.labPoints} > ${userPoints}
                 OR (${usersTable.labPoints} = ${userPoints} AND ${usersTable.telegramId} < ${telegramId}))`);
        const synthAbove = syntheticCraftAbove(userPoints, telegramId);
        userRank = Number(rk?.c ?? 0) + 1 + synthAbove;
      }
    }

    res.set("Cache-Control", "no-store");
    res.json({
      roundId: round.id,
      participants,
      poolTon: LAB_POOL_TON,
      endsAt: round.endsAt ? new Date(round.endsAt).toISOString() : null,
      prizes: labPrizeBreakdown(),
      userPoints,
      userRank,
      top100,
    });
  } catch (err) {
    logger.error({ err }, "[lab-rank/state] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * GET /admin/lab-rank/dashboard?adminId=
 * Pannello admin: round attivo, conto alla rovescia, current leader, Top 50
 * con premio TON per posizione e storico round chiusi.
 */
router.get("/admin/lab-rank/dashboard", async (req, res) => {
  try {
    if (!req.tgUser || !isAdmin(req.tgUser.id)) { res.status(403).json({ error: "Forbidden" }); return; }

    const round = await getOrCreateActiveLabRound();
    const participants = await countParticipants(round.id);

    const top30 = await db
      .select({
        telegramId: usersTable.telegramId,
        labPoints: usersTable.labPoints,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.labPoints} > 0`)
      .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
      .limit(50);

    const history = await db
      .select()
      .from(labRoundsTable)
      .where(eq(labRoundsTable.status, "closed"))
      .orderBy(desc(labRoundsTable.closedAt))
      .limit(10);

    res.set("Cache-Control", "no-store");
    res.json({
      round: {
        id: round.id,
        createdAt: round.createdAt,
        endsAt: round.endsAt ? new Date(round.endsAt).toISOString() : null,
        participants,
      },
      poolTon: LAB_POOL_TON,
      prizes: labPrizeBreakdown(),
      currentLeader: top30[0]
        ? {
            telegramId: top30[0].telegramId,
            name: top30[0].firstName || (top30[0].username ? `@${top30[0].username}` : top30[0].telegramId),
            labPoints: Number(top30[0].labPoints || 0),
          }
        : null,
      top30: top30.map((r, i) => ({
        rank: i + 1,
        telegramId: r.telegramId,
        name: r.firstName || (r.username ? `@${r.username}` : r.telegramId),
        labPoints: Number(r.labPoints || 0),
        tonPrize: tonPrizeForRank(i + 1),
      })),
      history,
    });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/dashboard] error");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /admin/lab-rank/close
 * Chiusura MANUALE di fallback. Delega alla stessa routine condivisa del
 * cron automatico: accredita i premi ★ sul saldo stardust, azzera i punti e
 * apre un nuovo round. Idempotente sull'id del round (replay-safe).
 */
router.post("/admin/lab-rank/close", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const targetRoundId = Number(req.body?.roundId ?? 0);
    if (!Number.isFinite(targetRoundId) || targetRoundId <= 0) {
      res.status(400).json({ ok: false, error: "MISSING_ROUND_ID" });
      return;
    }

    const result = await settleLabRoundCore({ targetRoundId, closedBy: adminId });

    if (result.kind === "no_round") {
      res.status(409).json({ ok: false, error: "NO_ACTIVE_ROUND_OR_ALREADY_ROTATED" });
      return;
    }
    if (result.kind === "closed") {
      recordLabPrizeHistory(result.credited);
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/close] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /admin/lab-rank/reset-points
 * Resetta tutti i lab_points a 0 senza premi, round, o side-effect.
 * Utile per ripartire "da zero" con una classifica pulita.
 */
router.post("/admin/lab-rank/reset-points", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const result = await db
      .update(usersTable)
      .set({ labPoints: 0 })
      .returning({ telegramId: usersTable.telegramId });
    res.json({ ok: true, resetCount: result.length });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/reset-points] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /admin/lab-rank/remove-points
 * Rimuove punti lab da un utente specifico (admin-only). Clampato a 0.
 */
router.post("/admin/lab-rank/remove-points", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const telegramId = await resolveTargetTelegramId(req.body?.telegramId as string);
    const points = Number(req.body?.points);
    if (!telegramId || !Number.isFinite(points) || points <= 0 || points > 10000) {
      res.status(400).json({ ok: false, error: "Invalid body" });
      return;
    }
    await db.execute(sql`
      UPDATE users
      SET lab_points = GREATEST(0, lab_points - ${points})
      WHERE telegram_id = ${telegramId}
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/remove-points] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /admin/lab-rank/credit-points
 * Accredita punti lab a un utente specifico (admin-only).
 * Aggiorna lab_points e lab_round_id se necessario.
 */
router.post("/admin/lab-rank/credit-points", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const telegramId = await resolveTargetTelegramId(req.body?.telegramId as string);
    const points = Number(req.body?.points);
    if (!telegramId || !Number.isFinite(points) || points <= 0 || points > 10000) {
      res.status(400).json({ ok: false, error: "Invalid body" });
      return;
    }
    const activeRound = await getOrCreateActiveLabRound();
    await db.execute(sql`
      UPDATE users
      SET lab_points = CASE
            WHEN lab_round_id = ${activeRound.id} THEN lab_points + ${points}
            ELSE ${points}
          END,
          lab_round_id = ${activeRound.id}
      WHERE telegram_id = ${telegramId}
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/credit-points] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

/**
 * POST /lab-rank/buy-ticket
 * Acquisto istantaneo di un ticket Lab: costo 1 TON (deposit_balance),
 * accredita +30 punti alla classifica craft attuale e +300 stardust.
 * Richiede un round attivo; se non esiste lo crea automaticamente.
 */
router.post("/lab-rank/buy-ticket", async (req, res) => {
  try {
    const telegramId = req.body?.telegramId as string;
    const costTon = Number(req.body?.costTon ?? 0);

    if (costTon !== 1) {
      res.status(400).json({ ok: false, error: "INVALID_COST" });
      return;
    }

    const round = await getOrCreateActiveLabRound();

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          depositBalance: usersTable.depositBalance,
          labPoints: usersTable.labPoints,
          labRoundId: usersTable.labRoundId,
          stardustBalance: usersTable.stardustBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);

      if (!user) {
        return { ok: false, error: "USER_NOT_FOUND" };
      }

      const deposit = Number(user.depositBalance ?? 0);
      if (deposit < costTon) {
        return { ok: false, error: "INSUFFICIENT_TON" };
      }

      const wasInRound = Number(user.labRoundId ?? 0) === round.id;

      const [updated] = await tx
        .update(usersTable)
        .set({
          depositBalance: sql`${usersTable.depositBalance} - ${costTon}`,
          labPoints: wasInRound ? sql`${usersTable.labPoints} + ${30}` : 30,
          labRoundId: round.id,
          stardustBalance: sql`${usersTable.stardustBalance} + ${300}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({
          labPoints: usersTable.labPoints,
          stardustBalance: usersTable.stardustBalance,
          depositBalance: usersTable.depositBalance,
        });

      return {
        ok: true,
        newLabPoints: Number(updated?.labPoints ?? 0),
        newStardustBalance: Number(updated?.stardustBalance ?? 0),
        newDepositBalance: Number(updated?.depositBalance ?? 0),
      };
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "[lab-rank/buy-ticket] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
