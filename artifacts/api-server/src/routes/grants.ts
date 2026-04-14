import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/grants/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;
    const [user] = await db
      .select({ bonusSlots: usersTable.bonusSlots, bonusSun: usersTable.bonusSun })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      return res.json({ bonusSlots: 0, bonusSun: false });
    }

    res.json({ bonusSlots: user.bonusSlots, bonusSun: user.bonusSun });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
