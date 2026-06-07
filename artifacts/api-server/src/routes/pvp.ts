import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  enterQueue,
  leaveQueue,
  getQueueStatus,
  getBattle,
  confirmBattle,
  declineBattle,
  calcWinProbability,
  getRarityWeight,
} from "../lib/pvpEngine";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ═══════════════════════════════════════════════════════════════════════
// PvP Route — planet-to-planet duels.
// ═══════════════════════════════════════════════════════════════════════

// ─── POST /pvp/queue ───────────────────────────────────────────────────
// Enter matchmaking queue with a planet.
// Body: { telegramId, planetId, planetName, planetRarity, planetRate, planetFloat? }
// Returns: { ok, status: "queue" | "match", battle?, message? }

const QueueBody = z.object({
  telegramId: z.string().min(1),
  planetId: z.string().min(1),
  planetName: z.string().min(1),
  planetRarity: z.string().min(1),
  planetRate: z.number().min(0),
  planetFloat: z.number().min(0).max(1).optional(),
});

router.post("/pvp/queue", async (req, res) => {
  const parsed = QueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId, planetId, planetName, planetRarity, planetRate, planetFloat } = parsed.data;

  try {
    // Verify ownership and eligibility
    const [user] = await db
      .select({
        planetsJson: usersTable.planetsJson,
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, telegramId))
      .limit(1);

    if (!user) {
      res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
      return;
    }

    const planets = Array.isArray(user.planetsJson)
      ? (user.planetsJson as Array<Record<string, unknown>>)
      : [];

    const planet = planets.find(
      (p) => p && typeof p === "object" && p["id"] === planetId,
    );
    if (!planet) {
      res.status(404).json({ ok: false, error: "PLANET_NOT_FOUND" });
      return;
    }

    // Check eligibility: not farming, not listed, not already in PvP
    const isFarming = planet["isFarmingActive"] === true;
    const isListed = planet["isListedInMarket"] === true;
    const hasSlot = planet["slotIndex"] != null;

    if (isFarming || isListed || hasSlot) {
      res.status(409).json({
        ok: false,
        error: "NOT_ELIGIBLE",
        reason: isFarming ? "FARMING" : isListed ? "LISTED" : "IN_SLOT",
      });
      return;
    }

    // Server-authoritative: use the actual planet data from DB, not the client payload
    const serverPlanetName = String(planet["name"] ?? "BASIC");
    const serverPlanetRarity = String(planet["name"] ?? "BASIC");
    const serverPlanetRate = Number(planet["rate"] ?? 0);
    const serverPlanetFloat = typeof planet["float"] === "number" ? planet["float"] : null;
    const displayUsername = String(user.username || user.firstName || "Player");
    const entry = enterQueue(telegramId, {
      id: planetId,
      name: serverPlanetName,
      rarity: serverPlanetRarity,
      rate: serverPlanetRate,
      float: serverPlanetFloat,
    }, displayUsername);

    if (entry.battle) {
      const b = entry.battle;
      res.json({
        ok: true,
        status: "match",
        battleId: b.id,
        player: {
          telegramId: b.player1.telegramId,
          planet: b.player1.planet,
        },
        opponent: {
          telegramId: b.player2.telegramId,
          planet: b.player2.planet,
        },
        confirmDeadline: b.confirmDeadline,
        winProbability: calcWinProbability(b.player1.planet.rarity, b.player2.planet.rarity),
      });
    } else {
      res.json({
        ok: true,
        status: "queue",
        message: "In coda. Ti avvisiamo quando troviamo un avversario!",
      });
    }
  } catch (err) {
    console.error("[pvp/queue] error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── POST /pvp/leave-queue ───────────────────────────────────────────
// Cancel matchmaking and leave queue.

const LeaveQueueBody = z.object({
  telegramId: z.string().min(1),
});

router.post("/pvp/leave-queue", async (req, res) => {
  const parsed = LeaveQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId } = parsed.data;
  const result = leaveQueue(telegramId);
  res.json({ ok: result.ok });
});

// ─── GET /pvp/status/:telegramId ─────────────────────────────────────
// Get current queue/battle status for a user.

router.get("/pvp/status/:telegramId", async (req, res) => {
  const telegramId = String(req.params.telegramId || "").trim();
  if (!telegramId) {
    res.status(400).json({ ok: false, error: "Missing telegramId" });
    return;
  }
  const status = getQueueStatus(telegramId);
  if (status.battle) {
    const b = status.battle;
    res.json({
      ok: true,
      inBattle: true,
      battleId: b.id,
      status: b.status,
      player: {
        telegramId: b.player1.telegramId,
        planet: b.player1.planet,
        confirmed: b.player1.confirmed,
        username: b.player1.username,
      },
      opponent: {
        telegramId: b.player2.telegramId,
        planet: b.player2.planet,
        confirmed: b.player2.confirmed,
        username: b.player2.username,
      },
      confirmDeadline: b.confirmDeadline,
      winProbability: b.winProbability,
      winnerTelegramId: b.winnerTelegramId,
      loserTelegramId: b.loserTelegramId,
      resultTimestamp: b.resultTimestamp,
    });
  } else {
    res.json({
      ok: true,
      inBattle: false,
      inQueue: status.inQueue,
      joinedAt: status.joinedAt,
    });
  }
});

// ─── GET /pvp/battle/:battleId ───────────────────────────────────────
// Get battle details by ID.

router.get("/pvp/battle/:battleId", async (req, res) => {
  const battleId = String(req.params.battleId || "").trim();
  if (!battleId) {
    res.status(400).json({ ok: false, error: "Missing battleId" });
    return;
  }
  const b = getBattle(battleId);
  if (!b) {
    res.status(404).json({ ok: false, error: "NOT_FOUND" });
    return;
  }
  // Caller-relative response: player = requester, opponent = other
  const callerId = String(req.query["telegramId"] || req.body?.telegramId || "");
  const isPlayer1 = b.player1.telegramId === callerId;
  const player = isPlayer1 ? b.player1 : b.player2;
  const opponent = isPlayer1 ? b.player2 : b.player1;
  res.json({
    ok: true,
    battleId: b.id,
    status: b.status,
    player: {
      telegramId: player.telegramId,
      planet: player.planet,
      confirmed: player.confirmed,
      username: player.username,
    },
    opponent: {
      telegramId: opponent.telegramId,
      planet: opponent.planet,
      confirmed: opponent.confirmed,
      username: opponent.username,
    },
    confirmDeadline: b.confirmDeadline,
    winProbability: isPlayer1 ? b.winProbability : (1 - (b.winProbability ?? 0.5)),
    winnerTelegramId: b.winnerTelegramId,
    loserTelegramId: b.loserTelegramId,
    resultTimestamp: b.resultTimestamp,
  });
});

// ─── POST /pvp/confirm ─────────────────────────────────────────────────
// Confirm a match within the 10-second window.

const ConfirmBody = z.object({
  telegramId: z.string().min(1),
  battleId: z.string().min(1),
});

router.post("/pvp/confirm", async (req, res) => {
  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId, battleId } = parsed.data;
  const result = await confirmBattle(battleId, telegramId);
  if (!result.ok) {
    res.status(409).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true, battle: result.battle });
});

// ─── POST /pvp/decline ─────────────────────────────────────────────────
// Decline / cancel a match.

const DeclineBody = z.object({
  telegramId: z.string().min(1),
  battleId: z.string().min(1),
});

router.post("/pvp/decline", async (req, res) => {
  const parsed = DeclineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId, battleId } = parsed.data;
  const result = declineBattle(battleId, telegramId);
  if (!result.ok) {
    res.status(409).json({ ok: false, error: result.error });
    return;
  }
  res.json({ ok: true });
});

export default router;
