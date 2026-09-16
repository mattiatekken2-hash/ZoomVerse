/**
 * Lab FUSE: 3 identical Lab GLBs → 1 Evo (then 3 Evo → 1 Evo II).
 * Pays on-chain ZMC 100% to treasury. Does not mint ZMC. Does not touch airdrop.
 */
import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable, treasuryLedgerTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { toNano } from "@ton/core";
import { zmcHumanToNano } from "@workspace/game-models";
import { recordHistoryAsync } from "../lib/history";
import {
  buildJettonTransferPayload,
  fetchZmcJettonWallet,
  treasuryWallet,
  verifyZmcTreasuryTransfer,
} from "../lib/zmc";
import {
  findCompletedLabFuse,
  fusePriceZmc,
  readEvoTier,
  keepUnburnedPlanets,
  resolveLabFuseApply,
  type EvoTier,
} from "../lib/labEvoFuse";

const router: IRouter = Router();

const FuseModelRow = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(16).optional(),
  shapeId: z.string().min(1).max(64).optional(),
  displayName: z.string().max(64).optional().nullable(),
  rate: z.number().finite().min(0).optional(),
  color: z.string().max(64).optional(),
  glowColor: z.string().max(64).optional(),
  float: z.number().finite().min(0).max(1).optional(),
  evoTier: z.number().int().min(0).max(2).optional(),
  createdAt: z.number().finite().optional(),
  farmDurationHours: z.number().finite().optional(),
}).passthrough();

const IntentBody = z.object({
  telegramId: z.string().min(1),
  walletAddress: z.string().min(10).max(128),
  planetIds: z.array(z.string().min(1).max(128)).length(3),
  shapeId: z.string().min(1).max(64).optional(),
  fromTier: z.union([z.literal(0), z.literal(1)]).optional(),
  models: z.array(FuseModelRow).max(3).optional(),
});

const ConfirmBody = IntentBody.extend({
  boc: z.string().min(8).max(65536),
});

function jsonPlanets(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

router.post("/lab/fuse/intent", async (req, res) => {
  const parsed = IntentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Missing telegramId, wallet, or 3 models" });
    return;
  }
  const { telegramId, walletAddress, planetIds, shapeId, fromTier: fromTierBody, models } = parsed.data;
  try {
    const [user] = await db
      .select({
        isDisabled: usersTable.isDisabled,
        planetsJson: usersTable.planetsJson,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }
    if (user.isDisabled) {
      res.status(403).json({ ok: false, error: "Account disabled" });
      return;
    }

    const planetsNow = jsonPlanets(user.planetsJson);
    const already = findCompletedLabFuse(planetsNow, planetIds);
    if (already) {
      res.json({
        ok: true,
        alreadyFused: true,
        alreadyCredited: true,
        priceZmc: fusePriceZmc((already.toTier - 1) as EvoTier) ?? undefined,
        toTier: already.toTier,
        keeperId: already.keeperId,
        planetIds,
        planets: already.planets,
      });
      return;
    }

    const fused = resolveLabFuseApply(planetsNow, planetIds, { shapeId, fromTier: fromTierBody, models });
    const fromTier: EvoTier = fused.ok ? fused.fromTier : (fromTierBody ?? 0);
    const priceZmc = fusePriceZmc(fromTier);
    if (priceZmc == null) {
      res.status(400).json({ ok: false, error: "EVO II cannot fuse" });
      return;
    }
    const fuseIds = fused.ok
      ? [fused.keeperId, ...fused.burnedIds].filter(Boolean)
      : planetIds;

    const jettonWallet = await fetchZmcJettonWallet(walletAddress);
    if (!jettonWallet) {
      res.status(400).json({ ok: false, error: "No ZMC wallet. Buy ZMC on STON.fi first." });
      return;
    }
    const amountNano = zmcHumanToNano(priceZmc);
    if (jettonWallet.balanceNano < amountNano) {
      res.status(400).json({ ok: false, error: "Not enough ZMC in connected wallet" });
      return;
    }

    const treasuryDest = treasuryWallet();
    res.json({
      ok: true,
      alreadyFused: false,
      priceZmc,
      fromTier,
      toTier: fused.ok ? fused.toTier : ((fromTier + 1) as 1 | 2),
      keeperId: fused.ok ? fused.keeperId : undefined,
      planetIds: fuseIds.length === 3 ? fuseIds : planetIds,
      amountNano: amountNano.toString(),
      treasuryWallet: treasuryDest,
      messages: [
        {
          address: jettonWallet.walletAddress,
          amount: toNano("0.08").toString(),
          payload: buildJettonTransferPayload({
            to: treasuryDest,
            amountNano,
            response: walletAddress,
            queryId: BigInt(Date.now()),
          }),
        },
      ],
    });
  } catch (err) {
    console.error("[lab/fuse/intent] error:", err);
    res.status(500).json({ ok: false, error: "Failed to build ZMC transfer" });
  }
});

type FuseCreditResult = {
  alreadyCredited: boolean;
  txnId: number;
  planets: Record<string, unknown>[];
  keeperId: string;
  toTier: 1 | 2;
  priceZmc: number;
};

async function applyVerifiedLabFuse(opts: {
  telegramId: string;
  planetIds: string[];
  txHash: string;
  amountHuman: number;
  priceZmc: number;
  fromTier: EvoTier;
  shapeId?: string;
  models?: unknown;
}): Promise<FuseCreditResult> {
  const { telegramId, planetIds, txHash, amountHuman, priceZmc, fromTier, shapeId, models } = opts;
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        isDisabled: usersTable.isDisabled,
        planetsJson: usersTable.planetsJson,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .for("update")
      .limit(1);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.isDisabled) throw new Error("ACCOUNT_DISABLED");

    const [existing] = await tx
      .select({ id: treasuryLedgerTable.id })
      .from(treasuryLedgerTable)
      .where(eq(treasuryLedgerTable.txHash, txHash))
      .limit(1);
    if (existing) {
      const planets = jsonPlanets(user.planetsJson) as Record<string, unknown>[];
      const keeperId = planetIds.find((id) => planets.some((p) => String(p.id ?? "") === id)) ?? "";
      const keeper = planets.find((p) => String(p.id ?? "") === keeperId);
      const toTier = (readEvoTier(keeper) || (fromTier + 1)) as 1 | 2;
      return {
        alreadyCredited: true as const,
        txnId: 0,
        planets,
        keeperId,
        toTier,
        priceZmc,
      };
    }

    const planetsNow = jsonPlanets(user.planetsJson);
    const done = findCompletedLabFuse(planetsNow, planetIds);
    if (done) {
      try {
        await tx.insert(treasuryLedgerTable).values({
          txHash,
          type: done.toTier === 2 ? "lab_fuse_evo_ii" : "lab_fuse_evo",
          amountZmc: amountHuman,
          userId: telegramId,
        });
      } catch (err: unknown) {
        const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : "";
        if (code !== "23505") throw err;
      }
      return {
        alreadyCredited: true as const,
        txnId: 0,
        planets: done.planets,
        keeperId: done.keeperId,
        toTier: done.toTier,
        priceZmc,
      };
    }

    const resolved = resolveLabFuseApply(planetsNow, planetIds, { shapeId, fromTier, models });
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    const fused = keepUnburnedPlanets(planetsNow, resolved);
    const expected = fusePriceZmc(fused.fromTier);
    if (expected !== priceZmc || fused.fromTier !== fromTier) {
      throw new Error("PRICE_CHANGED");
    }

    try {
      await tx.insert(treasuryLedgerTable).values({
        txHash,
        type: fused.toTier === 2 ? "lab_fuse_evo_ii" : "lab_fuse_evo",
        amountZmc: amountHuman,
        userId: telegramId,
      });
    } catch (err: unknown) {
      const code = typeof err === "object" && err && "code" in err ? (err as { code: string }).code : "";
      if (code === "23505") {
        const planets = jsonPlanets(user.planetsJson) as Record<string, unknown>[];
        return {
          alreadyCredited: true as const,
          txnId: 0,
          planets,
          keeperId: fused.keeperId,
          toTier: fused.toTier,
          priceZmc,
        };
      }
      throw err;
    }

    const nowMs = Date.now();
    await tx
      .update(usersTable)
      .set({
        planetsJson: sql`${JSON.stringify(fused.planets)}::jsonb`,
        planetsUpdatedAtMs: nowMs,
      })
      .where(eq(usersTable.telegramId, telegramId));

    const [txn] = await tx.insert(transactionsTable).values({
      telegramId,
      type: "lab_fuse",
      currency: "ZMC",
      amount: 0,
      tonAmount: priceZmc,
      itemId: fused.toTier === 2 ? "lab_fuse_evo_ii" : "lab_fuse_evo",
      itemName: fused.toTier === 2 ? "Lab FUSE Evo II" : "Lab FUSE Evo",
      status: "completed",
      telegramPaymentId: `zmc_lab_fuse_${txHash}`,
    }).returning();

    return {
      alreadyCredited: false as const,
      txnId: txn.id,
      planets: fused.planets,
      keeperId: fused.keeperId,
      toTier: fused.toTier,
      priceZmc,
    };
  });
}

const fuseBgInFlight = new Set<string>();

function backgroundVerifyLabFuse(opts: {
  telegramId: string;
  planetIds: string[];
  walletAddress: string;
  boc: string;
  amountNano: bigint;
  priceZmc: number;
  fromTier: EvoTier;
  shapeId?: string;
  models?: unknown;
}): void {
  const key = `${opts.telegramId}:${opts.boc.slice(0, 48)}`;
  if (fuseBgInFlight.has(key)) return;
  fuseBgInFlight.add(key);
  void (async () => {
    try {
      const attempts = [5_000, 8_000, 12_000, 18_000, 25_000, 30_000, 30_000, 30_000];
      for (const wait of attempts) {
        await new Promise((r) => setTimeout(r, wait));
        const verified = await verifyZmcTreasuryTransfer({
          boc: opts.boc,
          buyerWallet: opts.walletAddress,
          amountNano: opts.amountNano,
        });
        if (!verified.ok) {
          if (!verified.retriable) {
            console.warn(`[lab/fuse-bg] not retriable for ${opts.telegramId}: ${verified.reason}`);
            return;
          }
          continue;
        }
        const credited = await applyVerifiedLabFuse({
          telegramId: opts.telegramId,
          planetIds: opts.planetIds,
          txHash: verified.txHash,
          amountHuman: verified.feeHuman,
          priceZmc: opts.priceZmc,
          fromTier: opts.fromTier,
          shapeId: opts.shapeId,
          models: opts.models,
        });
        if (!credited.alreadyCredited) {
          recordHistoryAsync({
            telegramId: opts.telegramId,
            kind: "ton_purchase",
            delta: -opts.priceZmc,
            currency: "zmc",
            meta: {
              txnId: credited.txnId,
              itemId: credited.toTier === 2 ? "lab_fuse_evo_ii" : "lab_fuse_evo",
              source: "lab_fuse",
              txHash: verified.txHash,
              bg: true,
            },
          });
          console.log(`[lab/fuse-bg] fused ${opts.telegramId} → evo ${credited.toTier} keeper=${credited.keeperId}`);
        }
        return;
      }
      console.warn(`[lab/fuse-bg] timed out for ${opts.telegramId}`);
    } catch (err) {
      console.error("[lab/fuse-bg] error:", err);
    } finally {
      fuseBgInFlight.delete(key);
    }
  })();
}

router.post("/lab/fuse/confirm", async (req, res) => {
  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Missing telegramId, wallet, boc, or 3 models" });
    return;
  }
  const { telegramId, walletAddress, boc, planetIds, shapeId, fromTier: fromTierBody, models } = parsed.data;

  try {
    const [user] = await db
      .select({
        isDisabled: usersTable.isDisabled,
        planetsJson: usersTable.planetsJson,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if (!user) {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }
    if (user.isDisabled) {
      res.status(403).json({ ok: false, error: "Account disabled" });
      return;
    }

    const planetsNow = jsonPlanets(user.planetsJson);
    const already = findCompletedLabFuse(planetsNow, planetIds);
    if (already) {
      res.json({
        ok: true,
        alreadyCredited: true,
        priceZmc: fusePriceZmc((already.toTier - 1) as EvoTier) ?? undefined,
        toTier: already.toTier,
        keeperId: already.keeperId,
        planets: already.planets,
      });
      return;
    }

    const preview = resolveLabFuseApply(planetsNow, planetIds, { shapeId, fromTier: fromTierBody, models });
    if (!preview.ok) {
      res.status(400).json({ ok: false, error: preview.error });
      return;
    }
    const priceZmc = fusePriceZmc(preview.fromTier);
    if (priceZmc == null) {
      res.status(400).json({ ok: false, error: "EVO II cannot fuse" });
      return;
    }
    const amountNano = zmcHumanToNano(priceZmc);

    let verified: Awaited<ReturnType<typeof verifyZmcTreasuryTransfer>> | null = null;
    const waits = [0, 2000, 4000, 6000, 8000];
    for (const wait of waits) {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      verified = await verifyZmcTreasuryTransfer({
        boc,
        buyerWallet: walletAddress,
        amountNano,
      });
      if (verified.ok) break;
      if (!verified.retriable) break;
    }
    if (!verified || !verified.ok) {
      const pending = !verified || verified.retriable;
      if (pending) {
        backgroundVerifyLabFuse({
          telegramId,
          planetIds,
          walletAddress,
          boc,
          amountNano,
          priceZmc,
          fromTier: preview.fromTier,
          shapeId,
          models,
        });
      }
      res.status(verified && !verified.retriable ? 400 : 202).json({
        ok: false,
        pending,
        error: verified?.reason ?? "On-chain ZMC transfer not confirmed",
      });
      return;
    }

    const result = await applyVerifiedLabFuse({
      telegramId,
      planetIds,
      txHash: verified.txHash,
      amountHuman: verified.feeHuman,
      priceZmc,
      fromTier: preview.fromTier,
      shapeId,
      models,
    });

    if (!result.alreadyCredited) {
      recordHistoryAsync({
        telegramId,
        kind: "ton_purchase",
        delta: -priceZmc,
        currency: "zmc",
        meta: {
          txnId: result.txnId,
          itemId: result.toTier === 2 ? "lab_fuse_evo_ii" : "lab_fuse_evo",
          source: "lab_fuse",
          txHash: verified.txHash,
        },
      });
    }

    res.json({
      ok: true,
      alreadyCredited: result.alreadyCredited,
      txnId: result.txnId || undefined,
      priceZmc: result.priceZmc,
      toTier: result.toTier,
      keeperId: result.keeperId,
      planets: result.planets,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "FUSE failed";
    if (msg === "USER_NOT_FOUND") {
      res.status(404).json({ ok: false, error: "User not found" });
      return;
    }
    if (msg === "ACCOUNT_DISABLED") {
      res.status(403).json({ ok: false, error: "Account disabled" });
      return;
    }
    if (msg === "PRICE_CHANGED" || msg === "Delist before FUSE" || msg === "Need 3 identical models" || msg === "EVO II cannot fuse" || msg === "FUSE is Lab models only" || msg === "Model not found" || msg === "FUSE needs 3 models" || msg === "No models") {
      res.status(400).json({ ok: false, error: msg });
      return;
    }
    console.error("[lab/fuse/confirm] error:", err);
    res.status(500).json({ ok: false, error: "FUSE failed" });
  }
});

export default router;
