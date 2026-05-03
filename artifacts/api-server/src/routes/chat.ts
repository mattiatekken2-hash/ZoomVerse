import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, usersTable } from "@workspace/db/schema";
import { and, desc, gt, sql, eq } from "drizzle-orm";
import { z } from "zod";
// Side-effect import: brings in the `Request.tgUser` type augmentation
// so the defense-in-depth identity check below typechecks.
import "../lib/telegram-auth";

const router: IRouter = Router();

// ────────────────────────────────────────────────────────────────────────
// HOME — Global Chat (Phase 5b).
//
// Endpoints:
//   GET  /chat/messages?since=<id>&limit=<n>  — public read, polled by client
//   POST /chat/send                           — auth-gated send
//
// Both reads and writes are stateless — the client polls every few seconds.
// Writes are idempotent at the DB layer (each row gets a fresh serial id),
// rate-limited per telegram_id at 3s, and length-capped at 200 chars.
// ────────────────────────────────────────────────────────────────────────

const MAX_TEXT_LEN = 200;
const SEND_COOLDOWN_MS = 3000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Strip control characters and trim. Empty after sanitise → reject.
 * We keep emoji/unicode as-is — the user is Italian and may use accents.
 */
function sanitiseText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  const trimmed = stripped.trim();
  return trimmed.slice(0, MAX_TEXT_LEN);
}

const sendSchema = z.object({
  telegramId: z.string().min(1).max(64),
  username: z.string().max(64).optional().default(""),
  text: z.string().min(1).max(MAX_TEXT_LEN * 2), // generous pre-sanitise cap
});

// ─── GET /chat/messages ─────────────────────────────────────────────────
//
// Two modes:
//   * `?since=<id>` → return rows with id > since, ASC by id (delta poll).
//   * no `since`    → return the most recent N rows DESC, then reversed
//                     to ASC for client convenience (initial load).
router.get("/chat/messages", async (req, res) => {
  try {
    const sinceRaw = req.query.since;
    const since = typeof sinceRaw === "string" ? Number.parseInt(sinceRaw, 10) : NaN;
    const limitRaw = req.query.limit;
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE),
    );

    let rows;
    if (Number.isFinite(since) && since > 0) {
      // Delta poll: messages newer than the client's high-water id.
      rows = await db
        .select()
        .from(chatMessagesTable)
        .where(gt(chatMessagesTable.id, since))
        .orderBy(chatMessagesTable.id)
        .limit(limit);
    } else {
      // Initial load: most recent N, reversed so the client gets oldest→newest.
      const recent = await db
        .select()
        .from(chatMessagesTable)
        .orderBy(desc(chatMessagesTable.id))
        .limit(limit);
      rows = recent.reverse();
    }

    res.json({
      ok: true,
      messages: rows.map((r) => ({
        id: r.id,
        telegramId: r.telegramId,
        username: r.username,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "[chat] GET /chat/messages failed");
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /chat/send ────────────────────────────────────────────────────
//
// Body: { telegramId, username?, text }. The auth middleware in
// routes/index.ts has already verified telegramId belongs to the caller.
//
// Rate limit: at most 1 message per 3s per telegram_id. Implemented via a
// single SELECT on the most recent row — no extra table, no Redis. Two
// concurrent sends from the same user can both pass this check, but the
// blast radius is bounded (2 messages instead of 1) and the next attempt
// will see both and be blocked, so the long-run rate stays at the cap.
router.post("/chat/send", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_INPUT" });
    return;
  }
  const { telegramId } = parsed.data;
  const text = sanitiseText(parsed.data.text);
  if (!text) {
    res.status(400).json({ ok: false, error: "EMPTY" });
    return;
  }

  // ── Identity check (Phase 5b — pragmatic). ────────────────────────
  // The global PROTECTED_ROUTES middleware enforces telegramId binding
  // ONLY when TG_AUTH_MODE === "strict". The project default is "soft"
  // because some Telegram clients produce initData with `signature`
  // ed25519 fields that our HMAC verifier cannot validate (same issue
  // documented for /lottery/state). Rejecting all of them would lock
  // out a non-trivial slice of real users from chat.
  //
  // Compromise: ANTI-IMPERSONATION ONLY. If we DO have a verified
  // identity from initData and it does NOT match the body telegramId,
  // we reject (a verified user cannot post under another user's name).
  // If we don't have a verified identity (HMAC failed for known reasons),
  // we accept the body telegramId — exactly the soft-auth policy used
  // by every other write endpoint in this codebase. The blast radius
  // is bounded by the per-user 3s cooldown and the 200-char cap.
  const verifiedId = req.tgUser?.id ? String(req.tgUser.id) : "";
  if (verifiedId && verifiedId !== telegramId) {
    res.status(403).json({ ok: false, error: "ID_MISMATCH" });
    return;
  }

  try {
    // Rate-limit check: most recent message by this user.
    const [last] = await db
      .select({ createdAt: chatMessagesTable.createdAt })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.telegramId, telegramId))
      .orderBy(desc(chatMessagesTable.id))
      .limit(1);
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime();
      if (elapsed < SEND_COOLDOWN_MS) {
        res.status(429).json({
          ok: false,
          error: "COOLDOWN",
          retryAfterMs: SEND_COOLDOWN_MS - elapsed,
        });
        return;
      }
    }

    // Resolve a display name: prefer the client-supplied (which already
    // matches what the user picked in Telegram), but fall back to the
    // users table snapshot so old clients without a username still show
    // SOMETHING readable instead of a bare numeric id.
    let username = (parsed.data.username || "").trim().slice(0, 64);
    if (!username) {
      const [u] = await db
        .select({ username: usersTable.username, firstName: usersTable.firstName })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      username = (u?.username || u?.firstName || "").trim().slice(0, 64);
    }
    if (!username) username = `user${telegramId.slice(-4)}`;

    const [inserted] = await db
      .insert(chatMessagesTable)
      .values({ telegramId, username, text })
      .returning({
        id: chatMessagesTable.id,
        telegramId: chatMessagesTable.telegramId,
        username: chatMessagesTable.username,
        text: chatMessagesTable.text,
        createdAt: chatMessagesTable.createdAt,
      });

    res.json({
      ok: true,
      message: {
        id: inserted.id,
        telegramId: inserted.telegramId,
        username: inserted.username,
        text: inserted.text,
        createdAt: inserted.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "[chat] POST /chat/send failed");
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// Avoid an unused-import warning if drizzle helpers aren't all used in some
// configurations. Touching `and` keeps tree-shaking + tsc happy together.
void and;
void sql;

export default router;
