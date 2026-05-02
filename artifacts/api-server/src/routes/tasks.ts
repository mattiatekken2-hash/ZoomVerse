import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ────────────────────────────────────────────────────────────────────────
// Long-term Earn tasks.
//
// Two families:
//   1. Planet-build milestones — claimable when the user's
//      `totalPlanetsBuilt` (monotonic counter incremented inside
//      /regular-planets/save) reaches the threshold. Reward = $ZOOM.
//   2. Sponsor tasks — single-shot rewards for opening a partner channel.
//      The 10s wait + link-open is enforced client-side; the server only
//      guarantees "claimable exactly once". Reward = wheel spins.
//
// Persistence reuses the simple CSV pattern from claimed_milestones so
// we don't pay for a new table just to store five flags per user.
// ────────────────────────────────────────────────────────────────────────

interface PlanetTaskDef {
  id: string;
  kind: "planets";
  threshold: number;
  rewardZoom: number;
}
interface SponsorTaskDef {
  id: string;
  kind: "sponsor";
  url: string;
  rewardSpins: number;
}
type TaskDef = PlanetTaskDef | SponsorTaskDef;

const PLANET_TASKS: PlanetTaskDef[] = [
  { id: "planets_200",  kind: "planets", threshold: 200,  rewardZoom: 5_000 },
  { id: "planets_500",  kind: "planets", threshold: 500,  rewardZoom: 10_000 },
  { id: "planets_1000", kind: "planets", threshold: 1000, rewardZoom: 25_000 },
  { id: "planets_2000", kind: "planets", threshold: 2000, rewardZoom: 50_000 },
];

const SPONSOR_TASKS: SponsorTaskDef[] = [
  { id: "sponsor_coinflip", kind: "sponsor", url: "https://t.me/coinflip_vip", rewardSpins: 3 },
];

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

// GET /tasks/state/:telegramId
// Returns the catalog (so the client and server agree on thresholds /
// rewards / urls) plus the user's progress + claim flags.
router.get("/tasks/state/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    const rows = await db
      .select({
        totalPlanetsBuilt: usersTable.totalPlanetsBuilt,
        claimedTasks: usersTable.claimedTasks,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    const planetsBuilt = row?.totalPlanetsBuilt ?? 0;
    const claimed = getClaimedSet(row?.claimedTasks || "");
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
      sponsorTasks: SPONSOR_TASKS.map((t) => ({
        id: t.id,
        url: t.url,
        rewardSpins: t.rewardSpins,
        claimed: claimed.has(t.id),
      })),
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
//   - for planet tasks, total_planets_built >= threshold.
//
// On success we credit the reward (zoom for planet tasks, wheel_spins for
// sponsor tasks) and append the task id to claimed_tasks in the same
// statement so two concurrent /tasks/claim calls can never double-pay.
router.post("/tasks/claim", async (req, res) => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId, taskId } = parsed.data;
  const task = TASKS_BY_ID[taskId];
  if (!task) {
    res.status(400).json({ ok: false, error: "UNKNOWN_TASK" });
    return;
  }
  try {
    const isPlanetTask = task.kind === "planets";
    const rewardZoom = isPlanetTask ? task.rewardZoom : 0;
    const rewardSpins = !isPlanetTask ? task.rewardSpins : 0;
    const threshold = isPlanetTask ? task.threshold : 0;

    // Build the new claimed_tasks CSV in SQL: append `taskId` to the
    // existing list (or create a single-element list if the column is empty).
    // CASE WHEN claimed_tasks = '' covers the "no prior claims" branch
    // without producing a leading comma.
    const newClaimedSql = sql`CASE
      WHEN ${usersTable.claimedTasks} = '' THEN ${taskId}
      ELSE ${usersTable.claimedTasks} || ',' || ${taskId}
    END`;

    const updated = await db
      .update(usersTable)
      .set({
        claimedTasks: newClaimedSql,
        ...(isPlanetTask
          ? {
              zoomBalance: sql`${usersTable.zoomBalance} + ${rewardZoom}`,
              balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
            }
          : {
              wheelSpins: sql`${usersTable.wheelSpins} + ${rewardSpins}`,
            }),
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND NOT (${taskId} = ANY(string_to_array(${usersTable.claimedTasks}, ',')))
          ${isPlanetTask ? sql`AND ${usersTable.totalPlanetsBuilt} >= ${threshold}` : sql``}
        `,
      )
      .returning({
        zoom: usersTable.zoomBalance,
        spins: usersTable.wheelSpins,
        totalPlanetsBuilt: usersTable.totalPlanetsBuilt,
      });

    if (updated.length === 0) {
      // Distinguish "already claimed" vs "threshold not yet met" for a
      // friendly error in the client.
      const existing = await db
        .select({
          totalPlanetsBuilt: usersTable.totalPlanetsBuilt,
          claimedTasks: usersTable.claimedTasks,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const claimed = getClaimedSet(existing[0]!.claimedTasks || "");
      if (claimed.has(taskId)) {
        res.status(409).json({ ok: false, error: "ALREADY_CLAIMED" });
        return;
      }
      if (isPlanetTask && (existing[0]!.totalPlanetsBuilt ?? 0) < threshold) {
        res.status(409).json({
          ok: false,
          error: "THRESHOLD_NOT_MET",
          planetsBuilt: existing[0]!.totalPlanetsBuilt ?? 0,
          threshold,
        });
        return;
      }
      res.status(500).json({ ok: false, error: "UNKNOWN" });
      return;
    }

    console.log(
      `[tasks/claim] ${telegramId} claimed ${taskId} (+${rewardZoom} ZOOM, +${rewardSpins} spins)`,
    );

    res.json({
      ok: true,
      taskId,
      rewardZoom,
      rewardSpins,
      zoomBalance: updated[0]!.zoom,
      wheelSpins: updated[0]!.spins,
      totalPlanetsBuilt: updated[0]!.totalPlanetsBuilt,
    });
  } catch (err) {
    console.error("[tasks/claim] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

export default router;

// Re-export the catalog so other modules (or tests) can introspect it.
export { PLANET_TASKS, SPONSOR_TASKS, setToString as _setToString };
