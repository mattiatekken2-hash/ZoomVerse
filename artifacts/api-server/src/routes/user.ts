import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const ALLOWED = new Set(["en", "ru", "uk"]);

const SetLangBody = z.object({
  telegramId: z.string().min(1),
  language: z.string().min(2).max(5),
});

router.get("/user/:telegramId/language", async (req, res) => {
  try {
    const [row] = await db
      .select({ language: usersTable.language })
      .from(usersTable)
      .where(eq(usersTable.telegramId, req.params.telegramId))
      .limit(1);
    res.json({ language: row?.language ?? null });
  } catch {
    res.status(500).json({ language: null });
  }
});

router.post("/user/language", async (req, res) => {
  const parsed = SetLangBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid body" });
  const { telegramId, language } = parsed.data;
  if (!ALLOWED.has(language)) return res.status(400).json({ ok: false, error: "Unsupported language" });
  try {
    // We don't auto-create the user here — they get created on first game-state load.
    // If the row doesn't exist yet, this is a no-op (safe; the user will pick again
    // after they're registered, or the choice already lives in localStorage).
    await db
      .update(usersTable)
      .set({ language })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

export default router;
