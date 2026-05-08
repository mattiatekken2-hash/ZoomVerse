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
        bonusMythic: usersTable.bonusMythic,
        bonusV1: usersTable.bonusV1,
        bonusV1NftPlatinum: usersTable.bonusV1NftPlatinum,
        hasAutoTap: usersTable.hasAutoTap,
        whiteCollectionUnlocked: usersTable.whiteCollectionUnlocked,
        whiteCollectionBundles: usersTable.whiteCollectionBundles,
        earthCollectionUnlocked: usersTable.earthCollectionUnlocked,
        earthCollectionBundles: usersTable.earthCollectionBundles,
        blackCollectionUnlocked: usersTable.blackCollectionUnlocked,
        blackCollectionBundles: usersTable.blackCollectionBundles,
        tonBalance: usersTable.tonBalance,
        sunFarmStartedAtMs: usersTable.sunFarmStartedAtMs,
        sunLastCollectedAtMs: usersTable.sunLastCollectedAtMs,
        sunCycleCount: usersTable.sunCycleCount,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return res.json({ bonusSlots: 0, bonusSun: false, sunCount: 0, bonusBasic: 0, bonusRare: 0, bonusEpic: 0, bonusGold: 0, bonusMythic: 0, bonusV1: 0, bonusV1NftPlatinum: 0, hasAutoTap: false, whiteCollectionUnlocked: false, whiteCollectionBundles: 0, earthCollectionUnlocked: false, earthCollectionBundles: 0, blackCollectionUnlocked: false, blackCollectionBundles: 0, tonBalance: 0, sunFarmStartedAtMs: 0, sunLastCollectedAtMs: 0, sunCycleCount: 0 });
    }

    return res.json({
      bonusSlots: user.bonusSlots,
      bonusSun: user.bonusSun,
      sunCount: user.sunCount,
      bonusBasic: user.bonusBasic,
      bonusRare: user.bonusRare,
      bonusEpic: user.bonusEpic,
      bonusGold: user.bonusGold,
      bonusMythic: user.bonusMythic ?? 0,
      bonusV1: user.bonusV1 ?? 0,
      bonusV1NftPlatinum: user.bonusV1NftPlatinum ?? 0,
      hasAutoTap: user.hasAutoTap,
      whiteCollectionUnlocked: user.whiteCollectionUnlocked,
      whiteCollectionBundles: user.whiteCollectionBundles ?? 0,
      earthCollectionUnlocked: user.earthCollectionUnlocked,
      earthCollectionBundles: user.earthCollectionBundles ?? 0,
      blackCollectionUnlocked: user.blackCollectionUnlocked ?? false,
      blackCollectionBundles: user.blackCollectionBundles ?? 0,
      tonBalance: user.tonBalance ?? 0,
      sunFarmStartedAtMs: user.sunFarmStartedAtMs ?? 0,
      sunLastCollectedAtMs: user.sunLastCollectedAtMs ?? 0,
      sunCycleCount: user.sunCycleCount ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
