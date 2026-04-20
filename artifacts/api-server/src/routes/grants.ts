import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/grants/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;
    const [user] = await db
      .select({
        bonusSlots: usersTable.bonusSlots,
        bonusSun: usersTable.bonusSun,
        sunCount: usersTable.sunCount,
        bonusBasic: usersTable.bonusBasic,
        bonusRare: usersTable.bonusRare,
        bonusEpic: usersTable.bonusEpic,
        bonusGold: usersTable.bonusGold,
        hasAutoTap: usersTable.hasAutoTap,
        whiteCollectionUnlocked: usersTable.whiteCollectionUnlocked,
        tonBalance: usersTable.tonBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return res.json({ bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, hasAutoTap: false, whiteCollectionUnlocked: false, tonBalance: 0 });
    }

    res.json({
      bonusSlots: user.bonusSlots,
      bonusSun: user.bonusSun,
      sunCount: user.sunCount,
      bonusBasic: user.bonusBasic,
      bonusRare: user.bonusRare,
      bonusEpic: user.bonusEpic,
      bonusGold: user.bonusGold,
      hasAutoTap: user.hasAutoTap,
      whiteCollectionUnlocked: user.whiteCollectionUnlocked,
      tonBalance: user.tonBalance ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
