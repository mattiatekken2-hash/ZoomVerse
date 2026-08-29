/**
 * Lab $ZMC task airdrop — first tranche.
 * Eligibility is server-side. Payout is on-chain from treasury (95%);
 * 5% stays in treasury (never sent). Does not rewrite inventories or
 * off-chain wallets, and is separate from the 4M TGE estimate.
 */
import { Router, type IRouter } from "express";
import { db, appSettingsTable, usersTable, marketListingsTable } from "@workspace/db";
import { eq, sql, and, or } from "drizzle-orm";
import { z } from "zod";
import {
  ZMC_TASK_AIRDROP_CLAIM,
  ZMC_TASK_AIRDROP_POOL,
  ZMC_TASK_CHECKIN_DAYS,
  ZMC_TASK_CRAFTS_MIN,
  ZMC_TASK_HOLD_DAYS,
  ZMC_TASK_HOLD_MIN,
  ZMC_TASK_SALES_MIN,
  zmcNanoToHuman,
  zmcTaskAirdropSplit,
} from "@workspace/game-models";
import { fetchZmcBalanceNano, sendZmcFromTreasury } from "../lib/zmc";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const KEY_REMAINING = "zmc_task_airdrop_remaining";
const KEY_TOTAL = "zmc_task_airdrop_total";
const HOLD_MS = ZMC_TASK_HOLD_DAYS * 24 * 60 * 60 * 1000;
const PENDING_TX = "pending";

const SOCIALS = ["discord", "x", "youtube", "instagram", "tiktok"] as const;
type SocialId = (typeof SOCIALS)[number];

function utcDayKey(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function prevUtcDay(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isSocial(v: string): v is SocialId {
  return (SOCIALS as readonly string[]).includes(v);
}

function execRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export async function ensureZmcTaskAirdrop(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS zmc_task_airdrop (
        telegram_id text PRIMARY KEY,
        checkin_day_key text,
        checkin_streak integer NOT NULL DEFAULT 0,
        social_discord boolean NOT NULL DEFAULT false,
        social_x boolean NOT NULL DEFAULT false,
        social_youtube boolean NOT NULL DEFAULT false,
        social_instagram boolean NOT NULL DEFAULT false,
        social_tiktok boolean NOT NULL DEFAULT false,
        hold_started_at_ms bigint NOT NULL DEFAULT 0,
        claimed_at timestamp,
        claim_tx text,
        payout_zmc real,
        fee_zmc real,
        updated_at timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await db
      .insert(appSettingsTable)
      .values({ key: KEY_TOTAL, valueNum: ZMC_TASK_AIRDROP_POOL, updatedAt: new Date() })
      .onConflictDoNothing();
    await db
      .insert(appSettingsTable)
      .values({ key: KEY_REMAINING, valueNum: ZMC_TASK_AIRDROP_POOL, updatedAt: new Date() })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn({ err }, "[zmc-airdrop] ensure skipped");
  }
}

async function readPool(): Promise<{ remaining: number; total: number }> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(or(eq(appSettingsTable.key, KEY_REMAINING), eq(appSettingsTable.key, KEY_TOTAL)));
  let remaining = ZMC_TASK_AIRDROP_POOL;
  let total = ZMC_TASK_AIRDROP_POOL;
  for (const r of rows) {
    if (r.key === KEY_REMAINING) remaining = Math.max(0, Number(r.valueNum ?? 0));
    if (r.key === KEY_TOTAL) total = Math.max(0, Number(r.valueNum ?? ZMC_TASK_AIRDROP_POOL));
  }
  return { remaining, total };
}

async function soldCount(telegramId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(marketListingsTable)
    .where(and(
      eq(marketListingsTable.sellerTelegramId, telegramId),
      eq(marketListingsTable.status, "sold"),
      eq(marketListingsTable.kind, "planet"),
    ));
  return Number(row?.n ?? 0) || 0;
}

interface ProgressRow {
  checkin_day_key: string | null;
  checkin_streak: number;
  social_discord: boolean;
  social_x: boolean;
  social_youtube: boolean;
  social_instagram: boolean;
  social_tiktok: boolean;
  hold_started_at_ms: number;
  claimed_at: Date | string | null;
  claim_tx: string | null;
  payout_zmc: number | null;
}

async function loadProgress(telegramId: string): Promise<ProgressRow> {
  const sel = await db.execute(sql`
    SELECT checkin_day_key, checkin_streak,
           social_discord, social_x, social_youtube, social_instagram, social_tiktok,
           hold_started_at_ms, claimed_at, claim_tx, payout_zmc
      FROM zmc_task_airdrop
     WHERE telegram_id = ${telegramId}
     LIMIT 1
  `);
  const r = execRows<ProgressRow>(sel)[0];
  if (!r) {
    return {
      checkin_day_key: null,
      checkin_streak: 0,
      social_discord: false,
      social_x: false,
      social_youtube: false,
      social_instagram: false,
      social_tiktok: false,
      hold_started_at_ms: 0,
      claimed_at: null,
      claim_tx: null,
      payout_zmc: null,
    };
  }
  return {
    checkin_day_key: r.checkin_day_key ?? null,
    checkin_streak: Number(r.checkin_streak ?? 0) || 0,
    social_discord: !!r.social_discord,
    social_x: !!r.social_x,
    social_youtube: !!r.social_youtube,
    social_instagram: !!r.social_instagram,
    social_tiktok: !!r.social_tiktok,
    hold_started_at_ms: Number(r.hold_started_at_ms ?? 0) || 0,
    claimed_at: r.claimed_at ?? null,
    claim_tx: r.claim_tx ?? null,
    payout_zmc: r.payout_zmc == null ? null : Number(r.payout_zmc),
  };
}

function buildState(
  progress: ProgressRow,
  extra: {
    remaining: number;
    total: number;
    crafts: number;
    sales: number;
    zmcHeld: number;
    holdStartedAtMs: number;
    wallet: string | null;
  },
) {
  const now = Date.now();
  const today = utcDayKey(now);
  const checkedInToday = progress.checkin_day_key === today;
  const streak = progress.checkin_streak;
  const social = {
    discord: progress.social_discord,
    x: progress.social_x,
    youtube: progress.social_youtube,
    instagram: progress.social_instagram,
    tiktok: progress.social_tiktok,
  };
  const socialDone = SOCIALS.every((k) => social[k]);
  const checkinDone = streak >= ZMC_TASK_CHECKIN_DAYS;
  const craftsDone = extra.crafts >= ZMC_TASK_CRAFTS_MIN;
  const salesDone = extra.sales >= ZMC_TASK_SALES_MIN;
  const holding = extra.zmcHeld + 1e-9 >= ZMC_TASK_HOLD_MIN;
  const holdElapsed = extra.holdStartedAtMs > 0 ? now - extra.holdStartedAtMs : 0;
  const holdDone = holding && extra.holdStartedAtMs > 0 && holdElapsed >= HOLD_MS;
  const claimed = !!progress.claimed_at && progress.claim_tx !== PENDING_TX;
  const pending = progress.claim_tx === PENDING_TX;
  const exhausted = extra.remaining <= 0;
  const missing: string[] = [];
  if (!checkinDone) missing.push("checkin");
  if (!socialDone) missing.push("social");
  if (!extra.wallet) missing.push("wallet");
  else if (!holding) missing.push("hold_balance");
  else if (!holdDone) missing.push("hold_days");
  if (!craftsDone) missing.push("crafts");
  if (!salesDone) missing.push("sales");
  const eligible = !claimed && !pending && !exhausted && missing.length === 0;
  const { payout, fee } = zmcTaskAirdropSplit(Math.min(ZMC_TASK_AIRDROP_CLAIM, extra.remaining));
  return {
    remaining: extra.remaining,
    total: extra.total,
    claimGross: ZMC_TASK_AIRDROP_CLAIM,
    payout,
    fee,
    exhausted,
    claimed,
    pending,
    eligible,
    missing,
    checkin: {
      streak: Math.min(streak, ZMC_TASK_CHECKIN_DAYS),
      need: ZMC_TASK_CHECKIN_DAYS,
      checkedInToday,
      done: checkinDone,
    },
    social,
    hold: {
      min: ZMC_TASK_HOLD_MIN,
      days: ZMC_TASK_HOLD_DAYS,
      held: extra.zmcHeld,
      startedAtMs: extra.holdStartedAtMs,
      done: holdDone,
    },
    crafts: { have: extra.crafts, need: ZMC_TASK_CRAFTS_MIN, done: craftsDone },
    sales: { have: extra.sales, need: ZMC_TASK_SALES_MIN, done: salesDone },
    wallet: extra.wallet,
    payoutZmc: progress.payout_zmc,
  };
}

async function snapshotHold(telegramId: string, held: number, prevStart: number): Promise<number> {
  let start = prevStart;
  if (held + 1e-9 >= ZMC_TASK_HOLD_MIN) {
    if (start <= 0) start = Date.now();
  } else {
    start = 0;
  }
  if (start === prevStart) return start;
  await db.execute(sql`
    INSERT INTO zmc_task_airdrop (telegram_id, hold_started_at_ms, updated_at)
    VALUES (${telegramId}, ${start}, NOW())
    ON CONFLICT (telegram_id) DO UPDATE
      SET hold_started_at_ms = EXCLUDED.hold_started_at_ms,
          updated_at = NOW()
  `);
  return start;
}

async function gatherPlayer(telegramId: string) {
  const [pool, progress, user, sales] = await Promise.all([
    readPool(),
    loadProgress(telegramId),
    db.select({
      crafts: usersTable.totalPlanetsBuilt,
      wallet: usersTable.tonWalletAddress,
    }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1).then((r) => r[0] ?? null),
    soldCount(telegramId),
  ]);
  const wallet = user?.wallet ?? null;
  let zmcHeld = 0;
  if (wallet) {
    try {
      zmcHeld = zmcNanoToHuman(await fetchZmcBalanceNano(wallet));
    } catch {
      zmcHeld = 0;
    }
  }
  const holdStartedAtMs = await snapshotHold(telegramId, zmcHeld, progress.hold_started_at_ms);
  return {
    pool,
    progress: { ...progress, hold_started_at_ms: holdStartedAtMs },
    crafts: Number(user?.crafts ?? 0) || 0,
    sales,
    zmcHeld,
    holdStartedAtMs,
    wallet,
  };
}

router.get("/zmc-airdrop/state", async (req, res) => {
  const telegramId = String(req.query["telegramId"] || "").trim();
  if (!telegramId) return res.status(400).json({ error: "telegramId required" });
  try {
    const g = await gatherPlayer(telegramId);
    res.setHeader("Cache-Control", "no-store");
    return res.json(buildState(g.progress, {
      remaining: g.pool.remaining,
      total: g.pool.total,
      crafts: g.crafts,
      sales: g.sales,
      zmcHeld: g.zmcHeld,
      holdStartedAtMs: g.holdStartedAtMs,
      wallet: g.wallet,
    }));
  } catch (err) {
    logger.warn({ err }, "[zmc-airdrop] state failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const CheckinBody = z.object({ telegramId: z.string().min(1) });

router.post("/zmc-airdrop/checkin", async (req, res) => {
  const parsed = CheckinBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const { telegramId } = parsed.data;
  const today = utcDayKey();
  const yesterday = prevUtcDay(today);
  try {
    const prev = await loadProgress(telegramId);
    let streak = 1;
    if (prev.checkin_streak >= ZMC_TASK_CHECKIN_DAYS) {
      streak = ZMC_TASK_CHECKIN_DAYS;
    } else if (prev.checkin_day_key === today) {
      streak = prev.checkin_streak;
    } else if (prev.checkin_day_key === yesterday) {
      streak = Math.min(ZMC_TASK_CHECKIN_DAYS, prev.checkin_streak + 1);
    }
    await db.execute(sql`
      INSERT INTO zmc_task_airdrop (telegram_id, checkin_day_key, checkin_streak, updated_at)
      VALUES (${telegramId}, ${today}, ${streak}, NOW())
      ON CONFLICT (telegram_id) DO UPDATE
        SET checkin_day_key = EXCLUDED.checkin_day_key,
            checkin_streak = EXCLUDED.checkin_streak,
            updated_at = NOW()
    `);
    return res.json({ ok: true, streak, checkedInToday: true });
  } catch (err) {
    logger.warn({ err }, "[zmc-airdrop] checkin failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const SocialBody = z.object({
  telegramId: z.string().min(1),
  network: z.string().min(1),
});

router.post("/zmc-airdrop/social", async (req, res) => {
  const parsed = SocialBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const { telegramId, network } = parsed.data;
  if (!isSocial(network)) return res.status(400).json({ error: "Unknown network" });
  try {
    if (network === "discord") {
      await db.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, social_discord, updated_at)
        VALUES (${telegramId}, true, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET social_discord = true, updated_at = NOW()
      `);
    } else if (network === "x") {
      await db.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, social_x, updated_at)
        VALUES (${telegramId}, true, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET social_x = true, updated_at = NOW()
      `);
    } else if (network === "youtube") {
      await db.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, social_youtube, updated_at)
        VALUES (${telegramId}, true, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET social_youtube = true, updated_at = NOW()
      `);
    } else if (network === "instagram") {
      await db.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, social_instagram, updated_at)
        VALUES (${telegramId}, true, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET social_instagram = true, updated_at = NOW()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, social_tiktok, updated_at)
        VALUES (${telegramId}, true, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET social_tiktok = true, updated_at = NOW()
      `);
    }
    return res.json({ ok: true, network });
  } catch (err) {
    logger.warn({ err }, "[zmc-airdrop] social failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const ClaimBody = z.object({ telegramId: z.string().min(1) });

router.post("/zmc-airdrop/claim", async (req, res) => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const { telegramId } = parsed.data;
  try {
    const g = await gatherPlayer(telegramId);
    if (g.progress.claimed_at && g.progress.claim_tx !== PENDING_TX) {
      return res.status(409).json({ ok: false, error: "Already claimed" });
    }
    if (g.progress.claim_tx === PENDING_TX) {
      return res.status(409).json({ ok: false, error: "Payout in progress" });
    }
    if (g.pool.remaining <= 0) {
      return res.status(409).json({ ok: false, error: "Airdrop esaurito" });
    }
    if (!g.wallet) return res.status(400).json({ ok: false, error: "Connect TON wallet" });

    const state = buildState(g.progress, {
      remaining: g.pool.remaining,
      total: g.pool.total,
      crafts: g.crafts,
      sales: g.sales,
      zmcHeld: g.zmcHeld,
      holdStartedAtMs: g.holdStartedAtMs,
      wallet: g.wallet,
    });
    if (!state.eligible) {
      return res.status(400).json({ ok: false, error: "Not eligible", missing: state.missing });
    }

    const gross = Math.min(ZMC_TASK_AIRDROP_CLAIM, g.pool.remaining);
    const { payout, fee } = zmcTaskAirdropSplit(gross);
    if (payout <= 0) {
      return res.status(409).json({ ok: false, error: "Airdrop esaurito" });
    }

    const reserved = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"zmc-task-airdrop-pool"}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`zmc-airdrop:${telegramId}`}))`);

      const claimedRows = execRows<{ claimed_at: Date | null; claim_tx: string | null }>(
        await tx.execute(sql`
          SELECT claimed_at, claim_tx FROM zmc_task_airdrop
           WHERE telegram_id = ${telegramId} LIMIT 1
        `),
      );
      const row = claimedRows[0];
      if (row?.claimed_at && row.claim_tx !== PENDING_TX) {
        return { ok: false as const, error: "Already claimed" };
      }
      if (row?.claim_tx === PENDING_TX) {
        return { ok: false as const, error: "Payout in progress" };
      }

      const dec = execRows<{ value_num: number }>(
        await tx.execute(sql`
          UPDATE app_settings
             SET value_num = value_num - ${gross},
                 updated_at = NOW()
           WHERE key = ${KEY_REMAINING}
             AND value_num >= ${gross}
           RETURNING value_num
        `),
      );
      if (!dec[0]) return { ok: false as const, error: "Airdrop esaurito" };

      await tx.execute(sql`
        INSERT INTO zmc_task_airdrop (telegram_id, claimed_at, claim_tx, updated_at)
        VALUES (${telegramId}, NOW(), ${PENDING_TX}, NOW())
        ON CONFLICT (telegram_id) DO UPDATE
          SET claimed_at = NOW(),
              claim_tx = ${PENDING_TX},
              updated_at = NOW()
      `);
      return { ok: true as const };
    });

    if (!reserved.ok) {
      return res.status(409).json({ ok: false, error: reserved.error });
    }

    const sent = await sendZmcFromTreasury(g.wallet, payout, { waitSeqno: false });
    if (!sent.ok) {
      await db.execute(sql`
        UPDATE app_settings
           SET value_num = value_num + ${gross},
               updated_at = NOW()
         WHERE key = ${KEY_REMAINING}
      `);
      await db.execute(sql`
        UPDATE zmc_task_airdrop
           SET claimed_at = NULL,
               claim_tx = NULL,
               updated_at = NOW()
         WHERE telegram_id = ${telegramId}
           AND claim_tx = ${PENDING_TX}
      `);
      return res.status(502).json({ ok: false, error: sent.reason ?? "Payout failed" });
    }

    await db.execute(sql`
      UPDATE zmc_task_airdrop
         SET claim_tx = ${sent.txHash ?? "sent"},
             payout_zmc = ${payout},
             fee_zmc = ${fee},
             updated_at = NOW()
       WHERE telegram_id = ${telegramId}
    `);

    const next = await readPool();
    return res.json({
      ok: true,
      payout,
      fee,
      remaining: next.remaining,
      txHash: sent.txHash,
    });
  } catch (err) {
    logger.warn({ err }, "[zmc-airdrop] claim failed");
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

export default router;
