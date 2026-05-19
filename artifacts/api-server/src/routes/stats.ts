import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable, marketListingsTable, farmCyclesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * Public stats endpoint — returns aggregated counts from the production DB.
 * No auth required: these are public summary metrics.
 */
router.get("/stats", async (_req, res) => {
  try {
    const [{ totalUsers }] = await db.select({ totalUsers: sql<number>`count(*)::int` }).from(usersTable);
    const [{ totalTransactions }] = await db.select({ totalTransactions: sql<number>`count(*)::int` }).from(transactionsTable);
    const [{ totalListings }] = await db.select({ totalListings: sql<number>`count(*)::int` }).from(marketListingsTable);
    const [{ totalFarmCycles }] = await db.select({ totalFarmCycles: sql<number>`count(*)::int` }).from(farmCyclesTable);

    const [{ totalTonBalance }] = await db.select({ totalTonBalance: sql<number>`COALESCE(sum(${usersTable.tonBalance}), 0)::real` }).from(usersTable);
    const [{ totalZoomBalance }] = await db.select({ totalZoomBalance: sql<number>`COALESCE(sum(${usersTable.zoomBalance}), 0)::real` }).from(usersTable);
    const [{ totalPlanets }] = await db.select({
      totalPlanets: sql<number>`COALESCE(
        sum(${usersTable.bonusBasic} + ${usersTable.bonusRare} + ${usersTable.bonusEpic} +
            ${usersTable.bonusMythic} + ${usersTable.bonusGold} + ${usersTable.bonusV1} +
            ${usersTable.bonusV1NftPlatinum} + ${usersTable.bonusSun}::int),
        0
      )::int`
    }).from(usersTable);

    res.json({
      totalUsers,
      totalPlanets,
      totalTonBalance,
      totalZoomBalance,
      totalTransactions,
      totalListings,
      totalFarmCycles,
    });
  } catch (err) {
    console.error("[stats] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
