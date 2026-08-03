import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DAILY_REDSTAR_AMOUNT = 10;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const ClaimBody = z.object({ telegramId: z.string().min(1) });

/**
 * POST /stella-rossa/claim-daily
 * Awards 10 Redstar to the caller once every 24h, provided they have the
 * Stella Rossa collection unlocked.
 */
router.post("/stella-rossa/claim-daily", async (req, res) => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;

  try {
    const [user] = await db
      .select({
        stellaRossaCollectionUnlocked: usersTable.stellaRossaCollectionUnlocked,
        redStarBalance: usersTable.redStarBalance,
        lastStellaClaimAt: usersTable.lastStellaClaimAt,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    if (!user.stellaRossaCollectionUnlocked) {
      res.status(403).json({ ok: false, error: "Stella Rossa collection not unlocked" });
      return;
    }

    const now = Date.now();
    const lastClaim = Number(user.lastStellaClaimAt ?? 0);
    const cooldownRemaining = Math.max(0, lastClaim + CLAIM_COOLDOWN_MS - now);

    if (cooldownRemaining > 0) {
      res.status(429).json({
        ok: false,
        error: "Already claimed today",
        nextClaimAt: lastClaim + CLAIM_COOLDOWN_MS,
        cooldownRemainingMs: cooldownRemaining,
      });
      return;
    }

    await db
      .update(usersTable)
      .set({
        redStarBalance: sql`${usersTable.redStarBalance} + ${DAILY_REDSTAR_AMOUNT}`,
        lastStellaClaimAt: sql`${BigInt(now)}`,
      })
      .where(eq(usersTable.telegramId, telegramId));

    const newBalance = (user.redStarBalance ?? 0) + DAILY_REDSTAR_AMOUNT;
    res.json({
      ok: true,
      awarded: DAILY_REDSTAR_AMOUNT,
      newRedStarBalance: newBalance,
      nextClaimAt: now + CLAIM_COOLDOWN_MS,
    });
  } catch (err) {
    console.error("[stella-rossa/claim-daily] error:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/**
 * GET /stella-rossa/claim-status?telegramId=...
 * Returns whether the user can claim and when the next claim is available.
 */
router.get("/stella-rossa/claim-status", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "").trim();
  if (!telegramId) {
    res.status(400).json({ ok: false, error: "telegramId required" });
    return;
  }
  try {
    const [user] = await db
      .select({
        stellaRossaCollectionUnlocked: usersTable.stellaRossaCollectionUnlocked,
        lastStellaClaimAt: usersTable.lastStellaClaimAt,
        redStarBalance: usersTable.redStarBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }

    const now = Date.now();
    const lastClaim = Number(user.lastStellaClaimAt ?? 0);
    const nextClaimAt = lastClaim + CLAIM_COOLDOWN_MS;
    const canClaim = user.stellaRossaCollectionUnlocked && now >= nextClaimAt;

    res.json({
      ok: true,
      unlocked: !!user.stellaRossaCollectionUnlocked,
      canClaim,
      lastClaimAt: lastClaim,
      nextClaimAt,
      redStarBalance: user.redStarBalance ?? 0,
    });
  } catch (err) {
    console.error("[stella-rossa/claim-status] error:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

export default router;
