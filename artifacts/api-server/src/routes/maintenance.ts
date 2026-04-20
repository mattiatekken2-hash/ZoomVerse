import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ADMIN_ID = "8144744644";
const KEY_ENABLED = "maintenance_enabled";
const KEY_MESSAGE = "maintenance_message";
const DEFAULT_MESSAGE = "We're upgrading the game. Back online shortly.";

async function readSettings(): Promise<{ enabled: boolean; message: string; updatedAt: number }> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(sql`${appSettingsTable.key} IN (${KEY_ENABLED}, ${KEY_MESSAGE})`);
  let enabled = false;
  let message = DEFAULT_MESSAGE;
  let updatedAt = 0;
  for (const r of rows) {
    if (r.key === KEY_ENABLED) {
      enabled = Number(r.valueNum ?? 0) === 1;
      updatedAt = Math.max(updatedAt, r.updatedAt.getTime());
    } else if (r.key === KEY_MESSAGE && r.valueText) {
      message = r.valueText;
      updatedAt = Math.max(updatedAt, r.updatedAt.getTime());
    }
  }
  return { enabled, message, updatedAt };
}

router.get("/maintenance/status", async (_req, res) => {
  try {
    const s = await readSettings();
    res.json(s);
  } catch (err) {
    console.error("[maintenance/status] error:", err);
    res.json({ enabled: false, message: DEFAULT_MESSAGE, updatedAt: 0 });
  }
});

const SetBody = z.object({
  adminId: z.string().min(1),
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});

router.post("/admin/maintenance", async (req, res) => {
  const parsed = SetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid body" });
  const { adminId, enabled, message } = parsed.data;
  if (adminId !== ADMIN_ID) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    await db
      .insert(appSettingsTable)
      .values({ key: KEY_ENABLED, valueNum: enabled ? 1 : 0, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueNum: enabled ? 1 : 0, updatedAt: new Date() },
      });
    if (typeof message === "string" && message.trim().length > 0) {
      await db
        .insert(appSettingsTable)
        .values({ key: KEY_MESSAGE, valueText: message.trim(), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: { valueText: message.trim(), updatedAt: new Date() },
        });
    }
    const s = await readSettings();
    res.json({ ok: true, ...s });
  } catch (err) {
    console.error("[admin/maintenance] error:", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
