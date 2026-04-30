import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const REFERRAL_BONUS = 20;

const MILESTONES = [
  { count: 5, reward: 500 },
  { count: 10, reward: 1000 },
  { count: 20, reward: 2000 },
  { count: 50, reward: 5000 },
  { count: 100, reward: 12000 },
  { count: 200, reward: 30000 },
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
});

router.post("/referral/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { telegramId, referredBy, firstName, username } = parsed.data;
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
      .values({ telegramId, referredBy: referredBy ?? null, referralCount: 0, firstName: firstName ?? null, username: normalizedUsername })
      .onConflictDoNothing({ target: usersTable.telegramId })
      .returning({ telegramId: usersTable.telegramId });

    const isNew = inserted.length > 0;

    // For existing users, refresh first_name/username separately so we keep
    // those columns up to date without affecting the new/existing detection.
    if (!isNew && (firstName || normalizedUsername)) {
      await db.update(usersTable)
        .set({
          ...(firstName ? { firstName } : {}),
          ...(normalizedUsername ? { username: normalizedUsername } : {}),
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
      await db
        .insert(usersTable)
        .values({ telegramId: referredBy, referralCount: 1, zoomBalance: REFERRAL_BONUS, balanceEpoch: 1 })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: {
            referralCount: sql`${usersTable.referralCount} + 1`,
            zoomBalance: sql`${usersTable.zoomBalance} + ${REFERRAL_BONUS}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          },
        });

      console.log(`[referral] +${REFERRAL_BONUS} ZOOM credited to referrer ${referredBy} for user ${telegramId}`);

      await checkAndCreditMilestones(referredBy);
    }

    res.json({ ok: true, isNew });
  } catch (err) {
    console.error("[referral] register error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

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

router.post("/referral/unlink", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ referredBy: null })
      .where(eq(usersTable.telegramId, telegramId));
    console.log(`[referral] Unlinked referrer for ${telegramId}`);
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
