import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ─── Server-canonical rate table ─────────────────────────────────────
//
// SECURITY: must mirror the frontend `EQUIPMENT_RATE` table in
// `artifacts/zoom-master/src/utils/equipmentConfig.ts`. The server is the
// single source of truth for `rate` — any value sent by the client is
// discarded and overwritten with `EQUIPMENT_RATE_SERVER[category][rarity]`
// before persistence. This prevents a forged-rate exploit (a tampered
// client setting `rate: 9999999` and converting it to balance via the
// client-side offline accrual in `settleFarmingState`).
//
// If the frontend table is ever updated, this table MUST be updated in the
// same commit. Drift is detected on save: any item whose stored rate would
// not match this table is normalised, not rejected, so previously-saved
// items self-heal on the next debounced save.
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
 * rarity) survive validation — `rate` is intentionally NOT accepted from
 * the client and is recomputed server-side from EQUIPMENT_RATE_SERVER.
 * `passthrough()` is deliberately omitted so the client can't smuggle
 * extra economy-affecting fields through the save.
 */
const EquipmentRow = z.object({
  id: z.string().min(1).max(128),
  category: z.enum(["HELMET", "JETPACK", "HAT", "SCANNER"]),
  rarity: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "PLASMA", "MYTHIC"]),
  createdAt: z.number().finite().min(0).optional(),
  color: z.string().max(64).optional().nullable(),
});

const SaveBody = z.object({
  telegramId: z.string().min(1),
  equipment: z.array(EquipmentRow).max(512),
  clientWriteAtMs: z.number().int().min(0),
});

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

export default router;
