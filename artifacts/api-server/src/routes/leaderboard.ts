import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SyncBody = z.object({
  telegramId: z.string().min(1),
  firstName: z.string().optional(),
  zoomBalance: z.number().min(0),
});

router.post("/balance/sync", async (req, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { telegramId, firstName, zoomBalance } = parsed.data;

  try {
    const rows = await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance, firstName: firstName ?? null, referralCount: 0 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          zoomBalance: sql`GREATEST(${usersTable.zoomBalance}, ${zoomBalance})`,
          ...(firstName ? { firstName } : {}),
        },
      })
      .returning({ zoomBalance: usersTable.zoomBalance });

    const serverBalance = rows[0]?.zoomBalance ?? zoomBalance;
    res.json({ ok: true, zoomBalance: serverBalance });
  } catch (err) {
    console.error("[balance/sync] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        firstName: usersTable.firstName,
        zoomBalance: usersTable.zoomBalance,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.zoomBalance))
      .limit(5);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      telegramId: row.telegramId,
      firstName: row.firstName || "Player",
      zoomBalance: row.zoomBalance,
    }));

    res.json({ leaderboard });
  } catch (err) {
    console.error("[leaderboard] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/balance/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db
      .select({ zoomBalance: usersTable.zoomBalance, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ zoomBalance: 0, firstName: null });
      return;
    }

    res.json({ zoomBalance: rows[0]!.zoomBalance, firstName: rows[0]!.firstName });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
