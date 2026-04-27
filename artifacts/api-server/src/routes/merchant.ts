import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SPAWN_MIN_MS = 20 * 60 * 1000;
const SPAWN_MAX_MS = 50 * 60 * 1000;
const VISIT_DURATION_MS = 90 * 1000;
const MAX_FUSIONS_PER_VISIT = 3;
const FUSE_GRACE_MS = 30 * 1000;

// Single key in app_settings that holds the GLOBAL merchant schedule shared
// by every player. Storing both timestamps in one JSON value lets us flip
// from "pending" to "live" (or "live" to "ended") in a single atomic UPDATE
// guarded by the row's updated_at, so two concurrent /state polls can never
// produce two different spawn moments for different users.
const GLOBAL_KEY = "merchant.global";

interface GlobalState {
  // Earliest moment the next visit may begin. null when a visit is currently
  // live or when the global row hasn't been initialised yet.
  nextAtMs: number | null;
  // When the currently-visible visit disappears. null when no visit is live.
  expiresAtMs: number | null;
  // Raw JSON we read from value_text. Used as the CAS token for atomic
  // transitions: every transition flips the JSON content, so comparing on
  // value_text equality gives us strict "compare-and-swap" semantics with
  // no timestamp-precision pitfalls (Postgres stores updated_at at microsecond
  // precision but JS Date only carries milliseconds, so a CAS on updated_at
  // would silently fail forever after the row's first NOW()-default insert).
  // null when the row doesn't exist OR when its value_text column is NULL.
  rawValueText: string | null;
  // Distinguishes "row missing entirely" (need INSERT) from "row exists with
  // NULL value_text" (need UPDATE-CAS with IS NOT DISTINCT FROM NULL); without
  // this flag a NULL-valued legacy row would freeze on the INSERT-on-conflict
  // path forever.
  rowExists: boolean;
}

function rollNextDelay(): number {
  return SPAWN_MIN_MS + Math.floor(Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
}

type Outcome = "EXPLOSION" | "BASIC" | "RARE" | "EPIC" | "GOLD" | "V1" | "DOWNGRADE";

function rollLevel1(): Outcome {
  const r = Math.random() * 100;
  if (r < 30) return "EXPLOSION";
  if (r < 90) return "RARE";
  if (r < 99) return "EPIC";
  return "V1";
}

function rollLevel2(): Outcome {
  const r = Math.random() * 100;
  if (r < 15) return "EXPLOSION";
  if (r < 50) return "DOWNGRADE";
  if (r < 90) return "EPIC";
  if (r < 99) return "GOLD";
  return "V1";
}

async function readGlobal(): Promise<GlobalState> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, GLOBAL_KEY))
    .limit(1);
  if (!row) return { nextAtMs: null, expiresAtMs: null, rawValueText: null, rowExists: false };
  let nextAtMs: number | null = null;
  let expiresAtMs: number | null = null;
  if (row.valueText) {
    try {
      const parsed = JSON.parse(row.valueText) as { nextAtMs?: number | null; expiresAtMs?: number | null };
      nextAtMs = typeof parsed.nextAtMs === "number" ? parsed.nextAtMs : null;
      expiresAtMs = typeof parsed.expiresAtMs === "number" ? parsed.expiresAtMs : null;
    } catch { /* fallthrough — treat as uninitialised */ }
  }
  return { nextAtMs, expiresAtMs, rawValueText: row.valueText ?? null, rowExists: true };
}

// CAS write of the global row. Returns true if the write landed, false if
// another request already mutated the row (caller should re-read and retry
// from the new state, or just bail and let the next /state poll handle it).
//
// We CAS on the row's value_text content (not on updated_at). Every legitimate
// transition flips the JSON, so equality on the previous JSON is a sufficient
// optimistic-lock token, and unlike updated_at it isn't subject to the
// JS-millisecond / Postgres-microsecond precision mismatch that would silently
// freeze the schedule forever after the first defaultNow() insert.
//
// Two distinct cases for the "we have no JSON to compare against" branch:
//   - rowExists=false → INSERT-on-conflict (real first-ever bootstrap).
//   - rowExists=true with NULL value_text → UPDATE-CAS using IS NOT DISTINCT
//     FROM NULL so a legacy/manually-edited row with a NULL JSON can still
//     transition forward instead of being permanently wedged on the INSERT
//     path (which would always no-op against the existing row).
async function writeGlobalIf(
  expected: GlobalState,
  next: { nextAtMs: number | null; expiresAtMs: number | null },
): Promise<boolean> {
  const valueText = JSON.stringify({ nextAtMs: next.nextAtMs, expiresAtMs: next.expiresAtMs });
  if (!expected.rowExists) {
    // Row doesn't exist → INSERT … ON CONFLICT DO NOTHING. If the row was
    // just inserted by another request, our INSERT no-ops and we return false.
    const inserted = await db
      .insert(appSettingsTable)
      .values({ key: GLOBAL_KEY, valueText, updatedAt: new Date() })
      .onConflictDoNothing({ target: appSettingsTable.key })
      .returning({ key: appSettingsTable.key });
    return inserted.length > 0;
  }
  // Row exists. CAS on value_text content. `IS NOT DISTINCT FROM` treats
  // NULL = NULL as TRUE so the comparison works whether expected.rawValueText
  // is a JSON string or NULL.
  const updated = await db
    .update(appSettingsTable)
    .set({ valueText, updatedAt: new Date() })
    .where(
      and(
        eq(appSettingsTable.key, GLOBAL_KEY),
        sql`${appSettingsTable.valueText} IS NOT DISTINCT FROM ${expected.rawValueText}`,
      ),
    )
    .returning({ key: appSettingsTable.key });
  return updated.length > 0;
}

// Drive the global state machine forward until it's in a "stable" state for
// the given moment in time, returning the final state. Performs at most one
// transition; if our CAS write loses the race, we re-read instead of looping
// — the next /state poll will land within seconds and finish the work.
async function advanceGlobal(now: number): Promise<GlobalState> {
  let g = await readGlobal();

  // 1. Visit ended → schedule the next spawn.
  if (g.expiresAtMs != null && g.expiresAtMs <= now) {
    const nextAtMs = now + rollNextDelay();
    const ok = await writeGlobalIf(g, { nextAtMs, expiresAtMs: null });
    return ok
      ? { nextAtMs, expiresAtMs: null, rawValueText: JSON.stringify({ nextAtMs, expiresAtMs: null }), rowExists: true }
      : await readGlobal();
  }

  // 2. Bootstrap on the very first request ever.
  if (g.expiresAtMs == null && g.nextAtMs == null) {
    const nextAtMs = now + rollNextDelay();
    const ok = await writeGlobalIf(g, { nextAtMs, expiresAtMs: null });
    return ok
      ? { nextAtMs, expiresAtMs: null, rawValueText: JSON.stringify({ nextAtMs, expiresAtMs: null }), rowExists: true }
      : await readGlobal();
  }

  // 3. nextAt elapsed → spawn the visit (everyone sees it from this moment).
  if (g.expiresAtMs == null && g.nextAtMs != null && g.nextAtMs <= now) {
    const expiresAtMs = now + VISIT_DURATION_MS;
    const ok = await writeGlobalIf(g, { nextAtMs: null, expiresAtMs });
    return ok
      ? { nextAtMs: null, expiresAtMs, rawValueText: JSON.stringify({ nextAtMs: null, expiresAtMs }), rowExists: true }
      : await readGlobal();
  }

  return g;
}

router.get("/merchant/state/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId ?? "").trim();
  if (!telegramId) return res.status(400).json({ error: "telegramId required" });
  try {
    const now = Date.now();
    const g = await advanceGlobal(now);

    // Visit live globally?
    if (g.expiresAtMs != null && g.expiresAtMs > now) {
      // Per-user fusion bookkeeping:
      // `usersTable.merchantExpiresAt` is repurposed as a marker of which
      // global visit this user has already participated in. If it doesn't
      // match the current global visit, this is a NEW visit for them and
      // they have a fresh budget of MAX_FUSIONS_PER_VISIT — no DB write
      // here; the actual reset happens lazily inside /merchant/fuse so that
      // /state stays purely a read for the common idle case.
      const [u] = await db
        .select({
          marker: usersTable.merchantExpiresAt,
          fusionsUsed: usersTable.merchantFusionsUsed,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);

      const visitMarker = new Date(g.expiresAtMs);
      const isAttending = !!(u?.marker && u.marker.getTime() === visitMarker.getTime());
      const fusionsUsed = isAttending ? (u!.fusionsUsed ?? 0) : 0;

      return res.json({
        active: true,
        expiresAt: visitMarker.toISOString(),
        fusionsUsed,
        maxFusions: MAX_FUSIONS_PER_VISIT,
        // Always set on the first poll where this user sees this visit so
        // the client can fire haptics / vibration once.
        justSpawned: !isAttending,
      });
    }

    return res.json({
      active: false,
      expiresAt: null,
      fusionsUsed: 0,
      maxFusions: MAX_FUSIONS_PER_VISIT,
    });
  } catch (err) {
    console.error("[merchant/state] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

const FuseBody = z.object({
  telegramId: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2)]),
});

router.post("/merchant/fuse", async (req, res) => {
  const parsed = FuseBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, reason: "BAD_REQUEST" });
  const { telegramId, level } = parsed.data;

  try {
    const now = Date.now();
    const g = await advanceGlobal(now);

    // Visit must be live (with a small grace for in-flight requests).
    if (g.expiresAtMs == null || g.expiresAtMs < now - FUSE_GRACE_MS) {
      return res.status(409).json({ ok: false, reason: "EXPIRED_OR_MAX" });
    }
    const visitMarker = new Date(g.expiresAtMs);

    // Atomic per-user counter update. A single SQL CASE handles both the
    // "first fuse of a new visit (reset to 1)" and the "increment within an
    // ongoing visit (cap at MAX)" branches in one statement, so two
    // concurrent /fuse calls from the same user can never both pass the
    // cap check.
    const updated = await db
      .update(usersTable)
      .set({
        merchantExpiresAt: visitMarker,
        merchantFusionsUsed: sql`CASE
          WHEN ${usersTable.merchantExpiresAt} IS DISTINCT FROM ${visitMarker} THEN 1
          ELSE ${usersTable.merchantFusionsUsed} + 1
        END`,
      })
      .where(
        and(
          eq(usersTable.telegramId, telegramId),
          // Allow the write only if either this is a new visit (reset) OR
          // the user still has fusions available in the current visit.
          sql`(
            ${usersTable.merchantExpiresAt} IS DISTINCT FROM ${visitMarker}
            OR ${usersTable.merchantFusionsUsed} < ${MAX_FUSIONS_PER_VISIT}
          )`,
        ),
      )
      .returning({ fusionsUsed: usersTable.merchantFusionsUsed });

    if (updated.length === 0) {
      return res.status(409).json({ ok: false, reason: "EXPIRED_OR_MAX" });
    }

    const fusionsUsed = updated[0]!.fusionsUsed;
    const fusionsRemaining = Math.max(0, MAX_FUSIONS_PER_VISIT - fusionsUsed);
    const outcome = level === 1 ? rollLevel1() : rollLevel2();

    return res.json({
      ok: true,
      outcome,
      fusionsUsed,
      fusionsRemaining,
      maxFusions: MAX_FUSIONS_PER_VISIT,
    });
  } catch (err) {
    console.error("[merchant/fuse] error:", err);
    return res.status(500).json({ ok: false, reason: "INTERNAL" });
  }
});

export default router;
