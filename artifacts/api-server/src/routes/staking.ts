import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────
// PER-RARITY MONTHLY YIELD (TON / 30 days, full set of 4 planets)
// ─────────────────────────────────────────────────────────────────────
//   • V1 / SUN  → 0.15  (continuous accrual after activation, like before)
//   • MYTHIC    → 0.10  (requires SUN in inventory + 4 active farms)
//   • GOLD      → 0.07  (requires SUN in inventory + 4 active farms)
//   • EPIC      → 0.04  (requires SUN in inventory + 4 active farms)
//   • RARE      → 0.02  (requires SUN in inventory + 4 active farms)
//   • BASIC     → 0.01  (requires SUN in inventory + 4 active farms)
export type StakingKind = "v1" | "sun" | "basic" | "rare" | "epic" | "mythic" | "gold";

export const STAKING_REWARDS_TON_PER_MONTH: Record<StakingKind, number> = {
  v1: 0.15,
  sun: 0.15,
  mythic: 0.10,
  gold: 0.07,
  epic: 0.04,
  rare: 0.02,
  basic: 0.01,
};
export const STAKING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const STAKING_REQUIRED_COUNT = 4;
const FARM_DURATION_MS = 24 * 60 * 60 * 1000;

// New rarities (BASIC..GOLD) follow the dynamic-accrual model.
// SUN / V1 keep the legacy continuous-accrual model unchanged.
const DYNAMIC_KINDS = ["basic", "rare", "epic", "mythic", "gold"] as const;
type DynamicKind = typeof DYNAMIC_KINDS[number];

const RARITY_NAME: Record<DynamicKind, string> = {
  basic: "BASIC",
  rare: "RARE",
  epic: "EPIC",
  mythic: "MYTHIC",
  gold: "GOLD",
};

// Planets in users.planets_json use the `name` field as the rarity
// discriminator (see useGameState.ts `interface Planet`). We tolerate a
// legacy `type` field too so eligibility never silently breaks for old
// data. Includes the few farming/listing fields we need for active-check.
interface PlanetJson {
  name?: string;
  type?: string;
  farmStartedAt?: number;
  lastCollectedAt?: number;
  isFarmingActive?: boolean;
  isListedInMarket?: boolean;
}

function asArray(planetsJson: unknown): PlanetJson[] {
  return Array.isArray(planetsJson) ? (planetsJson as PlanetJson[]) : [];
}

function countV1(planets: PlanetJson[]): number {
  let n = 0;
  for (const p of planets) {
    if (!p) continue;
    const k = p.name ?? p.type;
    if (k === "V1" || k === "V1_NFT") n++;
  }
  return n;
}

function countByRarity(planets: PlanetJson[], rarity: string): number {
  let n = 0;
  for (const p of planets) {
    if (!p) continue;
    const k = p.name ?? p.type;
    if (k === rarity) n++;
  }
  return n;
}

// Mirror of client-side `isFarmActive`: planet has an active 24h cycle
// AND is not currently listed on the market AND was actually started.
function isPlanetActivelyFarming(p: PlanetJson, now: number): boolean {
  if (!p) return false;
  if (p.isListedInMarket === true) return false;
  if (p.isFarmingActive === false) return false;
  const start = Math.max(p.farmStartedAt ?? 0, p.lastCollectedAt ?? 0);
  if (start <= 0) return false;
  return now - start <= FARM_DURATION_MS;
}

function countActiveByRarity(planets: PlanetJson[], rarity: string, now: number): number {
  let n = 0;
  for (const p of planets) {
    if (!p) continue;
    const k = p.name ?? p.type;
    if (k !== rarity) continue;
    if (isPlanetActivelyFarming(p, now)) n++;
  }
  return n;
}

// V1 / SUN — unchanged continuous accrual based on a single timestamp.
function accruedTonContinuous(kind: "v1" | "sun", startedAtMs: number, nowMs: number): number {
  if (!startedAtMs || startedAtMs <= 0) return 0;
  const elapsed = Math.max(0, nowMs - startedAtMs);
  return (elapsed / STAKING_PERIOD_MS) * STAKING_REWARDS_TON_PER_MONTH[kind];
}

// Column-name maps for the 5 dynamic rarities. Kept tightly scoped so a
// typo can't silently break a single tier. We reference Drizzle columns
// by the property name we declared in lib/db/src/schema/users.ts.
const DYNAMIC_COLUMNS: Record<DynamicKind, {
  started: keyof typeof usersTable.$inferSelect;
  accrued: keyof typeof usersTable.$inferSelect;
  lastSettled: keyof typeof usersTable.$inferSelect;
}> = {
  basic:  { started: "stakingBasicStartedAtMs",  accrued: "stakingBasicAccruedTon",  lastSettled: "stakingBasicLastSettledAtMs"  },
  rare:   { started: "stakingRareStartedAtMs",   accrued: "stakingRareAccruedTon",   lastSettled: "stakingRareLastSettledAtMs"   },
  epic:   { started: "stakingEpicStartedAtMs",   accrued: "stakingEpicAccruedTon",   lastSettled: "stakingEpicLastSettledAtMs"   },
  mythic: { started: "stakingMythicStartedAtMs", accrued: "stakingMythicAccruedTon", lastSettled: "stakingMythicLastSettledAtMs" },
  gold:   { started: "stakingGoldStartedAtMs",   accrued: "stakingGoldAccruedTon",   lastSettled: "stakingGoldLastSettledAtMs"   },
};

// Minimal DB row shape we actually read for staking. Using the inferred
// select type keeps us aligned with schema renames.
type UserRow = typeof usersTable.$inferSelect;

interface DynamicSettleResult {
  startedAtMs: number;
  accruedTon: number;          // settled snapshot AFTER this call
  lastSettledAtMs: number;     // bumped to `now` if the row was updated
  count: number;               // total planets of this rarity in inventory
  activeCount: number;         // currently actively-farming subset
  eligible: boolean;           // can START staking right now (4 active + SUN)
  isStaking: boolean;          // already activated (startedAtMs > 0)
  isAccruing: boolean;         // currently producing TON (active>=4 & started)
  rewardTonPerMonth: number;
  // Internal — populated when the snapshot needs persisting.
  _patch?: Record<string, number>;
}

// Settle a single dynamic-tier row. Pure function over the row + planets.
// Returns a `_patch` object when DB columns need updating, so the caller
// can batch all 5 tier patches into ONE UPDATE per request.
function settleDynamicTier(
  row: UserRow,
  planets: PlanetJson[],
  kind: DynamicKind,
  hasSun: boolean,
  now: number,
): DynamicSettleResult {
  const cols = DYNAMIC_COLUMNS[kind];
  const rarityName = RARITY_NAME[kind];
  const startedAtMs = (row[cols.started] as number) ?? 0;
  const lastSettledAtMs = (row[cols.lastSettled] as number) ?? 0;
  let accruedTon = (row[cols.accrued] as number) ?? 0;

  const count = countByRarity(planets, rarityName);
  const activeCount = countActiveByRarity(planets, rarityName, now);
  const isStaking = startedAtMs > 0;
  const fullyActive = activeCount >= STAKING_REQUIRED_COUNT;
  // Eligibility to START staking: SUN in inventory AND 4 active planets.
  const eligible = hasSun && fullyActive;
  const rewardTonPerMonth = STAKING_REWARDS_TON_PER_MONTH[kind];

  let nextLastSettledAtMs = lastSettledAtMs;
  let patch: Record<string, number> | undefined;

  if (isStaking) {
    // Anchor for the very first settle after /staking/start.
    const anchor = lastSettledAtMs > 0 ? lastSettledAtMs : startedAtMs;
    const deltaMs = Math.max(0, now - anchor);
    if (deltaMs > 0) {
      // Only credit time when the user is currently fully active AND
      // still owns a SUN (anti-abuse: prevents "rent SUN → start staking
      // → sell SUN" exploit). Gaps where production is "off" are silently
      // skipped — `lastSettledAtMs` still advances so the user can't
      // back-claim the gap by re-acquiring a SUN later.
      if (fullyActive && hasSun) {
        accruedTon = accruedTon + (deltaMs / STAKING_PERIOD_MS) * rewardTonPerMonth;
      }
      nextLastSettledAtMs = now;
      patch = {
        [cols.accrued]: accruedTon,
        [cols.lastSettled]: now,
      };
    }
  }

  return {
    startedAtMs,
    accruedTon,
    lastSettledAtMs: nextLastSettledAtMs,
    count,
    activeCount,
    eligible,
    isStaking,
    isAccruing: isStaking && fullyActive,
    rewardTonPerMonth,
    _patch: patch,
  };
}

const StartBody = z.object({
  telegramId: z.string().min(1),
  kind: z.enum(["v1", "sun", "basic", "rare", "epic", "mythic", "gold"]),
});

/**
 * GET /staking/status?telegramId=...
 * Returns the live status of all 7 staking tiers. Side-effect: settles
 * the dynamic tiers (BASIC..GOLD) — accrues TON when 4 of that rarity
 * are actively farming, otherwise just bumps `lastSettledAtMs`.
 */
router.get("/staking/status", async (req, res) => {
  const telegramId = String(req.query["telegramId"] ?? "");
  if (!telegramId) return res.status(400).json({ error: "BAD_REQUEST" });

  try {
    const now = Date.now();
    // Race-free settle-on-read: lock the user row inside a transaction so
    // two concurrent /staking/status calls (e.g. user opens two devices at
    // once) cannot both compute the same `deltaMs` from a stale snapshot
    // and double-credit the accruedTon. Using FOR UPDATE serialises the
    // pair on the row lock; the second call reads the freshly-settled
    // state and observes deltaMs ≈ 0.
    const { rows, dynResults } = await db.transaction(async (tx) => {
      const sel = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);
      if (sel.length === 0) {
        return { rows: sel, dynResults: null };
      }
      const r = sel[0]!;
      const planetsArr = asArray(r.planetsJson);
      // SUN must be ACTIVE (within 24h cycle) to gate dynamic-tier accrual.
      // Owning an EXPIRED SUN is no longer enough — once the user lets the
      // SUN cycle lapse, the BASIC..GOLD staking pauses until they pay the
      // reactivation fee and start a fresh SUN cycle.
      const sFarmStarted = r.sunFarmStartedAtMs ?? 0;
      const sActive = (r.sunCount ?? 0) >= 1
        && sFarmStarted > 0
        && (now - sFarmStarted) <= FARM_DURATION_MS;
      const dyn: Record<DynamicKind, DynamicSettleResult> = {
        basic:  settleDynamicTier(r, planetsArr, "basic",  sActive, now),
        rare:   settleDynamicTier(r, planetsArr, "rare",   sActive, now),
        epic:   settleDynamicTier(r, planetsArr, "epic",   sActive, now),
        mythic: settleDynamicTier(r, planetsArr, "mythic", sActive, now),
        gold:   settleDynamicTier(r, planetsArr, "gold",   sActive, now),
      };
      const patches: Record<string, number> = {};
      for (const k of DYNAMIC_KINDS) {
        const p = dyn[k]._patch;
        if (p) Object.assign(patches, p);
      }
      if (Object.keys(patches).length > 0) {
        await tx.update(usersTable)
          .set(patches as Partial<typeof usersTable.$inferInsert>)
          .where(eq(usersTable.telegramId, telegramId));
      }
      return { rows: sel, dynResults: dyn };
    });

    if (rows.length === 0 || !dynResults) {
      const empty = (kind: StakingKind) => ({
        eligible: false, count: 0, activeCount: 0,
        required: STAKING_REQUIRED_COUNT, startedAtMs: 0,
        accruedTon: 0, isAccruing: false,
        rewardTonPerMonth: STAKING_REWARDS_TON_PER_MONTH[kind],
        requiresSunInInventory: kind !== "v1" && kind !== "sun",
      });
      return res.json({
        v1: empty("v1"), sun: empty("sun"),
        basic: empty("basic"), rare: empty("rare"), epic: empty("epic"),
        mythic: empty("mythic"), gold: empty("gold"),
        hasSun: false,
        nowMs: now,
      });
    }

    const row = rows[0]!;
    const v1Count = countV1(asArray(row.planetsJson));
    const sunCount = row.sunCount ?? 0;
    // `hasSun` in the response now means "owns an ACTIVE SUN" (within the
    // 24h cycle). The dynamic tiers gate accrual and start-eligibility on
    // this stricter check, so the client UI must surface the same notion.
    const sunFarmStartedAt = row.sunFarmStartedAtMs ?? 0;
    const hasSun = sunCount >= 1
      && sunFarmStartedAt > 0
      && (Date.now() - sunFarmStartedAt) <= FARM_DURATION_MS;

    // V1 / SUN — unchanged continuous model.
    const v1Started = row.stakingV1StartedAtMs ?? 0;
    const sunStarted = row.stakingSunStartedAtMs ?? 0;

    const dyn = dynResults;
    const dynPayload = (k: DynamicKind) => ({
      eligible: dyn[k].eligible,
      count: dyn[k].count,
      activeCount: dyn[k].activeCount,
      required: STAKING_REQUIRED_COUNT,
      startedAtMs: dyn[k].startedAtMs,
      accruedTon: dyn[k].accruedTon,
      isAccruing: dyn[k].isAccruing,
      rewardTonPerMonth: dyn[k].rewardTonPerMonth,
      requiresSunInInventory: true,
    });

    return res.json({
      v1: {
        eligible: v1Count >= STAKING_REQUIRED_COUNT,
        count: v1Count,
        activeCount: v1Count, // V1 keeps continuous model — surface count as active for UI symmetry.
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: v1Started,
        accruedTon: accruedTonContinuous("v1", v1Started, now),
        isAccruing: v1Started > 0,
        rewardTonPerMonth: STAKING_REWARDS_TON_PER_MONTH.v1,
        requiresSunInInventory: false,
      },
      sun: {
        eligible: sunCount >= STAKING_REQUIRED_COUNT,
        count: sunCount,
        activeCount: sunCount,
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: sunStarted,
        accruedTon: accruedTonContinuous("sun", sunStarted, now),
        isAccruing: sunStarted > 0,
        rewardTonPerMonth: STAKING_REWARDS_TON_PER_MONTH.sun,
        requiresSunInInventory: false,
      },
      basic: dynPayload("basic"),
      rare: dynPayload("rare"),
      epic: dynPayload("epic"),
      mythic: dynPayload("mythic"),
      gold: dynPayload("gold"),
      hasSun,
      nowMs: now,
    });
  } catch (err) {
    req.log?.error({ err }, "[staking/status] error");
    return res.status(500).json({ error: "INTERNAL" });
  }
});

/**
 * POST /staking/start { telegramId, kind }
 * Activates a staking tier. Server re-validates eligibility from the
 * authoritative DB state (anti-cheat). Idempotent: if already started,
 * the existing timestamp is returned unchanged.
 *
 * Eligibility rules:
 *   • V1 / SUN  → 4 of that type in inventory.
 *   • BASIC..GOLD → 4 of that rarity ACTIVELY FARMING + SUN in inventory.
 */
router.post("/staking/start", async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });
  const { telegramId, kind } = parsed.data;

  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const row = rows[0]!;
    const now = Date.now();
    const planets = asArray(row.planetsJson);

    if (kind === "v1") {
      const count = countV1(planets);
      if (count < STAKING_REQUIRED_COUNT) {
        return res.status(400).json({ error: "NOT_ENOUGH", count, required: STAKING_REQUIRED_COUNT });
      }
      const existing = row.stakingV1StartedAtMs ?? 0;
      if (existing > 0) {
        return res.json({ kind, startedAtMs: existing, accruedTon: accruedTonContinuous("v1", existing, now), nowMs: now });
      }
      await db.update(usersTable).set({ stakingV1StartedAtMs: now }).where(eq(usersTable.telegramId, telegramId));
      return res.json({ kind, startedAtMs: now, accruedTon: 0, nowMs: now });
    }

    // Helper: SUN is "active" only when its 24h farming cycle hasn't expired.
    // Owning a SUN that's "EXPIRED — Reactivate" no longer counts as having
    // an active SUN, so dynamic-tier staking won't accrue until the user
    // pays the reactivation fee and starts a fresh cycle.
    const sunFarmStartedAtMs = row.sunFarmStartedAtMs ?? 0;
    const sunIsActive = (row.sunCount ?? 0) >= 1
      && sunFarmStartedAtMs > 0
      && (now - sunFarmStartedAtMs) <= FARM_DURATION_MS;

    if (kind === "sun") {
      const count = row.sunCount ?? 0;
      if (count < STAKING_REQUIRED_COUNT) {
        return res.status(400).json({ error: "NOT_ENOUGH", count, required: STAKING_REQUIRED_COUNT });
      }
      const existing = row.stakingSunStartedAtMs ?? 0;
      if (existing > 0) {
        return res.json({ kind, startedAtMs: existing, accruedTon: accruedTonContinuous("sun", existing, now), nowMs: now });
      }
      await db.update(usersTable).set({ stakingSunStartedAtMs: now }).where(eq(usersTable.telegramId, telegramId));
      return res.json({ kind, startedAtMs: now, accruedTon: 0, nowMs: now });
    }

    // Dynamic tier (basic / rare / epic / mythic / gold).
    const dynKind = kind as DynamicKind;
    const cols = DYNAMIC_COLUMNS[dynKind];
    if (!sunIsActive) {
      return res.status(400).json({ error: "SUN_REQUIRED" });
    }
    const rarityName = RARITY_NAME[dynKind];
    const totalCount = countByRarity(planets, rarityName);
    const activeCount = countActiveByRarity(planets, rarityName, now);
    if (activeCount < STAKING_REQUIRED_COUNT) {
      return res.status(400).json({
        error: totalCount < STAKING_REQUIRED_COUNT ? "NOT_ENOUGH" : "NOT_ACTIVE",
        count: totalCount,
        activeCount,
        required: STAKING_REQUIRED_COUNT,
      });
    }
    const existing = (row[cols.started] as number) ?? 0;
    if (existing > 0) {
      const accrued = (row[cols.accrued] as number) ?? 0;
      return res.json({ kind, startedAtMs: existing, accruedTon: accrued, nowMs: now });
    }
    await db.update(usersTable).set({
      [cols.started]: now,
      [cols.lastSettled]: now,
      [cols.accrued]: 0,
    }).where(eq(usersTable.telegramId, telegramId));
    return res.json({ kind, startedAtMs: now, accruedTon: 0, nowMs: now });
  } catch (err) {
    req.log?.error({ err }, "[staking/start] error");
    return res.status(500).json({ error: "INTERNAL" });
  }
});

export default router;
