import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

const router = Router();

const ADMIN_ID = "8144744644";
const ADMIN_ASSET_SNAPSHOT = path.resolve(process.cwd(), "data", "admin-assets.json");

function isAdmin(adminId: string): boolean {
  return adminId === ADMIN_ID;
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
  fs.writeFileSync(
    ADMIN_ASSET_SNAPSHOT,
    JSON.stringify({ updatedAt: new Date().toISOString(), users: rows }, null, 2),
    "utf8",
  );
}

const CreditZoomBody = z.object({
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

  const { telegramId, amount } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: amount, referralCount: 0 })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: { zoomBalance: sql`${usersTable.zoomBalance} + ${amount}` },
      });
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/add-planets", async (req, res) => {
  const parsed = AddPlanetsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { telegramId, count, planetType } = parsed.data;
  try {
    if (planetType === "SUN") {
      await db
        .insert(usersTable)
        .values({ telegramId, zoomBalance: 0, referralCount: 0, bonusSun: true })
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: { bonusSun: true },
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
    await writeAdminAssetSnapshot();
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

  const { telegramId, count } = parsed.data;
  try {
    await db
      .insert(usersTable)
      .values({ telegramId, zoomBalance: 0, referralCount: 0, bonusSlots: count })
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: { bonusSlots: sql`${usersTable.bonusSlots} + ${count}` },
      });
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
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
      .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${amount}` });
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-zoom", async (req, res) => {
  const parsed = RemoveZoomBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { telegramId, amount } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({ zoomBalance: sql`GREATEST(0, ${usersTable.zoomBalance} - ${amount})` })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-planets", async (req, res) => {
  const parsed = RemovePlanetsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { telegramId, count, planetType } = parsed.data;
  try {
    if (planetType === "SUN") {
      await db.update(usersTable).set({ bonusSun: false }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "BASIC") {
      await db.update(usersTable).set({ bonusBasic: sql`GREATEST(0, ${usersTable.bonusBasic} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "RARE") {
      await db.update(usersTable).set({ bonusRare: sql`GREATEST(0, ${usersTable.bonusRare} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "EPIC") {
      await db.update(usersTable).set({ bonusEpic: sql`GREATEST(0, ${usersTable.bonusEpic} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    } else if (planetType === "GOLD") {
      await db.update(usersTable).set({ bonusGold: sql`GREATEST(0, ${usersTable.bonusGold} - ${count})` }).where(sql`${usersTable.telegramId} = ${telegramId}`);
    }
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/admin/remove-slots", async (req, res) => {
  const parsed = RemoveSlotsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });

  const { telegramId, count } = parsed.data;
  try {
    await db
      .update(usersTable)
      .set({ bonusSlots: sql`GREATEST(0, ${usersTable.bonusSlots} - ${count})` })
      .where(sql`${usersTable.telegramId} = ${telegramId}`);
    await writeAdminAssetSnapshot();
    res.json({ ok: true });
  } catch (err) {
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
  const { telegramId, count } = parsed.data;
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

router.post("/admin/remove-spins", async (req, res) => {
  const parsed = SpinsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  if (!isAdmin(parsed.data.adminId)) return res.status(403).json({ error: "Forbidden" });
  const { telegramId, count } = parsed.data;
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
    await writeAdminAssetSnapshot();
    res.json({ ok: true, epoch });
  } catch (err) {
    console.error("[admin/reset-season]", err);
    res.status(500).json({ error: "Database error" });
  }
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
