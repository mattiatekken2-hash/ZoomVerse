import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const ADMIN_ID = "8144744644";

function isAdmin(adminId: string): boolean {
  return adminId === ADMIN_ID;
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
