import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SPAWN_MIN_MS = 4 * 60 * 60 * 1000;   // 4 hours
const SPAWN_MAX_MS = 6 * 60 * 60 * 1000;   // 6 hours
const VISIT_DURATION_MS = 15 * 60 * 1000;  // 15 minutes
const SCRAP_GRACE_MS = 30 * 1000;

// Stardust recycling table — how much Stardust each planet rarity yields when scrapped.
const SCRAP_REWARDS: Record<string, number> = {
  BASIC: 1,
  RARE: 2,
  EPIC: 5,
  GOLD: 10,
  MYTHIC: 20,
  PLASMA: 35,
  V1: 50,
};

export const GLOBAL_KEY = "merchant.global";

interface GlobalState {
  nextAtMs: number | null;
  expiresAtMs: number | null;
  rawValueText: string | null;
  rowExists: boolean;
}

function rollNextDelay(): number {
  return SPAWN_MIN_MS + Math.floor(Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
}

export async function readGlobal(): Promise<GlobalState> {
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
    } catch { /* fallthrough */ }
  }
  return { nextAtMs, expiresAtMs, rawValueText: row.valueText ?? null, rowExists: true };
}

async function writeGlobalIf(
  expected: GlobalState,
  next: { nextAtMs: number | null; expiresAtMs: number | null },
): Promise<boolean> {
  const valueText = JSON.stringify({ nextAtMs: next.nextAtMs, expiresAtMs: next.expiresAtMs });
  if (!expected.rowExists) {
    const inserted = await db
      .insert(appSettingsTable)
      .values({ key: GLOBAL_KEY, valueText, updatedAt: new Date() })
      .onConflictDoNothing({ target: appSettingsTable.key })
      .returning({ key: appSettingsTable.key });
    return inserted.length > 0;
  }
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

export async function advanceGlobal(now: number): Promise<GlobalState> {
  let g = await readGlobal();

  if (g.expiresAtMs != null && g.expiresAtMs <= now) {
    const nextAtMs = now + rollNextDelay();
    const ok = await writeGlobalIf(g, { nextAtMs, expiresAtMs: null });
    return ok
      ? { nextAtMs, expiresAtMs: null, rawValueText: JSON.stringify({ nextAtMs, expiresAtMs: null }), rowExists: true }
      : await readGlobal();
  }

  if (g.expiresAtMs == null && g.nextAtMs == null) {
    const nextAtMs = now + rollNextDelay();
    const ok = await writeGlobalIf(g, { nextAtMs, expiresAtMs: null });
    return ok
      ? { nextAtMs, expiresAtMs: null, rawValueText: JSON.stringify({ nextAtMs, expiresAtMs: null }), rowExists: true }
      : await readGlobal();
  }

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

    if (g.expiresAtMs != null && g.expiresAtMs > now) {
      const [u] = await db
        .select({ marker: usersTable.merchantExpiresAt })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);

      const visitMarker = new Date(g.expiresAtMs);
      const isAttending = !!(u?.marker && u.marker.getTime() === visitMarker.getTime());

      return res.json({
        active: true,
        expiresAt: visitMarker.toISOString(),
        justSpawned: !isAttending,
      });
    }

    return res.json({ active: false, expiresAt: null });
  } catch (err) {
    console.error("[merchant/state] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

const ScrapBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1).max(128),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1"]),
});

router.post("/merchant/scrap", async (req, res) => {
  const parsed = ScrapBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, reason: "BAD_REQUEST" });
  const { telegramId, planetId, planetType } = parsed.data;

  const reward = SCRAP_REWARDS[planetType];
  if (reward == null) return res.status(400).json({ ok: false, reason: "BAD_REQUEST" });

  try {
    const now = Date.now();
    const g = await advanceGlobal(now);

    if (g.expiresAtMs == null || g.expiresAtMs < now - SCRAP_GRACE_MS) {
      return res.status(409).json({ ok: false, reason: "EXPIRED" });
    }
    const visitMarker = new Date(g.expiresAtMs);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify the user owns this exact planet in planets_json
      const rows = await client.query(
        `SELECT planets_json FROM users WHERE telegram_id = $1 FOR UPDATE`,
        [telegramId]
      );
      if (rows.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, reason: "USER_NOT_FOUND" });
      }

      const rawPlanets = rows.rows[0].planets_json;
      const planets = Array.isArray(rawPlanets) ? rawPlanets as Array<Record<string, unknown>> : [];
      const idx = planets.findIndex((p) => p && typeof p === "object" && p["id"] === planetId && p["name"] === planetType);
      if (idx === -1) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, reason: "PLANET_NOT_FOUND" });
      }

      // Remove the planet from planets_json, credit stardust, stamp merchant attendance
      const nextPlanets = planets.filter((_, i) => i !== idx);
      await client.query(
        `UPDATE users
         SET planets_json = $2::jsonb,
             stardust_balance = stardust_balance + $3::int,
             merchant_expires_at = $4::timestamp,
             planets_updated_at_ms = GREATEST(planets_updated_at_ms, $5::bigint)
         WHERE telegram_id = $1`,
        [telegramId, JSON.stringify(nextPlanets), reward, visitMarker, now]
      );

      // If the burned planet was a bonus planet, decrement the server-side entitlement
      const burned = planets[idx]!;
      const isBonus = typeof burned["id"] === "string" && (burned["id"] as string).startsWith(`bonus-${planetType}-`);
      if (isBonus) {
        const col = planetType === "BASIC" ? "bonus_basic"
          : planetType === "RARE" ? "bonus_rare"
          : planetType === "EPIC" ? "bonus_epic"
          : planetType === "MYTHIC" ? "bonus_mythic"
          : planetType === "PLASMA" ? "bonus_plasma"
          : planetType === "GOLD" ? "bonus_gold"
          : "bonus_v1";
        await client.query(
          `UPDATE users SET ${col} = GREATEST(0, ${col} - 1) WHERE telegram_id = $1`,
          [telegramId]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true, reward, planetType });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[merchant/scrap] error:", err);
    return res.status(500).json({ ok: false, reason: "INTERNAL" });
  }
});

const NOTIFIED_KEY = "merchant.notified";

export async function readNotifiedExpiresAtMs(): Promise<number | null> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, NOTIFIED_KEY))
    .limit(1);
  if (!row?.valueText) return null;
  try {
    const parsed = JSON.parse(row.valueText) as { expiresAtMs?: number | null };
    return typeof parsed.expiresAtMs === "number" ? parsed.expiresAtMs : null;
  } catch { return null; }
}

export async function writeNotifiedExpiresAtMs(expiresAtMs: number): Promise<void> {
  const valueText = JSON.stringify({ expiresAtMs });
  await db
    .insert(appSettingsTable)
    .values({ key: NOTIFIED_KEY, valueText, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { valueText, updatedAt: new Date() },
    });
}

export default router;
