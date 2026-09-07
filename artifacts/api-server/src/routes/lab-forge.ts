/**
 * Lab START BUILD payment. $ZOOM / ★ must be deducted on the server
 * before forge begins — /balance/sync cannot lower $ZOOM on re-entry
 * (Math.max local, server) so a client-only spend comes back after restart.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  LAB_STARDUST_FORGE_ZOOM_COST,
  LAB_ZOOM_FORGE_STARDUST_COST,
} from "@workspace/game-models";

const router: IRouter = Router();

const ForgeStartBody = z.object({
  telegramId: z.string().min(1),
  path: z.enum(["zoom", "stardust"]),
});

router.post("/lab/forge-start", async (req, res) => {
  const parsed = ForgeStartBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "BAD_REQUEST" });
  }
  const { telegramId, path } = parsed.data;
  try {
    if (path === "stardust") {
      const cost = LAB_STARDUST_FORGE_ZOOM_COST;
      const [upd] = await db
        .update(usersTable)
        .set({
          zoomBalance: sql`${usersTable.zoomBalance} - ${cost}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(
          sql`${usersTable.telegramId} = ${telegramId}
            AND ${usersTable.zoomBalance} >= ${cost}
            AND ${usersTable.isDisabled} = false`,
        )
        .returning({
          zoomBalance: usersTable.zoomBalance,
          stardustBalance: usersTable.stardustBalance,
          balanceEpoch: usersTable.balanceEpoch,
        });
      if (!upd) {
        return res.status(402).json({ ok: false, error: "INSUFFICIENT_ZOOM" });
      }
      return res.json({
        ok: true,
        path,
        zoomBalance: Number(upd.zoomBalance ?? 0),
        stardustBalance: Number(upd.stardustBalance ?? 0),
        balanceEpoch: Number(upd.balanceEpoch ?? 0),
      });
    }

    const cost = LAB_ZOOM_FORGE_STARDUST_COST;
    const [upd] = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`GREATEST(0, ${usersTable.stardustBalance} - ${cost})`,
      })
      .where(
        sql`${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.stardustBalance} >= ${cost}
          AND ${usersTable.isDisabled} = false`,
      )
      .returning({
        zoomBalance: usersTable.zoomBalance,
        stardustBalance: usersTable.stardustBalance,
        balanceEpoch: usersTable.balanceEpoch,
      });
    if (!upd) {
      return res.status(402).json({ ok: false, error: "INSUFFICIENT_STARDUST" });
    }
    return res.json({
      ok: true,
      path,
      zoomBalance: Number(upd.zoomBalance ?? 0),
      stardustBalance: Number(upd.stardustBalance ?? 0),
      balanceEpoch: Number(upd.balanceEpoch ?? 0),
    });
  } catch (err) {
    req.log.error(err, "[lab/forge-start] error");
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

export default router;
