import { Router, type IRouter } from "express";
import { db, usersTable, treasuryLedgerTable, appSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  computeTotalAirdropPool,
  computeUserAirdropZmc,
  isVipProPassActive,
  parseVipLevel,
  VIP_PRO_PASS_GIFT_UNTIL_KEY,
  VIP_PRO_PASS_MS,
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

function vipPassPayload(untilMs: number | null | undefined) {
  const vipProPassUntilMs = Number(untilMs) || 0;
  return {
    vipProPassUntilMs,
    vipProPassActive: isVipProPassActive(vipProPassUntilMs),
  };
}

/** One-time 7-day pass for existing on-chain VIP PRO, during the launch window. */
async function maybeGrantLaunchPass(telegramId: string, vipLevel: VipLevel): Promise<number | null> {
  if (vipLevel !== "PRO") return null;
  const [gate] = await db
    .select({ valueNum: appSettingsTable.valueNum })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, VIP_PRO_PASS_GIFT_UNTIL_KEY))
    .limit(1);
  const until = Number(gate?.valueNum ?? 0);
  if (!(until > Date.now())) return null;

  const now = Date.now();
  const result = await db.execute(sql`
    UPDATE users
    SET vip_pro_pass_until_ms =
          GREATEST(COALESCE(vip_pro_pass_until_ms, 0), ${now}) + ${VIP_PRO_PASS_MS},
        vip_pro_pass_gifted = true
    WHERE telegram_id = ${telegramId}
      AND vip_pro_pass_gifted = false
    RETURNING vip_pro_pass_until_ms
  `);
  const row = result.rows?.[0] as { vip_pro_pass_until_ms?: string | number } | undefined;
  if (!row) return null;
  return Number(row.vip_pro_pass_until_ms) || null;
}
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
        vipProPassUntilMs: usersTable.vipProPassUntilMs,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    const treasuryZmc = await treasuryZmcTotal();
    const globalPoints = await globalZoomPoints();
    const userPoints = Number(user?.zoomBalance ?? 0) || 0;
    const nano = BigInt(user?.zmcBalanceNano && /^\d+$/.test(user.zmcBalanceNano) ? user.zmcBalanceNano : "0");
    const giftedUntil = await maybeGrantLaunchPass(telegramId, parseVipLevel(user?.vipLevel));
    const passUntil = giftedUntil ?? user?.vipProPassUntilMs;

    res.json({
      ok: true,
      treasuryWallet: treasuryWallet(),
      jetton: zmcJettonMaster(),
      decimals: 9,
      walletAddress: user?.tonWalletAddress ?? null,
      vipLevel: parseVipLevel(user?.vipLevel),
      zmcBalanceNano: nano.toString(),
      zmcBalance: zmcNanoToHuman(nano),
      ...vipPassPayload(passUntil),
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

    await maybeGrantLaunchPass(telegramId, vipLevel);

    const [user] = await db
      .select({
        zoomBalance: usersTable.zoomBalance,
        vipProPassUntilMs: usersTable.vipProPassUntilMs,
      })
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
      ...vipPassPayload(user?.vipProPassUntilMs),
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
      .select({
        zoomBalance: usersTable.zoomBalance,
        vipProPassUntilMs: usersTable.vipProPassUntilMs,
      })
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
      ...vipPassPayload(user?.vipProPassUntilMs),
      airdrop: airdropPayload(userPoints, globalPoints, treasuryZmc),
    });
  } catch (err) {
    console.error("[zmc/unlink] error:", err);
    res.status(500).json({ error: "Failed to unlink wallet" });
  }
});

export default router;
