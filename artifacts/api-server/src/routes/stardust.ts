import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DAILY_CAP = 25;
const GLOBAL_KEY = "stardust_global_total";

function utcDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function readGlobalTotal(): Promise<number> {
  const [row] = await db
    .select({ valueNum: appSettingsTable.valueNum })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, GLOBAL_KEY))
    .limit(1);
  return Number(row?.valueNum ?? 0);
}

router.get("/stardust/state", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "").trim();
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId required" });
  }
  try {
    const today = utcDayKey();
    const [u] = await db
      .select({
        balance: usersTable.stardustBalance,
        todayCount: usersTable.stardustToday,
        dayKey: usersTable.stardustDayKey,
        sunCount: usersTable.sunCount,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const todayEffective = u && u.dayKey === today ? (u.todayCount ?? 0) : 0;
    const globalTotal = await readGlobalTotal();
    res.json({
      balance: u?.balance ?? 0,
      today: todayEffective,
      dayKey: today,
      dailyCap: DAILY_CAP,
      globalTotal,
      hasSun: (u?.sunCount ?? 0) > 0,
    });
  } catch (err) {
    console.error("[stardust/state] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

const CollectBody = z.object({
  telegramId: z.string().min(1),
});

router.get("/stardust/leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        firstName: usersTable.firstName,
        stardust: usersTable.stardustBalance,
      })
      .from(usersTable)
      .where(sql`COALESCE(${usersTable.stardustBalance}, 0) > 0`)
      .orderBy(desc(usersTable.stardustBalance))
      .limit(10);

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      firstName: r.firstName || "Player",
      stardust: r.stardust ?? 0,
    }));
    res.json({ leaderboard });
  } catch (err) {
    console.error("[stardust/leaderboard] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/stardust/collect", async (req, res) => {
  const parsed = CollectBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, reason: "BAD_REQUEST" });
  }
  const { telegramId } = parsed.data;
  const today = utcDayKey();

  try {
    // 1) SUN ownership gate. The sun_count column is the authoritative count
    //    of SUN tokens this user holds (0 = none).
    const [u] = await db
      .select({
        balance: usersTable.stardustBalance,
        todayCount: usersTable.stardustToday,
        dayKey: usersTable.stardustDayKey,
        sunCount: usersTable.sunCount,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!u) {
      return res.status(404).json({ ok: false, reason: "USER_NOT_FOUND" });
    }
    if ((u.sunCount ?? 0) <= 0) {
      const globalTotal = await readGlobalTotal();
      return res.json({
        ok: false,
        reason: "NO_SUN",
        balance: u.balance ?? 0,
        today: u.dayKey === today ? (u.todayCount ?? 0) : 0,
        dailyCap: DAILY_CAP,
        globalTotal,
      });
    }

    // 2) Daily cap. The today counter resets when the stored day key rolls.
    const todayEffective = u.dayKey === today ? (u.todayCount ?? 0) : 0;
    if (todayEffective >= DAILY_CAP) {
      const globalTotal = await readGlobalTotal();
      return res.json({
        ok: false,
        reason: "DAILY_CAP",
        balance: u.balance ?? 0,
        today: todayEffective,
        dailyCap: DAILY_CAP,
        globalTotal,
      });
    }

    // 3) Atomic increment + global counter bump in a single DB transaction so
    //    user balance and the global total can never drift on partial failures.
    //    The UPDATE uses a SQL CASE so a parallel request that just rolled the
    //    day key cannot lose its reset (and same-day parallels correctly
    //    increment off the latest stored value). The WHERE re-checks the cap
    //    at the SQL level so two requests racing at cap-1 cannot both succeed.
    //    `IS DISTINCT FROM` makes the day-key comparison null-safe (matters
    //    the very first time a user collects, when stardust_day_key is NULL).
    const txResult = await db.transaction(async (tx) => {
      const [upd] = await tx
        .update(usersTable)
        .set({
          stardustBalance: sql`${usersTable.stardustBalance} + 1`,
          stardustToday: sql`CASE WHEN ${usersTable.stardustDayKey} = ${today} THEN ${usersTable.stardustToday} + 1 ELSE 1 END`,
          stardustDayKey: today,
        })
        .where(sql`${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.sunCount} > 0
          AND (${usersTable.stardustDayKey} IS DISTINCT FROM ${today} OR COALESCE(${usersTable.stardustToday}, 0) < ${DAILY_CAP})`)
        .returning({
          balance: usersTable.stardustBalance,
          todayCount: usersTable.stardustToday,
        });

      if (!upd) return null;

      const [g] = await tx
        .insert(appSettingsTable)
        .values({ key: GLOBAL_KEY, valueNum: 1 })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: {
            valueNum: sql`COALESCE(${appSettingsTable.valueNum}, 0) + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ valueNum: appSettingsTable.valueNum });

      return { upd, globalTotal: Number(g?.valueNum ?? 0) };
    });

    if (!txResult) {
      // Lost the race (cap reached or sun lost between read and write).
      // Re-read the authoritative current state so the client doesn't show
      // stale counters, and pick the correct reason.
      const [fresh] = await db
        .select({
          balance: usersTable.stardustBalance,
          todayCount: usersTable.stardustToday,
          dayKey: usersTable.stardustDayKey,
          sunCount: usersTable.sunCount,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      const freshTodayEffective = fresh && fresh.dayKey === today ? (fresh.todayCount ?? 0) : 0;
      const freshReason = !fresh || (fresh.sunCount ?? 0) <= 0 ? "NO_SUN" : "DAILY_CAP";
      const globalTotal = await readGlobalTotal();
      return res.json({
        ok: false,
        reason: freshReason,
        balance: fresh?.balance ?? u.balance ?? 0,
        today: freshTodayEffective,
        dailyCap: DAILY_CAP,
        globalTotal,
      });
    }

    res.json({
      ok: true,
      balance: txResult.upd.balance ?? 0,
      today: txResult.upd.todayCount ?? 0,
      dailyCap: DAILY_CAP,
      globalTotal: txResult.globalTotal,
    });
  } catch (err) {
    console.error("[stardust/collect] error:", err);
    res.status(500).json({ ok: false, reason: "SERVER_ERROR" });
  }
});

export default router;
