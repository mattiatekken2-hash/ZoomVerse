import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// Mirrors client constants (artifacts/zoom-master/src/hooks/useGameState.ts).
// Both windows are 24h: a planet's farming cycle expires 24h after its
// activation OR 24h after its last collect, whichever happens first.
const FARM_DURATION_MS = 24 * 60 * 60 * 1000;
const DAILY_COLLECT_MS = 24 * 60 * 60 * 1000;
// SUN_CONFIG.rate on the client is 1000 ZOOM/hour (per SUN owned).
const SUN_RATE_PER_HOUR = 1000;
// Referral speed bonus on the client is +10% (state.referralSpeedBonus = 0.10
// for any user whose referredBy is set). We mirror it here so the server-side
// credit matches what the client would have computed had it been online.
const REFERRAL_SPEED_BONUS = 0.10;
// Mirror the client's per-tick "dynamic bonus" — every client tick adds
// `planet.rate + Math.random() * DYNAMIC_BONUS_MAX` ZOOM/hour for each
// regular planet (NOT for SUN). Over many ticks the expected value of the
// random term is `DYNAMIC_BONUS_MAX / 2`, so we add that fixed offset on
// the server to keep long-running offline accrual statistically equivalent
// to what the user would have earned online. SUN intentionally omitted —
// matches client which uses raw `SUN_CONFIG.rate` without a bonus.
const DYNAMIC_BONUS_MAX = 10;
const DYNAMIC_BONUS_AVG = DYNAMIC_BONUS_MAX / 2;

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
  rate?: unknown;
  farmStartedAt?: unknown;
  lastCollectedAt?: unknown;
  isFarmingActive?: unknown;
  isListedInMarket?: unknown;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Server-authoritative offline accrual.
 *
 * Reads the user's persisted planet array (`planets_json`) and SUN cycle
 * timestamps, computes how much $ZOOM has accrued since
 * `last_farming_settled_at_ms`, and atomically credits the new amount to
 * `zoom_balance`. Locks the user row with `FOR UPDATE` so concurrent calls
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
               balance_epoch,
               last_farming_settled_at_ms,
               planets_json,
               sun_count,
               sun_farm_started_at_ms,
               sun_last_collected_at_ms,
               referred_by
          FROM users
         WHERE telegram_id = ${telegramId}
         FOR UPDATE
      `);
      const rows = (sel as unknown as { rows: Record<string, unknown>[] }).rows;
      if (!rows || rows.length === 0) {
        // No user row yet (lazy-created on first /balance/sync). Nothing to
        // credit. Return ok: false so the client can retry after the row is
        // created without triggering an error toast.
        return {
          ok: false,
          exists: false,
          credited: 0,
          balance: 0,
          balanceEpoch: 0,
          settledAtMs: now,
        };
      }
      const row = rows[0]!;
      const serverLastSettled = num(row["last_farming_settled_at_ms"]);
      const zoomBalance = num(row["zoom_balance"]);
      const balanceEpoch = num(row["balance_epoch"]);
      const sunCount = num(row["sun_count"]);
      const sunStarted = num(row["sun_farm_started_at_ms"]);
      const sunCollected = num(row["sun_last_collected_at_ms"]);
      const referredBy = row["referred_by"];
      const speedMultiplier = referredBy ? 1 + REFERRAL_SPEED_BONUS : 1;

      // Watermark floor for the per-planet "start" computation. We always
      // take the max of:
      //  - the server's own previous watermark (what we already credited)
      //  - the client's last local settle (covers the deploy-day migration
      //    so we never credit a period the client already credited)
      // For brand-new users both are 0, and the per-planet
      // start = max(0, farmStartedAt, lastCollectedAt) naturally falls back
      // to "since the cycle started", which is the correct behavior.
      const watermark = Math.max(serverLastSettled, clientFloor);

      if (watermark >= now) {
        // Clock already past now (clock skew or repeated call within 1ms):
        // nothing to credit, but still bump the watermark so subsequent
        // calls can advance it.
        return {
          ok: true,
          exists: true,
          credited: 0,
          balance: zoomBalance,
          balanceEpoch,
          settledAtMs: serverLastSettled,
        };
      }

      let earned = 0;

      // ─── Planets ───
      const planetsField = row["planets_json"];
      const planets: PlanetRow[] = Array.isArray(planetsField)
        ? (planetsField as PlanetRow[])
        : [];
      for (const p of planets) {
        if (!p || typeof p !== "object") continue;
        if (!p.isFarmingActive) continue;
        if (p.isListedInMarket) continue;
        const rate = num(p.rate);
        if (rate <= 0) continue;
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
        const start = Math.max(watermark, effectiveStart);
        const end = Math.min(now, effectiveStart + FARM_DURATION_MS);
        if (end > start) {
          // Dynamic bonus average — see DYNAMIC_BONUS_AVG comment above.
          const effectiveRate = rate + DYNAMIC_BONUS_AVG;
          earned += (effectiveRate / 3_600_000) * (end - start) * speedMultiplier;
        }
      }

      // ─── SUN ───
      // SUN earns iff the user owns at least one SUN AND the cycle has been
      // activated (sunStarted > 0). The 24h farm/collect windows apply just
      // like for regular planets.
      if (sunCount > 0 && sunStarted > 0) {
        const start = Math.max(watermark, sunStarted, sunCollected);
        const end = Math.min(
          now,
          sunStarted + FARM_DURATION_MS,
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
      const epochBump = credited > 0 ? 1 : 0;

      // Conditional UPDATE: only land if no concurrent call already moved
      // the watermark past `serverLastSettled`. With FOR UPDATE this should
      // always succeed in the same transaction, but the guard is cheap and
      // makes the invariant explicit.
      await tx.execute(sql`
        UPDATE users
           SET zoom_balance = zoom_balance + ${credited},
               balance_epoch = balance_epoch + ${epochBump},
               last_farming_settled_at_ms = GREATEST(last_farming_settled_at_ms, ${newWatermark})
         WHERE telegram_id = ${telegramId}
      `);

      return {
        ok: true,
        exists: true,
        credited,
        balance: zoomBalance + credited,
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
