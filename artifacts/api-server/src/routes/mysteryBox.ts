import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { addBoxClient, removeBoxClient } from "../lib/activityBus";

const router: IRouter = Router();

const MYSTERY_BOX_SUN_GLOBAL_CAP = 50;
const MYSTERY_BOX_SUN_COUNTER_KEY = "mystery_box_suns_awarded";

function awardLabel(a: string): string {
  switch (a) {
    case "basic": return "a Basic Planet";
    case "rare": return "a Rare Planet";
    case "epic": return "an Epic Planet";
    case "gold": return "a Gold Planet";
    case "sun": return "THE SUN ☀️";
    default: return a;
  }
}

router.get("/mystery-box/stock", async (_req, res) => {
  try {
    const [row] = await db.select().from(appSettingsTable)
      .where(eq(appSettingsTable.key, MYSTERY_BOX_SUN_COUNTER_KEY)).limit(1);
    const sunsAwarded = Number(row?.valueNum ?? 0);
    res.set("Cache-Control", "no-store");
    res.json({
      sunsAwarded,
      sunsCap: MYSTERY_BOX_SUN_GLOBAL_CAP,
      sunsRemaining: Math.max(0, MYSTERY_BOX_SUN_GLOBAL_CAP - sunsAwarded),
    });
  } catch (err) {
    console.error("[mystery-box/stock] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/mystery-box/activity", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt((req.query["limit"] as string) || "30", 10) || 30, 1), 100);
    const rows = await db
      .select({
        id: transactionsTable.id,
        award: transactionsTable.award,
        createdAt: transactionsTable.createdAt,
        first: usersTable.firstName,
        uname: usersTable.username,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(usersTable.telegramId, transactionsTable.telegramId))
      .where(and(
        eq(transactionsTable.itemId, "mystery_box"),
        eq(transactionsTable.status, "completed"),
        isNotNull(transactionsTable.award),
      ))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit);

    res.set("Cache-Control", "no-store");
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        userName: r.first || (r.uname ? `@${r.uname}` : "Anon"),
        award: r.award as string,
        awardLabel: awardLabel(r.award as string),
        openedAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Date.now(),
      })),
    });
  } catch (err) {
    console.error("[mystery-box/activity] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/mystery-box/activity/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {}\n\n`);

  addBoxClient(res);

  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: {}\n\n`); } catch { /* ignore */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    removeBoxClient(res);
  });
});

export default router;
