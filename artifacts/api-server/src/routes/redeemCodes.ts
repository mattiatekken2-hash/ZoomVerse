import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, redeemCodesTable, redeemCodeUsesTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { recordHistoryAsync } from "../lib/history";

const router = Router();

const ADMIN_ID = "8144744644";

// Reward kinds the admin can mint codes for. Amounts are FIXED at mint
// time to keep the admin UI a single tap per kind — no amount field.
const REWARD_PRESETS = {
  zoom: 2000,
  stardust: 10,
  spins: 3,
} as const;
type RewardKind = keyof typeof REWARD_PRESETS;

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// 8-char alphanumeric. Excludes 0/O/1/I/L to avoid the "did you type a
// zero or an O?" support tickets when admins read codes off a screen.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Drizzle wraps the underlying pg error in a `_DrizzleQueryError` whose
// `.cause` carries the real Postgres error (with `.code`). Walk the
// cause chain so unique-violation detection works whether the throw
// comes raw from pg or wrapped by drizzle.
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const e = cur as { code?: string; cause?: unknown };
    if (e?.code === "23505") return true;
    cur = e?.cause;
  }
  return false;
}
function randomCode(len = 8): string {
  let out = "";
  // crypto for unpredictability — Math.random is fine for collision odds
  // at 31^8 (~852B combos) but we use the secure RNG for defense in depth.
  const buf = new Uint32Array(len);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

// ───────────────── ADMIN: create code ─────────────────
const CreateBody = z.object({
  adminId: z.string(),
  kind: z.enum(["zoom", "stardust", "spins"]),
});

router.post("/admin/redeem-codes/create", async (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  if (parsed.data.adminId !== ADMIN_ID) {
    res.status(403).json({ ok: false, error: "FORBIDDEN" });
    return;
  }

  const kind = parsed.data.kind as RewardKind;
  const rewardAmount = REWARD_PRESETS[kind];
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Retry on the (astronomically unlikely) collision with an existing code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    try {
      await db.insert(redeemCodesTable).values({
        code,
        rewardType: kind,
        rewardAmount,
        expiresAt,
        createdBy: parsed.data.adminId,
      });
      res.json({
        ok: true,
        code,
        rewardType: kind,
        rewardAmount,
        expiresAt: expiresAt.toISOString(),
      });
      return;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) continue; // collided with existing code → retry
      logger.error({ err }, "[redeem-codes/create] db error");
      res.status(500).json({ ok: false, error: "DB_ERROR" });
      return;
    }
  }
  res.status(500).json({ ok: false, error: "CODE_COLLISION" });
});

// ───────────────── ADMIN: list recent codes (last 50) ─────────────────
//
// POST (not GET) so the path can be added to the central PROTECTED_ROUTES
// table with bindField "adminId" — that mounts requireTelegramAuth and
// (in TG_AUTH_MODE=strict) verifies the caller's initData against the
// claimed adminId. A GET endpoint with the admin id in the URL would be
// trivially callable by anyone who knows the (publicly visible) admin
// Telegram id, which would expose every live code to redemption abuse.
const ListBody = z.object({ adminId: z.string() });

router.post("/admin/redeem-codes/list", async (req, res) => {
  const parsed = ListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  if (parsed.data.adminId !== ADMIN_ID) {
    res.status(403).json({ ok: false, error: "FORBIDDEN" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(redeemCodesTable)
      .orderBy(sql`${redeemCodesTable.createdAt} DESC`)
      .limit(50);
    res.json({
      ok: true,
      codes: rows.map((r) => ({
        code: r.code,
        rewardType: r.rewardType,
        rewardAmount: r.rewardAmount,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "[redeem-codes/list] db error");
    res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
});

// ───────────────── USER: redeem ─────────────────
const RedeemBody = z.object({
  telegramId: z.string().min(1),
  code: z.string().min(1).max(64),
});

router.post("/redeem-codes/redeem", async (req, res) => {
  const parsed = RedeemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }

  const { telegramId } = parsed.data;
  const code = normalize(parsed.data.code);

  // The whole "verify + claim use slot + credit reward" sequence runs
  // inside a single DB transaction so the three steps either all commit
  // together or all roll back. This eliminates the previous failure
  // mode where the use-slot insert succeeded but the reward credit
  // failed, permanently marking the code as used for that user with
  // no payout.
  //
  // Discriminated outcomes are passed back through the return value
  // (not by writing to `res` from inside the tx) so the HTTP response
  // is sent only after the commit succeeds.
  type Outcome =
    | { kind: "ok"; rewardType: string; rewardAmount: number }
    | { kind: "not_found" }
    | { kind: "expired" }
    | { kind: "already_used" };

  try {
    const outcome: Outcome = await db.transaction(async (tx) => {
      // 1. Lookup the code. The expiry check happens INSIDE the tx so a
      //    request that crosses the TTL boundary while we're processing
      //    can't slip through — the row's expires_at is read at the
      //    same isolation snapshot used for the rest of the tx.
      const [row] = await tx
        .select()
        .from(redeemCodesTable)
        .where(eq(redeemCodesTable.code, code))
        .limit(1);

      if (!row) return { kind: "not_found" };
      if (row.expiresAt.getTime() <= Date.now()) return { kind: "expired" };

      // 2. Claim the per-user use slot. The unique index on
      //    (code, telegram_id) atomically gates double-redeem from two
      //    concurrent requests at the DB level — no application-level
      //    race window exists here.
      try {
        await tx.insert(redeemCodeUsesTable).values({ code, telegramId });
      } catch (err: unknown) {
        if (isUniqueViolation(err)) return { kind: "already_used" };
        throw err;
      }

      // 3. Credit the reward into the appropriate column. For zoom and
      //    stardust we bump balance_epoch so the client picks up the
      //    new value on its next sync. wheel_spins is read directly via
      //    its own endpoints and doesn't participate in the epoch dance,
      //    matching /admin/credit-spins.
      await tx
        .insert(usersTable)
        .values({
          telegramId,
          zoomBalance: row.rewardType === "zoom" ? row.rewardAmount : 0,
          referralCount: 0,
          stardustBalance: row.rewardType === "stardust" ? row.rewardAmount : 0,
          wheelSpins: row.rewardType === "spins" ? row.rewardAmount : 0,
          balanceEpoch: 1,
        })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set:
            row.rewardType === "zoom"
              ? {
                  zoomBalance: sql`${usersTable.zoomBalance} + ${row.rewardAmount}`,
                  balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
                }
              : row.rewardType === "stardust"
                ? {
                    stardustBalance: sql`${usersTable.stardustBalance} + ${row.rewardAmount}`,
                    balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
                  }
                : {
                    wheelSpins: sql`${usersTable.wheelSpins} + ${row.rewardAmount}`,
                  },
        });

      return { kind: "ok", rewardType: row.rewardType, rewardAmount: row.rewardAmount };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ ok: false, error: "NOT_FOUND" });
      return;
    }
    if (outcome.kind === "expired") {
      res.status(410).json({ ok: false, error: "EXPIRED" });
      return;
    }
    if (outcome.kind === "ok") {
      const currency = outcome.rewardType === "spins"
        ? "spins"
        : outcome.rewardType === "stardust"
          ? "stardust"
          : "zoom";
      recordHistoryAsync({
        telegramId,
        kind: "redeem_code",
        delta: outcome.rewardAmount,
        currency,
        meta: { code, rewardType: outcome.rewardType },
      });
    }
    if (outcome.kind === "already_used") {
      res.status(409).json({ ok: false, error: "ALREADY_USED" });
      return;
    }
    res.json({
      ok: true,
      rewardType: outcome.rewardType,
      rewardAmount: outcome.rewardAmount,
    });
  } catch (err) {
    logger.error({ err }, "[redeem-codes/redeem] db error");
    res.status(500).json({ ok: false, error: "DB_ERROR" });
  }
});

export default router;
