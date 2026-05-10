import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { HISTORY_RETENTION_HOURS } from "../lib/history";
import { requireTelegramAuth } from "../lib/telegram-auth";

const router: IRouter = Router();

// Personal history is sensitive (per-user financial actions) → enforce
// Telegram auth on the GET. The middleware populates `req.tgUser` from
// the verified initData; we then guard against IDOR by matching the
// path param against the verified id INSIDE the handler. Mounting it
// here (rather than in PROTECTED_ROUTES, which exact-matches paths and
// would miss the `:telegramId` param) keeps the policy local and
// readable while still routing through the same verifier the rest of
// the app uses, including the same `TG_AUTH_MODE` semantics.
router.use("/history/list/:telegramId", requireTelegramAuth());

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * GET /history/list/:telegramId
 *
 * Restituisce le ultime azioni dell'utente nelle ultime 48h, in ordine
 * cronologico discendente. Il filtro 48h è applicato anche lato server
 * (oltre alla cron di pulizia) come safety net: se la cron è in ritardo,
 * l'utente non vede mai righe più vecchie del cap di retention.
 *
 * Risposta:
 *   { entries: Array<{
 *       id: number,
 *       kind: string,
 *       delta: number,
 *       currency: string,
 *       meta: object|null,
 *       createdAt: number   // unix ms
 *     }>,
 *     retentionHours: number
 *   }
 */
router.get("/history/list/:telegramId", async (req, res) => {
  const telegramId = req.params.telegramId;
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  // IDOR guard: when initData verification produced a user, that user
  // MUST match the path param. If verification produced no user (mode
  // "off" because BOT_TOKEN isn't set in dev, or soft mode + missing
  // initData), we fall back to trusting the URL — same posture as the
  // rest of the app's per-user reads (e.g. /profile/:telegramId,
  // /home/state/:telegramId). The cron-driven 48h retention still caps
  // exposure, and in production with BOT_TOKEN set the verified-id
  // branch enforces strict IDOR.
  const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : null;
  if (verifiedId !== null && verifiedId !== telegramId) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const rawLimit = Number(req.query["limit"] ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  try {
    const result = await db.execute(sql`
      SELECT id, kind, delta, currency, meta,
             EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
      FROM history
      WHERE telegram_id = ${telegramId}
        AND created_at >= NOW() - (${HISTORY_RETENTION_HOURS}::int || ' hours')::interval
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `);
    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
    const entries = rows.map((r) => ({
      id: Number(r["id"]),
      kind: String(r["kind"]),
      delta: Number(r["delta"]),
      currency: String(r["currency"]),
      meta: r["meta"] ?? null,
      createdAt: Math.floor(Number(r["created_at_ms"])),
    }));
    res.json({ entries, retentionHours: HISTORY_RETENTION_HOURS });
  } catch (err) {
    req.log.error({ err }, "[history/list] error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
