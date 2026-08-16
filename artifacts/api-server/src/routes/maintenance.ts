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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(s);
  } catch (err) {
    console.error("[maintenance/status] error:", err);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
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
  // The body-only `adminId` check is NOT a security boundary: the admin id is
  // public (hardcoded), so anyone could send it. The real gate is the
  // cryptographically verified Telegram identity (`req.tgUser`), which an
  // attacker cannot forge without the bot token used for the initData HMAC.
  // Require BOTH: the verified user must exist AND be the admin. This holds
  // even in soft TG_AUTH_MODE, where the central middleware only logs and lets
  // requests through. Without this, the endpoint was trivially exploitable.
  if (!req.tgUser || req.tgUser.id !== ADMIN_ID) {
    req.log?.warn(
      {
        path: req.path,
        verifiedId: req.tgUser?.id ?? null,
        claimedAdminId: adminId,
        ip: req.ip,
      },
      "[admin/maintenance] rejected: caller is not the verified admin",
    );
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

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
