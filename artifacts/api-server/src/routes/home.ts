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

// Whitelist of item ids that can occupy a HOME slot. Each id maps to a
// "do you own it?" predicate so /home/slot/place can refuse to display
// an item the user hasn't purchased.
const SLOT_ITEMS: Record<string, { ownedColumn: keyof typeof usersTable._.columns | null }> = {
  computer: { ownedColumn: "computerOwnedAt" },
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
        sunCount: usersTable.sunCount,
        stardustBalance: usersTable.stardustBalance,
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

    // Ownership predicate. Right now the only item is "computer", whose
    // ownership is `computer_owned_at IS NOT NULL`. Future items extend
    // this switch.
    let ownership = sql`TRUE`;
    if (itemId === "computer") {
      ownership = sql`${usersTable.computerOwnedAt} IS NOT NULL`;
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

export default router;

export {
  HOME_UNLOCK_COST as _HOME_UNLOCK_COST,
  COMPUTER_COST as _COMPUTER_COST,
  COMPUTER_REWARD as _COMPUTER_REWARD,
  COMPUTER_COOLDOWN_MS as _COMPUTER_COOLDOWN_MS,
};
