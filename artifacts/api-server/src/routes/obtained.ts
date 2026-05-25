import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const Body = z.object({
  telegramId: z.string().min(1),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "PLASMA", "GOLD", "V1"]),
});

const fieldMap: Record<string, "totalObtainedBasic" | "totalObtainedRare" | "totalObtainedEpic" | "totalObtainedMythic" | "totalObtainedPlasma" | "totalObtainedGold" | "totalObtainedV1" | null> = {
  BASIC: "totalObtainedBasic",
  RARE: "totalObtainedRare",
  EPIC: "totalObtainedEpic",
  MYTHIC: "totalObtainedMythic",
  PLASMA: "totalObtainedPlasma",
  GOLD: "totalObtainedGold",
  V1: "totalObtainedV1",
};

router.post("/obtained/record", async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { telegramId, planetType } = parsed.data;
  const field = fieldMap[planetType];
  if (!field) { res.json({ ok: true }); return; }

  try {
    await db
      .update(usersTable)
      .set({ [field]: sql`${usersTable[field as keyof typeof usersTable.$inferSelect] as never} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[obtained/record] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
