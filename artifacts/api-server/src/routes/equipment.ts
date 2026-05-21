import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─── Server-canonical rate table ─────────────────────────────────────
//
// SECURITY: must mirror the frontend `EQUIPMENT_RATE` table in
// `artifacts/zoom-master/src/utils/equipmentConfig.tsx`. The server is the
// single source of truth for `rate` — any value sent by the client is
// discarded and overwritten with `EQUIPMENT_RATE_SERVER[category][rarity]`
// before persistence. This prevents a forged-rate exploit (a tampered
// client setting `rate: 9999999` and converting it to balance via the
// client-side offline accrual in `settleFarmingState`).
type EqCategory = "HELMET" | "JETPACK" | "HAT" | "SCANNER";
type EqRarity = "BASIC" | "RARE" | "EPIC" | "GOLD" | "PLASMA" | "MYTHIC";
export const EQUIPMENT_RATE_SERVER: Record<EqCategory, Record<EqRarity, number>> = {
  HELMET:  { BASIC: 10, RARE: 25, EPIC: 60, GOLD: 120, PLASMA: 180, MYTHIC: 260 },
  JETPACK: { BASIC: 12, RARE: 30, EPIC: 70, GOLD: 130, PLASMA: 195, MYTHIC: 280 },
  HAT:     { BASIC:  8, RARE: 22, EPIC: 55, GOLD: 110, PLASMA: 170, MYTHIC: 240 },
  SCANNER: { BASIC: 10, RARE: 26, EPIC: 65, GOLD: 125, PLASMA: 185, MYTHIC: 250 },
};

/**
 * Equipment item shape. Only the trusted identity fields (id / category /
 * rarity) come strict from the client — `rate` is recomputed server-side
 * from EQUIPMENT_RATE_SERVER. The 24h-cycle bookkeeping fields are
 * accepted because the client needs to persist them between sessions
 * (otherwise activate/collect/list state would be lost on app re-open).
 */
const EquipmentRow = z.object({
  id: z.string().min(1).max(128),
  category: z.enum(["HELMET", "JETPACK", "HAT", "SCANNER"]),
  rarity: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "PLASMA", "MYTHIC"]),
  createdAt: z.number().finite().min(0).optional(),
  color: z.string().max(64).optional().nullable(),
  // 24h cycle state — see EquipmentItem in equipmentConfig.tsx.
  farmStartedAt: z.number().finite().min(0).optional(),
  lastCollectedAt: z.number().finite().min(0).optional(),
  isFarmingActive: z.boolean().optional(),
  pausedAt: z.number().finite().min(0).optional(),
  isListedInMarket: z.boolean().optional(),
  serverListingId: z.number().int().positive().optional(),
  marketPrice: z.number().int().nonnegative().optional(),
});

const SaveBody = z.object({
  telegramId: z.string().min(1),
  equipment: z.array(EquipmentRow).max(512),
  clientWriteAtMs: z.number().int().min(0),
});

const EQUIPMENT_CYCLE_MS = 24 * 60 * 60 * 1000;

// GET /api/equipment/:telegramId — returns the user's equipment array.
router.get("/equipment/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    const rows = await db
      .select({ equipmentJson: usersTable.equipmentJson })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.json({ ok: true, exists: false, equipment: [] });
      return;
    }
    res.json({
      ok: true,
      exists: true,
      equipment: Array.isArray(row.equipmentJson) ? row.equipmentJson : [],
    });
  } catch (err) {
    console.error("[equipment/get] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/equipment/save — replace the user's equipment array.
//
// Stale-write fence on `equipment_updated_at_ms`: only overwrite if the
// incoming clientWriteAtMs is strictly greater than the stored one.
// Anti-shrink guard mirrors regular-planets/save to defend against a
// buggy client wiping inventory.
router.post("/equipment/save", async (req, res) => {
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, equipment: rawEquipment, clientWriteAtMs } = parsed.data;
  // Recompute rate server-side from the canonical table. The client's
  // rate value (if any) was already stripped by EquipmentRow's strict
  // shape; this assigns the authoritative value.
  const equipment = rawEquipment.map((row) => ({
    ...row,
    rate: EQUIPMENT_RATE_SERVER[row.category][row.rarity],
  }));
  const SHRINK_GUARD_THRESHOLD = 6;
  try {
    const txResult = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT equipment_json, equipment_updated_at_ms
            FROM users
            WHERE telegram_id = ${telegramId}
            FOR UPDATE`,
      );
      const lockedRow = (lockedRows.rows ?? lockedRows)[0] as
        | { equipment_json: unknown; equipment_updated_at_ms: number }
        | undefined;
      if (!lockedRow) return { kind: "not_found" as const };
      const existing = Array.isArray(lockedRow.equipment_json)
        ? (lockedRow.equipment_json as unknown[])
        : [];
      const lostCount = existing.length - equipment.length;
      if (lostCount >= SHRINK_GUARD_THRESHOLD) {
        console.warn(
          `[equipment/save] anti-shrink guard tripped for ${telegramId}: ` +
            `stored=${existing.length}, incoming=${equipment.length}, lost=${lostCount}`,
        );
        return { kind: "rejected" as const, count: existing.length };
      }
      const updated = await tx
        .update(usersTable)
        .set({
          equipmentJson: sql`CASE WHEN ${usersTable.equipmentUpdatedAtMs} < ${clientWriteAtMs} THEN ${JSON.stringify(equipment)}::jsonb ELSE ${usersTable.equipmentJson} END`,
          equipmentUpdatedAtMs: sql`GREATEST(${usersTable.equipmentUpdatedAtMs}, ${clientWriteAtMs})`,
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({ updatedAt: usersTable.equipmentUpdatedAtMs });
      const accepted = updated[0]?.updatedAt === clientWriteAtMs;
      return { kind: "ok" as const, accepted, count: equipment.length };
    });
    if (txResult.kind === "not_found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (txResult.kind === "rejected") {
      res.json({ ok: true, accepted: false, count: txResult.count, rejected: "anti-shrink guard" });
      return;
    }
    res.json({ ok: true, accepted: txResult.accepted, count: txResult.count });
  } catch (err) {
    console.error("[equipment/save] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ───────────────── Per-item cycle endpoints ─────────────────
//
// All three mutate a single item inside `users.equipment_json` and bump
// `equipment_updated_at_ms` to NOW so the client save fence
// (clientWriteAtMs < equipment_updated_at_ms) blocks any in-flight
// debounced /equipment/save that carried stale state. They run inside a
// SELECT ... FOR UPDATE transaction to serialise against concurrent
// /equipment/save calls.

const PerItemBody = z.object({
  telegramId: z.string().min(1),
  equipmentId: z.string().min(1).max(128),
});

/**
 * Helper that loads the equipment array under row lock, applies the
 * caller-supplied mutator to the matching item, and writes back. Returns
 * the mutated item (or null when not found / rejected by mutator).
 */
async function mutateItem(
  telegramId: string,
  equipmentId: string,
  mutate: (item: Record<string, unknown>) => Record<string, unknown> | null,
  mode: "patch" | "remove" = "patch",
): Promise<{ kind: "ok"; item: Record<string, unknown> | null } | { kind: "not_found" } | { kind: "missing" }> {
  return await db.transaction(async (tx) => {
    const sel = await tx.execute(
      sql`SELECT equipment_json
            FROM users
            WHERE telegram_id = ${telegramId}
            FOR UPDATE`,
    );
    const rows = (sel as unknown as { rows: { equipment_json: unknown }[] }).rows;
    if (!rows || rows.length === 0) return { kind: "not_found" as const };
    const existing = Array.isArray(rows[0]!.equipment_json)
      ? (rows[0]!.equipment_json as Array<Record<string, unknown>>)
      : [];
    const idx = existing.findIndex((it) => it && typeof it === "object" && it["id"] === equipmentId);
    if (idx < 0) return { kind: "missing" as const };
    let nextArr: Array<Record<string, unknown>>;
    let resultItem: Record<string, unknown> | null = null;
    if (mode === "remove") {
      nextArr = existing.filter((_, i) => i !== idx);
    } else {
      const patched = mutate(existing[idx]!);
      if (!patched) return { kind: "missing" as const };
      nextArr = [...existing];
      nextArr[idx] = patched;
      resultItem = patched;
    }
    const nowMs = Date.now();
    await tx.execute(
      sql`UPDATE users
            SET equipment_json = ${JSON.stringify(nextArr)}::jsonb,
                equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, ${nowMs}::bigint)
            WHERE telegram_id = ${telegramId}`,
    );
    return { kind: "ok" as const, item: resultItem };
  });
}

// POST /api/equipment/start — activate the 24h cycle on a single item.
// Refuses if the item is currently listed on the marketplace (cycle is
// paused while in escrow). If the previous cycle is expired, we restart
// a fresh 24h window from now.
router.post("/equipment/start", async (req, res) => {
  const parsed = PerItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, equipmentId } = parsed.data;
  try {
    const out = await mutateItem(telegramId, equipmentId, (item) => {
      if (item["isListedInMarket"] === true) return null;
      const now = Date.now();
      return {
        ...item,
        farmStartedAt: now,
        lastCollectedAt: 0,
        isFarmingActive: true,
        pausedAt: 0,
      };
    });
    if (out.kind === "not_found") return void res.status(404).json({ error: "User not found" });
    if (out.kind === "missing") return void res.status(404).json({ error: "Equipment not found or listed" });
    res.json({ ok: true, item: out.item });
  } catch (err) {
    console.error("[equipment/start] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/equipment/collect — reset the cycle anchor to NOW so the
// item starts a fresh 24h window. The actual ZOOM credit is computed
// by /farm/settle (which reads farmStartedAt / lastCollectedAt and
// caps at 24h) and happens automatically on the client's next settle
// tick. This endpoint just rolls the cycle forward.
router.post("/equipment/collect", async (req, res) => {
  const parsed = PerItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, equipmentId } = parsed.data;
  try {
    const out = await mutateItem(telegramId, equipmentId, (item) => {
      if (item["isListedInMarket"] === true) return null;
      const now = Date.now();
      const farmStartedAt = Number(item["farmStartedAt"]) || 0;
      const lastCollectedAt = Number(item["lastCollectedAt"]) || 0;
      const eff = Math.max(farmStartedAt, lastCollectedAt);
      // Only allow collect if the cycle ran at all.
      if (eff <= 0) return null;
      const capped = Math.min(now, eff + EQUIPMENT_CYCLE_MS);
      return {
        ...item,
        lastCollectedAt: capped,
        isFarmingActive: true,
        // farmStartedAt unchanged — effectiveStart now follows lastCollectedAt.
      };
    });
    if (out.kind === "not_found") return void res.status(404).json({ error: "User not found" });
    if (out.kind === "missing") return void res.status(404).json({ error: "Equipment not collectable" });
    res.json({ ok: true, item: out.item });
  } catch (err) {
    console.error("[equipment/collect] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/equipment/burn — permanently destroy the item. Refuses if
// the item is currently listed on the marketplace (must delist first).
router.post("/equipment/burn", async (req, res) => {
  const parsed = PerItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, equipmentId } = parsed.data;
  try {
    // Pre-flight: refuse if listed. We re-check inside the transaction
    // via mutateItem so a concurrent /market/list-equipment can't race.
    const out = await db.transaction(async (tx) => {
      const sel = await tx.execute(
        sql`SELECT equipment_json
              FROM users
              WHERE telegram_id = ${telegramId}
              FOR UPDATE`,
      );
      const rows = (sel as unknown as { rows: { equipment_json: unknown }[] }).rows;
      if (!rows || rows.length === 0) return { kind: "not_found" as const };
      const existing = Array.isArray(rows[0]!.equipment_json)
        ? (rows[0]!.equipment_json as Array<Record<string, unknown>>)
        : [];
      const idx = existing.findIndex((it) => it && typeof it === "object" && it["id"] === equipmentId);
      if (idx < 0) return { kind: "missing" as const };
      if (existing[idx]!["isListedInMarket"] === true) return { kind: "listed" as const };
      const nextArr = existing.filter((_, i) => i !== idx);
      const nowMs = Date.now();
      await tx.execute(
        sql`UPDATE users
              SET equipment_json = ${JSON.stringify(nextArr)}::jsonb,
                  equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, ${nowMs}::bigint)
              WHERE telegram_id = ${telegramId}`,
      );
      return { kind: "ok" as const };
    });
    if (out.kind === "not_found") return void res.status(404).json({ error: "User not found" });
    if (out.kind === "missing") return void res.status(404).json({ error: "Equipment not found" });
    if (out.kind === "listed") return void res.status(409).json({ error: "Delist before burning" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[equipment/burn] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
