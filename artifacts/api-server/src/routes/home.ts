import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ────────────────────────────────────────────────────────────────────────
// HOME — pixel-art Comfort Zone, server foundations (Phase 1).
//
// Endpoints:
//   GET  /home/state/:telegramId           — full HOME + computer state
//   POST /home/unlock                      — pay 1000 stardust, requires SUN
//   POST /home/computer/buy                — pay 5000 stardust
//   POST /home/computer/claim              — credit 25 stardust if 24h passed
//   POST /home/slot/place                  — place owned item in slot A/B/C
//   POST /home/slot/clear                  — empty a slot
//
// All write endpoints use single atomic CAS-style UPDATEs so concurrent
// requests (double-tap, dual-device) can never double-spend or duplicate
// rewards. Failures fall through to a second SELECT to disambiguate the
// reason (NOT_ENOUGH_STARDUST vs NO_SUN vs ALREADY_*) for friendly UI.
// ────────────────────────────────────────────────────────────────────────

const HOME_UNLOCK_COST = 1000;        // stardust
const COMPUTER_COST = 5000;           // stardust
const COMPUTER_REWARD = 25;           // stardust per claim
const COMPUTER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Easter-egg bonus: tapping the computer can drop +200 $ZOOM once every
// 24h (separate cooldown from the stardust claim above).
const COMPUTER_ZOOM_BONUS_REWARD = 200;
const COMPUTER_ZOOM_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// PLANT — virtual pixel-art plant that the user grows by watering.
// 10 levels, +10 XP per watering, 100 XP per level → 10 waterings per
// level → 90 waterings total to reach level 10 (~45 days at 1/12h).
// At level 10 it stops accepting water and starts generating 0.1 TON
// every 30 days, claimed manually (same UX as the computer claim).
const PLANT_SEED_COST = 10000;        // stardust
const PLANT_WATER_COST = 100;         // stardust per watering
const PLANT_WATER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const PLANT_XP_PER_WATER = 10;
const PLANT_XP_PER_LEVEL = 100;
const PLANT_MAX_LEVEL = 10;
const PLANT_TON_REWARD = 0.1;         // TON per claim once mature
const PLANT_CLAIM_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Whitelist of item ids that can occupy a HOME slot. Each id maps to a
// "do you own it?" predicate so /home/slot/place can refuse to display
// an item the user hasn't purchased.
const SLOT_ITEMS: Record<string, { ownedColumn: keyof typeof usersTable._.columns | null }> = {
  computer: { ownedColumn: "computerOwnedAt" },
  plant: { ownedColumn: "plantOwnedAt" },
};
const VALID_SLOTS = ["A", "B", "C"] as const;
type Slot = (typeof VALID_SLOTS)[number];

function slotColumn(slot: Slot) {
  if (slot === "A") return usersTable.homeSlotA;
  if (slot === "B") return usersTable.homeSlotB;
  return usersTable.homeSlotC;
}

// ─── GET /home/state/:telegramId ────────────────────────────────────────
router.get("/home/state/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ ok: false, error: "telegramId required" });
    return;
  }
  try {
    const rows = await db
      .select({
        homeUnlocked: usersTable.homeUnlocked,
        homeUnlockedAt: usersTable.homeUnlockedAt,
        homeSlotA: usersTable.homeSlotA,
        homeSlotB: usersTable.homeSlotB,
        homeSlotC: usersTable.homeSlotC,
        computerOwnedAt: usersTable.computerOwnedAt,
        computerLastClaimAt: usersTable.computerLastClaimAt,
        plantOwnedAt: usersTable.plantOwnedAt,
        plantLevel: usersTable.plantLevel,
        plantXp: usersTable.plantXp,
        plantLastWaterAt: usersTable.plantLastWaterAt,
        plantLastClaimAt: usersTable.plantLastClaimAt,
        sunCount: usersTable.sunCount,
        stardustBalance: usersTable.stardustBalance,
        computerZoomBonusLastAt: usersTable.computerZoomBonusLastAt,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
      return;
    }
    const now = Date.now();
    const lastClaim = row.computerLastClaimAt ? new Date(row.computerLastClaimAt).getTime() : 0;
    const owned = row.computerOwnedAt != null;
    const nextReadyAt = owned ? lastClaim + COMPUTER_COOLDOWN_MS : 0;
    const secondsToReady = owned ? Math.max(0, Math.ceil((nextReadyAt - now) / 1000)) : 0;
    // Easter-egg 200 $ZOOM bonus state. Available immediately on first
    // ever tap (lastBonus === 0); otherwise 24h after the last grant.
    const lastBonus = row.computerZoomBonusLastAt
      ? new Date(row.computerZoomBonusLastAt).getTime()
      : 0;
    const zoomBonusNextReadyAt = lastBonus === 0 ? now : lastBonus + COMPUTER_ZOOM_BONUS_COOLDOWN_MS;
    const zoomBonusSecondsToReady = Math.max(0, Math.ceil((zoomBonusNextReadyAt - now) / 1000));

    // PLANT derived state. waterReadyAt = lastWaterAt + 12h, or NOW
    // when the user has never watered (first watering is immediate).
    // claimReadyAt only matters at level 10 — before that the field is
    // typically NULL so we keep it at 0 (UI hides the claim block).
    const plantOwned = row.plantOwnedAt != null;
    const plantLevel = row.plantLevel ?? 1;
    const plantXp = row.plantXp ?? 0;
    const plantLastWater = row.plantLastWaterAt ? new Date(row.plantLastWaterAt).getTime() : 0;
    const plantLastClaim = row.plantLastClaimAt ? new Date(row.plantLastClaimAt).getTime() : 0;
    const waterNextReadyAt = plantLastWater === 0 ? now : plantLastWater + PLANT_WATER_COOLDOWN_MS;
    const secondsToWater = plantOwned && plantLevel < PLANT_MAX_LEVEL
      ? Math.max(0, Math.ceil((waterNextReadyAt - now) / 1000))
      : 0;
    const claimNextReadyAt = plantLastClaim === 0 ? 0 : plantLastClaim + PLANT_CLAIM_COOLDOWN_MS;
    const secondsToClaim = plantOwned && plantLevel >= PLANT_MAX_LEVEL && plantLastClaim > 0
      ? Math.max(0, Math.ceil((claimNextReadyAt - now) / 1000))
      : 0;

    res.json({
      ok: true,
      unlocked: row.homeUnlocked,
      hasSun: (row.sunCount ?? 0) >= 1,
      stardustBalance: row.stardustBalance ?? 0,
      unlockCost: HOME_UNLOCK_COST,
      slots: { A: row.homeSlotA, B: row.homeSlotB, C: row.homeSlotC },
      computer: {
        owned,
        ownedAt: row.computerOwnedAt,
        lastClaimAt: row.computerLastClaimAt,
        nextReadyAt,
        secondsToReady,
        claimable: owned && secondsToReady === 0,
        cost: COMPUTER_COST,
        rewardPerClaim: COMPUTER_REWARD,
        cooldownMs: COMPUTER_COOLDOWN_MS,
        zoomBonusReward: COMPUTER_ZOOM_BONUS_REWARD,
        zoomBonusCooldownMs: COMPUTER_ZOOM_BONUS_COOLDOWN_MS,
        zoomBonusNextReadyAt,
        zoomBonusSecondsToReady,
        zoomBonusReady: zoomBonusSecondsToReady === 0,
      },
      plant: {
        owned: plantOwned,
        level: plantLevel,
        xp: plantXp,
        xpPerLevel: PLANT_XP_PER_LEVEL,
        xpPerWater: PLANT_XP_PER_WATER,
        maxLevel: PLANT_MAX_LEVEL,
        ownedAt: row.plantOwnedAt,
        lastWaterAt: row.plantLastWaterAt,
        lastClaimAt: row.plantLastClaimAt,
        waterNextReadyAt: plantOwned && plantLevel < PLANT_MAX_LEVEL ? waterNextReadyAt : 0,
        secondsToWater,
        waterReady: plantOwned && plantLevel < PLANT_MAX_LEVEL && secondsToWater === 0,
        waterCost: PLANT_WATER_COST,
        waterCooldownMs: PLANT_WATER_COOLDOWN_MS,
        claimNextReadyAt,
        secondsToClaim,
        claimReady: plantOwned && plantLevel >= PLANT_MAX_LEVEL && plantLastClaim > 0 && secondsToClaim === 0,
        tonPerClaim: PLANT_TON_REWARD,
        claimCooldownMs: PLANT_CLAIM_COOLDOWN_MS,
        // TON/sec accrual rate at level 10 (display-only — actual payout
        // is the lump-sum on claim every 30d, not per-second).
        tonPerSecond: PLANT_TON_REWARD / (PLANT_CLAIM_COOLDOWN_MS / 1000),
        seedCost: PLANT_SEED_COST,
      },
    });
  } catch (err) {
    console.error("[home/state] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

const TgIdBody = z.object({ telegramId: z.string().min(1) });

// ─── POST /home/unlock ──────────────────────────────────────────────────
// Single atomic UPDATE: only lands when home is still locked, the user
// owns at least one SUN, and has >= 1000 stardust. Same statement
// debits the cost, sets unlocked=true, and stamps the unlock time —
// so two concurrent calls can't both succeed.
router.post("/home/unlock", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        homeUnlocked: true,
        homeUnlockedAt: sql`NOW()`,
        stardustBalance: sql`${usersTable.stardustBalance} - ${HOME_UNLOCK_COST}`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.homeUnlocked} = false
          AND ${usersTable.sunCount} >= 1
          AND ${usersTable.stardustBalance} >= ${HOME_UNLOCK_COST}
        `,
      )
      .returning({
        stardustBalance: usersTable.stardustBalance,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          homeUnlocked: usersTable.homeUnlocked,
          sunCount: usersTable.sunCount,
          stardustBalance: usersTable.stardustBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.homeUnlocked) {
        res.status(409).json({ ok: false, error: "ALREADY_UNLOCKED" });
        return;
      }
      if ((e.sunCount ?? 0) < 1) {
        res.status(409).json({ ok: false, error: "NO_SUN" });
        return;
      }
      if ((e.stardustBalance ?? 0) < HOME_UNLOCK_COST) {
        res.status(409).json({
          ok: false,
          error: "NOT_ENOUGH_STARDUST",
          have: e.stardustBalance ?? 0,
          need: HOME_UNLOCK_COST,
        });
        return;
      }
      res.status(500).json({ ok: false, error: "UNKNOWN" });
      return;
    }
    console.log(`[home/unlock] ${telegramId} unlocked HOME (-${HOME_UNLOCK_COST} stardust)`);
    res.json({ ok: true, stardustBalance: updated[0]!.stardustBalance });
  } catch (err) {
    console.error("[home/unlock] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/computer/buy ────────────────────────────────────────────
// Computer is purchasable from the Shop (the ZOOM-balance shop) BEFORE
// the HOME is unlocked — the user can stockpile it and place it later.
// Guards: not already owned, has 5000 stardust. Sets last_claim_at = NOW
// so the first 25-stardust drop is exactly 24h after purchase (matches
// spec wording "produce 25 ogni 24h").
router.post("/home/computer/buy", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        computerOwnedAt: sql`NOW()`,
        computerLastClaimAt: sql`NOW()`,
        stardustBalance: sql`${usersTable.stardustBalance} - ${COMPUTER_COST}`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.computerOwnedAt} IS NULL
          AND ${usersTable.stardustBalance} >= ${COMPUTER_COST}
        `,
      )
      .returning({
        stardustBalance: usersTable.stardustBalance,
        computerOwnedAt: usersTable.computerOwnedAt,
        computerLastClaimAt: usersTable.computerLastClaimAt,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          computerOwnedAt: usersTable.computerOwnedAt,
          stardustBalance: usersTable.stardustBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.computerOwnedAt != null) {
        res.status(409).json({ ok: false, error: "ALREADY_OWNED" });
        return;
      }
      if ((e.stardustBalance ?? 0) < COMPUTER_COST) {
        res.status(409).json({
          ok: false,
          error: "NOT_ENOUGH_STARDUST",
          have: e.stardustBalance ?? 0,
          need: COMPUTER_COST,
        });
        return;
      }
      res.status(500).json({ ok: false, error: "UNKNOWN" });
      return;
    }
    console.log(`[home/computer/buy] ${telegramId} bought COMPUTER (-${COMPUTER_COST} stardust)`);
    res.json({
      ok: true,
      stardustBalance: updated[0]!.stardustBalance,
      computerOwnedAt: updated[0]!.computerOwnedAt,
      computerLastClaimAt: updated[0]!.computerLastClaimAt,
    });
  } catch (err) {
    console.error("[home/computer/buy] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/computer/claim ──────────────────────────────────────────
// Atomic: only lands if owned AND last_claim_at is at least 24h ago.
// Same UPDATE credits +25 stardust and resets the cooldown anchor.
router.post("/home/computer/claim", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} + ${COMPUTER_REWARD}`,
        computerLastClaimAt: sql`NOW()`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.computerOwnedAt} IS NOT NULL
          AND ${usersTable.computerLastClaimAt} IS NOT NULL
          AND (EXTRACT(EPOCH FROM (NOW() - ${usersTable.computerLastClaimAt})) * 1000) >= ${COMPUTER_COOLDOWN_MS}
        `,
      )
      .returning({
        stardustBalance: usersTable.stardustBalance,
        computerLastClaimAt: usersTable.computerLastClaimAt,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          computerOwnedAt: usersTable.computerOwnedAt,
          computerLastClaimAt: usersTable.computerLastClaimAt,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.computerOwnedAt == null) {
        res.status(409).json({ ok: false, error: "NOT_OWNED" });
        return;
      }
      const lastClaim = e.computerLastClaimAt ? new Date(e.computerLastClaimAt).getTime() : 0;
      const secondsToReady = Math.max(0, Math.ceil((lastClaim + COMPUTER_COOLDOWN_MS - Date.now()) / 1000));
      res.status(409).json({ ok: false, error: "NOT_READY", secondsToReady });
      return;
    }
    console.log(`[home/computer/claim] ${telegramId} claimed +${COMPUTER_REWARD} stardust`);
    res.json({
      ok: true,
      reward: COMPUTER_REWARD,
      stardustBalance: updated[0]!.stardustBalance,
      computerLastClaimAt: updated[0]!.computerLastClaimAt,
    });
  } catch (err) {
    console.error("[home/computer/claim] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/computer/zoom-bonus ─────────────────────────────────────
// Easter-egg: tapping the COMPUTER on HOME drops +200 $ZOOM once every
// 24h, atomic CAS-style update so a double-tap can't pay twice. NULL
// `computerZoomBonusLastAt` (never claimed) counts as "ready now".
router.post("/home/computer/zoom-bonus", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} + ${COMPUTER_ZOOM_BONUS_REWARD}`,
        computerZoomBonusLastAt: sql`NOW()`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.computerOwnedAt} IS NOT NULL
          AND (
            ${usersTable.computerZoomBonusLastAt} IS NULL
            OR (EXTRACT(EPOCH FROM (NOW() - ${usersTable.computerZoomBonusLastAt})) * 1000)
                >= ${COMPUTER_ZOOM_BONUS_COOLDOWN_MS}
          )
        `,
      )
      .returning({
        zoomBalance: usersTable.zoomBalance,
        computerZoomBonusLastAt: usersTable.computerZoomBonusLastAt,
      });
    if (updated.length === 0) {
      // Disambiguate the failure: USER_NOT_FOUND vs NOT_OWNED (bonus
      // requires owning the COMPUTER) vs NOT_READY (cooldown active).
      const existing = await db
        .select({
          computerOwnedAt: usersTable.computerOwnedAt,
          computerZoomBonusLastAt: usersTable.computerZoomBonusLastAt,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      if (existing[0]!.computerOwnedAt == null) {
        res.status(409).json({ ok: false, error: "NOT_OWNED" });
        return;
      }
      const last = existing[0]!.computerZoomBonusLastAt
        ? new Date(existing[0]!.computerZoomBonusLastAt).getTime()
        : 0;
      const secondsToReady = Math.max(
        0,
        Math.ceil((last + COMPUTER_ZOOM_BONUS_COOLDOWN_MS - Date.now()) / 1000),
      );
      res.status(409).json({ ok: false, error: "NOT_READY", secondsToReady });
      return;
    }
    console.log(
      `[home/computer/zoom-bonus] ${telegramId} +${COMPUTER_ZOOM_BONUS_REWARD} ZOOM (easter egg)`,
    );
    res.json({
      ok: true,
      reward: COMPUTER_ZOOM_BONUS_REWARD,
      zoomBalance: updated[0]!.zoomBalance,
    });
  } catch (err) {
    console.error("[home/computer/zoom-bonus] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/slot/place ──────────────────────────────────────────────
// Validates: HOME unlocked + slot is A/B/C + itemId is whitelisted +
// user owns the item. Enforces single-instance: if the same item
// already occupies another slot, that slot is cleared in the same
// UPDATE so there's never a double-render.
const PlaceBody = z.object({
  telegramId: z.string().min(1),
  slot: z.enum(VALID_SLOTS),
  itemId: z.string().min(1),
});
router.post("/home/slot/place", async (req, res) => {
  const parsed = PlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId, slot, itemId } = parsed.data;
  if (!SLOT_ITEMS[itemId]) {
    res.status(400).json({ ok: false, error: "UNKNOWN_ITEM" });
    return;
  }
  try {
    const setObj: Record<string, unknown> = {};
    setObj[slot === "A" ? "homeSlotA" : slot === "B" ? "homeSlotB" : "homeSlotC"] = itemId;
    // Clear other slots that already hold this item id (single-instance
    // invariant). Only writes the columns that don't match the target slot.
    for (const s of VALID_SLOTS) {
      if (s === slot) continue;
      const col = s === "A" ? "homeSlotA" : s === "B" ? "homeSlotB" : "homeSlotC";
      setObj[col] = sql`CASE WHEN ${slotColumn(s)} = ${itemId} THEN NULL ELSE ${slotColumn(s)} END`;
    }

    // Ownership predicate. Each placeable item maps to its "owned?"
    // SQL predicate. Future items extend this switch.
    let ownership = sql`TRUE`;
    if (itemId === "computer") {
      ownership = sql`${usersTable.computerOwnedAt} IS NOT NULL`;
    } else if (itemId === "plant") {
      ownership = sql`${usersTable.plantOwnedAt} IS NOT NULL`;
    }

    const updated = await db
      .update(usersTable)
      .set(setObj as never)
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.homeUnlocked} = true
          AND ${ownership}
        `,
      )
      .returning({
        slotA: usersTable.homeSlotA,
        slotB: usersTable.homeSlotB,
        slotC: usersTable.homeSlotC,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          homeUnlocked: usersTable.homeUnlocked,
          computerOwnedAt: usersTable.computerOwnedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      if (!existing[0]!.homeUnlocked) {
        res.status(409).json({ ok: false, error: "HOME_LOCKED" });
        return;
      }
      if (itemId === "computer" && existing[0]!.computerOwnedAt == null) {
        res.status(409).json({ ok: false, error: "ITEM_NOT_OWNED" });
        return;
      }
      if (itemId === "plant") {
        const ownerCheck = await db
          .select({ plantOwnedAt: usersTable.plantOwnedAt })
          .from(usersTable)
          .where(eq(usersTable.telegramId, telegramId))
          .limit(1);
        if (ownerCheck[0] && ownerCheck[0].plantOwnedAt == null) {
          res.status(409).json({ ok: false, error: "ITEM_NOT_OWNED" });
          return;
        }
      }
      res.status(500).json({ ok: false, error: "UNKNOWN" });
      return;
    }
    res.json({
      ok: true,
      slots: { A: updated[0]!.slotA, B: updated[0]!.slotB, C: updated[0]!.slotC },
    });
  } catch (err) {
    console.error("[home/slot/place] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/slot/clear ──────────────────────────────────────────────
const ClearBody = z.object({
  telegramId: z.string().min(1),
  slot: z.enum(VALID_SLOTS),
});
router.post("/home/slot/clear", async (req, res) => {
  const parsed = ClearBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId, slot } = parsed.data;
  try {
    const setObj: Record<string, unknown> = {};
    setObj[slot === "A" ? "homeSlotA" : slot === "B" ? "homeSlotB" : "homeSlotC"] = null;
    const updated = await db
      .update(usersTable)
      .set(setObj as never)
      .where(eq(usersTable.telegramId, telegramId))
      .returning({
        slotA: usersTable.homeSlotA,
        slotB: usersTable.homeSlotB,
        slotC: usersTable.homeSlotC,
      });
    if (updated.length === 0) {
      res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
      return;
    }
    res.json({
      ok: true,
      slots: { A: updated[0]!.slotA, B: updated[0]!.slotB, C: updated[0]!.slotC },
    });
  } catch (err) {
    console.error("[home/slot/clear] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/plant/buy ───────────────────────────────────────────────
// Single atomic UPDATE: only lands when the user does not yet own a
// plant AND has at least 10,000 stardust. Same statement debits the
// cost, sets plantOwnedAt=NOW, plantLevel=1, plantXp=0, and leaves
// plantLastWaterAt NULL so the very first watering is immediately
// available (no 12h wait at level 1).
router.post("/home/plant/buy", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        plantOwnedAt: sql`NOW()`,
        plantLevel: 1,
        plantXp: 0,
        plantLastWaterAt: null,
        plantLastClaimAt: null,
        stardustBalance: sql`${usersTable.stardustBalance} - ${PLANT_SEED_COST}`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.plantOwnedAt} IS NULL
          AND ${usersTable.stardustBalance} >= ${PLANT_SEED_COST}
        `,
      )
      .returning({
        stardustBalance: usersTable.stardustBalance,
        plantOwnedAt: usersTable.plantOwnedAt,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          plantOwnedAt: usersTable.plantOwnedAt,
          stardustBalance: usersTable.stardustBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.plantOwnedAt != null) {
        res.status(409).json({ ok: false, error: "ALREADY_OWNED" });
        return;
      }
      if ((e.stardustBalance ?? 0) < PLANT_SEED_COST) {
        res.status(409).json({
          ok: false,
          error: "NOT_ENOUGH_STARDUST",
          have: e.stardustBalance ?? 0,
          need: PLANT_SEED_COST,
        });
        return;
      }
      res.status(500).json({ ok: false, error: "UNKNOWN" });
      return;
    }
    console.log(`[home/plant/buy] ${telegramId} bought PLANT SEED (-${PLANT_SEED_COST} stardust)`);
    res.json({
      ok: true,
      stardustBalance: updated[0]!.stardustBalance,
      plantOwnedAt: updated[0]!.plantOwnedAt,
    });
  } catch (err) {
    console.error("[home/plant/buy] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/plant/water ─────────────────────────────────────────────
// Single atomic UPDATE that:
//   • debits 100 stardust
//   • adds +10 XP (resets to 0 on level-up; +10 always lands ≤100, no overshoot)
//   • bumps the level when XP would reach 100
//   • on the 9→10 transition, stamps plantLastClaimAt = NOW so the first
//     0.1 TON drop is exactly 30 days after maturing
//   • stamps plantLastWaterAt = NOW
//
// Guards: plant owned, level < 10, ≥100 stardust, water cooldown elapsed
// (or NULL — first watering is always free of cooldown). Concurrent
// double-taps cannot land twice because the cooldown predicate sees the
// just-stamped NOW() in the same UPDATE.
router.post("/home/plant/water", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} - ${PLANT_WATER_COST}`,
        plantXp: sql`CASE WHEN ${usersTable.plantXp} + ${PLANT_XP_PER_WATER} >= ${PLANT_XP_PER_LEVEL} THEN 0 ELSE ${usersTable.plantXp} + ${PLANT_XP_PER_WATER} END`,
        plantLevel: sql`CASE WHEN ${usersTable.plantXp} + ${PLANT_XP_PER_WATER} >= ${PLANT_XP_PER_LEVEL} THEN ${usersTable.plantLevel} + 1 ELSE ${usersTable.plantLevel} END`,
        plantLastWaterAt: sql`NOW()`,
        // Stamp the claim anchor exactly when the plant transitions
        // 9→10, so the first TON claim unlocks 30 days later.
        plantLastClaimAt: sql`CASE
          WHEN ${usersTable.plantXp} + ${PLANT_XP_PER_WATER} >= ${PLANT_XP_PER_LEVEL}
            AND ${usersTable.plantLevel} + 1 >= ${PLANT_MAX_LEVEL}
          THEN NOW()
          ELSE ${usersTable.plantLastClaimAt}
        END`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.plantOwnedAt} IS NOT NULL
          AND ${usersTable.plantLevel} < ${PLANT_MAX_LEVEL}
          AND ${usersTable.stardustBalance} >= ${PLANT_WATER_COST}
          AND (
            ${usersTable.plantLastWaterAt} IS NULL
            OR (EXTRACT(EPOCH FROM (NOW() - ${usersTable.plantLastWaterAt})) * 1000) >= ${PLANT_WATER_COOLDOWN_MS}
          )
        `,
      )
      .returning({
        stardustBalance: usersTable.stardustBalance,
        plantLevel: usersTable.plantLevel,
        plantXp: usersTable.plantXp,
        plantLastWaterAt: usersTable.plantLastWaterAt,
        plantLastClaimAt: usersTable.plantLastClaimAt,
      });
    if (updated.length === 0) {
      // Disambiguate the failure for friendly UI.
      const existing = await db
        .select({
          plantOwnedAt: usersTable.plantOwnedAt,
          plantLevel: usersTable.plantLevel,
          plantLastWaterAt: usersTable.plantLastWaterAt,
          stardustBalance: usersTable.stardustBalance,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.plantOwnedAt == null) {
        res.status(409).json({ ok: false, error: "NOT_OWNED" });
        return;
      }
      if ((e.plantLevel ?? 1) >= PLANT_MAX_LEVEL) {
        res.status(409).json({ ok: false, error: "MAX_LEVEL" });
        return;
      }
      if ((e.stardustBalance ?? 0) < PLANT_WATER_COST) {
        res.status(409).json({
          ok: false,
          error: "NOT_ENOUGH_STARDUST",
          have: e.stardustBalance ?? 0,
          need: PLANT_WATER_COST,
        });
        return;
      }
      const lastWater = e.plantLastWaterAt ? new Date(e.plantLastWaterAt).getTime() : 0;
      const secondsToReady = Math.max(
        0,
        Math.ceil((lastWater + PLANT_WATER_COOLDOWN_MS - Date.now()) / 1000),
      );
      res.status(409).json({ ok: false, error: "NOT_READY", secondsToReady });
      return;
    }
    const row = updated[0]!;
    console.log(
      `[home/plant/water] ${telegramId} watered plant → L${row.plantLevel} (${row.plantXp}/${PLANT_XP_PER_LEVEL} xp)`,
    );
    res.json({
      ok: true,
      stardustBalance: row.stardustBalance,
      plantLevel: row.plantLevel,
      plantXp: row.plantXp,
      plantLastWaterAt: row.plantLastWaterAt,
      plantLastClaimAt: row.plantLastClaimAt,
      leveledUp: row.plantXp === 0,
      maxedOut: row.plantLevel >= PLANT_MAX_LEVEL,
    });
  } catch (err) {
    console.error("[home/plant/water] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

// ─── POST /home/plant/claim ─────────────────────────────────────────────
// Atomic: only lands when plant is at level 10 AND plantLastClaimAt is
// at least 30 days ago. Same UPDATE credits +0.1 TON to ton_balance and
// resets the 30-day cooldown anchor.
router.post("/home/plant/claim", async (req, res) => {
  const parsed = TgIdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }
  const { telegramId } = parsed.data;
  try {
    const updated = await db
      .update(usersTable)
      .set({
        tonBalance: sql`${usersTable.tonBalance} + ${PLANT_TON_REWARD}`,
        plantLastClaimAt: sql`NOW()`,
      })
      .where(
        sql`
          ${usersTable.telegramId} = ${telegramId}
          AND ${usersTable.plantOwnedAt} IS NOT NULL
          AND ${usersTable.plantLevel} >= ${PLANT_MAX_LEVEL}
          AND ${usersTable.plantLastClaimAt} IS NOT NULL
          AND (EXTRACT(EPOCH FROM (NOW() - ${usersTable.plantLastClaimAt})) * 1000) >= ${PLANT_CLAIM_COOLDOWN_MS}
        `,
      )
      .returning({
        tonBalance: usersTable.tonBalance,
        plantLastClaimAt: usersTable.plantLastClaimAt,
      });
    if (updated.length === 0) {
      const existing = await db
        .select({
          plantOwnedAt: usersTable.plantOwnedAt,
          plantLevel: usersTable.plantLevel,
          plantLastClaimAt: usersTable.plantLastClaimAt,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      if (existing.length === 0) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const e = existing[0]!;
      if (e.plantOwnedAt == null) {
        res.status(409).json({ ok: false, error: "NOT_OWNED" });
        return;
      }
      if ((e.plantLevel ?? 1) < PLANT_MAX_LEVEL) {
        res.status(409).json({ ok: false, error: "NOT_MATURE", level: e.plantLevel ?? 1 });
        return;
      }
      const lastClaim = e.plantLastClaimAt ? new Date(e.plantLastClaimAt).getTime() : 0;
      const secondsToReady = Math.max(
        0,
        Math.ceil((lastClaim + PLANT_CLAIM_COOLDOWN_MS - Date.now()) / 1000),
      );
      res.status(409).json({ ok: false, error: "NOT_READY", secondsToReady });
      return;
    }
    console.log(`[home/plant/claim] ${telegramId} claimed +${PLANT_TON_REWARD} TON from plant`);
    res.json({
      ok: true,
      reward: PLANT_TON_REWARD,
      tonBalance: updated[0]!.tonBalance,
      plantLastClaimAt: updated[0]!.plantLastClaimAt,
    });
  } catch (err) {
    console.error("[home/plant/claim] error:", err);
    res.status(500).json({ ok: false, error: "INTERNAL" });
  }
});

export default router;

export {
  HOME_UNLOCK_COST as _HOME_UNLOCK_COST,
  COMPUTER_COST as _COMPUTER_COST,
  COMPUTER_REWARD as _COMPUTER_REWARD,
  COMPUTER_COOLDOWN_MS as _COMPUTER_COOLDOWN_MS,
  PLANT_SEED_COST as _PLANT_SEED_COST,
  PLANT_WATER_COST as _PLANT_WATER_COST,
  PLANT_WATER_COOLDOWN_MS as _PLANT_WATER_COOLDOWN_MS,
  PLANT_TON_REWARD as _PLANT_TON_REWARD,
  PLANT_CLAIM_COOLDOWN_MS as _PLANT_CLAIM_COOLDOWN_MS,
};
