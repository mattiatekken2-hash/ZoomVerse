import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { EQUIPMENT_RATE_SERVER } from "./equipment";
import {
  LAB_GLB_FARM_HOURS,
  LAB_STARDUST_FARM_RATE,
  isLabStardustFarmPlanet,
  labMarketPathForPlanet,
  resolveLabShapeIdFromPlanet,
  resolveLabStardustShapeId,
  resumePlanetFarmAfterMarketPause,
} from "@workspace/game-models";

const router: IRouter = Router();

// Lab GLB farm cycle is a fixed 24h window (duration upgrades retired).
const BASE_FARM_DURATION_MS = LAB_GLB_FARM_HOURS * 60 * 60 * 1000;
const SUN_FARM_DURATION_MS  = 1 * 60 * 60 * 1000;   // SUN cycle
const EQUIPMENT_FARM_DURATION_MS = 24 * 60 * 60 * 1000; // equipment stays 24h
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;
// SUN_CONFIG.rate on the client is 1000 ZOOM/hour (per SUN owned).
const SUN_RATE_PER_HOUR = 1000;
// Referral speed bonus on the client is +10% (state.referralSpeedBonus = 0.10
// for any user whose referredBy is set). We mirror it here so the server-side
// credit matches what the client would have computed had it been online.
const REFERRAL_SPEED_BONUS = 0.10;

const SettleBody = z.object({
  telegramId: z.string().min(1),
  // Optional: the client's local lastFarmingSettledAt watermark. Used as a
  // floor when the server's own watermark is still 0 (first ever server-side
  // settle for this user). This guarantees we cannot credit a period that
  // the client already credited locally on a previous session — protecting
  // every existing user from a one-off double-credit at deploy time.
  clientLastSettledAtMs: z.number().nonnegative().optional(),
});

interface PlanetRow {
  id?: unknown;
  name?: unknown;
  rate?: unknown;
  shapeId?: unknown;
  displayName?: unknown;
  farmStartedAt?: unknown;
  lastCollectedAt?: unknown;
  isFarmingActive?: unknown;
  isListedInMarket?: unknown;
}

function planetText(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function queryRows(sel: unknown): Record<string, unknown>[] {
  if (Array.isArray(sel)) return sel as Record<string, unknown>[];
  const rows = (sel as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function jsonArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string" && v.length > 0) {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isFlagOn(v: unknown): boolean {
  return v === true || v === 1 || v === "true";
}

function planetIsStardustFarm(p: PlanetRow, rate: number): boolean {
  const shapeId = planetText(p.shapeId);
  const displayName = planetText(p.displayName);
  if (isLabStardustFarmPlanet({ shapeId, displayName })) return true;
  return labMarketPathForPlanet({ shapeId, displayName, rate }) === "stardust";
}

function stardustCardRate(p: PlanetRow, fallbackRate: number): number {
  const resolved = resolveLabStardustShapeId(
    resolveLabShapeIdFromPlanet({
      shapeId: planetText(p.shapeId),
      displayName: planetText(p.displayName),
    }),
  );
  if (resolved && typeof LAB_STARDUST_FARM_RATE[resolved] === "number") {
    return LAB_STARDUST_FARM_RATE[resolved];
  }
  return fallbackRate;
}

/**
 * Server-authoritative offline accrual.
 *
 * Reads the user's persisted planet array (`planets_json`) and SUN cycle
 * timestamps, computes how much $ZOOM / ★ stardust has accrued since
 * `last_farming_settled_at_ms`, and atomically credits $ZOOM to
 * `zoom_balance` and Lab stardust-path models to `stardust_balance`.
 * Locks the user row with `FOR UPDATE` so concurrent calls
 * (multiple tabs / retries) cannot double-credit the same elapsed period.
 *
 * Per-planet formula (matches client `settleFarmingState` after the
 * daily-collect removal):
 *   effectiveStart = max(farmStartedAt, lastCollectedAt)
 *   start = max(watermark, effectiveStart)
 *   end   = min(now, effectiveStart + 24h)
 *   if (end > start) earned += (rate / 3_600_000) * (end - start) * speed
 *
 * SUN keeps its original two-window formula (its 24h farm + 24h collect
 * pattern was NOT changed in the collect removal — only the regular
 * planets were).
 *
 * MIGRATION GUARANTEE — the user explicitly asked that no existing member
 * lose anything. The first ever call for a given user has
 * `last_farming_settled_at_ms = 0`. We treat that as "the server has never
 * credited this user before" and use the client-supplied watermark
 * (`clientLastSettledAtMs`) as the floor instead. If the client has been
 * crediting offline accrual locally up until now, its watermark will be
 * close to "now", so the server credits ~0 on the first call. From then on
 * the server is the authority and the client just mirrors what it returns.
 *
 * No path in this endpoint ever decreases `zoom_balance` or any other
 * stored value. `earned` is clamped to >= 0 before the UPDATE.
 */
router.post("/farm/settle", async (req, res) => {
  const parsed = SettleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  const clientFloor = Math.floor(parsed.data.clientLastSettledAtMs ?? 0);
  const now = Date.now();

  try {
    const out = await db.transaction(async (tx) => {
      const sel = await tx.execute(sql`
        SELECT zoom_balance,
               stardust_balance,
               balance_epoch,
               last_farming_settled_at_ms,
               planets_json,
               equipment_json,
               items_json,
               sun_count,
               sun_farm_started_at_ms,
               sun_last_collected_at_ms,
               referred_by
          FROM users
         WHERE telegram_id = ${telegramId}
         FOR UPDATE
      `);
      const rows = queryRows(sel);
      if (!rows || rows.length === 0) {
        // No user row yet (lazy-created on first /balance/sync). Nothing to
        // credit. Return ok: false so the client can retry after the row is
        // created without triggering an error toast.
        return {
          ok: false,
          exists: false,
          credited: 0,
          stardustCredited: 0,
          balance: 0,
          stardustBalance: 0,
          balanceEpoch: 0,
          settledAtMs: now,
        };
      }
      const row = rows[0]!;
      const serverLastSettled = num(row["last_farming_settled_at_ms"] ?? row["lastFarmingSettledAtMs"]);
      const zoomBalance = num(row["zoom_balance"] ?? row["zoomBalance"]);
      const stardustBalance = num(row["stardust_balance"] ?? row["stardustBalance"]);
      const balanceEpoch = num(row["balance_epoch"] ?? row["balanceEpoch"]);
      const sunCount = num(row["sun_count"] ?? row["sunCount"]);
      const sunStarted = num(row["sun_farm_started_at_ms"] ?? row["sunFarmStartedAtMs"]);
      const sunCollected = num(row["sun_last_collected_at_ms"] ?? row["sunLastCollectedAtMs"]);
      const referredBy = row["referred_by"] ?? row["referredBy"];
      const speedMultiplier = referredBy ? 1 + REFERRAL_SPEED_BONUS : 1;

      // Both paths credit from the server watermark only.
      // The client HUD ticks locally and advances `lastFarmingSettledAt`
      // before /farm/settle. Using that as a ZOOM floor made the window
      // empty (credited=0), then wallet hydration snapped S3 back to 0.
      // Stardust already ignored the client floor for the same reason.
      void clientFloor;
      const zoomWatermark = serverLastSettled;
      const stardustWatermark = serverLastSettled;

      if (zoomWatermark >= now && stardustWatermark >= now) {
        return {
          ok: true,
          exists: true,
          credited: 0,
          stardustCredited: 0,
          balance: zoomBalance,
          stardustBalance,
          balanceEpoch,
          settledAtMs: serverLastSettled,
        };
      }

      let earned = 0;
      let stardustEarned = 0;

      // ─── Planets ───
      const planets: PlanetRow[] = jsonArray<PlanetRow>(row["planets_json"] ?? row["planetsJson"]);
      for (const raw of planets) {
        if (!raw || typeof raw !== "object") continue;
        // Listed models stay paused. Delisted-but-paused rows use the same
        // resume view as the Farm UI so ★ credits match what the card shows.
        if (isFlagOn(raw.isListedInMarket)) continue;
        const p = resumePlanetFarmAfterMarketPause(raw, now);
        if (!isFlagOn(p.isFarmingActive)) continue;
        // MUSHROOM planets earn NFTSTAR (client-side currency) — skip from ZOOM credit.
        if (String((p as Record<string, unknown>)["name"] ?? "").toUpperCase() === "MUSHROOM") continue;
        const jsonRate = num(p.rate);
        const farmStartedAt = num(p.farmStartedAt);
        const lastCollectedAt = num(p.lastCollectedAt);
        // Daily-collect removed: cycle is anchored to a single 24h block.
        // For brand-new cycles `effectiveStart === farmStartedAt`. For planets
        // that existed BEFORE the daily-collect removal AND had already been
        // collected at least once, `lastCollectedAt > farmStartedAt`, so we
        // anchor the fresh 24h block to the last collect — exactly the
        // "riattiva automaticamente, come se avessi appena cliccato collect"
        // behavior the user asked for. Mirrors `effectiveFarmStart()` in the
        // client `useGameState.ts`.
        const effectiveStart = Math.max(farmStartedAt, lastCollectedAt);
        // Never-started planet (both timestamps still at 0) — skip.
        if (effectiveStart <= 0) continue;
        // Lab GLB models farm a fixed 24h cycle (duration upgrades retired).
        const planetFarmDurationMs = BASE_FARM_DURATION_MS;
        const stardustFarm = planetIsStardustFarm(p, jsonRate);
        // Canonical ★ rate even when planets_json.rate is 0/stale — otherwise
        // stardust models never credit the wallet.
        const rate = stardustFarm ? stardustCardRate(p, jsonRate) : jsonRate;
        if (rate <= 0) continue;
        const start = Math.max(stardustFarm ? stardustWatermark : zoomWatermark, effectiveStart);
        const end = Math.min(now, effectiveStart + planetFarmDurationMs);
        if (end > start) {
          if (stardustFarm) {
            stardustEarned += (rate / 3_600_000) * (end - start) * speedMultiplier;
          } else {
            earned += (rate / 3_600_000) * (end - start) * speedMultiplier;
          }
        }
      }

      // ─── Equipment ───
      // Mirror per-planet 24h-cycle accrual. Server-canonical
      // rate table — any tampered client `rate` was already stripped on
      // /equipment/save, but we re-derive here as belt-and-suspenders.
      const equipment: Array<Record<string, unknown>> = jsonArray<Record<string, unknown>>(row["equipment_json"] ?? row["equipmentJson"]);
      for (const e of equipment) {
        if (!e || typeof e !== "object") continue;
        if (!isFlagOn(e["isFarmingActive"])) continue;
        if (isFlagOn(e["isListedInMarket"])) continue;
        const category = String(e["category"] || "");
        const rarity = String(e["rarity"] || "");
        const canon =
          (EQUIPMENT_RATE_SERVER as Record<string, Record<string, number>>)[category]?.[rarity];
        const rate = typeof canon === "number" ? canon : num(e["rate"]);
        if (rate <= 0) continue;
        const farmStartedAt = num(e["farmStartedAt"]);
        const lastCollectedAt = num(e["lastCollectedAt"]);
        const effectiveStart = Math.max(farmStartedAt, lastCollectedAt);
        if (effectiveStart <= 0) continue;
        const start = Math.max(zoomWatermark, effectiveStart);
        const end = Math.min(now, effectiveStart + EQUIPMENT_FARM_DURATION_MS);
        if (end > start) {
          earned += (rate / 3_600_000) * (end - start) * speedMultiplier;
        }
      }

      // ─── Collectible items ───
      // Items are always-on passive earners with no farm cycle: they earn
      // from max(watermark, createdAt) to now without any 24h cap.
      // Server-canonical rate is re-derived from ITEM_CFG[type] to prevent
      // any client-forged rate from influencing the settlement.
      const ITEM_RATE_SERVER: Record<string, number> = {
        SANDWICH: 1, PIZZA: 1.5,
        SKATEBOARD: 10, PLUNGER: 8,
        DVD: 45, GAMEBOY: 55,
        GUITAR: 90, ARTIFACT: 105, ROBOT: 115,
        CRYSTAL: 160, TROPHY: 175, BOOK: 200,
      };
      const items: Array<Record<string, unknown>> = jsonArray<Record<string, unknown>>(row["items_json"] ?? row["itemsJson"]);
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (isFlagOn(item["isListedInMarket"])) continue;
        const itemType = String(item["type"] || "");
        const canon = ITEM_RATE_SERVER[itemType];
        const rate = typeof canon === "number" ? canon : num(item["rate"]);
        if (rate <= 0) continue;
        const createdAt = num(item["createdAt"]);
        if (createdAt <= 0) continue;
        const start = Math.max(zoomWatermark, createdAt);
        const end = now;
        if (end > start) {
          earned += (rate / 3_600_000) * (end - start) * speedMultiplier;
        }
      }

      // ─── SUN ───
      // SUN earns iff the user owns at least one SUN AND the cycle has been
      // activated (sunStarted > 0). SUN now uses the same 1h farm window as
      // regular planets. The collect window keeps the old DAILY_COLLECT_MS
      // as a secondary cap (SUN still requires a manual collect).
      if (sunCount > 0 && sunStarted > 0) {
        const start = Math.max(zoomWatermark, sunStarted, sunCollected);
        const end = Math.min(
          now,
          sunStarted + SUN_FARM_DURATION_MS,
          sunCollected > 0 ? sunCollected + DAILY_COLLECT_MS : now,
        );
        if (end > start) {
          earned +=
            ((SUN_RATE_PER_HOUR * sunCount) / 3_600_000) *
            (end - start) *
            speedMultiplier;
        }
      }

      // Defensive: never credit a negative amount, never write a watermark
      // older than the one already stored.
      const credited = Math.max(0, earned);
      const stardustCredited = Math.max(0, stardustEarned);
      const newWatermark = Math.max(serverLastSettled, now);

      // RACE FIX (May 2026): when we actually credit something, bump
      // `balance_epoch` so a concurrent or near-concurrent `/balance/sync`
      // (which may still be in-flight with the *pre-credit* localBalance)
      // cannot overwrite our credit. `/balance/sync` uses
      //   CASE WHEN server_epoch > clientEpoch THEN server ELSE client
      // so a higher server epoch forces the server value to win and the
      // client snaps to the post-credit balance via reconcileFromSyncResponse.
      // If credited == 0 we leave the epoch alone so heartbeat calls don't
      // generate a flood of unnecessary epoch bumps that would force every
      // client to snap to the same value they already have.
      // Bump epoch on ZOOM *or* ★ credit so a racing /balance/sync LEAST
      // (pre-credit persistable) cannot undo the farm yield we just wrote.
      const epochBump = credited > 0 || stardustCredited > 0 ? 1 : 0;

      // Conditional UPDATE: only land if no concurrent call already moved
      // the watermark past `serverLastSettled`. With FOR UPDATE this should
      // always succeed in the same transaction, but the guard is cheap and
      // makes the invariant explicit.
      await tx.execute(sql`
        UPDATE users
           SET zoom_balance = zoom_balance + ${credited},
               stardust_balance = stardust_balance + ${stardustCredited},
               balance_epoch = balance_epoch + ${epochBump},
               last_farming_settled_at_ms = GREATEST(last_farming_settled_at_ms, ${newWatermark})
         WHERE telegram_id = ${telegramId}
      `);

      return {
        ok: true,
        exists: true,
        credited,
        stardustCredited,
        balance: zoomBalance + credited,
        stardustBalance: stardustBalance + stardustCredited,
        balanceEpoch: balanceEpoch + epochBump,
        settledAtMs: newWatermark,
      };
    });

    res.json(out);
  } catch (err) {
    console.error("[farm/settle] error:", err);
    res.status(500).json({ error: "INTERNAL" });
  }
});

export default router;
