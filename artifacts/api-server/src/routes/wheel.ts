import { Router, type IRouter } from "express";
import { db, usersTable, spinLogsTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const PRIZES = [
  { name: "ZOOM",       weight: 7394 },
  { name: "RARE",       weight: 2000 },
  { name: "BLACK_HOLE", weight: 500  },
  { name: "EPIC",       weight: 100  },
  { name: "GOLD",       weight: 5    },
  { name: "SUN",        weight: 1    },
  { name: "TON",        weight: 0    },
  { name: "STARS",      weight: 0    },
] as const;

const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);

const ZOOM_AMOUNTS: Record<string, { min: number; max: number }> = {
  ZOOM: { min: 5, max: 50 },
};

const BASE_STAR_COST = 20;
const STAR_INCREMENT = 5;

function rollPrize(): string {
  const r = Math.random() * TOTAL_WEIGHT;
  let cumulative = 0;
  for (const p of PRIZES) {
    cumulative += p.weight;
    if (r < cumulative) return p.name;
  }
  return "ZOOM";
}

function getTodayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const SpinBody = z.object({
  telegramId: z.string().min(1),
  firstName: z.string().optional(),
});

router.get("/wheel/status/:telegramId", async (req, res) => {
  const telegramId = req.params.telegramId;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }

  try {
    const todayStart = getTodayStart();
    const spinsToday = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(spinLogsTable)
      .where(and(
        eq(spinLogsTable.telegramId, telegramId),
        gte(spinLogsTable.createdAt, todayStart)
      ));

    const count = spinsToday[0]?.count ?? 0;
    const hasFreeSpinToday = count === 0;
    const nextCost = hasFreeSpinToday ? 0 : BASE_STAR_COST + STAR_INCREMENT * (count - 1);

    res.json({
      spinsToday: count,
      hasFreeSpinToday,
      nextCost,
    });
  } catch (err) {
    console.error("[wheel/status] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/wheel/spin", async (req, res) => {
  const parsed = SpinBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { telegramId, firstName } = parsed.data;

  try {
    const todayStart = getTodayStart();
    const spinsToday = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(spinLogsTable)
      .where(and(
        eq(spinLogsTable.telegramId, telegramId),
        gte(spinLogsTable.createdAt, todayStart)
      ));

    const count = spinsToday[0]?.count ?? 0;
    const isFree = count === 0;
    const starsCost = isFree ? 0 : BASE_STAR_COST + STAR_INCREMENT * (count - 1);

    const prize = rollPrize();

    let zoomAmount = 0;
    if (prize === "ZOOM") {
      zoomAmount = Math.floor(Math.random() * (ZOOM_AMOUNTS.ZOOM.max - ZOOM_AMOUNTS.ZOOM.min + 1)) + ZOOM_AMOUNTS.ZOOM.min;
    }

    await db.insert(spinLogsTable).values({
      telegramId,
      firstName: firstName ?? null,
      prize,
      starsSpent: starsCost,
      isFree,
    });

    if (prize === "ZOOM" && zoomAmount > 0) {
      await db
        .update(usersTable)
        .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${zoomAmount}` })
        .where(eq(usersTable.telegramId, telegramId));
    }

    if (prize === "RARE" || prize === "EPIC" || prize === "GOLD" || prize === "SUN") {
      const bonusCol = prize === "RARE" ? "bonusRare"
        : prize === "EPIC" ? "bonusEpic"
        : prize === "GOLD" ? "bonusGold"
        : "bonusSun";

      if (bonusCol === "bonusSun") {
        await db
          .update(usersTable)
          .set({ bonusSun: true })
          .where(eq(usersTable.telegramId, telegramId));
      } else {
        await db
          .update(usersTable)
          .set({ [bonusCol]: sql`${usersTable[bonusCol]} + 1` })
          .where(eq(usersTable.telegramId, telegramId));
      }
    }

    const newCount = count + 1;
    const nextCost = BASE_STAR_COST + STAR_INCREMENT * (newCount - 1);

    res.json({
      ok: true,
      prize,
      zoomAmount: prize === "ZOOM" ? zoomAmount : 0,
      starsCost,
      isFree,
      spinsToday: newCount,
      nextCost,
    });
  } catch (err) {
    console.error("[wheel/spin] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/wheel/log", async (_req, res) => {
  try {
    const logs = await db
      .select({
        id: spinLogsTable.id,
        firstName: spinLogsTable.firstName,
        telegramId: spinLogsTable.telegramId,
        prize: spinLogsTable.prize,
        starsSpent: spinLogsTable.starsSpent,
        isFree: spinLogsTable.isFree,
        createdAt: spinLogsTable.createdAt,
      })
      .from(spinLogsTable)
      .orderBy(desc(spinLogsTable.createdAt))
      .limit(30);

    res.json({ logs });
  } catch (err) {
    console.error("[wheel/log] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
