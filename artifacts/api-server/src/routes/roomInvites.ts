import { Router, type IRouter, type Request } from "express";
import { db, usersTable, roomInvitesTable } from "@workspace/db";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";

const router: IRouter = Router();

/**
 * Visit window — how long an accepted invite keeps the recipient's
 * astronaut visible in the sender's room. Mirrors the client-side
 * FRIEND_VISIT_MS in HomePage.tsx (kept loose: client filters the
 * actual list; server only uses this value to scope the visitors query
 * so we don't pull stale rows).
 */
const VISIT_MS = 30 * 60 * 1000;
/** Cooldown between two invites from the same sender to the same
 *  recipient, regardless of the previous invite's outcome. Prevents
 *  spamming Accept prompts. */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
/** Cap on simultaneously pending OUTBOUND invites per sender. */
const MAX_PENDING_OUTBOUND = 10;

function getTgUser(req: Request): { id: string } | null {
  return (req as unknown as { tgUser?: { id: string } | null }).tgUser ?? null;
}

/** Stable opaque key for a (host, peer) pair. Same construction as the
 *  one in /referral/friends so the client can use a single derivation
 *  function for palette/spot assignment across both data sources. */
function pairKey(hostId: string, peerId: string): string {
  return createHash("sha256").update(`${hostId}:${peerId}`).digest("hex").slice(0, 16);
}

function shortName(firstName: string | null, username: string | null): string {
  return (firstName || username || "Player").toString().slice(0, 16);
}

// ─── POST /room-invites/send ────────────────────────────────────────────
// Sender invites another EXISTING player to visit their room. Auth binds
// `telegramId` to the verified Telegram user (route is in PROTECTED_ROUTES).
const SendBody = z.object({
  telegramId: z.string().min(1),
  toUsername: z.string().min(1).max(64),
});

router.post("/room-invites/send", async (req, res) => {
  const parsed = SendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { toUsername } = parsed.data;
  // SECURITY: authoritative sender id comes from the verified Telegram
  // initData (req.tgUser), NEVER the body. The bindField on the central
  // PROTECTED_ROUTES check prevents body/initData mismatch in strict
  // mode, but we read tgUser.id directly here so this route is correct
  // even if the global mode is ever set to soft / off.
  const tgUser = getTgUser(req);
  if (!tgUser?.id) {
    res.status(401).json({ error: "auth_required" });
    return;
  }
  const senderId = tgUser.id;

  const normalized = toUsername.replace(/^@/, "").trim().toLowerCase();
  if (!normalized) {
    res.status(400).json({ error: "invalid_username" });
    return;
  }

  try {
    // Look up recipient by stored (lowercase) username. We deliberately
    // do NOT trust the username column to be unique (no DB constraint
    // exists today and adding one could fail on legacy duplicates), so
    // we fetch up to 2 rows and reject as ambiguous if more than one
    // account claims this @handle. This avoids silently misdelivering
    // the invite to an arbitrary account.
    const candidates = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.username, normalized))
      .limit(2);

    if (candidates.length === 0) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    if (candidates.length > 1) {
      res.status(409).json({ error: "ambiguous_username" });
      return;
    }
    const recipientId = candidates[0]!.telegramId;
    if (recipientId === senderId) {
      res.status(400).json({ error: "cannot_invite_self" });
      return;
    }

    // Cooldown + pending-cap + insert run inside a transaction guarded
    // by a per-sender Postgres advisory lock. Without serialization,
    // two concurrent send requests can both observe "no recent invite"
    // and "pending count under cap" and both succeed — bypassing both
    // limits. The advisory lock is held for the txn lifetime and keyed
    // off a stable hash of the sender id so different senders don't
    // contend with each other.
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`room_invite_send:${senderId}`}))`,
      );

      const cooldownCutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
      const [recent] = await tx
        .select({ id: roomInvitesTable.id, createdAt: roomInvitesTable.createdAt })
        .from(roomInvitesTable)
        .where(
          and(
            eq(roomInvitesTable.fromTelegramId, senderId),
            eq(roomInvitesTable.toTelegramId, recipientId),
            gt(roomInvitesTable.createdAt, cooldownCutoff),
          ),
        )
        .orderBy(desc(roomInvitesTable.createdAt))
        .limit(1);
      if (recent) {
        const waitMs = RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime());
        return { kind: "cooldown" as const, waitSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }

      const pendingCountRows = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(roomInvitesTable)
        .where(
          and(
            eq(roomInvitesTable.fromTelegramId, senderId),
            eq(roomInvitesTable.status, "pending"),
          ),
        );
      const pendingCount = pendingCountRows[0]?.c ?? 0;
      if (pendingCount >= MAX_PENDING_OUTBOUND) {
        return { kind: "too_many_pending" as const };
      }

      const [inserted] = await tx
        .insert(roomInvitesTable)
        .values({
          fromTelegramId: senderId,
          toTelegramId: recipientId,
          status: "pending",
        })
        .returning({ id: roomInvitesTable.id });

      return { kind: "ok" as const, inviteId: inserted?.id ?? null };
    });

    if (result.kind === "cooldown") {
      res.status(429).json({ error: "cooldown", waitSeconds: result.waitSeconds });
      return;
    }
    if (result.kind === "too_many_pending") {
      res.status(429).json({ error: "too_many_pending" });
      return;
    }
    res.json({ ok: true, inviteId: result.inviteId });
  } catch (err) {
    console.error("[room-invites] send error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── GET /room-invites/inbox ────────────────────────────────────────────
// Pending invites addressed to the CALLING user. Returns the sender's
// short display name plus the row id (needed for the respond call).
// Telegram ids and @usernames are NOT returned to the client.
router.get("/room-invites/inbox", async (req, res) => {
  const tgUser = getTgUser(req);
  if (!tgUser?.id) {
    res.json({ invites: [] });
    return;
  }
  try {
    const rows = await db
      .select({
        id: roomInvitesTable.id,
        fromTelegramId: roomInvitesTable.fromTelegramId,
        firstName: usersTable.firstName,
        username: usersTable.username,
        createdAt: roomInvitesTable.createdAt,
      })
      .from(roomInvitesTable)
      .leftJoin(usersTable, eq(usersTable.telegramId, roomInvitesTable.fromTelegramId))
      .where(
        and(
          eq(roomInvitesTable.toTelegramId, tgUser.id),
          eq(roomInvitesTable.status, "pending"),
        ),
      )
      .orderBy(desc(roomInvitesTable.createdAt))
      .limit(10);

    const invites = rows.map((r) => ({
      id: r.id,
      from: shortName(r.firstName, r.username),
      sentAt: r.createdAt.toISOString(),
    }));
    res.json({ invites });
  } catch (err) {
    console.error("[room-invites] inbox error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /room-invites/respond ─────────────────────────────────────────
// Recipient accepts or declines a pending invite. Auth binds telegramId
// to the verified caller; the WHERE clause additionally constrains the
// row by recipient so a verified user can never accept an invite that
// wasn't addressed to them (defense in depth on top of the bind).
const RespondBody = z.object({
  telegramId: z.string().min(1),
  inviteId: z.number().int().positive(),
  action: z.enum(["accept", "decline"]),
});

router.post("/room-invites/respond", async (req, res) => {
  const parsed = RespondBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { inviteId, action } = parsed.data;
  // SECURITY: authoritative recipient id is the verified Telegram user;
  // the body's telegramId is ignored for the WHERE clause so the route
  // is safe even if the central auth runs in soft/off mode.
  const tgUser = getTgUser(req);
  if (!tgUser?.id) {
    res.status(401).json({ error: "auth_required" });
    return;
  }
  const recipientId = tgUser.id;
  try {
    const updated = await db
      .update(roomInvitesTable)
      .set({
        status: action === "accept" ? "accepted" : "declined",
        acceptedAt: action === "accept" ? new Date() : null,
      })
      .where(
        and(
          eq(roomInvitesTable.id, inviteId),
          eq(roomInvitesTable.toTelegramId, recipientId),
          eq(roomInvitesTable.status, "pending"),
        ),
      )
      .returning({ id: roomInvitesTable.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "not_found_or_already_handled" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[room-invites] respond error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── GET /room-invites/visitors ─────────────────────────────────────────
// Active visitors = invites the CALLER sent that have been accepted in
// the last VISIT_MS. Returned in the same shape as /referral/friends so
// the client can render both lists with the same component.
router.get("/room-invites/visitors", async (req, res) => {
  const tgUser = getTgUser(req);
  if (!tgUser?.id) {
    res.json({ visitors: [] });
    return;
  }
  try {
    const cutoff = new Date(Date.now() - VISIT_MS);
    const rows = await db
      .select({
        toTelegramId: roomInvitesTable.toTelegramId,
        firstName: usersTable.firstName,
        username: usersTable.username,
        acceptedAt: roomInvitesTable.acceptedAt,
      })
      .from(roomInvitesTable)
      .leftJoin(usersTable, eq(usersTable.telegramId, roomInvitesTable.toTelegramId))
      .where(
        and(
          eq(roomInvitesTable.fromTelegramId, tgUser.id),
          eq(roomInvitesTable.status, "accepted"),
          gt(roomInvitesTable.acceptedAt, cutoff),
        ),
      )
      .orderBy(desc(roomInvitesTable.acceptedAt))
      .limit(8);

    const visitors = rows
      .filter((r) => r.acceptedAt != null)
      .map((r) => ({
        key: pairKey(tgUser.id, r.toTelegramId),
        name: shortName(r.firstName, r.username),
        joinedAt: r.acceptedAt!.toISOString(),
      }));
    res.json({ visitors });
  } catch (err) {
    console.error("[room-invites] visitors error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
