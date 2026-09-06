import { Router, type IRouter, type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { VerifiedTgUser } from "../lib/telegram-auth";
import { recordHistoryAsync } from "../lib/history";
import { requireTelegramAuth } from "../lib/telegram-auth";

// Local helper — the global Express.Request augmentation declared in
// telegram-auth.ts is sometimes not picked up across files in this
// codebase (other routes show the same TS2339 noise). Reading via this
// cast avoids adding new type errors while keeping runtime behaviour
// identical to the augmented `req.tgUser`.
function getTgUser(req: Request): VerifiedTgUser | null {
  return (req as Request & { tgUser?: VerifiedTgUser | null }).tgUser ?? null;
}

const router: IRouter = Router();

// ────────────────────────────────────────────────────────────────────────
// Long-term Earn tasks.
//
// Two families:
//   1. Lab forge milestones — claimable when the user's craft counters
//      reach the threshold (Lab pizza / stardust-pot forges count via
//      /craft/record → totalPlanetsBuilt). Reward = $ZOOM helper only.
//      Lab construction stays primary: pot costs 2,000 $ZOOM, pizza costs
//      12 ★ — Earn must not flood free pots.
//   2. Sponsor tasks — single-shot rewards for opening a partner channel
//      or visiting a link. The 10s wait + link-open is enforced
//      client-side; the server only guarantees "claimable exactly once"
//      AND enforces any extra eligibility gates (name emoji, account
//      age, balance threshold, referral count).
//      Reward can be wheel spins, $ZOOM or stardust.
//
// Persistence reuses the simple CSV pattern from claimed_milestones so
// we don't pay for a new table just to store a few flags per user.
// ────────────────────────────────────────────────────────────────────────

interface PlanetTaskDef {
  id: string;
  kind: "planets";
  threshold: number;
  rewardZoom: number;
}

// Sponsor reward shape. Exactly one of the reward fields should be > 0;
// the credit logic in /tasks/claim only updates the matching column.
interface SponsorTaskDef {
  id: string;
  kind: "sponsor";
  url: string;
  rewardSpins?: number;
  rewardZoom?: number;
  rewardStardust?: number;
  // Optional eligibility gates. ALL present gates must pass.
  // `requireNameEmoji` checks the verified Telegram first_name +
  // last_name + username (substring, case-sensitive on the emoji).
  // `requireAccountAgeDays` checks the user's `createdAt` is older
  // than N days (account age in OUR bot, not Telegram itself).
  // `requireMinZoomBalance` checks the live $ZOOM balance.
  // `requireMinReferrals` checks `referralCount`.
  requireNameEmoji?: string;
  requireAccountAgeDays?: number;
  requireMinZoomBalance?: number;
  requireMinReferrals?: number;
  // Localized requirement label shown in the UI when ineligible.
  // Italian — the active community for this batch of tasks.
  requirementLabel?: string;
}
type TaskDef = PlanetTaskDef | SponsorTaskDef;

// Lab-era catalog (labv3 — lower ZOOM so Farm/Lab stay primary).
// Pizza 12 ★ → 3.5 $ZOOM/h; pot 2,000 $ZOOM → 0.22 ★/h.
// All six ≈ 155 $ZOOM after 500 forges — helper only, not free pots.
const PLANET_TASKS: PlanetTaskDef[] = [
  { id: "labv3_5",   kind: "planets", threshold: 5,   rewardZoom: 5 },
  { id: "labv3_15",  kind: "planets", threshold: 15,  rewardZoom: 10 },
  { id: "labv3_40",  kind: "planets", threshold: 40,  rewardZoom: 15 },
  { id: "labv3_100", kind: "planets", threshold: 100, rewardZoom: 25 },
  { id: "labv3_250", kind: "planets", threshold: 250, rewardZoom: 40 },
  { id: "labv3_500", kind: "planets", threshold: 500, rewardZoom: 60 },
];

const SPONSOR_TASKS: SponsorTaskDef[] = [];

const TASKS_BY_ID: Record<string, TaskDef> = Object.fromEntries(
  [...PLANET_TASKS, ...SPONSOR_TASKS].map((t) => [t.id, t]),
);

function getClaimedSet(raw: string): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function setToString(s: Set<string>): string {
  return [...s].sort().join(",");
}

// ────────────────────────────────────────────────────────────────────────
// Eligibility — pure function over (task, user snapshot). Returns
// `{ eligible, reason? }`. Used both by /tasks/state (to compute the
// `eligible` flag for the UI) AND by /tasks/claim (to enforce server-side
// before crediting). Keeping it in one place prevents UI/server drift.
// ────────────────────────────────────────────────────────────────────────
interface EligibilitySnapshot {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  createdAtMs: number;
  zoomBalance: number;
  referralCount: number;
  nowMs: number;
}

interface EligibilityResult {
  eligible: boolean;
  reason?: "NAME_EMOJI" | "ACCOUNT_AGE" | "MIN_ZOOM" | "MIN_REFERRALS";
}

function checkSponsorEligibility(task: SponsorTaskDef, snap: EligibilitySnapshot): EligibilityResult {
  if (task.requireNameEmoji) {
    const haystack = `${snap.firstName ?? ""} ${snap.lastName ?? ""} ${snap.username ?? ""}`;
    if (!haystack.includes(task.requireNameEmoji)) {
      return { eligible: false, reason: "NAME_EMOJI" };
    }
  }
  if (task.requireAccountAgeDays && task.requireAccountAgeDays > 0) {
    const ageMs = snap.nowMs - snap.createdAtMs;
    const minAgeMs = task.requireAccountAgeDays * 24 * 60 * 60 * 1000;
    if (ageMs < minAgeMs) return { eligible: false, reason: "ACCOUNT_AGE" };
  }
  if (task.requireMinZoomBalance && task.requireMinZoomBalance > 0) {
    if (snap.zoomBalance < task.requireMinZoomBalance) {
      return { eligible: false, reason: "MIN_ZOOM" };
    }
  }
  if (task.requireMinReferrals && task.requireMinReferrals > 0) {
    if (snap.referralCount < task.requireMinReferrals) {
      return { eligible: false, reason: "MIN_REFERRALS" };
    }
  }
  return { eligible: true };
}

// GET /tasks/state/:telegramId
// Returns the catalog (so the client and server agree on thresholds /
// rewards / urls) plus the user's progress + claim flags + per-sponsor
// eligibility (so the UI can disable Open and show the requirement label
// without making a separate roundtrip).
router.get("/tasks/state/:telegramId", requireTelegramAuth({ bindField: "" }), async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    // The "ПОСТРОЕНО / built" counter on EARN must match the per-tier
    // sum shown in the RANK profile (BASIC + RARE + EPIC + GOLD + V1).
    // The legacy `total_planets_built` column is incremented by a
    // different sync path and drifts out of sync with `/craft/record`,
    // so we compute the value live from the per-tier counters here.
    const rows = await db
      .select({
        builtSum: sql<number>`GREATEST(
          ${usersTable.totalPlanetsBuilt},
          ${usersTable.totalCraftedBasic} + ${usersTable.totalCraftedRare} +
          ${usersTable.totalCraftedEpic}  + ${usersTable.totalCraftedMythic} +
          ${usersTable.totalCraftedPlasma} + ${usersTable.totalCraftedGold} +
          ${usersTable.totalCraftedV1}
        )`,
        claimedTasks: usersTable.claimedTasks,
        firstName: usersTable.firstName,
        username: usersTable.username,
        createdAt: usersTable.createdAt,
        zoomBalance: usersTable.zoomBalance,
        referralCount: usersTable.referralCount,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    const planetsBuilt = Number(row?.builtSum ?? 0);
    const claimed = getClaimedSet(row?.claimedTasks || "");

    // Eligibility snapshot. For name-emoji checks we ALSO consider the
    // current request's verified Telegram user (req.tgUser) because the
    // user may have just updated their Telegram profile and our DB copy
    // (firstName/username) lags behind until they reopen the app.
    const tg = getTgUser(req);
    const snap: EligibilitySnapshot = {
      firstName: tg?.firstName ?? row?.firstName ?? null,
      lastName: tg?.lastName ?? null,
      username: tg?.username ?? row?.username ?? null,
      createdAtMs: row?.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
      zoomBalance: Number(row?.zoomBalance ?? 0),
      referralCount: Number(row?.referralCount ?? 0),
      nowMs: Date.now(),
    };

    res.json({
      ok: true,
      planetsBuilt,
      claimedTasks: [...claimed],
      planetTasks: PLANET_TASKS.map((t) => ({
        id: t.id,
        threshold: t.threshold,
        rewardZoom: t.rewardZoom,
        claimed: claimed.has(t.id),
        claimable: !claimed.has(t.id) && planetsBuilt >= t.threshold,
      })),
      sponsorTasks: SPONSOR_TASKS.map((t) => {
        const elig = checkSponsorEligibility(t, snap);
        return {
          id: t.id,
          url: t.url,
          rewardSpins: t.rewardSpins ?? 0,
          rewardZoom: t.rewardZoom ?? 0,
          rewardStardust: t.rewardStardust ?? 0,
          claimed: claimed.has(t.id),
          eligible: elig.eligible,
          ineligibleReason: elig.eligible ? null : elig.reason,
          requirementLabel: t.requirementLabel ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[tasks/state] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const ClaimBody = z.object({
  telegramId: z.string().min(1),
  taskId: z.string().min(1),
});

// POST /tasks/claim
// Atomically claims a single task. The CAS-like UPDATE only lands when:
//   - the user exists, AND
//   - the task id is NOT already in claimed_tasks (CSV substring guard
//     using string_to_array to avoid the "planets_200 vs planets_2000"
//     prefix collision a naive LIKE would suffer from), AND
//   - for planet tasks, the live build sum >= threshold, AND
//   - for sponsor tasks, the eligibility gate (name emoji / age /
//     balance / referrals) is satisfied.
//
// On success we credit the reward in the same statement so two
// concurrent /tasks/claim calls can never double-pay.
router.post("/tasks/claim", async (req, res) => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId, taskId } = parsed.data;
  const task = TASKS_BY_ID[taskId];
  if (!task || taskId.startsWith("planets_")) {
    res.status(400).json({ ok: false, error: "UNKNOWN_TASK" });
    return;
  }
  try {
    const isPlanetTask = task.kind === "planets";
    const rewardZoom = isPlanetTask ? task.rewardZoom : (task.rewardZoom ?? 0);
    const rewardSpins = isPlanetTask ? 0 : (task.rewardSpins ?? 0);
    const rewardStardust = isPlanetTask ? 0 : (task.rewardStardust ?? 0);
    const threshold = isPlanetTask ? task.threshold : 0;

    // Same per-tier sum used by GET /tasks/state — keeps the threshold
    // guard consistent with the value the client actually sees.
    const builtSumSql = sql<number>`GREATEST(
      ${usersTable.totalPlanetsBuilt},
      ${usersTable.totalCraftedBasic} + ${usersTable.totalCraftedRare} +
      ${usersTable.totalCraftedEpic}  + ${usersTable.totalCraftedMythic} +
      ${usersTable.totalCraftedPlasma} + ${usersTable.totalCraftedGold} +
      ${usersTable.totalCraftedV1}
    )`;

    // Build the new claimed_tasks CSV in SQL: append `taskId` to the
    // existing list (or create a single-element list if the column is empty).
    // CASE WHEN claimed_tasks = '' covers the "no prior claims" branch
    // without producing a leading comma.
    const newClaimedSql = sql`CASE
      WHEN ${usersTable.claimedTasks} = '' THEN ${taskId}
      ELSE ${usersTable.claimedTasks} || ',' || ${taskId}
    END`;

    // Snapshot of verified Telegram identity (captured outside the txn —
    // it doesn't depend on DB state and we don't want to keep it in the
    // hot path of the row lock).
    const tg = getTgUser(req);

    // Wrap the entire claim flow in a transaction with SELECT ... FOR
    // UPDATE so:
    //   1) sponsor gate predicates (zoom balance, referrals, name emoji,
    //      account age) are re-checked under a row lock — closing the
    //      TOCTOU window where a user passed a stale eligibility check
    //      and got credited even though concurrent state changed,
    //   2) the claim CSV append + currency credit happen atomically with
    //      the eligibility re-check (no one else can mutate the row in
    //      between).
    // The conditional UPDATE still carries the "not already claimed"
    // guard as a belt-and-suspenders defence against a programmer error
    // bypassing the lock path.
    type ClaimOutcome =
      | { kind: "ok"; zoom: number; spins: number; stardust: number; epoch: number; totalBuilt: number }
      | { kind: "user_not_found" }
      | { kind: "already_claimed" }
      | { kind: "threshold_not_met"; built: number }
      | { kind: "ineligible"; reason: string; requirementLabel: string | null };

    const outcome: ClaimOutcome = await db.transaction(async (tx) => {
      const locked = await tx
        .select({
          firstName: usersTable.firstName,
          username: usersTable.username,
          createdAt: usersTable.createdAt,
          zoomBalance: usersTable.zoomBalance,
          referralCount: usersTable.referralCount,
          claimedTasks: usersTable.claimedTasks,
          builtSum: builtSumSql,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);

      if (locked.length === 0) {
        return { kind: "user_not_found" } as const;
      }
      const row = locked[0]!;

      // Already claimed?
      const claimedSet = getClaimedSet(row.claimedTasks || "");
      if (claimedSet.has(taskId)) {
        return { kind: "already_claimed" } as const;
      }

      // Planet-task threshold under lock.
      if (isPlanetTask) {
        const built = Number(row.builtSum ?? 0);
        if (built < threshold) {
          return { kind: "threshold_not_met", built } as const;
        }
      } else {
        // Sponsor-task gate re-check under lock.
        const sponsorTask = task;
        const hasGate =
          sponsorTask.requireNameEmoji ||
          sponsorTask.requireAccountAgeDays ||
          sponsorTask.requireMinZoomBalance ||
          sponsorTask.requireMinReferrals;
        if (hasGate) {
          const snap: EligibilitySnapshot = {
            firstName: tg?.firstName ?? row.firstName ?? null,
            lastName: tg?.lastName ?? null,
            username: tg?.username ?? row.username ?? null,
            createdAtMs: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
            zoomBalance: Number(row.zoomBalance ?? 0),
            referralCount: Number(row.referralCount ?? 0),
            nowMs: Date.now(),
          };
          const elig = checkSponsorEligibility(sponsorTask, snap);
          if (!elig.eligible) {
            return {
              kind: "ineligible",
              reason: elig.reason ?? "INELIGIBLE",
              requirementLabel: sponsorTask.requirementLabel ?? null,
            } as const;
          }
        }
      }

      // Build the credit patch by reward type. Multiple reward types in
      // one task are supported but unused right now. zoomBalance bumps
      // also bump balanceEpoch so client reconciliation picks the new
      // value.
      const creditPatch: Record<string, unknown> = {
        claimedTasks: newClaimedSql,
      };
      if (rewardZoom > 0) {
        creditPatch["zoomBalance"] = sql`${usersTable.zoomBalance} + ${rewardZoom}`;
        creditPatch["balanceEpoch"] = sql`${usersTable.balanceEpoch} + 1`;
      }
      if (rewardSpins > 0) {
        creditPatch["wheelSpins"] = sql`${usersTable.wheelSpins} + ${rewardSpins}`;
      }
      if (rewardStardust > 0) {
        creditPatch["stardustBalance"] = sql`${usersTable.stardustBalance} + ${rewardStardust}`;
      }

      const updated = await tx
        .update(usersTable)
        .set(creditPatch)
        .where(
          sql`
            ${usersTable.telegramId} = ${telegramId}
            AND NOT (${taskId} = ANY(string_to_array(${usersTable.claimedTasks}, ',')))
          `,
        )
        .returning({
          zoom: usersTable.zoomBalance,
          spins: usersTable.wheelSpins,
          stardust: usersTable.stardustBalance,
          epoch: usersTable.balanceEpoch,
          totalPlanetsBuilt: builtSumSql,
        });

      if (updated.length === 0) {
        // Should be unreachable thanks to the FOR UPDATE lock + the
        // already-claimed check above, but fall back to "already
        // claimed" rather than silently dropping the credit.
        return { kind: "already_claimed" } as const;
      }
      return {
        kind: "ok",
        zoom: Number(updated[0]!.zoom),
        spins: Number(updated[0]!.spins),
        stardust: Number(updated[0]!.stardust),
        epoch: Number(updated[0]!.epoch ?? 0),
        totalBuilt: Number(updated[0]!.totalPlanetsBuilt ?? 0),
      } as const;
    });

    if (outcome.kind === "user_not_found") {
      res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
      return;
    }
    if (outcome.kind === "already_claimed") {
      res.status(409).json({ ok: false, error: "ALREADY_CLAIMED" });
      return;
    }
    if (outcome.kind === "threshold_not_met") {
      res.status(409).json({
        ok: false,
        error: "THRESHOLD_NOT_MET",
        planetsBuilt: outcome.built,
        threshold,
      });
      return;
    }
    if (outcome.kind === "ineligible") {
      res.status(409).json({
        ok: false,
        error: "INELIGIBLE",
        reason: outcome.reason,
        requirementLabel: outcome.requirementLabel,
      });
      return;
    }

    console.log(
      `[tasks/claim] ${telegramId} claimed ${taskId} (+${rewardZoom} ZOOM, +${rewardSpins} spins, +${rewardStardust} stardust)`,
    );

    if (rewardZoom > 0) {
      recordHistoryAsync({ telegramId, kind: "task_claim", delta: rewardZoom, currency: "zoom", meta: { taskId } });
    }
    if (rewardStardust > 0) {
      recordHistoryAsync({ telegramId, kind: "task_claim", delta: rewardStardust, currency: "stardust", meta: { taskId } });
    }

    res.json({
      ok: true,
      taskId,
      rewardZoom,
      rewardSpins,
      rewardStardust,
      zoomBalance: outcome.zoom,
      balanceEpoch: outcome.epoch,
      wheelSpins: outcome.spins,
      stardustBalance: outcome.stardust,
      totalPlanetsBuilt: outcome.totalBuilt,
    });
  } catch (err) {
    console.error("[tasks/claim] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

export default router;

// Re-export the catalog so other modules (or tests) can introspect it.
export { PLANET_TASKS, SPONSOR_TASKS, setToString as _setToString };
