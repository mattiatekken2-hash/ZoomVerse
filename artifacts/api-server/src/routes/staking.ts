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
export type StakingKind = "v1" | "sun" | "basic" | "rare" | "epic" | "mythic" | "plasma" | "gold";

export const STAKING_REWARDS_TON_PER_MONTH: Record<StakingKind, number> = {
  v1: 0.15,
  sun: 0.15,
  plasma: 5,      // PLASMA — premium staking: 5 TON / 30 days per set of 4
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
const DYNAMIC_KINDS = ["basic", "rare", "epic", "mythic", "plasma", "gold"] as const;
type DynamicKind = typeof DYNAMIC_KINDS[number];

const RARITY_NAME: Record<DynamicKind, string> = {
  basic: "BASIC",
  rare: "RARE",
  epic: "EPIC",
  mythic: "MYTHIC",
  plasma: "PLASMA",
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

// Count V1 NFT planets that are currently actively farming (24h cycle,
// not listed). Mirrors `countActiveByRarity` but accepts both legacy
// names "V1" and "V1_NFT".
function countActiveV1(planets: PlanetJson[], now: number): number {
  let n = 0;
  for (const p of planets) {
    if (!p) continue;
    const k = p.name ?? p.type;
    if (k !== "V1" && k !== "V1_NFT") continue;
    if (isPlanetActivelyFarming(p, now)) n++;
  }
  return n;
}

// (Legacy `accruedTonContinuous` removed — V1/SUN now use the same gated
// settle as the dynamic tiers via `settleContinuousTier` below.)

// V1 / SUN — column maps for the gated settle (parallel to DYNAMIC_COLUMNS).
const CONTINUOUS_COLUMNS: Record<"v1" | "sun", {
  started: keyof typeof usersTable.$inferSelect;
  accrued: keyof typeof usersTable.$inferSelect;
  lastSettled: keyof typeof usersTable.$inferSelect;
}> = {
  v1:  { started: "stakingV1StartedAtMs",  accrued: "stakingV1AccruedTon",  lastSettled: "stakingV1LastSettledAtMs"  },
  sun: { started: "stakingSunStartedAtMs", accrued: "stakingSunAccruedTon", lastSettled: "stakingSunLastSettledAtMs" },
};

interface ContinuousSettleResult {
  startedAtMs: number;
  accruedTon: number;
  count: number;
  activeCount: number;
  isStaking: boolean;
  isAccruing: boolean;       // currently producing TON (active>=4 & started)
  rewardTonPerMonth: number;
  _patch?: Record<string, number>;
}

// Settle V1 or SUN tier using the SAME gated-accrual model as the
// dynamic tiers: TON only accrues while the underlying source is
// actively producing ZOOM. For V1 → 4 V1 planets actively farming;
// for SUN → 4 SUNs owned AND the SUN cycle is within its 24h window.
// Gaps where the source is "off" are silently skipped (lastSettledAtMs
// still advances), so users can't back-claim by reactivating later.
function settleContinuousTier(
  row: UserRow,
  kind: "v1" | "sun",
  isProducing: boolean,
  activeCount: number,
  totalCount: number,
  now: number,
): ContinuousSettleResult {
  const cols = CONTINUOUS_COLUMNS[kind];
  const startedAtMs = (row[cols.started] as number) ?? 0;
  const lastSettledAtMs = (row[cols.lastSettled] as number) ?? 0;
  let accruedTon = (row[cols.accrued] as number) ?? 0;
  const rewardTonPerMonth = STAKING_REWARDS_TON_PER_MONTH[kind];
  const isStaking = startedAtMs > 0;

  let patch: Record<string, number> | undefined;

  if (isStaking) {
    const anchor = lastSettledAtMs > 0 ? lastSettledAtMs : startedAtMs;
    const deltaMs = Math.max(0, now - anchor);
    if (deltaMs > 0) {
      if (isProducing) {
        accruedTon = accruedTon + (deltaMs / STAKING_PERIOD_MS) * rewardTonPerMonth;
      }
      patch = {
        [cols.accrued]: accruedTon,
        [cols.lastSettled]: now,
      };
    }
  }

  return {
    startedAtMs,
    accruedTon,
    count: totalCount,
    activeCount,
    isStaking,
    isAccruing: isStaking && isProducing,
    rewardTonPerMonth,
    _patch: patch,
  };
}

// Column-name maps for the 5 dynamic rarities. Kept tightly scoped so a
// typo can't silently break a single tier. We reference Drizzle columns
// by the property name we declared in lib/db/src/schema/users.ts.
const DYNAMIC_COLUMNS: Record<DynamicKind, {
  started: keyof typeof usersTable.$inferSelect;
  accrued: keyof typeof usersTable.$inferSelect;
  lastSettled: keyof typeof usersTable.$inferSelect;
}> = {
  basic:  { started: "stakingBasicStartedAtMs",   accrued: "stakingBasicAccruedTon",   lastSettled: "stakingBasicLastSettledAtMs"   },
  rare:   { started: "stakingRareStartedAtMs",    accrued: "stakingRareAccruedTon",    lastSettled: "stakingRareLastSettledAtMs"    },
  epic:   { started: "stakingEpicStartedAtMs",    accrued: "stakingEpicAccruedTon",    lastSettled: "stakingEpicLastSettledAtMs"    },
  mythic: { started: "stakingMythicStartedAtMs",  accrued: "stakingMythicAccruedTon",  lastSettled: "stakingMythicLastSettledAtMs"  },
  plasma: { started: "stakingPlasmaStartedAtMs",  accrued: "stakingPlasmaAccruedTon",  lastSettled: "stakingPlasmaLastSettledAtMs"  },
  gold:   { started: "stakingGoldStartedAtMs",    accrued: "stakingGoldAccruedTon",    lastSettled: "stakingGoldLastSettledAtMs"    },
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
  kind: z.enum(["v1", "sun", "basic", "rare", "epic", "mythic", "plasma", "gold"]),
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
    const { rows, dynResults, v1Settled, sunSettled } = await db.transaction(async (tx) => {
      const sel = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);
      if (sel.length === 0) {
        return { rows: sel, dynResults: null, v1Settled: null, sunSettled: null };
      }
      const r = sel[0]!;
      const planetsArr = asArray(r.planetsJson);
      // SUN must be ACTIVE (within 24h cycle) to gate dynamic-tier accrual.
      // Owning an EXPIRED SUN is no longer enough — once the user lets the
      // SUN cycle lapse, the BASIC..GOLD staking pauses until they pay the
      // reactivation fee and start a fresh SUN cycle.
      const sFarmStarted = r.sunFarmStartedAtMs ?? 0;
      const sunCycleActive = sFarmStarted > 0
        && (now - sFarmStarted) <= FARM_DURATION_MS;
      const sActive = (r.sunCount ?? 0) >= 1 && sunCycleActive;

      // V1 / SUN settle — same gated model as the dynamic tiers. They
      // only accrue TON while their underlying source is currently
      // producing ZOOM (4 V1 actively farming, or 4 SUN owned + cycle
      // active). When production is off, we still bump lastSettledAtMs
      // so users can't back-claim the gap by reactivating later.
      const v1ActiveCount = countActiveV1(planetsArr, now);
      const v1TotalCount = countV1(planetsArr);
      const sunTotalCount = r.sunCount ?? 0;
      // ALL tiers (V1 included) require an active SUN in inventory.
      // Removing the SUN via admin panel, or letting the SUN cycle
      // expire, freezes every TON staking line — no exceptions.
      const v1Producing = v1ActiveCount >= STAKING_REQUIRED_COUNT && sActive;
      const sunProducing = sunTotalCount >= STAKING_REQUIRED_COUNT && sunCycleActive;
      const v1Settled  = settleContinuousTier(r, "v1",  v1Producing,  v1ActiveCount, v1TotalCount, now);
      const sunSettled = settleContinuousTier(r, "sun", sunProducing, sunTotalCount, sunTotalCount, now);

      const dyn: Record<DynamicKind, DynamicSettleResult> = {
        basic:  settleDynamicTier(r, planetsArr, "basic",  sActive, now),
        rare:   settleDynamicTier(r, planetsArr, "rare",   sActive, now),
        epic:   settleDynamicTier(r, planetsArr, "epic",   sActive, now),
        mythic: settleDynamicTier(r, planetsArr, "mythic", sActive, now),
        plasma: settleDynamicTier(r, planetsArr, "plasma", sActive, now),
        gold:   settleDynamicTier(r, planetsArr, "gold",   sActive, now),
      };
      const patches: Record<string, number> = {};
      for (const k of DYNAMIC_KINDS) {
        const p = dyn[k]._patch;
        if (p) Object.assign(patches, p);
      }
      if (v1Settled._patch)  Object.assign(patches, v1Settled._patch);
      if (sunSettled._patch) Object.assign(patches, sunSettled._patch);
      if (Object.keys(patches).length > 0) {
        await tx.update(usersTable)
          .set(patches as Partial<typeof usersTable.$inferInsert>)
          .where(eq(usersTable.telegramId, telegramId));
      }
      return { rows: sel, dynResults: dyn, v1Settled, sunSettled };
    });

    if (rows.length === 0 || !dynResults || !v1Settled || !sunSettled) {
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
        mythic: empty("mythic"), plasma: empty("plasma"), gold: empty("gold"),
        hasSun: false,
        nowMs: now,
      });
    }

    const row = rows[0]!;
    const sunCount = row.sunCount ?? 0;
    // `hasSun` in the response now means "owns an ACTIVE SUN" (within the
    // 24h cycle). The dynamic tiers gate accrual and start-eligibility on
    // this stricter check, so the client UI must surface the same notion.
    const sunFarmStartedAt = row.sunFarmStartedAtMs ?? 0;
    const hasSun = sunCount >= 1
      && sunFarmStartedAt > 0
      && (now - sunFarmStartedAt) <= FARM_DURATION_MS;

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
        // Eligible to START requires 4 V1 currently actively farming
        // (mirrors the dynamic-tier rule). Once started, accrual is
        // gated by the same condition — so production stops if all
        // V1 cycles expire.
        eligible: v1Settled.activeCount >= STAKING_REQUIRED_COUNT,
        count: v1Settled.count,
        activeCount: v1Settled.activeCount,
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: v1Settled.startedAtMs,
        accruedTon: v1Settled.accruedTon,
        isAccruing: v1Settled.isAccruing,
        rewardTonPerMonth: v1Settled.rewardTonPerMonth,
        // V1 staking now requires an active SUN too — surface that to
        // the client so the "Activate your SUN" banner is shown.
        requiresSunInInventory: true,
      },
      sun: {
        // Eligible to START requires 4 SUN owned AND the SUN cycle to
        // be active (same rule as accrual gating). If the user lets
        // the SUN cycle expire, both display "Production paused" and
        // accrual freezes until they reactivate.
        eligible: sunCount >= STAKING_REQUIRED_COUNT && hasSun,
        count: sunCount,
        activeCount: hasSun ? sunCount : 0,
        required: STAKING_REQUIRED_COUNT,
        startedAtMs: sunSettled.startedAtMs,
        accruedTon: sunSettled.accruedTon,
        isAccruing: sunSettled.isAccruing,
        rewardTonPerMonth: sunSettled.rewardTonPerMonth,
        requiresSunInInventory: false,
      },
      basic: dynPayload("basic"),
      rare: dynPayload("rare"),
      epic: dynPayload("epic"),
      mythic: dynPayload("mythic"),
      plasma: dynPayload("plasma"),
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

    // SUN-active gate, computed once for both v1 and dynamic tiers below.
    const _sunFarmStartedAtMs = row.sunFarmStartedAtMs ?? 0;
    const _sunIsActive = (row.sunCount ?? 0) >= 1
      && _sunFarmStartedAtMs > 0
      && (now - _sunFarmStartedAtMs) <= FARM_DURATION_MS;

    if (kind === "v1") {
      const totalCount = countV1(planets);
      const activeCount = countActiveV1(planets, now);
      if (activeCount < STAKING_REQUIRED_COUNT) {
        return res.status(400).json({
          error: totalCount < STAKING_REQUIRED_COUNT ? "NOT_ENOUGH" : "NOT_ACTIVE",
          count: totalCount,
          activeCount,
          required: STAKING_REQUIRED_COUNT,
        });
      }
      // V1 staking now also requires an active SUN in inventory (parity
      // with all other tiers — admin removing the SUN must freeze V1 too).
      if (!_sunIsActive) {
        return res.status(400).json({ error: "SUN_REQUIRED" });
      }
      const existing = row.stakingV1StartedAtMs ?? 0;
      if (existing > 0) {
        const accrued = (row.stakingV1AccruedTon as number) ?? 0;
        return res.json({ kind, startedAtMs: existing, accruedTon: accrued, nowMs: now });
      }
      await db.update(usersTable).set({
        stakingV1StartedAtMs: now,
        stakingV1LastSettledAtMs: now,
        stakingV1AccruedTon: 0,
      }).where(eq(usersTable.telegramId, telegramId));
      return res.json({ kind, startedAtMs: now, accruedTon: 0, nowMs: now });
    }

    // Re-export the shared sun-active check under the previous local
    // names for the rest of the handler (kept for minimal diff).
    const sunFarmStartedAtMs = _sunFarmStartedAtMs;
    const sunIsActive = _sunIsActive;
    void sunFarmStartedAtMs;

    if (kind === "sun") {
      const count = row.sunCount ?? 0;
      if (count < STAKING_REQUIRED_COUNT) {
        return res.status(400).json({ error: "NOT_ENOUGH", count, required: STAKING_REQUIRED_COUNT });
      }
      // SUN cycle must be active to start (and to accrue).
      if (!sunIsActive) {
        return res.status(400).json({ error: "NOT_ACTIVE", count, required: STAKING_REQUIRED_COUNT });
      }
      const existing = row.stakingSunStartedAtMs ?? 0;
      if (existing > 0) {
        const accrued = (row.stakingSunAccruedTon as number) ?? 0;
        return res.json({ kind, startedAtMs: existing, accruedTon: accrued, nowMs: now });
      }
      await db.update(usersTable).set({
        stakingSunStartedAtMs: now,
        stakingSunLastSettledAtMs: now,
        stakingSunAccruedTon: 0,
      }).where(eq(usersTable.telegramId, telegramId));
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
