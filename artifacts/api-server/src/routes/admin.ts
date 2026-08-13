import { Router } from "express";
import { db, pool, transactionsTable, marketListingsTable } from "@workspace/db";
import { usersTable, appSettingsTable, collectionPlanetsTable } from "@workspace/db/schema";
import { sql, eq, inArray, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";
import { DEFAULT_SEASON_EPOCH_MS } from "../lib/ensure-db";
import { recordHistoryAsync } from "../lib/history";
import { EQUIPMENT_RATE_SERVER } from "./equipment";
import { readGlobal as readMerchantGlobal, advanceGlobal as advanceMerchantGlobal, GLOBAL_KEY as MERCHANT_GLOBAL_KEY } from "./merchant";
import { PLANET_TASKS } from "./tasks";

const router = Router();

// EARN planet-milestone task ids. These are claimable when the per-tier
// crafting counters reach a threshold, so they are SEASONAL: a season reset
// zeroes those counters and must therefore also clear these claims, or the
// task shows "CLAIMED" while its progress reads ~0. Sponsor task ids
// (one-time real-world channel joins) are intentionally preserved.
const PLANET_TASK_IDS: string[] = PLANET_TASKS.map((t) => t.id);
// Build a real Postgres text[] literal (ARRAY['a','b',...]). Embedding a JS
// array directly via sql`${arr}` makes drizzle emit a record tuple
// `($1,$2,...)`, NOT an array, so `&&` / `= ANY(...)` blow up at runtime.
const planetIdsArr = () =>
  sql`ARRAY[${sql.join(
    PLANET_TASK_IDS.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;

import { isAdmin } from "../lib/admin-ids";

const ADMIN_ASSET_SNAPSHOT = path.resolve(process.cwd(), "data", "admin-assets.json");

/**
 * Resolves an admin-provided target identifier into a numeric Telegram ID.
 * Accepts either a numeric telegram_id or an @username / username string,
 * looking up the username column we now persist on register/sync.
 * Returns null if the username cannot be matched to any user.
 */
export async function resolveTargetTelegramId(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // numeric telegram id passes through unchanged
  if (/^\d+$/.test(trimmed)) return trimmed;
  // strip leading @ and lowercase
  const handle = trimmed.replace(/^@/, "").toLowerCase();
  if (!handle) return null;
  const [row] = await db
    .select({ telegramId: usersTable.telegramId })
    .from(usersTable)
    .where(sql`LOWER(${usersTable.username}) = ${handle}`)
    .limit(1);
  return row?.telegramId ?? null;
}

async function writeAdminAssetSnapshot() {
  const rows = await db
    .select({
      telegramId: usersTable.telegramId,
      zoomBalance: usersTable.zoomBalance,
      bonusSlots: usersTable.bonusSlots,
      bonusSun: usersTable.bonusSun,
      bonusBasic: usersTable.bonusBasic,
      bonusRare: usersTable.bonusRare,
      bonusEpic: usersTable.bonusEpic,
      bonusGold: usersTable.bonusGold,
    })
    .from(usersTable);

  fs.mkdirSync(path.dirname(ADMIN_ASSET_SNAPSHOT), { recursive: true });
  // Async write — never blocks the Node event loop while serializing the
  // (potentially large) JSON to disk.
  await fs.promises.writeFile(
    ADMIN_ASSET_SNAPSHOT,
    JSON.stringify({ updatedAt: new Date().toISOString(), users: rows }, null, 2),
    "utf8",
  );
}

/**
 * Fire-and-forget wrapper around writeAdminAssetSnapshot used by every admin
 * mutation route. The snapshot is a debug/backup file (the DB is the source
 * of truth), so admins should never have to wait for it: we let the request
 * return immediately and run the SELECT * + JSON write in the background.
 *
 * Errors are logged but never thrown so an unhandled rejection can't crash
 * the process. Concurrent admin actions queue safely on top of each other —
 * each call writes its own snapshot independently and the last one wins,
 * which matches the existing semantics.
 */
function scheduleAdminAssetSnapshot(): void {
  void writeAdminAssetSnapshot().catch((err) => {
    logger.error({ err }, "[admin] background snapshot write failed");
  });
}

const CreditZoomBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const CreditTonBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const AddPlanetsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "NOVA", "PLASMA", "GOLD", "MUSHROOM", "SUN"]),
});

const UnlockSlotsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
});

const UnlockWhiteCollectionBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const UnlockEarthCollectionBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const UnlockBlackCollectionBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const UnlockSupernovaCollectionBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const RevokeCollectionBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const GrantAutoTapBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

const GlobalBonusBody = z.object({
  adminId: z.string(),
  amount: z.number().positive(),
});
const GlobalRemoveBody = z.object({
  adminId: z.string(),
  amount: z.number().positive(),
});
const GlobalStardustBody = z.object({
  adminId: z.string(),
  amount: z.number().positive(),
});
const GlobalTonBody = z.object({
  adminId: z.string(),
  amount: z.number().positive(),
});
const GlobalRedStarBody = z.object({
  adminId: z.string(),
  amount: z.number().int().positive(),
});
const RepairTasksBody = z.object({ adminId: z.string() });

const RemoveZoomBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const CreditRedStarBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const RemoveRedStarBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const RemovePlanetsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "MYTHIC", "NOVA", "PLASMA", "GOLD", "MUSHROOM", "SUN"]),
});

const RemoveSlotsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
});

const GrantEquipmentBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  category: z.enum(["HELMET", "JETPACK", "HAT", "SCANNER"]),
  rarity: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "PLASMA", "MYTHIC"]),
});

router.post("/admin/credit-zoom", async (req, res) => {
  const parsed = CreditZoomBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: amount, referralCount: 0, balanceEpoch: 1 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          zoomBalance: sql`${usersTable.zoomBalance} + ${amount}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        },
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_reward",
      delta: amount,
      currency: "zoom",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/credit-ton", async (req, res) => {
  const parsed = CreditTonBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, tonBalance: amount, balanceEpoch: 1 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          tonBalance: sql`${usersTable.tonBalance} + ${amount}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        },
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_reward",
      delta: amount,
      currency: "ton",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/add-planets", async (req, res) => {
  const parsed = AddPlanetsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count, planetType } = parsed.data;
  try {
    if (planetType === "SUN") {
      // Grant SUN: set bonus_sun flag, bump sun_count by `count` (multiple
      // suns stack the multiplier), and bump balance_epoch so the client
      // discards any cached state and re-applies the grant on next sync.
      await db
        .insert(usersTable)
        .values({ telegramId, zoomBalance: 0, referralCount: 0, bonusSun: true, sunCount: count, balanceEpoch: 1 })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: {
            bonusSun: true,
            sunCount: sql`GREATEST(${usersTable.sunCount}, 0) + ${count}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          },
        });
    } else if (planetType === "BASIC") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusBasic: count, totalObtainedBasic: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusBasic: sql`${usersTable.bonusBasic} + ${count}`, totalObtainedBasic: sql`${usersTable.totalObtainedBasic} + ${count}` } });
    } else if (planetType === "RARE") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusRare: count, totalObtainedRare: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusRare: sql`${usersTable.bonusRare} + ${count}`, totalObtainedRare: sql`${usersTable.totalObtainedRare} + ${count}` } });
    } else if (planetType === "EPIC") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusEpic: count, totalObtainedEpic: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusEpic: sql`${usersTable.bonusEpic} + ${count}`, totalObtainedEpic: sql`${usersTable.totalObtainedEpic} + ${count}` } });
    } else if (planetType === "MYTHIC") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusMythic: count, totalObtainedMythic: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusMythic: sql`${usersTable.bonusMythic} + ${count}`, totalObtainedMythic: sql`${usersTable.totalObtainedMythic} + ${count}` } });
    } else if (planetType === "NOVA") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusNova: count, totalObtainedNova: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusNova: sql`${usersTable.bonusNova} + ${count}`, totalObtainedNova: sql`${usersTable.totalObtainedNova} + ${count}` } });
    } else if (planetType === "PLASMA") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusPlasma: count, totalObtainedPlasma: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusPlasma: sql`${usersTable.bonusPlasma} + ${count}`, totalObtainedPlasma: sql`${usersTable.totalObtainedPlasma} + ${count}` } });
    } else if (planetType === "GOLD") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusGold: count, totalObtainedGold: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusGold: sql`${usersTable.bonusGold} + ${count}`, totalObtainedGold: sql`${usersTable.totalObtainedGold} + ${count}` } });
    } else if (planetType === "MUSHROOM") {
      // MUSHROOM is handled like other rarities — stored in planets_json
      // (client-side grants flow). We bump balanceEpoch so the client
      // re-syncs grants and the Mushroom planet materialises.
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusMushroom: count, balanceEpoch: 1 })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: {
          bonusMushroom: sql`COALESCE(${usersTable.bonusMushroom}, 0) + ${count}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        } });
    }
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/unlock-slots", async (req, res) => {
  const parsed = UnlockSlotsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, bonusSlots: count })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: { bonusSlots: sql`${usersTable.bonusSlots} + ${count}` },
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/grant-auto-tap", async (req, res) => {
  const parsed = GrantAutoTapBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, hasAutoTap: true, balanceEpoch: 1 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          hasAutoTap: true,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        },
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/grant-auto-tap] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/unlock-white-collection", async (req, res) => {
  const parsed = UnlockWhiteCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    const [user] = await db
      .select({ bundles: usersTable.whiteCollectionBundles })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    if ((user?.bundles ?? 0) >= 10) {
      return res.status(400).json({ error: "User already owns max 10 White Collection bundles" });
    }
    await db
      .update(usersTable)
      .set({
        whiteCollectionUnlocked: true,
        whiteCollectionBundles: sql`${usersTable.whiteCollectionBundles} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/unlock-white-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/unlock-earth-collection", async (req, res) => {
  const parsed = UnlockEarthCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        earthCollectionUnlocked: true,
        earthCollectionBundles: sql`${usersTable.earthCollectionBundles} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/unlock-earth-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/revoke-white-collection", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        whiteCollectionUnlocked: false,
        whiteCollectionBundles: 0,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/revoke-white-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/revoke-earth-collection", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        earthCollectionUnlocked: false,
        earthCollectionBundles: 0,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/revoke-earth-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/unlock-black-collection", async (req, res) => {
  const parsed = UnlockBlackCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        blackCollectionUnlocked: true,
        blackCollectionBundles: sql`${usersTable.blackCollectionBundles} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/unlock-black-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/revoke-black-collection", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        blackCollectionUnlocked: false,
        blackCollectionBundles: 0,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/revoke-black-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/unlock-supernova-collection", async (req, res) => {
  const parsed = UnlockSupernovaCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        supernovaCollectionUnlocked: true,
        supernovaCollectionBundles: sql`${usersTable.supernovaCollectionBundles} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/unlock-supernova-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/revoke-supernova-collection", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          supernovaCollectionUnlocked: false,
          supernovaCollectionBundles: 0,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, telegramId));
      // Stop TON accrual: remove every supernova planet row for this user
      // so the client-side `liveTonBalance` loop has nothing to accumulate.
      await tx
        .delete(collectionPlanetsTable)
        .where(
          and(
            eq(collectionPlanetsTable.telegramId, telegramId),
            eq(collectionPlanetsTable.kind, "supernova"),
          ),
        );
    });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/revoke-supernova-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/grant-v1", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        bonusV1: sql`${usersTable.bonusV1} + 1`,
        totalCraftedV1: sql`${usersTable.totalCraftedV1} + 1`,
        totalObtainedV1: sql`${usersTable.totalObtainedV1} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/grant-v1] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin grant V1 NFT Platinum Edition: bypassa il cap globale di 5
// (gli admin grant sono override intenzionali, stesso pattern di grant-v1).
// Incrementa bonus_v1_nft_platinum così il client materializza il pianeta
// V1_NFT in inventory tramite applyGrants alla prossima sync.
router.post("/admin/grant-v1-nft", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        bonusV1NftPlatinum: sql`${usersTable.bonusV1NftPlatinum} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/grant-v1-nft] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/global-bonus", async (req, res) => {
  const parsed = GlobalBonusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} + ${amount}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/global-remove", async (req, res) => {
  const parsed = GlobalRemoveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        zoomBalance: sql`GREATEST(0, ${usersTable.zoomBalance} - ${amount})`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/global-stardust", async (req, res) => {
  const parsed = GlobalStardustBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} + ${amount}`,
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/global-ton", async (req, res) => {
  const parsed = GlobalTonBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        tonBalance: sql`${usersTable.tonBalance} + ${amount}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/global-redstar", async (req, res) => {
  const parsed = GlobalRedStarBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        redStarBalance: sql`${usersTable.redStarBalance} + ${amount}`,
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// ----- REPAIR EARN TASKS -----
// Removes ORPHANED planet-milestone claims: a task marked claimed whose live
// build progress is now below its threshold (e.g. left over after a season
// reset zeroed the crafting counters, so the UI shows "CLAIMED" next to a
// near-zero progress bar). It NEVER removes a claim that is still backed by
// enough progress, so a real reward can never be re-claimed — safe to run at
// any time. Sponsor claims (one-time channel joins) are always preserved.
router.post("/admin/repair-tasks", async (req, res) => {
  const parsed = RepairTasksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  if (!isAdmin(parsed.data.adminId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const builtSum = sql`(
      ${usersTable.totalCraftedBasic} + ${usersTable.totalCraftedRare} +
      ${usersTable.totalCraftedEpic}  + ${usersTable.totalCraftedMythic} +
      ${usersTable.totalCraftedGold}  + ${usersTable.totalCraftedV1}
    )`;
    const thresholdCase = sql.join(
      PLANET_TASKS.map((t) => sql`WHEN ${t.id} THEN ${t.threshold}`),
      sql` `,
    );
    const affected = await db
      .update(usersTable)
      .set({
        claimedTasks: sql`COALESCE((
          SELECT string_agg(t, ',')
          FROM unnest(string_to_array(NULLIF(${usersTable.claimedTasks}, ''), ',')) AS t
          WHERE NOT (t = ANY(${planetIdsArr()}))
             OR ${builtSum} >= (CASE t ${thresholdCase} ELSE 0 END)
        ), '')`,
      })
      .where(sql`string_to_array(${usersTable.claimedTasks}, ',') && ${planetIdsArr()}`)
      .returning({ id: usersTable.telegramId });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true, affected: affected.length });
  } catch (err) {
    console.error("[admin/repair-tasks]", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-ton", async (req, res) => {
  const parsed = CreditTonBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        tonBalance: sql`GREATEST(0, ${usersTable.tonBalance} - ${amount})`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_remove",
      delta: -amount,
      currency: "ton",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-zoom", async (req, res) => {
  const parsed = RemoveZoomBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        zoomBalance: sql`GREATEST(0, ${usersTable.zoomBalance} - ${amount})`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_remove",
      delta: -amount,
      currency: "zoom",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/credit-redstar", async (req, res) => {
  const parsed = CreditRedStarBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, redStarBalance: amount })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          redStarBalance: sql`${usersTable.redStarBalance} + ${amount}`,
        },
      });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-redstar", async (req, res) => {
  const parsed = RemoveRedStarBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({
        redStarBalance: sql`GREATEST(0, ${usersTable.redStarBalance} - ${amount})`,
      })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-planets", async (req, res) => {
  const parsed = RemovePlanetsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count, planetType } = parsed.data;
  try {
    if (planetType === "SUN") {
      await db.update(usersTable).set({ bonusSun: false, sunCount: 0 }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "BASIC") {
      await db.update(usersTable).set({ bonusBasic: sql`GREATEST(0, ${usersTable.bonusBasic} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "RARE") {
      await db.update(usersTable).set({ bonusRare: sql`GREATEST(0, ${usersTable.bonusRare} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "EPIC") {
      await db.update(usersTable).set({ bonusEpic: sql`GREATEST(0, ${usersTable.bonusEpic} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "MYTHIC") {
      await db.update(usersTable).set({ bonusMythic: sql`GREATEST(0, ${usersTable.bonusMythic} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "NOVA") {
      await db.update(usersTable).set({ bonusNova: sql`GREATEST(0, ${usersTable.bonusNova} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "PLASMA") {
      await db.update(usersTable).set({ bonusPlasma: sql`GREATEST(0, ${usersTable.bonusPlasma} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "GOLD") {
      await db.update(usersTable).set({ bonusGold: sql`GREATEST(0, ${usersTable.bonusGold} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "MUSHROOM") {
      await db.update(usersTable).set({ bonusMushroom: sql`GREATEST(0, COALESCE(${usersTable.bonusMushroom}, 0) - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    }
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-slots", async (req, res) => {
  const parsed = RemoveSlotsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({ bonusSlots: sql`GREATEST(0, ${usersTable.bonusSlots} - ${count})` })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// ─── EQUIPMENT GRANT ────────────────────────────────────────────────────────
// Admin mints a single equipment item directly into the user's inventory.
// The new item is appended to the existing `equipment_json` array; the
// server computes the canonical rate from EQUIPMENT_RATE_SERVER and bumps
// `equipment_updated_at_ms` so the stale-write fence on the client-side
// /equipment/save won't accidentally overwrite the new item.
router.post("/admin/grant-equipment", async (req, res) => {
  const parsed = GrantEquipmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { category, rarity } = parsed.data;
  const rate = EQUIPMENT_RATE_SERVER[category][rarity];
  const now = Date.now();
  const newItem = {
    id: `eq-${category.toLowerCase()}-${rarity.toLowerCase()}-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    category,
    rarity,
    rate,
    createdAt: now,
    color: rarity === "BASIC" ? "#9aa4b2"
      : rarity === "RARE" ? "#4fc3f7"
      : rarity === "EPIC" ? "#ab47bc"
      : rarity === "GOLD" ? "#ffd700"
      : rarity === "PLASMA" ? "#00e676"
      : "#ff1744",
  };
  try {
    const updatedRows = await db
      .update(usersTable)
      .set({
        equipmentJson: sql`jsonb_insert(coalesce(${usersTable.equipmentJson}, '[]'::jsonb), '{999999}', ${JSON.stringify(newItem)}::jsonb, true)`,
        equipmentUpdatedAtMs: now,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        equipmentJson: usersTable.equipmentJson,
      });
    const stored = updatedRows[0];
    if (!stored) return res.status(404).json({ error: "User not found" });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true, item: newItem, count: Array.isArray(stored.equipmentJson) ? stored.equipmentJson.length : 0 });
  } catch (err) {
    logger.error({ err }, "[admin/grant-equipment] database error");
    res.status(500).json({ error: "Database error" });
  }
});

// ----- DISABLE / ENABLE USER (anti-abuse freeze) -----
// Sets the `is_disabled` flag on a user. A disabled user keeps full
// read access to the app but is locked out of every money-impacting
// flow:
//   • POST /market/list   → 403
//   • POST /market/buy    → 403
//   • POST /withdrawals/request → 403
// Used to freeze referral-farm alts (and the host who runs them) the
// moment we catch them, so any ZOOM they accumulated cannot be turned
// into TON while the case is reviewed.
const ToggleUserBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

router.post("/admin/disable-user", async (req, res) => {
  const parsed = ToggleUserBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  try {
    const updated = await db
      .update(usersTable)
      .set({
        isDisabled: true,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ id: usersTable.telegramId });
    if (updated.length === 0) return res.status(404).json({ error: "User not found" });
    logger.warn({ adminId: parsed.data.adminId, target: telegramId }, "[admin] user disabled");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin/disable-user] db error");
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/enable-user", async (req, res) => {
  const parsed = ToggleUserBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  try {
    const updated = await db
      .update(usersTable)
      .set({
        isDisabled: false,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ id: usersTable.telegramId });
    if (updated.length === 0) return res.status(404).json({ error: "User not found" });
    logger.warn({ adminId: parsed.data.adminId, target: telegramId }, "[admin] user re-enabled");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[admin/enable-user] db error");
    res.status(500).json({ error: "Database error" });
  }
});

// Bulk disable: takes a list of telegramIds (or @usernames) and flips
// is_disabled=true on each one in a single transaction. Used by the
// "BAN NEBO + 17 ALTS" one-click button in the admin panel. Returns
// per-id status so the UI can show how many were actually frozen.
const BulkDisableBody = z.object({
  adminId: z.string(),
  telegramIds: z.array(z.string().min(1)).min(1).max(100),
});

router.post("/admin/stardust/total", async (req, res) => {
  const { adminId } = req.body as { adminId?: string };
  if (!isAdmin(adminId ?? "")) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const [global] = await db
      .select({ valueNum: appSettingsTable.valueNum })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "stardust_global_total"))
      .limit(1);
    const [sumRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${usersTable.stardustBalance}), 0)` })
      .from(usersTable);
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(sql`${usersTable.stardustBalance} > 0`);
    res.json({
      globalCounter: Number(global?.valueNum ?? 0),
      sumFromUsers: Number(sumRow?.total ?? 0),
      holdersWithBalance: Number(countRow?.count ?? 0),
    });
  } catch (err) {
    logger.error(err, "[admin/stardust/total] error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/bulk-disable", async (req, res) => {
  const parsed = BulkDisableBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const resolved: { input: string; telegramId: string | null }[] = [];
  for (const input of parsed.data.telegramIds) {
    resolved.push({ input, telegramId: await resolveTargetTelegramId(input) });
  }
  const ids = resolved.map((r) => r.telegramId).filter((x): x is string => !!x);
  if (ids.length === 0) return res.json({ ok: true, disabled: 0, results: resolved });

  try {
    const updated = await db
      .update(usersTable)
      .set({
        isDisabled: true,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(inArray(usersTable.telegramId, ids))
      .returning({ id: usersTable.telegramId });
    const disabledSet = new Set(updated.map((u) => u.id));
    const results = resolved.map((r) => ({
      input: r.input,
      telegramId: r.telegramId,
      disabled: r.telegramId ? disabledSet.has(r.telegramId) : false,
    }));
    logger.warn({ adminId: parsed.data.adminId, count: updated.length }, "[admin] bulk-disable");
    res.json({ ok: true, disabled: updated.length, results });
  } catch (err) {
    logger.error({ err }, "[admin/bulk-disable] db error");
    res.status(500).json({ error: "Database error" });
  }
});

// ----- STARDUST -----
const CreditStardustBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().int().positive(),
});

router.post("/admin/credit-stardust", async (req, res) => {
  const parsed = CreditStardustBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    // We touch ONLY stardust_balance — never stardust_today / stardust_day_key.
    // The today counter is for the per-day collection cap on /stardust/collect
    // and admin grants intentionally bypass that cap (the same way wheel
    // prizes and HOF rewards do); leaving today unchanged means the player's
    // legitimate cap budget for the day is preserved. Bumping balance_epoch
    // forces the next client sync to refresh the visible stardust counter
    // immediately so the user sees the credit without reopening the app.
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, stardustBalance: amount, balanceEpoch: 1 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          stardustBalance: sql`${usersTable.stardustBalance} + ${amount}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        },
      });
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_reward",
      delta: amount,
      currency: "stardust",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    console.error("[admin/credit-stardust]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Mirror of credit-stardust but subtracts. Uses GREATEST(balance - amount, 0)
// so the balance is clamped at zero — admins can't push it negative even by
// mistake. Like the credit endpoint, leaves stardust_today / stardust_day_key
// alone (admin actions bypass the per-day cap accounting) and bumps
// balance_epoch so the user's next sync picks up the new value immediately.
router.post("/admin/remove-stardust", async (req, res) => {
  const parsed = CreditStardustBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { amount } = parsed.data;
  try {
    // .returning() lets us detect whether the user row actually exists.
    // Without this, an UPDATE on a non-existent telegramId would silently
    // affect 0 rows and we'd return {ok:true}, hiding admin typos.
    const updated = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`GREATEST(${usersTable.stardustBalance} - ${amount}, 0)`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ id: usersTable.telegramId });
    if (updated.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_remove",
      delta: -amount,
      currency: "stardust",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    console.error("[admin/remove-stardust]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----- SPINS -----
const SpinsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
});

router.post("/admin/credit-spins", async (req, res) => {
  const parsed = SpinsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count } = parsed.data;
  try {
    await db.insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, wheelSpins: count })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: { wheelSpins: sql`${usersTable.wheelSpins} + ${count}` },
      });
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_reward",
      delta: count,
      currency: "spins",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    console.error("[admin/credit-spins]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----- MARKETPLACE FORCE-DELIST -----
const ForceDelistBody = z.object({
  adminId: z.string(),
  listingId: z.number().int().positive(),
});

router.post("/admin/force-delist", async (req, res) => {
  const parsed = ForceDelistBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db
      .update(marketListingsTable)
      .set({ status: "delisted" })
      .where(
        and(
          eq(marketListingsTable.id, parsed.data.listingId),
          eq(marketListingsTable.status, "active"),
        ),
      )
      .returning();
    if (result.length === 0) return res.status(404).json({ error: "Listing not found or already delisted" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/force-delist]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── CLEAR EQUIPMENT MARKETPLACE ────────────────────────────────────────────
// Admin-only bulk delist: mark every active equipment listing as 'delisted'
// and sync the seller's equipment_json so the items return to inventory.
// Does NOT create or grant equipment — it only undoes existing listings.
router.post("/admin/clear-equipment-market", async (req, res) => {
  const ClearMarketBody = z.object({ adminId: z.string() });
  const parsed = ClearMarketBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = await client.query(
      `SELECT id, seller_telegram_id, equipment_id
       FROM market_listings
       WHERE kind = 'equipment' AND status = 'active'
       FOR UPDATE`
    );
    const listings = rows.rows as Array<{ id: number; seller_telegram_id: string; equipment_id: string }>;

    if (listings.length === 0) {
      await client.query("COMMIT");
      res.json({ ok: true, cleared: 0 });
      return;
    }

    const nowMs = Date.now();
    // 1) bulk mark listings as delisted
    const listingIds = listings.map(l => l.id);
    await client.query(
      `UPDATE market_listings
       SET status = 'delisted'
       WHERE id = ANY($1::int[])
         AND kind = 'equipment'
         AND status = 'active'`,
      [listingIds]
    );

    // 2) per-seller group + rebuild equipment_json via jsonb aggregation
    const bySeller = new Map<string, string[]>();
    for (const l of listings) {
      const arr = bySeller.get(l.seller_telegram_id) ?? [];
      arr.push(l.equipment_id);
      bySeller.set(l.seller_telegram_id, arr);
    }

    for (const [sellerId, eqIds] of bySeller) {
      await client.query(
        `UPDATE users
         SET equipment_json = COALESCE(
           (SELECT jsonb_agg(
              CASE
                WHEN e->>'id' = ANY($2::text[])
                  THEN (e - 'serverListingId' - 'marketPrice') || jsonb_build_object('isListedInMarket', false)
                ELSE e
              END
            )
            FROM jsonb_array_elements(equipment_json) e),
           '[]'::jsonb
         ),
         equipment_updated_at_ms = GREATEST(equipment_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [sellerId, eqIds, nowMs]
      );
    }

    await client.query("COMMIT");
    console.log(`[admin/clear-equipment-market] Cleared ${listings.length} equipment listings`);
    res.json({ ok: true, cleared: listings.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[admin/clear-equipment-market] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// ─── CLEAR PLANET MARKETPLACE ───────────────────────────────────────────────
// Admin-only bulk delist: mark every active planet listing as 'delisted'
// and sync the seller's planets_json so the items return to inventory.
// Mirrors clear-equipment-market but for kind='planet'.
router.post("/admin/clear-planet-market", async (req, res) => {
  const ClearMarketBody = z.object({ adminId: z.string() });
  const parsed = ClearMarketBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = await client.query(
      `SELECT id, seller_telegram_id, planet_id
       FROM market_listings
       WHERE kind = 'planet' AND status = 'active'
       FOR UPDATE`
    );
    const listings = rows.rows as Array<{ id: number; seller_telegram_id: string; planet_id: string }>;

    if (listings.length === 0) {
      await client.query("COMMIT");
      res.json({ ok: true, cleared: 0 });
      return;
    }

    const nowMs = Date.now();
    // 1) bulk mark listings as delisted
    const listingIds = listings.map(l => l.id);
    await client.query(
      `UPDATE market_listings
       SET status = 'delisted'
       WHERE id = ANY($1::int[])
         AND kind = 'planet'
         AND status = 'active'`,
      [listingIds]
    );

    // 2) per-seller group + rebuild planets_json via jsonb aggregation
    const bySeller = new Map<string, string[]>();
    for (const l of listings) {
      const arr = bySeller.get(l.seller_telegram_id) ?? [];
      arr.push(l.planet_id);
      bySeller.set(l.seller_telegram_id, arr);
    }

    for (const [sellerId, planetIds] of bySeller) {
      await client.query(
        `UPDATE users
         SET planets_json = COALESCE(
           (SELECT jsonb_agg(
              CASE
                WHEN p->>'id' = ANY($2::text[])
                  THEN (p - 'serverListingId' - 'marketPrice') || jsonb_build_object('isListedInMarket', false)
                ELSE p
              END
            )
            FROM jsonb_array_elements(planets_json) p),
           '[]'::jsonb
         ),
         planets_updated_at_ms = GREATEST(planets_updated_at_ms, $3::bigint)
         WHERE telegram_id = $1`,
        [sellerId, planetIds, nowMs]
      );
    }

    await client.query("COMMIT");
    console.log(`[admin/clear-planet-market] Cleared ${listings.length} planet listings`);
    res.json({ ok: true, cleared: listings.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[admin/clear-planet-market] error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// ─── FORCE MERCHANT SPAWN ────────────────────────────────────────────────
// Overrides the global merchant timer so the Space Merchant appears
// immediately for all users. Next auto-spawn will resume normally
// after the forced visit expires (15 min window).
router.post("/admin/force-merchant-spawn", async (req, res) => {
  const parsed = z.object({ adminId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const now = Date.now();
    const expiresAtMs = now + 15 * 60 * 1000;
    const nextAtMs = null;
    const valueText = JSON.stringify({ nextAtMs, expiresAtMs });
    await db
      .insert(appSettingsTable)
      .values({ key: "merchant.global", valueText, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueText, updatedAt: new Date() },
      });
    res.json({ ok: true, expiresAt: new Date(expiresAtMs).toISOString() });
  } catch (err) {
    console.error("[admin/force-merchant-spawn] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-spins", async (req, res) => {
  const parsed = SpinsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });
  const { count } = parsed.data;
  try {
    await db.update(usersTable)
      .set({ wheelSpins: sql`GREATEST(0, ${usersTable.wheelSpins} - ${count})` })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    res.json({ ok: true });
    recordHistoryAsync({
      telegramId,
      kind: "admin_remove",
      delta: -count,
      currency: "spins",
      meta: { adminId: parsed.data.adminId },
    });
  } catch (err) {
    console.error("[admin/remove-spins]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----- RESET SEASON -----
const ResetSeasonBody = z.object({ adminId: z.string() });

router.post("/admin/reset-season", async (req, res) => {
  const parsed = ResetSeasonBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  try {
    await db.update(usersTable).set({
      zoomBalance: 0,
      balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      totalCraftedBasic: 0,
      totalCraftedRare: 0,
      totalCraftedEpic: 0,
      totalCraftedMythic: 0,
      totalCraftedGold: 0,
      totalCraftedV1: 0,
      claimedMilestones: "",
      // Strip only the seasonal planet-milestone claims; keep sponsor claims.
      claimedTasks: sql`COALESCE((
        SELECT string_agg(t, ',')
        FROM unnest(string_to_array(NULLIF(${usersTable.claimedTasks}, ''), ',')) AS t
        WHERE NOT (t = ANY(${planetIdsArr()}))
      ), '')`,
    });
    const epoch = Date.now();
    await db.insert(appSettingsTable)
      .values({ key: "season_epoch", valueNum: epoch, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { valueNum: epoch, updatedAt: new Date() },
      });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true, epoch });
  } catch (err) {
    console.error("[admin/reset-season]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----- MARK TON TRANSACTION COMPLETED (recovery) -----
const MarkTonBody = z.object({
  adminId: z.string(),
  txnId: z.number().int().positive(),
});

router.post("/admin/mark-ton-completed", async (req, res) => {
  const parsed = MarkTonBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.update(transactionsTable)
      .set({ status: "completed" })
      .where(and(
        eq(transactionsTable.id, parsed.data.txnId),
        sql`${transactionsTable.status} <> 'completed'`,
      ))
      .returning({ id: transactionsTable.id, status: transactionsTable.status, tonAmount: transactionsTable.tonAmount });
    res.json({ ok: true, updated: result });
  } catch (err) {
    console.error("[admin/mark-ton-completed]", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ----- ADMIN: reconcile referral counts -----
// One-shot data fix: rewrite each user's referral_count to the actual number
// of users that have them as referred_by. Does NOT touch zoom_balance or
// claimed_milestones — bonuses already paid out stay with the users.
router.post("/admin/reconcile-referrals", async (req, res) => {
  const { adminId } = (req.body ?? {}) as { adminId?: string };
  if (!adminId || !isAdmin(adminId)) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }
  try {
    const beforeRow = await db.execute(sql`SELECT COALESCE(SUM(referral_count), 0)::int AS total FROM users`);
    const before = Number((beforeRow as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0);

    // Reset everyone to 0 first, then set to actual count for users who
    // really have referred anyone. Keeps accounting trivially correct.
    await db.execute(sql`UPDATE users SET referral_count = 0 WHERE referral_count <> 0`);
    await db.execute(sql`
      UPDATE users u
      SET referral_count = actual.cnt
      FROM (
        SELECT referred_by AS rid, COUNT(*)::int AS cnt
        FROM users
        WHERE referred_by IS NOT NULL
        GROUP BY referred_by
      ) actual
      WHERE u.telegram_id = actual.rid
    `);

    const afterRow = await db.execute(sql`SELECT COALESCE(SUM(referral_count), 0)::int AS total FROM users`);
    const after = Number((afterRow as unknown as { rows: { total: number }[] }).rows[0]?.total ?? 0);

    console.log(`[admin/reconcile-referrals] before=${before} after=${after} delta=${after - before}`);
    res.json({ ok: true, before, after, delta: after - before });
  } catch (err) {
    console.error("[admin/reconcile-referrals]", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

/**
 * Reconcile stuck Stars purchases by pulling the bot's actual Stars-payment
 * history from Telegram (`getStarTransactions`) and crediting any pending DB
 * rows whose `txnId` (encoded in `invoice_payload`) matches a real payment.
 *
 * Use this when the webhook didn't fire (or fired but failed) and users have
 * paid Stars without receiving their item. Idempotent: only flips
 * `pending` → `completed` and credits exactly once per row, gated by the
 * existing atomic `UPDATE ... WHERE status='pending'` semantics in the
 * crediting path. Never double-credits a completed row.
 */
router.get("/admin/webhook-info", async (req, res) => {
  if (!req.tgUser || !isAdmin(req.tgUser.id)) return res.status(403).json({ error: "Forbidden" });

  const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
  if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set" });

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await r.json() as { ok?: boolean; description?: string };
    if (!data?.ok) {
      return res.status(502).json({ ok: false, error: data?.description || "Telegram getWebhookInfo failed", info: data });
    }
    return res.json({ ok: true, info: data });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/admin/reconcile-stars", async (req, res) => {
  const adminId = (req.body?.adminId as string) || "";
  if (!isAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });

  const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
  if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN not set" });

  // Lazy-import to avoid circular dep at module load.
  const { reconcilePendingStarPayment } = await import("./stars-reconcile");

  type StarsTx = {
    id: string;
    date: number;
    source?: { transaction_type?: string; invoice_payload?: string; user?: { id: number } };
    amount?: number;
  };

  const collected: StarsTx[] = [];
  let offset = 0;
  // Telegram returns up to 100 per page. Walk forward until we get a short page.
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getStarTransactions?limit=100&offset=${offset}`);
    const data = await r.json() as { ok: boolean; result?: { transactions?: StarsTx[] } };
    const page = data?.result?.transactions || [];
    if (page.length === 0) break;
    collected.push(...page);
    if (page.length < 100) break;
    offset += page.length;
  }

  const results: Array<{ txnId: number; status: string; reason?: string }> = [];
  for (const t of collected) {
    if (t.source?.transaction_type !== "invoice_payment") continue;
    const payload = t.source?.invoice_payload;
    if (!payload) continue;
    let parsed: { txnId?: number; itemId?: string; telegramId?: string };
    try { parsed = JSON.parse(payload); } catch { continue; }
    if (typeof parsed.txnId !== "number" || !parsed.itemId || !parsed.telegramId) continue;
    const r = await reconcilePendingStarPayment(parsed.txnId, parsed.itemId, parsed.telegramId, t.id);
    results.push({ txnId: parsed.txnId, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  }

  res.json({
    ok: true,
    starTxnsScanned: collected.length,
    invoiceMatches: results.length,
    credited: results.filter((r) => r.status === "credited").length,
    alreadyDone: results.filter((r) => r.status === "already_done").length,
    notFound: results.filter((r) => r.status === "not_found").length,
    errors: results.filter((r) => r.status === "error"),
    results,
  });
});

/**
 * Anti-cheat purge: rimuove i referral fake da un utente sospetto e/o azzera
 * i suoi contatori. Operazione in singola transazione, idempotente.
 *
 * Parametri:
 *   - telegramId: l'utente sospetto da sgonfiare
 *   - purgeReferralsSinceMs (opzionale): se presente, scollega TUTTI i referral
 *     che hanno questo utente come referrer e che sono stati creati a partire
 *     da questo timestamp (in ms). Tipicamente l'inizio della "burst" sospetta.
 *   - zeroTotal (opzionale): se true, azzera referral_count.
 *   - zeroDaily (opzionale): se true, azzera daily_referral_count e
 *     daily_referral_day_key (lo toglie dalla competizione HOF di oggi).
 */
router.post("/admin/anti-cheat-purge-referrals", async (req, res) => {
  const Body = z.object({
    adminId: z.string(),
    telegramId: z.string().min(1),
    purgeReferralsSinceMs: z.number().int().positive().optional(),
    zeroTotal: z.boolean().optional(),
    zeroDaily: z.boolean().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  // Defense-in-depth: requireTelegramAuth (PROTECTED_ROUTES, bindField:"adminId")
  // already enforces that the verified Telegram initData id equals body.adminId.
  // This explicit check guarantees the same invariant even if the route were ever
  // accidentally removed from PROTECTED_ROUTES.
  if (!req.tgUser || req.tgUser.id !== parsed.data.adminId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { telegramId, purgeReferralsSinceMs, zeroTotal, zeroDaily } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      let unlinked = 0;
      if (purgeReferralsSinceMs) {
        const cutoff = new Date(purgeReferralsSinceMs);
        const r = await tx.execute(sql`
          UPDATE users
          SET referred_by = NULL
          WHERE referred_by = ${telegramId}
            AND created_at >= ${cutoff}
        `);
        unlinked = (r as { rowCount?: number }).rowCount ?? 0;
      }
      const setClauses: Record<string, unknown> = {};
      if (zeroTotal) setClauses["referralCount"] = 0;
      if (zeroDaily) {
        setClauses["dailyReferralCount"] = 0;
        setClauses["dailyReferralDayKey"] = null;
      }
      if (Object.keys(setClauses).length > 0) {
        await tx.update(usersTable).set(setClauses).where(eq(usersTable.telegramId, telegramId));
      }
      return { unlinked };
    });
    logger.info({ telegramId, ...result, zeroTotal, zeroDaily }, "[admin] anti-cheat purge applied");
    scheduleAdminAssetSnapshot();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, telegramId }, "[admin] anti-cheat purge failed");
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * Audit a user's referrals: returns total / today counts plus how many of them
 * are "fake" (the referred user has zoom_balance = 0 AND balance_epoch = 0,
 * i.e. the account exists but has never produced any in-app activity — typical
 * signal of a bot signup farm). Read-only, safe to call freely.
 */
router.post("/admin/referrals/audit", async (req, res) => {
  const Body = z.object({
    adminId: z.string(),
    target: z.string().min(1),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  if (!req.tgUser || req.tgUser.id !== parsed.data.adminId) return res.status(403).json({ error: "Forbidden" });

  const targetId = await resolveTargetTelegramId(parsed.data.target);
  if (!targetId) return res.status(404).json({ error: "Target not found" });

  try {
    const countsRow = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_refs,
        COUNT(*) FILTER (WHERE created_at::date = (NOW() AT TIME ZONE 'UTC')::date)::int AS today_refs,
        COUNT(*) FILTER (WHERE zoom_balance = 0 AND balance_epoch = 0)::int AS total_fake,
        COUNT(*) FILTER (
          WHERE created_at::date = (NOW() AT TIME ZONE 'UTC')::date
            AND zoom_balance = 0 AND balance_epoch = 0
        )::int AS today_fake
      FROM users WHERE referred_by = ${targetId}
    `);
    const counts = (countsRow as unknown as {
      rows: { total_refs: number; today_refs: number; total_fake: number; today_fake: number }[];
    }).rows[0] ?? { total_refs: 0, today_refs: 0, total_fake: 0, today_fake: 0 };

    const [user] = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
        dailyReferralCount: usersTable.dailyReferralCount,
        referralCount: usersTable.referralCount,
        dailyReferralDayKey: usersTable.dailyReferralDayKey,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, targetId))
      .limit(1);

    res.json({
      ok: true,
      targetTelegramId: targetId,
      username: user?.username ?? null,
      firstName: user?.firstName ?? null,
      dailyReferralCount: user?.dailyReferralCount ?? 0,
      referralCount: user?.referralCount ?? 0,
      dailyReferralDayKey: user?.dailyReferralDayKey ?? null,
      counts,
    });
  } catch (err) {
    logger.error({ err, targetId }, "[admin/referrals/audit] failed");
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * Surgical purge of fake referrals for a target user. Unlinks (sets
 * referred_by = NULL) every referred user whose zoom_balance = 0 AND
 * balance_epoch = 0 (never opened the app), within the chosen scope
 * ("today" UTC by default, or "all" time). Decrements the referrer's
 * referral_count and daily_referral_count by the exact unlinked count
 * (clamped at 0). Real referrals (anyone with any balance or epoch
 * activity) are left untouched. Wrapped in a single transaction with
 * SELECT ... FOR UPDATE on the referrer row to prevent races with
 * concurrent referral increments.
 */
router.post("/admin/referrals/purge-fakes", async (req, res) => {
  const Body = z.object({
    adminId: z.string(),
    target: z.string().min(1),
    scope: z.enum(["today", "all"]).default("today"),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  if (!req.tgUser || req.tgUser.id !== parsed.data.adminId) return res.status(403).json({ error: "Forbidden" });

  const targetId = await resolveTargetTelegramId(parsed.data.target);
  if (!targetId) return res.status(404).json({ error: "Target not found" });

  const scope = parsed.data.scope;

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the referrer row so concurrent /referral writes can't race the
      // counter math below.
      await tx.execute(sql`SELECT 1 FROM users WHERE telegram_id = ${targetId} FOR UPDATE`);

      // Count what's about to be unlinked, partitioned so we can decrement
      // both counters precisely (total + today subset).
      const scopeFilter =
        scope === "today"
          ? sql`AND created_at::date = (NOW() AT TIME ZONE 'UTC')::date`
          : sql``;

      const countRow = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE zoom_balance = 0 AND balance_epoch = 0)::int AS fake_total,
          COUNT(*) FILTER (
            WHERE zoom_balance = 0 AND balance_epoch = 0
              AND created_at::date = (NOW() AT TIME ZONE 'UTC')::date
          )::int AS fake_today
        FROM users
        WHERE referred_by = ${targetId} ${scopeFilter}
      `);
      const { fake_total, fake_today } = (countRow as unknown as {
        rows: { fake_total: number; fake_today: number }[];
      }).rows[0] ?? { fake_total: 0, fake_today: 0 };

      // Sever the referral link on the fake accounts.
      const upd = await tx.execute(sql`
        UPDATE users
        SET referred_by = NULL
        WHERE referred_by = ${targetId}
          AND zoom_balance = 0
          AND balance_epoch = 0
          ${scopeFilter}
      `);
      const unlinked = (upd as { rowCount?: number }).rowCount ?? 0;

      // Decrement counters atomically, clamped at 0.
      await tx.execute(sql`
        UPDATE users
        SET
          referral_count = GREATEST(0, COALESCE(referral_count, 0) - ${fake_total}),
          daily_referral_count = GREATEST(0, COALESCE(daily_referral_count, 0) - ${fake_today})
        WHERE telegram_id = ${targetId}
      `);

      return { unlinked, decrementedTotal: fake_total, decrementedDaily: fake_today };
    });

    logger.info({ targetId, scope, ...result }, "[admin] purge fakes applied");
    scheduleAdminAssetSnapshot();
    res.json({ ok: true, targetTelegramId: targetId, scope, ...result });
  } catch (err) {
    logger.error({ err, targetId }, "[admin/referrals/purge-fakes] failed");
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * Send a fake "Withdrawal Paid" message to the configured withdrawals chat /
 * forum topic, using the same exact format the real approval flow posts.
 * Lets the admin verify the bot has channel write access without paying out
 * a real withdrawal. Marked clearly as TEST in the body so it's not mistaken
 * for a real payout if anyone sees it.
 */
router.post("/admin/test-withdrawal-channel", async (req, res) => {
  const adminId = (req.body?.adminId as string) || "";
  if (!isAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });

  const { sendWithdrawalChannelMessage } = await import("../lib/notify");
  const msg =
    `🧪 <b>TEST — Withdrawal Paid</b>\n` +
    `💎 <b>1.2345 TON</b>\n` +
    `👤 User ID: <code>${adminId}</code>\n` +
    `📬 UQAB…cdef\n` +
    `<i>(messaggio di test, ignorare)</i>`;
  const ok = await sendWithdrawalChannelMessage(msg);
  res.json({ ok, sent: ok });
});

// ----- Admin: broadcast Telegram message to all users -----
router.post("/admin/broadcast", async (req, res) => {
  const adminId = (req.body?.adminId as string) || "";
  if (!isAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });
  const text = (req.body?.text as string || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  if (text.length > 4096) return res.status(400).json({ error: "Message too long (max 4096 chars)" });

  const { broadcastBotMessageToAllUsers } = await import("../lib/notify");
  const result = await broadcastBotMessageToAllUsers(text);
  res.json({ ok: true, sent: result.sent, skipped: result.skipped });
});

// ----- PUBLIC: season epoch -----
router.get("/season/epoch", async (_req, res) => {
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "season_epoch")).limit(1);
    const epoch = row?.valueNum ?? 0;
    res.json({ epoch: epoch > 0 ? epoch : DEFAULT_SEASON_EPOCH_MS });
  } catch {
    res.json({ epoch: DEFAULT_SEASON_EPOCH_MS });
  }
});

router.get("/admin/merchant-status", async (req, res) => {
  // Authorize on the cryptographically verified Telegram identity, NOT the
  // spoofable query param. forceStrict in PROTECTED_ROUTES guarantees req.tgUser
  // is populated (or the request was already rejected 401).
  if (!req.tgUser || !isAdmin(req.tgUser.id)) return res.status(403).json({ error: "Forbidden" });
  try {
    const now = Date.now();
    const g = await advanceMerchantGlobal(now);
    if (g.expiresAtMs != null && g.expiresAtMs > now) {
      const remainingSec = Math.max(0, Math.ceil((g.expiresAtMs - now) / 1000));
      return res.json({ active: true, expiresAt: new Date(g.expiresAtMs).toISOString(), remainingSec });
    }
    if (g.nextAtMs != null && g.nextAtMs > now) {
      const remainingSec = Math.max(0, Math.ceil((g.nextAtMs - now) / 1000));
      return res.json({ active: false, nextAt: new Date(g.nextAtMs).toISOString(), remainingSec });
    }
    return res.json({ active: false, nextAt: null, remainingSec: null });
  } catch (err) {
    console.error("[admin/merchant-status] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// ─── STELLA ROSSA COLLECTION ────────────────────────────────────────────────
const UnlockStellaRossaBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
});

router.post("/admin/unlock-stella-rossa-collection", async (req, res) => {
  const parsed = UnlockStellaRossaBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db
      .update(usersTable)
      .set({
        stellaRossaCollectionUnlocked: true,
        stellaRossaCollectionBundles: sql`${usersTable.stellaRossaCollectionBundles} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/unlock-stella-rossa-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/revoke-stella-rossa-collection", async (req, res) => {
  const parsed = RevokeCollectionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const telegramId = await resolveTargetTelegramId(parsed.data.telegramId);
  if (!telegramId) return res.status(404).json({ error: "User not found" });

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          stellaRossaCollectionUnlocked: false,
          stellaRossaCollectionBundles: 0,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, telegramId));
      await tx
        .delete(collectionPlanetsTable)
        .where(
          and(
            eq(collectionPlanetsTable.telegramId, telegramId),
            eq(collectionPlanetsTable.kind, "stella"),
          ),
        );
    });
    scheduleAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/revoke-stella-rossa-collection] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
