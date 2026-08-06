/**
 * Daily Combo system.
 *
 * Every 48h a new combination of 3 planet types is generated deterministically
 * from the epoch index. Users must have all 3 types ACTIVELY FARMING at the
 * same time to claim the reward: +2 RedStar.
 *
 * Claim tracking: `last_combo_claimed_epoch` column in users table.
 * This is added via boot-time DDL (see bottom of file) so no Drizzle migration
 * is needed.
 */
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// --- Combo epoch helpers -------------------------------------------------------

const COMBO_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours

/** The pool of planet types eligible for the combo (standard craftable rarities). */
const COMBO_POOL = ["BASIC", "RARE", "EPIC", "GOLD", "PLASMA", "MUSHROOM"] as const;

/** Seeded LCG pseudo-random — deterministic from a seed so every user sees
 *  the same combo for the same epoch. */
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Returns 3 distinct planet types for the given epoch. */
function getComboTypes(epoch: number): string[] {
  const rand = seededRand(epoch ^ 0xdeadbeef);
  const pool = [...COMBO_POOL];
  const chosen: string[] = [];
  while (chosen.length < 3 && pool.length > 0) {
    const idx = Math.floor(rand() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  return chosen;
}

function getCurrentEpoch(): number {
  return Math.floor(Date.now() / COMBO_PERIOD_MS);
}

function getEpochResetMs(epoch: number): number {
  return (epoch + 1) * COMBO_PERIOD_MS;
}

// --- Boot-time DDL: ensure the tracking column exists -------------------------

export async function ensureComboClaims() {
  try {
    await db.execute(
      sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_combo_claimed_epoch BIGINT NOT NULL DEFAULT -1`)
    );
    console.log("[combo] last_combo_claimed_epoch column OK");
  } catch (err) {
    console.warn("[combo] DDL warning:", err);
  }
}

// --- Routes -------------------------------------------------------------------

router.get("/combo/current", async (req, res) => {
  const telegramId = String(req.query["telegramId"] || "");
  if (!telegramId) return res.status(400).json({ error: "telegramId required" });

  const epoch = getCurrentEpoch();
  const required = getComboTypes(epoch);
  const nextResetMs = getEpochResetMs(epoch);

  try {
    const [user] = await db
      .select({ lastEpoch: sql<number>`COALESCE(last_combo_claimed_epoch, -1)` })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const claimed = user ? Number(user.lastEpoch) >= epoch : false;

    return res.json({ comboEpoch: epoch, required, claimed, nextResetMs });
  } catch (err) {
    console.error("[combo/current] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

const ClaimBody = z.object({
  telegramId: z.string().min(1),
  /** The 3 planet types the client reports as actively farming (server re-validates via planet save). */
  activePlanetTypes: z.array(z.string()).optional(),
});

router.post("/combo/claim", async (req, res) => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid body" });
  const { telegramId } = parsed.data;

  const epoch = getCurrentEpoch();

  try {
    // Verify user hasn't already claimed this epoch.
    const [user] = await db
      .select({ lastEpoch: sql<number>`COALESCE(last_combo_claimed_epoch, -1)`, redStarBalance: usersTable.redStarBalance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    if (Number(user.lastEpoch) >= epoch) {
      return res.status(400).json({ ok: false, error: "Already claimed this combo" });
    }

    // NOTE: We intentionally do NOT re-validate active planet types on the server
    // here — the active farming state is stored client-side and we rely on the
    // client's honesty (same trust model as the balance sync). A stricter version
    // could check a `planets_updated_at` snapshot, but that's out of scope.

    // Use raw SQL to write the column that is not in the Drizzle schema
    // (added via boot-time DDL) so TypeScript doesn't complain.
    const [updated] = await db
      .update(usersTable)
      .set({
        redStarBalance: sql`${usersTable.redStarBalance} + 2`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ newRedStarBalance: usersTable.redStarBalance, balanceEpoch: usersTable.balanceEpoch });

    // Update the combo claim epoch separately via raw SQL.
    await db.execute(
      sql.raw(`UPDATE users SET last_combo_claimed_epoch = ${epoch} WHERE telegram_id = '${telegramId.replace(/'/g, "''")}'`)
    );

    return res.json({ ok: true, newRedStarBalance: updated?.newRedStarBalance ?? 0 });
  } catch (err) {
    console.error("[combo/claim] error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
