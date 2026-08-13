/**
 * /models — Lab mystery-build collectible models (100-model catalog).
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  MODEL_CATALOG,
  getModelById,
  makeModelInstance,
  rollModelDefinition,
} from "@workspace/game-models";

const router: IRouter = Router();

const VALID_MODEL_IDS = new Set(MODEL_CATALOG.map((m) => m.id));

// ─── GET /models/catalog ─────────────────────────────────────────
router.get("/models/catalog", (_req, res) => {
  res.json({
    ok: true,
    count: MODEL_CATALOG.length,
    models: MODEL_CATALOG.map(({ poolWeight: _pw, ...rest }) => rest),
  });
});

// ─── GET /models/:telegramId ─────────────────────────────────────
router.get("/models/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }
  try {
    const rows = await db
      .select({ modelsJson: usersTable.modelsJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    if (!row) { res.json({ ok: true, exists: false, models: [] }); return; }
    res.json({
      ok: true,
      exists: true,
      models: Array.isArray(row.modelsJson) ? row.modelsJson : [],
    });
  } catch (err) {
    console.error("[models/get] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /forge/mystery-model ───────────────────────────────────
// Server-authoritative roll from the 100-model pool. Stardust is deducted
// client-side at forge start; this endpoint only rolls the outcome.
const ForgeMysteryBody = z.object({
  telegramId: z.string().min(1),
});

router.post("/forge/mystery-model", async (req, res) => {
  const parsed = ForgeMysteryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId } = parsed.data;

  try {
    const rows = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "User not found" }); return; }

    const def = rollModelDefinition();
    const model = makeModelInstance(def);

    res.json({
      ok: true,
      model,
      voxels: def.voxels,
    });
  } catch (err) {
    console.error("[forge/mystery-model] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /models/claim ──────────────────────────────────────────
const ClaimModelBody = z.object({
  telegramId: z.string().min(1),
  model: z.object({
    id: z.string().min(1).max(128),
    modelId: z.string().min(1).max(32),
    name: z.string().min(1).max(128),
    category: z.string().min(1).max(32),
    rarity: z.string().min(1).max(32),
    rate: z.number().nonnegative(),
    float: z.number().min(0).max(100),
    primaryColor: z.string().min(1).max(16),
    accentColor: z.string().min(1).max(16),
    createdAt: z.number().int().min(0),
    isListedInMarket: z.boolean().optional(),
  }),
});

router.post("/models/claim", async (req, res) => {
  const parsed = ClaimModelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, model: incoming } = parsed.data;

  if (!VALID_MODEL_IDS.has(incoming.modelId)) {
    res.status(400).json({ error: "Invalid modelId" });
    return;
  }

  const canonical = getModelById(incoming.modelId);
  if (!canonical) {
    res.status(400).json({ error: "Unknown model" });
    return;
  }

  const stored = {
    id: incoming.id,
    modelId: canonical.id,
    name: canonical.name,
    category: canonical.category,
    rarity: canonical.rarity,
    rate: canonical.rate,
    float: incoming.float,
    primaryColor: canonical.primaryColor,
    accentColor: canonical.accentColor,
    createdAt: incoming.createdAt,
    isListedInMarket: false,
  };

  try {
    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT models_json FROM users WHERE telegram_id = ${telegramId} FOR UPDATE`,
      );
      const lockedRow = (lockedRows.rows ?? lockedRows)[0] as { models_json: unknown } | undefined;
      if (!lockedRow) return { kind: "not_found" as const };

      const existing: Record<string, unknown>[] = Array.isArray(lockedRow.models_json)
        ? (lockedRow.models_json as Record<string, unknown>[])
        : [];

      if (existing.some((m) => m.id === stored.id)) {
        return { kind: "duplicate" as const };
      }

      const merged = [...existing, stored];
      await tx
        .update(usersTable)
        .set({
          modelsJson: sql`${JSON.stringify(merged)}::jsonb`,
          modelsUpdatedAtMs: Date.now(),
        })
        .where(eq(usersTable.telegramId, telegramId));

      return { kind: "ok" as const, models: merged };
    });

    if (txResult.kind === "not_found") { res.status(404).json({ error: "User not found" }); return; }
    if (txResult.kind === "duplicate") { res.json({ ok: true, duplicate: true, model: stored }); return; }
    res.json({ ok: true, model: stored, models: txResult.models });
  } catch (err) {
    console.error("[models/claim] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /models/save ───────────────────────────────────────────
const MutableModelPatch = z.object({
  id: z.string().min(1).max(128),
  isListedInMarket: z.boolean().optional(),
  serverListingId: z.number().int().positive().optional().nullable(),
  marketPrice: z.number().nonnegative().optional().nullable(),
});

const SaveModelsBody = z.object({
  telegramId: z.string().min(1),
  models: z.array(MutableModelPatch).max(512),
  clientWriteAtMs: z.number().int().min(0),
});

router.post("/models/save", async (req, res) => {
  const parsed = SaveModelsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, models: patches, clientWriteAtMs } = parsed.data;

  try {
    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT models_json, models_updated_at_ms FROM users WHERE telegram_id = ${telegramId} FOR UPDATE`,
      );
      const lockedRow = (lockedRows.rows ?? lockedRows)[0] as
        | { models_json: unknown; models_updated_at_ms: number }
        | undefined;
      if (!lockedRow) return { kind: "not_found" as const };

      const storedMs = Number(lockedRow.models_updated_at_ms ?? 0);
      if (storedMs >= clientWriteAtMs) return { kind: "stale" as const };

      const existing: Record<string, unknown>[] = Array.isArray(lockedRow.models_json)
        ? (lockedRow.models_json as Record<string, unknown>[])
        : [];

      const patchMap = new Map(patches.map((p) => [p.id, p]));
      const merged = existing.map((row) => {
        const patch = patchMap.get(String(row.id));
        if (!patch) return row;
        return {
          ...row,
          ...(patch.isListedInMarket !== undefined ? { isListedInMarket: patch.isListedInMarket } : {}),
          ...(patch.serverListingId !== undefined ? { serverListingId: patch.serverListingId } : {}),
          ...(patch.marketPrice !== undefined ? { marketPrice: patch.marketPrice } : {}),
        };
      });

      await tx
        .update(usersTable)
        .set({
          modelsJson: sql`${JSON.stringify(merged)}::jsonb`,
          modelsUpdatedAtMs: clientWriteAtMs,
        })
        .where(eq(usersTable.telegramId, telegramId));

      return { kind: "ok" as const };
    });

    if (txResult.kind === "not_found") { res.status(404).json({ error: "User not found" }); return; }
    if (txResult.kind === "stale") { res.json({ ok: true, stale: true }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[models/save] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
