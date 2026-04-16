import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

export interface WheelPrize {
  index: number;
  type: "zoom" | "planet";
  zoomAmount?: number;
  planetType?: "BASIC" | "RARE" | "EPIC";
  label: string;
  color: string;
  weight: number;
}

export const WHEEL_PRIZES: WheelPrize[] = [
  { index: 0, type: "zoom",   zoomAmount: 100,   label: "100 $ZOOM",   color: "#8892b0", weight: 35 },
  { index: 1, type: "zoom",   zoomAmount: 500,   label: "500 $ZOOM",   color: "#4facfe", weight: 25 },
  { index: 2, type: "zoom",   zoomAmount: 1000,  label: "1K $ZOOM",    color: "#00f2fe", weight: 15 },
  { index: 3, type: "planet", planetType: "BASIC", label: "BASIC",     color: "#a0aec0", weight: 10 },
  { index: 4, type: "zoom",   zoomAmount: 2500,  label: "2.5K $ZOOM",  color: "#43e97b", weight: 7 },
  { index: 5, type: "planet", planetType: "RARE",  label: "RARE",      color: "#4facfe", weight: 5 },
  { index: 6, type: "zoom",   zoomAmount: 5000,  label: "5K $ZOOM",    color: "#f093fb", weight: 2.5 },
  { index: 7, type: "planet", planetType: "EPIC",  label: "EPIC",      color: "#c471ed", weight: 0.5 },
];

function pickPrize(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of WHEEL_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return WHEEL_PRIZES[0];
}

router.get("/wheel/config", (_req, res) => {
  res.json({
    prizes: WHEEL_PRIZES.map(({ index, type, zoomAmount, planetType, label, color }) => ({
      index, type, zoomAmount, planetType, label, color,
    })),
  });
});

router.get("/wheel/spins/:telegramId", async (req, res) => {
  try {
    const telegramId = req.params.telegramId;
    const [row] = await db
      .select({ spins: usersTable.wheelSpins })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    res.json({ spins: row?.spins ?? 0 });
  } catch (err) {
    console.error("[wheel/spins] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/wheel/spin", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    // Atomic decrement only if spins > 0
    const dec = await db.execute(sql`
      UPDATE users
      SET wheel_spins = wheel_spins - 1
      WHERE telegram_id = ${telegramId}
        AND wheel_spins > 0
      RETURNING wheel_spins
    `);

    if (!dec.rows || dec.rows.length === 0) {
      res.status(409).json({ error: "No spins available" });
      return;
    }

    const prize = pickPrize();

    // Credit prize atomically
    if (prize.type === "zoom" && prize.zoomAmount) {
      await db.update(usersTable)
        .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${prize.zoomAmount}` })
        .where(eq(usersTable.telegramId, telegramId));
    } else if (prize.type === "planet" && prize.planetType) {
      const col = prize.planetType === "BASIC" ? "bonusBasic"
        : prize.planetType === "RARE" ? "bonusRare"
        : "bonusEpic";
      await db.update(usersTable)
        .set({ [col]: sql`${usersTable[col as keyof typeof usersTable.$inferSelect] as never} + 1` })
        .where(eq(usersTable.telegramId, telegramId));
    }

    const remaining = Number((dec.rows[0] as { wheel_spins: number }).wheel_spins);
    res.json({
      prizeIndex: prize.index,
      prize: {
        type: prize.type,
        zoomAmount: prize.zoomAmount,
        planetType: prize.planetType,
        label: prize.label,
        color: prize.color,
      },
      spinsRemaining: remaining,
    });
  } catch (err) {
    console.error("[wheel/spin] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
