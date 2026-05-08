import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// 0.5 TON ogni 30 giorni per l'INTERO set di 4 pianeti.
// Un mese = 30 * 24h per semplicità (allineato a plant claim).
export const STAKING_REWARD_TON = 0.5;
export const STAKING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const STAKING_REQUIRED_COUNT = 4;

// Planets in users.planets_json use the `name` field (PlanetType) as the
// rarity discriminator — see lib hooks/useGameState.ts `interface Planet`.
// We also tolerate a legacy `type` field just in case any older write path
// ever emitted it, so eligibility never silently breaks for old data.
interface PlanetJson { name?: string; type?: string }

function countV1FromJson(planetsJson: unknown): number {
  if (!Array.isArray(planetsJson)) return 0;
  let n = 0;
  for (const p of planetsJson as PlanetJson[]) {
    if (!p) continue;
    const k = p.name ?? p.type;
    if (k === "V1" || k === "V1_NFT") n++;
  }
  return n;
}

function accruedTon(startedAtMs: number, nowMs: number): number {
  if (!startedAtMs || startedAtMs <= 0) return 0;
  const elapsed = Math.max(0, nowMs - startedAtMs);
  return (elapsed / STAKING_PERIOD_MS) * STAKING_REWARD_TON;
}

const StartBody = z.object({
  telegramId: z.string().min(1),
  kind: z.enum(["v1", "sun"]),
});

/**
 * GET /staking/status?telegramId=...
 * Returns the current staking timestamps + derived live counters for V1
 * and SUN sets. Read-only — safe for soft auth (no write side-effects).
 */
router.get("/staking/status", async (req, res) => {
  const telegramId = String(req.query["telegramId"] ?? "");
  if (!telegramId) return res.status(400).json({ error: "BAD_REQUEST" });

  try {
    const rows = await db
      .select({
        v1Started: usersTable.stakingV1StartedAtMs,
        sunStarted: usersTable.stakingSunStartedAtMs,
        sunCount: usersTable.sunCount,
        planetsJson: usersTable.planetsJson,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) {
      return res.json({
        v1: { eligible: false, count: 0, required: STAKING_REQUIRED_COUNT, startedAtMs: 0, accruedTon: 0, rewardTonPerMonth: STAKING_REWARD_TON },
        sun: { eligible: false, count: 0, required: STAKING_REQUIRED_COUNT, startedAtMs: 0, accruedTon: 0, rewardTonPerMonth: STAKING_REWARD_TON },
        nowMs: Date.now(),
      });
    }

    const row = rows[0]!;
    const v1Count = countV1FromJson(row.planetsJson);
    const sunCount = row.sunCount ?? 0;
    const now = Date.now();

    return res.json({
      v1: {
        eligible: v1Count >= STAKING_REQUIRED_COUNT,
        count: v1Count,
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: row.v1Started ?? 0,
        accruedTon: accruedTon(row.v1Started ?? 0, now),
        rewardTonPerMonth: STAKING_REWARD_TON,
      },
      sun: {
        eligible: sunCount >= STAKING_REQUIRED_COUNT,
        count: sunCount,
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: row.sunStarted ?? 0,
        accruedTon: accruedTon(row.sunStarted ?? 0, now),
        rewardTonPerMonth: STAKING_REWARD_TON,
      },
      nowMs: now,
    });
  } catch (err) {
    req.log?.error({ err }, "[staking/status] error");
    return res.status(500).json({ error: "INTERNAL" });
  }
});

/**
 * POST /staking/start { telegramId, kind: "v1" | "sun" }
 * Activates the staking set. Server re-validates the count (≥4) from the
 * authoritative DB state, NOT from the client request body — this is the
 * critical anti-cheat guard. Idempotent: if already started, the existing
 * timestamp is returned unchanged.
 */
router.post("/staking/start", async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });
  const { telegramId, kind } = parsed.data;

  try {
    const rows = await db
      .select({
        v1Started: usersTable.stakingV1StartedAtMs,
        sunStarted: usersTable.stakingSunStartedAtMs,
        sunCount: usersTable.sunCount,
        planetsJson: usersTable.planetsJson,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const row = rows[0]!;

    const count = kind === "v1" ? countV1FromJson(row.planetsJson) : (row.sunCount ?? 0);
    if (count < STAKING_REQUIRED_COUNT) {
      return res.status(400).json({ error: "NOT_ENOUGH", count, required: STAKING_REQUIRED_COUNT });
    }

    const existing = kind === "v1" ? (row.v1Started ?? 0) : (row.sunStarted ?? 0);
    if (existing > 0) {
      // Already staking — idempotent OK.
      const now = Date.now();
      return res.json({ kind, startedAtMs: existing, accruedTon: accruedTon(existing, now), nowMs: now });
    }

    const now = Date.now();
    if (kind === "v1") {
      await db.update(usersTable).set({ stakingV1StartedAtMs: now }).where(eq(usersTable.telegramId, telegramId));
    } else {
      await db.update(usersTable).set({ stakingSunStartedAtMs: now }).where(eq(usersTable.telegramId, telegramId));
    }
    return res.json({ kind, startedAtMs: now, accruedTon: 0, nowMs: now });
  } catch (err) {
    req.log?.error({ err }, "[staking/start] error");
    return res.status(500).json({ error: "INTERNAL" });
  }
});

export default router;
