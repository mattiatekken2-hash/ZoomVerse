import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// Per-invite reward: small ★ helper + 0.1 TON deposit (no ZOOM).
// Pizza forge costs 3 ★ — 2 ★/invite is a nudge, not free Lab forges.
const REFERRAL_STARDUST = 2;
const REFERRAL_TON_DEPOSIT = 0.1;

// HALL OF FAME helper: same UTC day-key convention as stardust.
// Inlined here (instead of imported) to avoid coupling the referral route
// to the stardust route's internal helpers.
function utcDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Referral ZOOM milestones — tiny helper only. Pot costs 500 $ZOOM;
// even all six milestones (~1.2k) never replace Lab farming.
const MILESTONES = [
  { count: 5, reward: 40 },
  { count: 10, reward: 70 },
  { count: 20, reward: 100 },
  { count: 50, reward: 180 },
  { count: 100, reward: 300 },
  { count: 200, reward: 500 },
];

function getClaimedSet(raw: string): Set<number> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map(Number).filter(n => !isNaN(n)));
}

function setToString(s: Set<number>): string {
  return [...s].sort((a, b) => a - b).join(",");
}

async function checkAndCreditMilestones(telegramId: string) {
  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (!user) return { credited: 0, milestonesClaimed: [] as number[] };

  const claimed = getClaimedSet(user.claimedMilestones || "");
  let totalReward = 0;
  const newlyClaimed: number[] = [];

  for (const m of MILESTONES) {
    if (user.referralCount >= m.count && !claimed.has(m.count)) {
      claimed.add(m.count);
      totalReward += m.reward;
      newlyClaimed.push(m.count);
    }
  }

  if (totalReward > 0) {
    await db.update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} + ${totalReward}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        claimedMilestones: setToString(claimed),
      })
      .where(eq(usersTable.telegramId, telegramId));
    console.log(`[referral] Milestone rewards for ${telegramId}: +${totalReward} ZOOM (milestones: ${newlyClaimed.join(",")})`);
  }

  return { credited: totalReward, milestonesClaimed: newlyClaimed };
}

const RegisterBody = z.object({
  telegramId: z.string().min(1),
  referredBy: z.string().min(1).nullish(),
  firstName: z.string().nullish(),
  username: z.string().nullish(),
  photoUrl: z.string().nullish(),
});

router.post("/referral/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { telegramId, referredBy, firstName, username, photoUrl } = parsed.data;
  const normalizedUsername = username ? username.replace(/^@/, "").toLowerCase() : null;

  console.log(`[register] telegramId=${telegramId} username=${normalizedUsername ?? "none"} referredBy=${referredBy ?? "none"}`);

  try {
    // Use ON CONFLICT DO NOTHING + RETURNING so we can reliably tell
    // whether this was a true insert (returns 1 row) or an existing user
    // (returns 0 rows). The previous DO UPDATE variant always returned
    // the row, which made every app reopen with a stored start_param
    // re-credit the referrer (+20 ZOOM each time + double-count milestones).
    const inserted = await db
      .insert(usersTable)
      .values({
        telegramId,
        referredBy: referredBy ?? null,
        referralCount: 0,
        firstName: firstName ?? null,
        username: normalizedUsername,
        photoUrl: photoUrl ?? null,
        stardustBalance: 30,
        redStarBalance: 5,
      })
      .onConflictDoNothing({ target: usersTable.telegramId })
      .returning({ telegramId: usersTable.telegramId });

    const isNew = inserted.length > 0;

    // For existing users, refresh first_name/username/photoUrl separately so we keep
    // those columns up to date without affecting the new/existing detection.
    if (!isNew && (firstName || normalizedUsername || photoUrl)) {
      await db.update(usersTable)
        .set({
          ...(firstName ? { firstName } : {}),
          ...(normalizedUsername ? { username: normalizedUsername } : {}),
          ...(photoUrl ? { photoUrl } : {}),
        })
        .where(eq(usersTable.telegramId, telegramId));
    }

    let shouldCreditReferrer = isNew && !!referredBy && referredBy !== telegramId;

    if (!isNew && referredBy && referredBy !== telegramId) {
      const [existingUser] = await db.select().from(usersTable)
        .where(eq(usersTable.telegramId, telegramId)).limit(1);
      if (existingUser && !existingUser.referredBy) {
        await db.update(usersTable)
          .set({ referredBy })
          .where(eq(usersTable.telegramId, telegramId));
        shouldCreditReferrer = true;
        console.log(`[referral] Late-linked user ${telegramId} to referrer ${referredBy}`);
      }
    }

    if (shouldCreditReferrer && referredBy) {
      // Single UPSERT bumps:
      //   • referral_count       — lifetime counter (+ 1)
      //   • stardust_balance     — +REFERRAL_STARDUST per invite
      //   • deposit_balance      — +0.1 TON deposited to wallet
      //   • daily_referral_count — Hall of Fame counter, reset-on-rollover
      //   • daily_referral_day_key — UTC day this counter belongs to
      //
      // The HOF reset uses the same atomic CASE pattern as stardust:
      // if the stored day_key matches today, increment; otherwise reset
      // to 1 and stamp today's key.
      const today = utcDayKey();
      await db
        .insert(usersTable)
        .values({
          telegramId: referredBy,
          referralCount: 1,
          stardustBalance: REFERRAL_STARDUST,
          depositBalance: REFERRAL_TON_DEPOSIT,
          dailyReferralCount: 1,
          dailyReferralDayKey: today,
        })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: {
            referralCount: sql`${usersTable.referralCount} + 1`,
            stardustBalance: sql`${usersTable.stardustBalance} + ${REFERRAL_STARDUST}`,
            depositBalance: sql`${usersTable.depositBalance} + ${REFERRAL_TON_DEPOSIT}`,
            dailyReferralCount: sql`CASE WHEN ${usersTable.dailyReferralDayKey} = ${today} THEN ${usersTable.dailyReferralCount} + 1 ELSE 1 END`,
            dailyReferralDayKey: today,
          },
        });

      console.log(`[referral] +${REFERRAL_STARDUST} stardust +${REFERRAL_TON_DEPOSIT} TON deposit credited to referrer ${referredBy} for user ${telegramId}`);

      await checkAndCreditMilestones(referredBy);
    }

    res.json({ ok: true, isNew });
  } catch (err) {
    console.error("[referral] register error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── GET /referral/friends ──────────────────────────────────────────────
// List the most recent users who joined via the CALLING user's referral
// link. Used by HOME to spawn one extra "friend astronaut" per accepted
// invite so the host's room visibly fills up over time.
//
// Auth: relies on Telegram initData (the global auth middleware in
// routes/index.ts populates `req.tgUser` for this path). We only ever
// query referrals belonging to the verified caller — the path is
// parameterless on purpose so a malicious client cannot ask for someone
// else's friend list.
//
// Privacy: we deliberately do NOT return raw telegramIds or @usernames
// of the invited friends. The host only sees a non-reversible per-room
// `key` (used by the client just to assign a stable color/spot) plus a
// short display name. This is strictly less sensitive than what the
// existing /referral/:id endpoint already exposes (referralCount).
import { createHash } from "node:crypto";

router.get("/referral/friends", async (req, res) => {
  const tgUser = (req as unknown as { tgUser?: { id: string } | null }).tgUser ?? null;
  if (!tgUser?.id) {
    res.json({ friends: [] });
    return;
  }
  const MAX = 8;
  try {
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        firstName: usersTable.firstName,
        username: usersTable.username,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.referredBy, tgUser.id))
      .limit(MAX);

    // Hash telegramId with the host's id as salt so the resulting key
    // is stable for THIS host's view but cannot be cross-correlated to
    // identify the friend across other endpoints. `joinedAt` is the
    // server timestamp of when the friend created their account; the
    // client uses it to auto-hide the friend's astronaut after a fixed
    // visit window (currently 30 min).
    const friends = rows.map((r) => {
      const key = createHash("sha256")
        .update(`${tgUser.id}:${r.telegramId}`)
        .digest("hex")
        .slice(0, 16);
      const name = (r.firstName || r.username || "Friend").toString().slice(0, 16);
      return { key, name, joinedAt: r.createdAt.toISOString() };
    });

    res.json({ friends });
  } catch (err) {
    console.error("[referral] friends fetch error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// NOTE: this catch-all by-id route MUST stay below `/referral/friends`
// (and any other static segment under `/referral/`) — Express route
// matching is order-sensitive, so a literal segment registered after
// `:telegramId` would otherwise be swallowed by the wildcard.
router.get("/referral/:telegramId", async (req, res) => {
  const { telegramId } = req.params;

  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ telegramId, referralCount: 0, claimedMilestones: [] });
      return;
    }

    const claimed = getClaimedSet(rows[0]!.claimedMilestones || "");

    res.json({
      telegramId,
      referralCount: rows[0]!.referralCount,
      claimedMilestones: [...claimed],
    });
  } catch (err) {
    console.error("[referral] fetch error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/referral/check-milestones", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    const result = await checkAndCreditMilestones(telegramId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[referral] milestone check error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/referral/reset", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ referralCount: 0, claimedMilestones: "" })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

// ADMIN-ONLY. The original endpoint was open to any caller — letting a
// referee unlink themselves before buying from their former referrer
// would have re-opened the marketplace referral-chain bypass we close
// in /market/buy. Now requires the admin id in the body and is also
// listed in PROTECTED_ROUTES under the admin section so the Telegram
// auth middleware binds the call to the admin's verified initData.
const ADMIN_ID = "8144744644";
router.post("/referral/unlink", async (req, res) => {
  const { adminId, telegramId } = req.body as { adminId?: string; telegramId?: string };
  if (adminId !== ADMIN_ID) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ referredBy: null })
      .where(eq(usersTable.telegramId, telegramId));
    console.log(`[referral] Admin ${adminId} unlinked referrer for ${telegramId}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/referral/debug", (req, res) => {
  const { telegramId, initData, initDataUnsafe, startParam, localStorageParam, href, hash, search } = req.body as Record<string, string>;
  console.log(`[debug] id=${telegramId} startParam=${startParam ?? "null"} ls=${localStorageParam ?? "null"}`);
  console.log(`[debug] href=${href ?? "n/a"} hash=${hash ?? "n/a"} search=${search ?? "n/a"}`);
  console.log(`[debug] initData=${initData ?? "empty"}`);
  res.json({ received: true });
});

export default router;
