import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const RegisterBody = z.object({
  telegramId: z.string().min(1),
  referredBy: z.string().min(1).nullish(),
});

router.post("/referral/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { telegramId, referredBy } = parsed.data;

  console.log(`[register] telegramId=${telegramId} referredBy=${referredBy ?? "none"}`);

  try {
    const inserted = await db
      .insert(usersTable)
      .values({ telegramId, referredBy: referredBy ?? null, referralCount: 0 })
      .onConflictDoNothing()
      .returning({ telegramId: usersTable.telegramId });

    const isNew = inserted.length > 0;

    if (isNew && referredBy) {
      await db
        .insert(usersTable)
        .values({ telegramId: referredBy, referralCount: 1 })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: { referralCount: sql`${usersTable.referralCount} + 1` },
        });
    }

    res.json({ ok: true, isNew });
  } catch (err) {
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
      res.json({ telegramId, referralCount: 0 });
      return;
    }

    res.json({ telegramId, referralCount: rows[0]!.referralCount });
  } catch (err) {
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
      .set({ referralCount: 0 })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
