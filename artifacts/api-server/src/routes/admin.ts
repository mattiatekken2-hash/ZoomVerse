import { Router } from "express";
import { db, transactionsTable, marketListingsTable } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { and } from "drizzle-orm";
import { sql, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

const router = Router();

const ADMIN_ID = "8144744644";
const ADMIN_ASSET_SNAPSHOT = path.resolve(process.cwd(), "data", "admin-assets.json");

function isAdmin(adminId: string): boolean {
  return adminId === ADMIN_ID;
}

/**
 * Resolves an admin-provided target identifier into a numeric Telegram ID.
 * Accepts either a numeric telegram_id or an @username / username string,
 * looking up the username column we now persist on register/sync.
 * Returns null if the username cannot be matched to any user.
 */
async function resolveTargetTelegramId(input: string): Promise<string | null> {
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
  planetType: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "SUN"]),
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

const RemoveZoomBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  amount: z.number().positive(),
});

const RemovePlanetsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
  planetType: z.enum(["BASIC", "RARE", "EPIC", "GOLD", "SUN"]),
});

const RemoveSlotsBody = z.object({
  adminId: z.string(),
  telegramId: z.string().min(1),
  count: z.number().int().positive(),
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
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusBasic: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusBasic: sql`${usersTable.bonusBasic} + ${count}` } });
    } else if (planetType === "RARE") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusRare: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusRare: sql`${usersTable.bonusRare} + ${count}` } });
    } else if (planetType === "EPIC") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusEpic: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusEpic: sql`${usersTable.bonusEpic} + ${count}` } });
    } else if (planetType === "GOLD") {
      await db.insert(usersTable).values({ telegramId, zoomBalance: 0, referralCount: 0, bonusGold: count })
        .onConflictDoUpdate({ target: usersTable.telegramId, set: { bonusGold: sql`${usersTable.bonusGold} + ${count}` } });
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
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/grant-v1] error:", err);
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
    } else if (planetType === "GOLD") {
      await db.update(usersTable).set({ bonusGold: sql`GREATEST(0, ${usersTable.bonusGold} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
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
      totalCraftedGold: 0,
      claimedMilestones: "",
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

// ----- PUBLIC: season epoch -----
router.get("/season/epoch", async (_req, res) => {
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "season_epoch")).limit(1);
    res.json({ epoch: row?.valueNum ?? 0 });
  } catch {
    res.json({ epoch: 0 });
  }
});

export default router;
