import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const SPAWN_MIN_MS = 20 * 60 * 1000;
const SPAWN_MAX_MS = 50 * 60 * 1000;
const VISIT_DURATION_MS = 90 * 1000;
const MAX_FUSIONS_PER_VISIT = 3;
const FUSE_GRACE_MS = 30 * 1000;

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

router.get("/merchant/state/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId ?? "").trim();
  if (!telegramId) return res.status(400).json({ error: "telegramId required" });
  try {
    const now = new Date();
    const [u] = await db
      .select({
        nextAt: usersTable.merchantNextAt,
        expiresAt: usersTable.merchantExpiresAt,
        fusionsUsed: usersTable.merchantFusionsUsed,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!u) {
      return res.json({
        active: false,
        expiresAt: null,
        fusionsUsed: 0,
        maxFusions: MAX_FUSIONS_PER_VISIT,
      });
    }

    if (u.expiresAt && u.expiresAt.getTime() > now.getTime()) {
      return res.json({
        active: true,
        expiresAt: u.expiresAt.toISOString(),
        fusionsUsed: u.fusionsUsed ?? 0,
        maxFusions: MAX_FUSIONS_PER_VISIT,
      });
    }

    if (u.expiresAt && u.expiresAt.getTime() <= now.getTime()) {
      const nextAt = new Date(now.getTime() + rollNextDelay());
      // Atomic guard: if two concurrent /state polls both see the just-
      // expired visit, only the first wins the cleanup. The loser sees 0
      // rows updated and re-reads the freshly-scheduled nextAt instead of
      // overwriting it with a different roll.
      const cleanup = await db
        .update(usersTable)
        .set({ merchantExpiresAt: null, merchantFusionsUsed: 0, merchantNextAt: nextAt })
        .where(
          and(
            eq(usersTable.telegramId, telegramId),
            sql`${usersTable.merchantExpiresAt} IS NOT NULL`,
            sql`${usersTable.merchantExpiresAt} <= ${now}`,
          ),
        )
        .returning({ nextAt: usersTable.merchantNextAt });
      if (cleanup.length === 0) {
        // Another concurrent request already cleaned up. Re-read so we
        // return the canonical nextAt (whichever roll won).
        return res.json({
          active: false,
          expiresAt: null,
          fusionsUsed: 0,
          maxFusions: MAX_FUSIONS_PER_VISIT,
        });
      }
      return res.json({
        active: false,
        expiresAt: null,
        fusionsUsed: 0,
        maxFusions: MAX_FUSIONS_PER_VISIT,
      });
    }

    if (!u.nextAt) {
      const nextAt = new Date(now.getTime() + rollNextDelay());
      await db
        .update(usersTable)
        .set({ merchantNextAt: nextAt })
        .where(eq(usersTable.telegramId, telegramId));
      return res.json({
        active: false,
        expiresAt: null,
        fusionsUsed: 0,
        maxFusions: MAX_FUSIONS_PER_VISIT,
      });
    }

    if (u.nextAt.getTime() <= now.getTime()) {
      const expiresAt = new Date(now.getTime() + VISIT_DURATION_MS);
      const result = await db
        .update(usersTable)
        .set({
          merchantExpiresAt: expiresAt,
          merchantFusionsUsed: 0,
          merchantNextAt: null,
        })
        .where(
          and(
            eq(usersTable.telegramId, telegramId),
            sql`${usersTable.merchantExpiresAt} IS NULL`,
            sql`${usersTable.merchantNextAt} IS NOT NULL`,
            sql`${usersTable.merchantNextAt} <= ${now}`,
          ),
        )
        .returning({ expiresAt: usersTable.merchantExpiresAt });
      if (result.length > 0) {
        return res.json({
          active: true,
          expiresAt: expiresAt.toISOString(),
          fusionsUsed: 0,
          maxFusions: MAX_FUSIONS_PER_VISIT,
          justSpawned: true,
        });
      }
      const [refresh] = await db
        .select({
          expiresAt: usersTable.merchantExpiresAt,
          fusionsUsed: usersTable.merchantFusionsUsed,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      const stillActive = refresh?.expiresAt && refresh.expiresAt.getTime() > now.getTime();
      return res.json({
        active: !!stillActive,
        expiresAt: stillActive ? refresh!.expiresAt!.toISOString() : null,
        fusionsUsed: refresh?.fusionsUsed ?? 0,
        maxFusions: MAX_FUSIONS_PER_VISIT,
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
    const now = new Date();
    const graceCutoff = new Date(now.getTime() - FUSE_GRACE_MS);
    const updated = await db
      .update(usersTable)
      .set({ merchantFusionsUsed: sql`${usersTable.merchantFusionsUsed} + 1` })
      .where(
        and(
          eq(usersTable.telegramId, telegramId),
          sql`${usersTable.merchantFusionsUsed} < ${MAX_FUSIONS_PER_VISIT}`,
          sql`${usersTable.merchantExpiresAt} IS NOT NULL`,
          gte(usersTable.merchantExpiresAt, graceCutoff),
        ),
      )
      .returning({
        fusionsUsed: usersTable.merchantFusionsUsed,
        expiresAt: usersTable.merchantExpiresAt,
      });

    if (updated.length === 0) {
      return res.status(409).json({ ok: false, reason: "EXPIRED_OR_MAX" });
    }

    const fusionsUsed = updated[0]!.fusionsUsed;
    const fusionsRemaining = Math.max(0, MAX_FUSIONS_PER_VISIT - fusionsUsed);
    const outcome = level === 1 ? rollLevel1() : rollLevel2();

    if (fusionsUsed >= MAX_FUSIONS_PER_VISIT) {
      const nextAt = new Date(now.getTime() + rollNextDelay());
      await db
        .update(usersTable)
        .set({ merchantExpiresAt: null, merchantNextAt: nextAt, merchantFusionsUsed: 0 })
        .where(eq(usersTable.telegramId, telegramId));
    }

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
