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
    // SERVER-AUTHORITATIVE: never let a client-supplied balance ERASE a higher
    // server balance. This protects in-flight credits (Stars/TON purchases,
    // wheel rewards, referral bonuses) from being clobbered by a stale local
    // balance that the client computed before the credit landed.
    // The on-conflict update keeps the GREATER of (server, client) so legit
    // farming gains still get persisted, but purchases can never disappear.
    const [row] = await db
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

    res.json({ ok: true, zoomBalance: row?.zoomBalance ?? zoomBalance });
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
      .where(sql`${usersTable.zoomBalance} > 0`)
      .orderBy(desc(usersTable.zoomBalance))
      .limit(100);

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

router.get("/global-pool", async (_req, res) => {
  try {
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${usersTable.zoomBalance}), 0)` })
      .from(usersTable);

    res.json({ totalPool: result?.total ?? 0 });
  } catch (err) {
    console.error("[global-pool] error:", err);
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
      res.json({ zoomBalance: 0, firstName: null, exists: false });
      return;
    }

    res.json({ zoomBalance: rows[0]!.zoomBalance, firstName: rows[0]!.firstName, exists: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/profile/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  try {
    const rows = await db
      .select({
        createdAt: usersTable.createdAt,
        totalCraftedBasic: usersTable.totalCraftedBasic,
        totalCraftedRare: usersTable.totalCraftedRare,
        totalCraftedEpic: usersTable.totalCraftedEpic,
        totalCraftedGold: usersTable.totalCraftedGold,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      res.json({ exists: false });
      return;
    }

    res.json({
      exists: true,
      createdAt: rows[0]!.createdAt,
      crafted: {
        BASIC: rows[0]!.totalCraftedBasic,
        RARE: rows[0]!.totalCraftedRare,
        EPIC: rows[0]!.totalCraftedEpic,
        GOLD: rows[0]!.totalCraftedGold,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

const CraftBody = z.object({
  telegramId: z.string().min(1),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "GOLD"]),
});

router.post("/craft/record", async (req, res) => {
  const parsed = CraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { telegramId, planetType } = parsed.data;
  const fieldMap = {
    BASIC: "totalCraftedBasic" as const,
    RARE: "totalCraftedRare" as const,
    EPIC: "totalCraftedEpic" as const,
    GOLD: "totalCraftedGold" as const,
  };
  const field = fieldMap[planetType];

  try {
    await db
      .update(usersTable)
      .set({ [field]: sql`${usersTable[field]} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[craft/record] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
