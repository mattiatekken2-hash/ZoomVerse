import { Router, type IRouter } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { labRoundsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_ID = "8144744644";
export const LAB_ENTRY_ZOOM = 1_000_000;
export const LAB_WINNER_TON = 5;

// Stardust auto-payouts — ranks 2..20 (BASE values).
// These are multiplied by max(1, floor(participants / 10)) so prize
// scales with real participation.
const STARDUST_BASE: Record<number, number> = {
  2: 500,
  3: 250,
  4: 100, 5: 100,
  6: 50, 7: 50, 8: 50, 9: 50, 10: 50,
  11: 20, 12: 20, 13: 20, 14: 20, 15: 20,
  16: 20, 17: 20, 18: 20, 19: 20, 20: 20,
};

function stardustPayout(rank: number, participants: number): number {
  const base = STARDUST_BASE[rank] || 0;
  if (!base) return 0;
  const multiplier = Math.max(1, Math.floor(participants / 10));
  return base * multiplier;
}

function stardustPayoutsMap(participants: number): Record<number, number> {
  const map: Record<number, number> = {};
  for (let r = 2; r <= 20; r++) {
    map[r] = stardustPayout(r, participants);
  }
  return map;
}

function isAdmin(adminId: string | undefined): boolean {
  return !!adminId && adminId === ADMIN_ID;
}

/**
 * Risolve il round attivo, creandone uno se non esiste. Race-safe grazie
 * al partial UNIQUE index `uniq_lab_active_round`.
 */
export async function getOrCreateActiveLabRound() {
  const [existing] = await db
    .select()
    .from(labRoundsTable)
    .where(eq(labRoundsTable.status, "active"))
    .limit(1);
  if (existing) return existing;
  await db.insert(labRoundsTable).values({ status: "active" }).onConflictDoNothing();
  const [round] = await db
    .select()
    .from(labRoundsTable)
    .where(eq(labRoundsTable.status, "active"))
    .limit(1);
  if (!round) throw new Error("FAILED_TO_GET_ACTIVE_LAB_ROUND");
  return round;
}

/**
 * GET /lab-rank/state?telegramId=
 * Stato del round attivo per l'utente: gate di attivazione, pool, top 100,
 * iscrizione, punti e rank.
 */
const JoinBody = z.object({
  telegramId: z.string().min(1),
});

/**
 * POST /lab-rank/join
 * Iscrizione al round attivo della classifica mensile Lab.
 * Richiede: SUN (sunCount > 0), ZOOM balance >= 50.000, e non
 * già iscritto al round corrente.
 * L'iscrizione debita 50.000 ZOOM e incrementa il numero di partecipanti.
 * Nessun pool TON è accumulato — il premio #1 è fisso (5 TON).
 */
router.post("/lab-rank/join", async (req, res) => {
  const parsed = JoinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042200)`);

      const roundRes = await tx.execute(sql`SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1 FOR UPDATE`);
      let activeId: number | undefined;
      if (roundRes.rows && roundRes.rows.length > 0) {
        activeId = Number((roundRes.rows[0] as Record<string, unknown>)["id"]);
      }
      if (!activeId) {
        await tx.execute(sql`INSERT INTO lab_rounds (status) VALUES ('active') ON CONFLICT DO NOTHING`);
        const r2 = await tx.execute(sql`SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1 FOR UPDATE`);
        activeId = Number((r2.rows[0] as Record<string, unknown>)["id"]);
      }
      if (!activeId) throw new Error("LAB_JOIN_NO_ACTIVE_ROUND");

      const userRes = await tx.execute(sql`
        UPDATE users
        SET lab_round_id = ${activeId}, lab_points = 0,
            zoom_balance = zoom_balance - ${LAB_ENTRY_ZOOM},
            balance_epoch = balance_epoch + 1
        WHERE telegram_id = ${telegramId}
          AND sun_count > 0
          AND zoom_balance >= ${LAB_ENTRY_ZOOM}
          AND COALESCE(lab_round_id, 0) <> ${activeId}
        RETURNING telegram_id
      `);
      if (!userRes.rows || userRes.rows.length === 0) {
        return { kind: "ineligible" as const, reason: "Already joined, no SUN, or insufficient ZOOM" };
      }

      await tx.execute(sql`
        UPDATE lab_rounds
        SET participants = participants + 1
        WHERE id = ${activeId} AND status = 'active'
      `);

      return { kind: "ok" as const, roundId: activeId };
    });

    if (result.kind === "ineligible") {
      return res.status(409).json({ ok: false, error: result.reason });
    }
    return res.json({ ok: true, roundId: result.roundId });
  } catch (err) {
    logger.error({ err }, "[lab-rank/join] error");
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

router.get("/lab-rank/state", async (req, res) => {
  try {
    const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : "";
    const queryIdRaw = req.query["telegramId"];
    const queryId = typeof queryIdRaw === "string" ? queryIdRaw.trim() : "";
    const telegramId = verifiedId || queryId;

    const round = await getOrCreateActiveLabRound();
    const participants = Number(round.participants || 0);
    const poolTon = Number(round.poolTon || 0);

    let userPoints = 0;
    let hasSun = false;
    let hasPaid = false;
    if (telegramId) {
      const [u] = await db
        .select({
          labPoints: usersTable.labPoints,
          sunCount: usersTable.sunCount,
          labRoundId: usersTable.labRoundId,
          zoomBalance: usersTable.zoomBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (u) {
        userPoints = Number(u.labPoints || 0);
        hasSun = Number(u.sunCount || 0) > 0;
        hasPaid = Number(u.labRoundId || 0) === round.id;
      }
    }
    const eligible = hasSun && hasPaid;

    // Leaderboard is always active (no threshold gate)
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        labPoints: usersTable.labPoints,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.sunCount} > 0`)
      .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
      .limit(100);
    const top100 = rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      name: r.firstName || (r.username ? `@${r.username}` : `User ${r.telegramId.slice(-4)}`),
      labPoints: Number(r.labPoints || 0),
    }));

    let userRank: number | null = null;
    if (telegramId && eligible) {
      const [rk] = await db
        .select({ c: sql<number>`COUNT(*)::int` })
        .from(usersTable)
        .where(sql`${usersTable.labRoundId} = ${round.id}
          AND ${usersTable.sunCount} > 0
          AND (${usersTable.labPoints} > ${userPoints}
               OR (${usersTable.labPoints} = ${userPoints} AND ${usersTable.telegramId} < ${telegramId}))`);
      userRank = Number(rk?.c ?? 0) + 1;
    }

    res.set("Cache-Control", "no-store");
    res.json({
      roundId: round.id,
      participants,
      poolTon,
      entryZoom: LAB_ENTRY_ZOOM,
      winnerTon: LAB_WINNER_TON,
      stardustPayouts: stardustPayoutsMap(participants),
      hasSun,
      hasPaid,
      eligible,
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
 * Pannello admin: round attivo, current leader, top 20 con stardust preview,
 * splits TON 80/20 e storico round chiusi.
 */
router.get("/admin/lab-rank/dashboard", async (req, res) => {
  try {
    const adminId = (req.query["adminId"] as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    const round = await getOrCreateActiveLabRound();
    const pool = Number(round.poolTon || 0);

    const top20 = await db
      .select({
        telegramId: usersTable.telegramId,
        labPoints: usersTable.labPoints,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.sunCount} > 0 AND ${usersTable.labPoints} > 0`)
      .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
      .limit(20);

    const history = await db
      .select()
      .from(labRoundsTable)
      .where(eq(labRoundsTable.status, "closed"))
      .orderBy(desc(labRoundsTable.closedAt))
      .limit(10);

    const participants = Number(round.participants || 0);
    const winnerTon = LAB_WINNER_TON;
    const stardustMap = stardustPayoutsMap(participants);
    res.set("Cache-Control", "no-store");
    res.json({
      round: {
        id: round.id,
        createdAt: round.createdAt,
        participants,
      },
      poolTon: pool,
      winnerTon,
      entryZoom: LAB_ENTRY_ZOOM,
      currentLeader: top20[0]
        ? {
            telegramId: top20[0].telegramId,
            name: top20[0].firstName || (top20[0].username ? `@${top20[0].username}` : top20[0].telegramId),
            labPoints: Number(top20[0].labPoints || 0),
          }
        : null,
      top20: top20.map((r, i) => ({
        rank: i + 1,
        telegramId: r.telegramId,
        name: r.firstName || (r.username ? `@${r.username}` : r.telegramId),
        labPoints: Number(r.labPoints || 0),
        stardustPayout: stardustMap[i + 1] || 0,
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
 * Chiude il round attivo, accredita Stardust ai ranghi 2-20, resetta
 * lab_points di tutti gli utenti e apre un nuovo round.
 * Il pagamento del 80% TON al #1 lo fa manualmente l'admin off-chain.
 */
router.post("/admin/lab-rank/close", async (req, res) => {
  try {
    const adminId = (req.body?.adminId as string) || "";
    if (!isAdmin(adminId)) { res.status(403).json({ error: "Forbidden" }); return; }

    // Idempotency: il client DEVE passare l'id del round che vuole chiudere
    // (lo conosce dalla dashboard). Se la richiesta viene rigiocata dopo
    // una chiusura riuscita, il round risulta già 'closed' e ritorniamo
    // lo snapshot storico invece di chiudere il NUOVO round attivo.
    const targetRoundId = Number(req.body?.roundId ?? 0);
    if (!Number.isFinite(targetRoundId) || targetRoundId <= 0) {
      res.status(400).json({ ok: false, error: "MISSING_ROUND_ID" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042200)`);

      // Replay-safe: se il round target è già chiuso, restituisci lo snapshot
      // — nessun side-effect, l'admin vede l'esito originale.
      const [existingClosed] = await tx
        .select()
        .from(labRoundsTable)
        .where(sql`${labRoundsTable.id} = ${targetRoundId} AND ${labRoundsTable.status} = 'closed'`)
        .limit(1);
      if (existingClosed) {
        return {
          kind: "already_closed" as const,
          roundId: existingClosed.id,
          winner: existingClosed.winnerTelegramId
            ? { telegramId: existingClosed.winnerTelegramId, name: existingClosed.winnerTelegramId, labPoints: Number(existingClosed.winnerLabPoints || 0) }
            : null,
          poolTon: Number(existingClosed.poolTon || 0),
          prizeTon: Number(existingClosed.prizeTon || 0),
          profitTon: Number(existingClosed.profitTon || 0),
          credited: [] as Array<{ rank: number; telegramId: string; stardust: number }>,
        };
      }

      const [round] = await tx
        .select()
        .from(labRoundsTable)
        .where(sql`${labRoundsTable.id} = ${targetRoundId} AND ${labRoundsTable.status} = 'active'`)
        .limit(1);
      if (!round) return { kind: "no_round" as const };

      const ranking = await tx
        .select({
          telegramId: usersTable.telegramId,
          labPoints: usersTable.labPoints,
          firstName: usersTable.firstName,
          username: usersTable.username,
        })
        .from(usersTable)
        .where(sql`${usersTable.labRoundId} = ${round.id} AND ${usersTable.sunCount} > 0 AND ${usersTable.labPoints} > 0`)
        .orderBy(desc(usersTable.labPoints), usersTable.telegramId)
        .limit(20);

      const winner = ranking[0] ?? null;
      const pool = Number(round.poolTon || 0);
      const prizeTon = LAB_WINNER_TON;
      const participants = Number(round.participants || 0);
      const stardustMap = stardustPayoutsMap(participants);

      // Accredito Stardust ranghi 2..20 (non includere il #1).
      const credited: Array<{ rank: number; telegramId: string; stardust: number }> = [];
      for (let i = 1; i < ranking.length; i++) {
        const rank = i + 1;
        const amount = stardustMap[rank];
        if (!amount) continue;
        const r = ranking[i];
        await tx
          .update(usersTable)
          .set({
            stardustBalance: sql`${usersTable.stardustBalance} + ${amount}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          })
          .where(eq(usersTable.telegramId, r.telegramId));
        credited.push({ rank, telegramId: r.telegramId, stardust: amount });
      }

      // Chiudi round (UPDATE gated su status='active' = idempotency)
      await tx
        .update(labRoundsTable)
        .set({
          status: "closed",
          winnerTelegramId: winner?.telegramId ?? null,
          winnerLabPoints: winner ? Number(winner.labPoints || 0) : null,
          prizeTon,
          profitTon: 0,
          closedAt: new Date(),
          closedBy: adminId,
        })
        .where(sql`${labRoundsTable.id} = ${round.id} AND ${labRoundsTable.status} = 'active'`);

      // Reset lab_points per TUTTI. lab_round_id viene lasciato com'è —
      // diventa stale di default quando crea il nuovo round con id diverso.
      await tx.update(usersTable).set({ labPoints: 0 });

      // Apri nuovo round
      const [newRound] = await tx
        .insert(labRoundsTable)
        .values({ status: "active" })
        .returning();

      return {
        kind: "closed" as const,
        roundId: round.id,
        newRoundId: newRound.id,
        winner: winner
          ? {
              telegramId: winner.telegramId,
              name: winner.firstName || (winner.username ? `@${winner.username}` : winner.telegramId),
              labPoints: Number(winner.labPoints || 0),
            }
          : null,
        poolTon: pool,
        prizeTon,
        credited,
      };
    });

    if (result.kind === "no_round") { res.status(409).json({ ok: false, error: "NO_ACTIVE_ROUND_OR_ALREADY_ROTATED" }); return; }
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[admin/lab-rank/close] error");
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
