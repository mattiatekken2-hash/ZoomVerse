import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { settleCometStardust } from "./stardust.js";

const router: IRouter = Router();

const BurnBody = z.object({
  telegramId: z.string().min(1),
  // COMET is allowed because bonus comets need their entitlement counter
  // decremented just like the other rarities. Without this, burning a
  // bonus comet would leave `bonusComet > claimedBonusComet` on the
  // server and the next /grants poll would re-mint the burned planet.
  planetType: z.enum(["BASIC", "RARE", "EPIC", "COMET", "GOLD"]),
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
    : planetType === "COMET" ? "bonusComet"
    : "bonusGold";
  try {
    // For COMET burns, settle pending stardust BEFORE the entitlement
    // counter changes — otherwise a comet that was about to bank a full
    // 24h window could be burned right before settlement and the user
    // would lose accrued stardust they earned while the comet was alive.
    // Settling first locks in everything earned with the OLD count.
    if (planetType === "COMET") {
      await settleCometStardust(telegramId);
    }
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
