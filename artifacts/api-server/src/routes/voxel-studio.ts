import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const FREE_SLOTS = 2;
const MAX_SLOTS = 10;
const SLOT_COST = 15;

const Voxel = z.object({
  x: z.number().int().min(-24).max(24),
  y: z.number().int().min(0).max(48),
  z: z.number().int().min(-24).max(24),
});

const Project = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(32),
  createdAt: z.number().int(),
  voxels: z.array(Voxel).max(900),
});

void pool.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS voxel_studio_json jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS voxel_studio_slots integer NOT NULL DEFAULT 2;
`).catch(() => {});

router.get("/voxel-studio/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    const rows = await pool.query<{ voxel_studio_json: unknown }>(
      `SELECT voxel_studio_json FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId],
    );
    const raw = (rows.rows[0]?.voxel_studio_json && typeof rows.rows[0].voxel_studio_json === "object")
      ? rows.rows[0].voxel_studio_json as { extraSlots?: number; projects?: unknown }
      : {};
    res.json({
      extraSlots: Math.max(0, Number(raw.extraSlots) || 0),
      projects: Array.isArray(raw.projects) ? raw.projects : [],
    });
  } catch (err) {
    console.error("[voxel-studio get]", err);
    res.json({ extraSlots: 0, projects: [] });
  }
});

router.post("/voxel-studio/save", async (req, res) => {
  const parsed = z.object({
    telegramId: z.string().min(1),
    extraSlots: z.number().int().min(0).max(MAX_SLOTS - FREE_SLOTS).optional(),
    projects: z.array(Project).max(MAX_SLOTS),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, extraSlots, projects } = parsed.data;
  try {
    await pool.query(
      `UPDATE users SET voxel_studio_json = $2::jsonb WHERE telegram_id = $1`,
      [telegramId, JSON.stringify({ extraSlots: extraSlots ?? 0, projects })],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[voxel-studio save]", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/voxel-studio/buy-slot", async (req, res) => {
  const parsed = z.object({ telegramId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query<{ stardust_balance: number; voxel_studio_json: { extraSlots?: number; projects?: unknown[] } | null }>(
      `SELECT stardust_balance, voxel_studio_json FROM users WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId],
    );
    const row = u.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }
    const blob = row.voxel_studio_json && typeof row.voxel_studio_json === "object" ? row.voxel_studio_json : {};
    const extraSlots = Math.max(0, Number(blob.extraSlots) || 0);
    if (FREE_SLOTS + extraSlots >= MAX_SLOTS) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Max 10 slots" });
      return;
    }
    if ((Number(row.stardust_balance) || 0) < SLOT_COST) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Need ${SLOT_COST} ★` });
      return;
    }
    const nextExtra = extraSlots + 1;
    const nextJson = { extraSlots: nextExtra, projects: Array.isArray(blob.projects) ? blob.projects : [] };
    const updated = await client.query<{ stardust_balance: number }>(
      `UPDATE users
       SET stardust_balance = stardust_balance - $1,
           voxel_studio_json = $2::jsonb
       WHERE telegram_id = $3
       RETURNING stardust_balance`,
      [SLOT_COST, JSON.stringify(nextJson), telegramId],
    );
    await client.query("COMMIT");
    res.json({ ok: true, extraSlots: nextExtra, stardustBalance: Number(updated.rows[0]?.stardust_balance ?? 0) });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /**/ }
    console.error("[voxel-studio buy-slot]", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

export default router;
