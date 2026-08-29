import { Router, type IRouter } from "express";
import { db, usersTable, treasuryLedgerTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  computeTotalAirdropPool,
  computeUserAirdropZmc,
  parseVipLevel,
  zmcNanoToHuman,
  type VipLevel,
} from "@workspace/game-models";
import { fetchZmcBalanceNano, vipFromBalanceNano, treasuryWallet, zmcJettonMaster } from "../lib/zmc";

const router: IRouter = Router();

async function treasuryZmcTotal(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${treasuryLedgerTable.amountZmc}), 0)` })
    .from(treasuryLedgerTable);
  return Number(row?.total ?? 0) || 0;
}

async function globalZoomPoints(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usersTable.zoomBalance}), 0)` })
    .from(usersTable);
  return Number(row?.total ?? 0) || 0;
}

/** Wallet estimate: share of the 4M treasury airdrop + fee ledger. DEX lock excluded. */
function airdropPayload(
  userPoints: number,
  globalPoints: number,
  treasuryZmc: number,
) {
  const totalPool = computeTotalAirdropPool(treasuryZmc);
  return {
    zoomPoints: userPoints,
    totalGlobalZoomPoints: globalPoints,
    treasuryZmc,
    totalAirdropPool: totalPool,
    estimatedAirdropZmc: computeUserAirdropZmc(userPoints, globalPoints, treasuryZmc),
  };
}

router.get("/zmc/status/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ error: "telegramId required" });
    return;
  }
  try {
    const [user] = await db
      .select({
        zoomBalance: usersTable.zoomBalance,
        vipLevel: usersTable.vipLevel,
        zmcBalanceNano: usersTable.zmcBalanceNano,
        tonWalletAddress: usersTable.tonWalletAddress,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const treasuryZmc = await treasuryZmcTotal();
    const globalPoints = await globalZoomPoints();
    const userPoints = Number(user?.zoomBalance ?? 0) || 0;
    const nano = BigInt(user?.zmcBalanceNano && /^\d+$/.test(user.zmcBalanceNano) ? user.zmcBalanceNano : "0");

    res.json({
      ok: true,
      treasuryWallet: treasuryWallet(),
      jetton: zmcJettonMaster(),
      decimals: 9,
      walletAddress: user?.tonWalletAddress ?? null,
      vipLevel: parseVipLevel(user?.vipLevel),
      zmcBalanceNano: nano.toString(),
      zmcBalance: zmcNanoToHuman(nano),
      airdrop: airdropPayload(userPoints, globalPoints, treasuryZmc),
    });
  } catch (err) {
    console.error("[zmc/status] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const SyncBody = z.object({
  telegramId: z.string().min(1),
  walletAddress: z.string().min(1).max(128),
});

router.post("/zmc/sync", async (req, res) => {
  const parsed = SyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId, walletAddress } = parsed.data;
  try {
    const balanceNano = await fetchZmcBalanceNano(walletAddress);
    const vipLevel: VipLevel = vipFromBalanceNano(balanceNano);
    await db
      .update(usersTable)
      .set({
        tonWalletAddress: walletAddress,
        vipLevel,
        zmcBalanceNano: balanceNano.toString(),
      })
      .where(eq(usersTable.telegramId, telegramId));

    const [user] = await db
      .select({ zoomBalance: usersTable.zoomBalance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const treasuryZmc = await treasuryZmcTotal();
    const globalPoints = await globalZoomPoints();
    const userPoints = Number(user?.zoomBalance ?? 0) || 0;

    res.json({
      ok: true,
      walletAddress,
      vipLevel,
      zmcBalanceNano: balanceNano.toString(),
      zmcBalance: zmcNanoToHuman(balanceNano),
      airdrop: airdropPayload(userPoints, globalPoints, treasuryZmc),
    });
  } catch (err) {
    console.error("[zmc/sync] error:", err);
    res.status(500).json({ error: "Failed to read on-chain ZMC" });
  }
});

const UnlinkBody = z.object({
  telegramId: z.string().min(1),
});

router.post("/zmc/unlink", async (req, res) => {
  const parsed = UnlinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        tonWalletAddress: null,
        vipLevel: "NONE",
        zmcBalanceNano: "0",
      })
      .where(eq(usersTable.telegramId, telegramId));

    const [user] = await db
      .select({ zoomBalance: usersTable.zoomBalance })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const treasuryZmc = await treasuryZmcTotal();
    const globalPoints = await globalZoomPoints();
    const userPoints = Number(user?.zoomBalance ?? 0) || 0;

    res.json({
      ok: true,
      walletAddress: null,
      vipLevel: "NONE",
      zmcBalanceNano: "0",
      zmcBalance: 0,
      airdrop: airdropPayload(userPoints, globalPoints, treasuryZmc),
    });
  } catch (err) {
    console.error("[zmc/unlink] error:", err);
    res.status(500).json({ error: "Failed to unlink wallet" });
  }
});

export default router;
