import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { recordHistoryAsync } from "../lib/history";
import {
  STARDUST_GENESIS_MICRO,
  STARDUST_SCALE,
  bumpStardustIndex,
  getStardustChart,
  getStardustIndexMicro,
  normalizeStardustChartPoints,
  readGlobalStakedTotal,
  stardustValueAtIndex,
  gramToStardust,
  stardustToGram,
  STARDUST_PER_GRAM_BASE,
  STARDUST_TO_GRAM_SPREAD,
} from "../lib/stardustPrice";

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

    if (txResult) {
      recordHistoryAsync({
        telegramId,
        kind: "stardust_collect",
        delta: 1,
        currency: "stardust",
      });
      void bumpStardustIndex("earn");
    }
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

// Top 10 stardust holders. Returns a small public list (no telegram_id) so
// it's safe to render in the client. We prefer username, fall back to
// firstName, then to a generic "Player". Players with 0 balance are filtered
// out so the list doesn't pad with empty entries on a fresh database.
const DeductBody = z.object({
  telegramId: z.string().min(1),
  amount: z.number().min(1),
});

router.post("/stardust/deduct", async (req, res) => {
  const parsed = DeductBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "BAD_REQUEST" });
  }
  const { telegramId, amount } = parsed.data;
  try {
    const [upd] = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`GREATEST(0, ${usersTable.stardustBalance} - ${amount})`,
      })
      .where(
        sql`${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.stardustBalance} >= ${amount}
          AND ${usersTable.isDisabled} = false`
      )
      .returning({ stardustBalance: usersTable.stardustBalance });
    if (!upd) {
      return res.status(402).json({ ok: false, error: "Insufficient stardust" });
    }
    void bumpStardustIndex("spend");
    res.json({ ok: true, newBalance: Number(upd.stardustBalance ?? 0) });
  } catch (err) {
    req.log.error(err, "[stardust/deduct] error");
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

const ConvertBody = z.object({
  telegramId: z.string().min(1),
  /** GRAM from deposit + earned balance → STARDUST. */
  gramAmount: z.coerce.number().positive(),
});

router.post("/stardust/convert-deposit", async (req, res) => {
  const parsed = ConvertBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid amount — enter a positive GRAM value" });
  }
  const { telegramId, gramAmount } = parsed.data;
  try {
    const indexMicro = await getStardustIndexMicro();
    const stardustOut = gramToStardust(gramAmount, indexMicro);

    const [upd] = await db
      .update(usersTable)
      .set({
        depositBalance: sql`${usersTable.depositBalance} - LEAST(COALESCE(${usersTable.depositBalance}, 0), ${gramAmount})`,
        tonBalance: sql`${usersTable.tonBalance} - GREATEST(0, ${gramAmount} - LEAST(COALESCE(${usersTable.depositBalance}, 0), ${gramAmount}))`,
        stardustBalance: sql`${usersTable.stardustBalance} + ${stardustOut}`,
      })
      .where(sql`
        ${usersTable.telegramId} = ${telegramId}
        AND COALESCE(${usersTable.depositBalance}, 0) + COALESCE(${usersTable.tonBalance}, 0) >= ${gramAmount}
        AND ${usersTable.isDisabled} = false
      `)
      .returning({
        depositBalance: usersTable.depositBalance,
        tonBalance: usersTable.tonBalance,
        stardustBalance: usersTable.stardustBalance,
      });

    if (!upd) {
      return res.status(402).json({
        ok: false,
        error: "Insufficient GRAM (need deposit + earned balance)",
      });
    }

    void bumpStardustIndex("convert");
    recordHistoryAsync({
      telegramId,
      kind: "stardust_convert",
      delta: stardustOut,
      currency: "stardust",
      meta: { gramSpent: gramAmount, index: indexMicro / STARDUST_SCALE },
    });

    res.json({
      ok: true,
      stardustReceived: stardustOut,
      depositBalance: Number(upd.depositBalance ?? 0),
      tonBalance: Number(upd.tonBalance ?? 0),
      stardustBalance: Number(upd.stardustBalance ?? 0),
      index: indexMicro / STARDUST_SCALE,
      rate: STARDUST_PER_GRAM_BASE,
    });
  } catch (err) {
    console.error("[stardust/convert-deposit]", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

const ConvertToGramBody = z.object({
  telegramId: z.string().min(1),
  /** STARDUST from wallet balance → earned GRAM (85% of nominal at live index). */
  stardustAmount: z.coerce.number().int().positive(),
});

router.post("/stardust/convert-to-gram", async (req, res) => {
  const parsed = ConvertToGramBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid amount — enter a positive STARDUST value" });
  }
  const { telegramId, stardustAmount } = parsed.data;
  try {
    const indexMicro = await getStardustIndexMicro();
    const gramOut = stardustToGram(stardustAmount, indexMicro);
    if (gramOut <= 0) {
      return res.status(400).json({ ok: false, error: "Amount too small at current index" });
    }

    const [upd] = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} - ${stardustAmount}`,
        tonBalance: sql`${usersTable.tonBalance} + ${gramOut}`,
      })
      .where(sql`
        ${usersTable.telegramId} = ${telegramId}
        AND COALESCE(${usersTable.stardustBalance}, 0) >= ${stardustAmount}
        AND ${usersTable.isDisabled} = false
      `)
      .returning({
        depositBalance: usersTable.depositBalance,
        tonBalance: usersTable.tonBalance,
        stardustBalance: usersTable.stardustBalance,
      });

    if (!upd) {
      return res.status(402).json({
        ok: false,
        error: "Insufficient STARDUST (wallet balance only — unstake first if needed)",
      });
    }

    void bumpStardustIndex("convert_out");
    recordHistoryAsync({
      telegramId,
      kind: "stardust_convert_out",
      delta: -stardustAmount,
      currency: "stardust",
      meta: { gramReceived: gramOut, index: indexMicro / STARDUST_SCALE, spread: STARDUST_TO_GRAM_SPREAD },
    });
    recordHistoryAsync({
      telegramId,
      kind: "gram_convert_in",
      delta: gramOut,
      currency: "gram",
      meta: { stardustSpent: stardustAmount, index: indexMicro / STARDUST_SCALE, spread: STARDUST_TO_GRAM_SPREAD },
    });

    res.json({
      ok: true,
      gramReceived: gramOut,
      stardustSpent: stardustAmount,
      depositBalance: Number(upd.depositBalance ?? 0),
      tonBalance: Number(upd.tonBalance ?? 0),
      stardustBalance: Number(upd.stardustBalance ?? 0),
      index: indexMicro / STARDUST_SCALE,
      spread: STARDUST_TO_GRAM_SPREAD,
    });
  } catch (err) {
    console.error("[stardust/convert-to-gram]", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.get("/stardust/market/price", async (_req, res) => {
  try {
    const indexMicro = await getStardustIndexMicro();
    const totalStaked = await readGlobalStakedTotal();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      indexMicro,
      index: indexMicro / STARDUST_SCALE,
      genesisIndex: STARDUST_GENESIS_MICRO / STARDUST_SCALE,
      totalStaked,
      stardustPerGramBase: STARDUST_PER_GRAM_BASE,
      gramPerStardustAtIndex: (indexMicro / STARDUST_SCALE) / STARDUST_PER_GRAM_BASE,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[stardust/market/price]", err);
    res.json({
      indexMicro: STARDUST_GENESIS_MICRO,
      index: STARDUST_GENESIS_MICRO / STARDUST_SCALE,
      genesisIndex: STARDUST_GENESIS_MICRO / STARDUST_SCALE,
      totalStaked: 0,
      updatedAt: Date.now(),
    });
  }
});

router.get("/stardust/market/history", async (_req, res) => {
  try {
    const raw = await getStardustChart();
    const points = normalizeStardustChartPoints(raw);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      points: points.map((pt) => ({
        t: pt.t,
        p: pt.p,
        index: pt.p / STARDUST_SCALE,
      })),
      genesisIndex: STARDUST_GENESIS_MICRO / STARDUST_SCALE,
    });
  } catch {
    res.json({ points: [], genesisIndex: STARDUST_GENESIS_MICRO / STARDUST_SCALE });
  }
});

router.get("/stardust/stake/state", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "").trim();
  if (!telegramId) return res.status(400).json({ error: "telegramId required" });
  try {
    const indexMicro = await getStardustIndexMicro();
    const [u] = await db
      .select({
        balance: usersTable.stardustBalance,
        staked: usersTable.stardustStaked,
        stakeIndex: usersTable.stardustStakeIndexMicro,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const staked = Number(u?.staked ?? 0);
    const stakeIndex = Number(u?.stakeIndex ?? STARDUST_GENESIS_MICRO);
    const stakedValue = stardustValueAtIndex(staked, stakeIndex, indexMicro);

    res.json({
      balance: Number(u?.balance ?? 0),
      staked,
      stakeIndexMicro: stakeIndex,
      stakedValue,
      index: indexMicro / STARDUST_SCALE,
      pnl: stakedValue - staked,
    });
  } catch (err) {
    console.error("[stardust/stake/state]", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (/stardust_staked|stardust_stake_index|column/i.test(msg)) {
      res.status(503).json({ error: "Stake pool not migrated — run stardust_stake.sql" });
      return;
    }
    res.status(500).json({ error: "Internal error" });
  }
});

const StakeBody = z.object({
  telegramId: z.string().min(1),
  amount: z.coerce.number().int().positive(),
});

router.post("/stardust/stake", async (req, res) => {
  const parsed = StakeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "BAD_REQUEST" });
  const { telegramId, amount } = parsed.data;
  try {
    const indexMicro = await getStardustIndexMicro();
    const [u] = await db
      .select({
        balance: usersTable.stardustBalance,
        staked: usersTable.stardustStaked,
        stakeIndex: usersTable.stardustStakeIndexMicro,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (!u) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    if ((u.balance ?? 0) < amount) {
      return res.status(402).json({ ok: false, error: "Insufficient stardust" });
    }

    const oldStaked = Number(u.staked ?? 0);
    const oldIndex = Number(u.stakeIndex ?? STARDUST_GENESIS_MICRO);
    const newStaked = oldStaked + amount;
    const newIndex = oldStaked <= 0
      ? indexMicro
      : Math.round((oldStaked * oldIndex + amount * indexMicro) / newStaked);

    const [upd] = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} - ${amount}`,
        stardustStaked: newStaked,
        stardustStakeIndexMicro: newIndex,
      })
      .where(sql`${usersTable.telegramId} = ${telegramId} AND ${usersTable.stardustBalance} >= ${amount}`)
      .returning({
        balance: usersTable.stardustBalance,
        staked: usersTable.stardustStaked,
        stakeIndex: usersTable.stardustStakeIndexMicro,
      });

    if (!upd) return res.status(402).json({ ok: false, error: "Insufficient stardust" });

    void bumpStardustIndex("stake");
    const stakedValue = stardustValueAtIndex(
      Number(upd.staked ?? 0),
      Number(upd.stakeIndex ?? STARDUST_GENESIS_MICRO),
      indexMicro,
    );

    res.json({
      ok: true,
      balance: Number(upd.balance ?? 0),
      staked: Number(upd.staked ?? 0),
      stakedValue,
      index: indexMicro / STARDUST_SCALE,
    });
  } catch (err) {
    console.error("[stardust/stake]", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (/stardust_staked|stardust_stake_index|column/i.test(msg)) {
      res.status(503).json({
        ok: false,
        error: "Stake pool not migrated yet — run DB migration for stardust_staked columns",
      });
      return;
    }
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

const UnstakeBody = z.object({
  telegramId: z.string().min(1),
  amount: z.number().int().positive().optional(),
});

router.post("/stardust/unstake", async (req, res) => {
  const parsed = UnstakeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "BAD_REQUEST" });
  const { telegramId, amount } = parsed.data;
  try {
    const indexMicro = await getStardustIndexMicro();
    const [u] = await db
      .select({
        staked: usersTable.stardustStaked,
        stakeIndex: usersTable.stardustStakeIndexMicro,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (!u) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

    const staked = Number(u.staked ?? 0);
    if (staked <= 0) return res.status(400).json({ ok: false, error: "Nothing staked" });

    const stakeIndex = Number(u.stakeIndex ?? STARDUST_GENESIS_MICRO);
    const unstakeUnits = amount ? Math.min(amount, staked) : staked;
    const payout = stardustValueAtIndex(unstakeUnits, stakeIndex, indexMicro);
    const remaining = staked - unstakeUnits;

    const [upd] = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} + ${payout}`,
        stardustStaked: remaining,
        stardustStakeIndexMicro: remaining > 0 ? stakeIndex : STARDUST_GENESIS_MICRO,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        balance: usersTable.stardustBalance,
        staked: usersTable.stardustStaked,
      });

    void bumpStardustIndex("unstake");
    res.json({
      ok: true,
      balance: Number(upd?.balance ?? 0),
      staked: Number(upd?.staked ?? 0),
      payout,
      index: indexMicro / STARDUST_SCALE,
    });
  } catch (err) {
    console.error("[stardust/unstake]", err);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

router.get("/stardust/leaderboard", async (_req, res) => {
  try {
    const rows = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
        balance: usersTable.stardustBalance,
      })
      .from(usersTable)
      .where(sql`${usersTable.stardustBalance} > 0`)
      .orderBy(desc(usersTable.stardustBalance))
      .limit(10);

    res.json({
      entries: rows.map((r) => ({
        name: r.username || r.firstName || "Player",
        balance: Number(r.balance ?? 0),
      })),
    });
  } catch (err) {
    console.error("[stardust/leaderboard] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
