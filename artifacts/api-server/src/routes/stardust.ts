import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DAILY_CAP = 25;
const GLOBAL_KEY = "stardust_global_total";

// COMET passive yield: each comet planet generates exactly 25 stardust per
// full 24-hour window. Accrual is server-authoritative (anti-cheat) and
// banked in whole 24h chunks so the integer stardust column never drifts.
const COMET_STARDUST_PER_CYCLE = 25;
const COMET_CYCLE_MS = 24 * 60 * 60 * 1000;

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

/**
 * Settle pending COMET stardust for a user.
 *
 * Each COMET planet that the user OWNS (counted from `planets_json`) produces
 * exactly `COMET_STARDUST_PER_CYCLE` stardust every `COMET_CYCLE_MS` ms.
 * We bank by full 24-hour windows so we never have to deal with fractional
 * stardust (the column is INT). The watermark `cometStardustSettledAtMs`
 * advances by exactly `cycles * COMET_CYCLE_MS` each settlement, which means
 * any leftover sub-24h time naturally rolls into the next call — no time
 * is lost and no time is double-credited.
 *
 * Anti-cheat properties:
 *  - The COMET count is taken from the server-side `planets_json` mirror,
 *    not from any client-supplied value. The user can't lie about how many
 *    comets they own.
 *  - Both the credit and the watermark advance happen in a single UPDATE,
 *    so two parallel `/stardust/state` reads can't double-credit (the
 *    second one will see the already-advanced watermark and compute 0
 *    pending cycles).
 *  - First-ever call (watermark = 0) initialises to "now" and credits
 *    nothing. This is intentional — a brand-new comet shouldn't pay out
 *    before its first 24h has elapsed.
 *
 * Idempotent and safe to call on every read.
 */
async function settleCometStardust(telegramId: string): Promise<void> {
  // Single round-trip read: pull the watermark + count comets directly from
  // the JSONB array. Filtering on `name = 'COMET'` matches how the client
  // stores the planet shape (see PlanetRow.name in regular-planets.ts).
  const [row] = await db
    .select({
      settledAt: usersTable.cometStardustSettledAtMs,
      cometCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM jsonb_array_elements(${usersTable.planetsJson}) e
        WHERE e->>'name' = 'COMET'
      )`,
    })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  if (!row) return;
  const now = Date.now();
  const watermark = Number(row.settledAt ?? 0);
  const cometCount = Number(row.cometCount ?? 0);

  // First-ever settle: just set the watermark, don't pay out yet.
  // CAS guard: the WHERE clause requires the watermark to still be 0
  // (or NULL). If a parallel call already initialised it, this UPDATE
  // affects 0 rows and we silently no-op — exactly what we want.
  if (watermark <= 0) {
    await db
      .update(usersTable)
      .set({ cometStardustSettledAtMs: now })
      .where(
        sql`${usersTable.telegramId} = ${telegramId} AND COALESCE(${usersTable.cometStardustSettledAtMs}, 0) <= 0`,
      );
    return;
  }

  // No comets owned — fast-forward the watermark to "now" so a future
  // comet starts its 24h from the moment it appears in the inventory, not
  // from some ancient timestamp that would instantly pay out a backlog.
  // CAS guard: only advance if the watermark we read is still the current
  // one. A racing call could legitimately have advanced it in between.
  if (cometCount <= 0) {
    if (now > watermark) {
      await db
        .update(usersTable)
        .set({ cometStardustSettledAtMs: now })
        .where(
          sql`${usersTable.telegramId} = ${telegramId} AND ${usersTable.cometStardustSettledAtMs} = ${watermark}`,
        );
    }
    return;
  }

  const elapsed = now - watermark;
  if (elapsed < COMET_CYCLE_MS) return; // less than one full window — nothing to bank yet

  const cycles = Math.floor(elapsed / COMET_CYCLE_MS);
  const stardustToCredit = cycles * COMET_STARDUST_PER_CYCLE * cometCount;
  const advanceMs = cycles * COMET_CYCLE_MS;

  // CAS update: only credit IF the watermark hasn't moved since we read
  // it. This makes parallel calls safe: the loser of the race sees the
  // already-advanced watermark, its WHERE clause matches 0 rows, and it
  // does NOT double-credit. The credit and the watermark advance happen
  // in the same UPDATE, so an observer can never see one without the
  // other (Postgres row-level isolation).
  await db
    .update(usersTable)
    .set({
      stardustBalance: sql`${usersTable.stardustBalance} + ${stardustToCredit}`,
      cometStardustSettledAtMs: sql`${usersTable.cometStardustSettledAtMs} + ${advanceMs}`,
    })
    .where(
      sql`${usersTable.telegramId} = ${telegramId} AND ${usersTable.cometStardustSettledAtMs} = ${watermark}`,
    );
}

// Re-export so other route handlers can settle BEFORE they change a user's
// COMET ownership. Settling first locks in the payout for the OLD count, so
// the window the user actually owned that count gets credited correctly,
// then the new count takes effect for the NEXT window.
export { settleCometStardust };

router.get("/stardust/state", async (req, res) => {
  const telegramId = String(req.query.telegramId ?? "").trim();
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId required" });
  }
  try {
    // Settle pending COMET stardust BEFORE reading the balance so the
    // returned `balance` already includes the comet payout. This makes the
    // HUD show the up-to-date number on every refresh without any extra
    // client round-trip.
    await settleCometStardust(telegramId);
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
    // Settle COMET stardust before the SUN-tap collect path runs so the
    // returned `balance` is always current — even when the user has no SUN
    // (i.e. only the comet stream is active).
    await settleCometStardust(telegramId);
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

// Top 10 stardust holders. Returns a small public list (no telegram_id) so
// it's safe to render in the client. We prefer username, fall back to
// firstName, then to a generic "Player". Players with 0 balance are filtered
// out so the list doesn't pad with empty entries on a fresh database.
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
