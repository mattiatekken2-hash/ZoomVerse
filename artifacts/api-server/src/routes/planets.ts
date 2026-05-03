import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const BurnBody = z.object({
  telegramId: z.string().min(1),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "GOLD"]),
});

/**
 * Permanently consume one bonus-planet entitlement when the user burns a
 * planet that was originally granted by the server (referral milestone,
 * wheel reward, mystery box, starter pack, etc — i.e. any planet whose
 * client-side id starts with `bonus-${TYPE}-`).
 *
 * Without this call, the periodic /grants sync would re-grant the same
 * planet on the next refresh because the server's `bonus*` counter still
 * shows an outstanding entitlement.
 *
 * The decrement is clamped at 0 so accidental double-calls (or burns of
 * non-bonus crafted planets that the client mistakenly forwarded) cannot
 * push the counter negative.
 */
router.post("/planets/burn", async (req, res) => {
  const parsed = BurnBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const { telegramId, planetType } = parsed.data;
  const col = planetType === "BASIC" ? "bonusBasic"
    : planetType === "RARE" ? "bonusRare"
    : planetType === "EPIC" ? "bonusEpic"
    : planetType === "MYTHIC" ? "bonusMythic"
    : "bonusGold";
  try {
    await db.update(usersTable)
      .set({ [col]: sql`GREATEST(0, ${usersTable[col as "bonusBasic"]} - 1)` })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[planets/burn] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
