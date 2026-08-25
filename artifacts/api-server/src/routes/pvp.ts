import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  enterQueue,
  leaveQueue,
  getQueueStatus,
  getLobbyEntries,
  getBattle,
  confirmBattle,
  declineBattle,
  calcWinProbability,
  getRarityWeight,
  type PlanetEntry,
} from "../lib/pvpEngine";
import { db, usersTable, marketListingsTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { isLabForgeGeneratorPlanet } from "@workspace/game-models";

const router: IRouter = Router();

// PvP DAILY LEADERBOARD prize split (1st→10th), redstar.
const PVP_PRIZES = [10, 7, 5, 4, 3, 2, 2, 1, 1, 1] as const;

function pvpLeaderboardDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  planetName: z.string().optional(),
  planetRarity: z.string().optional(),
  planetRate: z.number().finite().optional(),
  planetFloat: z.number().finite().nullish(),
});

router.post("/pvp/queue", async (req, res) => {
  const parsed = QueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid body" });
    return;
  }
  const { telegramId, planetId } = parsed.data;

  try {
    // Verify ownership and eligibility
    const [user] = await db
      .select({
        planetsJson: usersTable.planetsJson,
        username: usersTable.username,
        firstName: usersTable.firstName,
        bonusSlots: usersTable.bonusSlots,
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

    // Eligible: not listed (flag or a live marketplace row). Farming can duel.
    const activeListings = await db
      .select({ planetId: marketListingsTable.planetId })
      .from(marketListingsTable)
      .where(and(
        eq(marketListingsTable.sellerTelegramId, telegramId),
        eq(marketListingsTable.status, "active"),
      ));
    const listedIds = new Set(
      activeListings.map((r) => r.planetId).filter((id): id is string => !!id),
    );
    const isListed = planet["isListedInMarket"] === true
      || planet["serverListingId"] != null
      || listedIds.has(planetId);
    if (isListed) {
      res.status(409).json({
        ok: false,
        error: "NOT_ELIGIBLE",
        reason: "LISTED",
      });
      return;
    }

    // Winner keeps their staked model and receives the opponent's, so we
    // only count OTHER unlisted lab models. The staked one is already in
    // inventory — treating it as filling the last slot was a false SLOTS_FULL
    // while Farm still showed empty cards (listed ghosts / duplicates).
    const maxSlots = 2 + Math.max(0, Number(user.bonusSlots) || 0);
    const seenIds = new Set<string>();
    let otherOccupying = 0;
    for (const p of planets) {
      if (!p || typeof p !== "object") continue;
      const id = typeof p["id"] === "string" ? p["id"] : "";
      if (id) {
        if (id === planetId || seenIds.has(id)) continue;
        seenIds.add(id);
      }
      if (listedIds.has(id)) continue;
      if (p["isListedInMarket"] === true) continue;
      if (p["serverListingId"] != null) continue;
      if (!isLabForgeGeneratorPlanet({
        shapeId: typeof p["shapeId"] === "string" ? p["shapeId"] : null,
        displayName: typeof p["displayName"] === "string" ? p["displayName"] : null,
      })) continue;
      otherOccupying += 1;
    }
    if (otherOccupying >= maxSlots) {
      res.status(409).json({ ok: false, error: "SLOTS_FULL" });
      return;
    }

    // Server-authoritative: use the actual planet data from DB, not the client payload
    const entry: PlanetEntry = {
      id: planetId,
      name: String(planet["name"] ?? "BASIC"),
      rarity: String(planet["name"] ?? "BASIC"),
      rate: Number(planet["rate"] ?? 0),
      float: typeof planet["float"] === "number" ? planet["float"] : null,
      shapeId: typeof planet["shapeId"] === "string" ? planet["shapeId"] : undefined,
      displayName: typeof planet["displayName"] === "string" ? planet["displayName"] : undefined,
      color: typeof planet["color"] === "string" ? planet["color"] : undefined,
      glowColor: typeof planet["glowColor"] === "string" ? planet["glowColor"] : undefined,
    };
    const displayUsername = String(user.username || user.firstName || "Player");
    const queued = enterQueue(telegramId, entry, displayUsername);
    if (!queued.ok) {
      res.status(409).json({ ok: false, error: queued.error || "QUEUE_FAILED" });
      return;
    }

    if (queued.battle) {
      const b = queued.battle;
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

// ─── GET /pvp/lobby ──────────────────────────────────────────────────
// Returns all players currently waiting in the matchmaking queue.
// Public endpoint — no auth needed.

router.get("/pvp/lobby", (_req, res) => {
  try {
    const entries = getLobbyEntries();
    res.json({ ok: true, count: entries.length, entries });
  } catch (err) {
    console.error("[pvp/lobby] error:", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
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

// ─── GET /pvp/leaderboard ────────────────────────────────────────────
// Public daily PvP leaderboard. Returns today's top 10 by win points with
// Telegram avatars + stardust prize tiers. If a caller `telegramId` is
// supplied and the caller is NOT in the top 10 but has points today, also
// returns `me` with their current rank + points so the UI can pin a row.

router.get("/pvp/leaderboard", async (req, res) => {
  try {
    const today = pvpLeaderboardDayKey();
    const callerId = String(req.query["telegramId"] || "").trim();

    const rows = await db
      .select({
        telegramId: usersTable.telegramId,
        username: usersTable.username,
        firstName: usersTable.firstName,
        photoUrl: usersTable.photoUrl,
        points: usersTable.pvpDailyPoints,
      })
      .from(usersTable)
      .where(
        sql`${usersTable.pvpDayKey} = ${today}
            AND ${usersTable.pvpDailyPoints} > 0
            AND ${usersTable.isDisabled} = false`,
      )
      .orderBy(desc(usersTable.pvpDailyPoints), usersTable.telegramId)
      .limit(10);

    const entries = rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      name: r.username || r.firstName || "Player",
      photoUrl: r.photoUrl || null,
      points: Number(r.points ?? 0),
      prize: i < PVP_PRIZES.length ? PVP_PRIZES[i] : null,
    }));

    // Caller row (only when they exist, have points today, and aren't already
    // visible in the top 10).
    let me: { rank: number | null; points: number } | null = null;
    if (callerId && !entries.some((e) => e.telegramId === callerId)) {
      const [self] = await db
        .select({ points: usersTable.pvpDailyPoints, dayKey: usersTable.pvpDayKey })
        .from(usersTable)
        .where(eq(usersTable.telegramId, callerId))
        .limit(1);

      if (self && self.dayKey === today && (self.points ?? 0) > 0) {
        const selfPoints = Number(self.points ?? 0);
        // Rank = (# of users strictly ahead) + 1, with telegramId tie-break
        // matching the leaderboard ordering above.
        const [ahead] = await db
          .select({ n: sql<number>`count(*)` })
          .from(usersTable)
          .where(
            sql`${usersTable.pvpDayKey} = ${today}
                AND ${usersTable.isDisabled} = false
                AND (
                  ${usersTable.pvpDailyPoints} > ${selfPoints}
                  OR (${usersTable.pvpDailyPoints} = ${selfPoints} AND ${usersTable.telegramId} < ${callerId})
                )`,
          );
        me = { rank: Number(ahead?.n ?? 0) + 1, points: selfPoints };
      }
    }

    res.json({ dayKey: today, prizes: PVP_PRIZES, entries, me });
  } catch (err) {
    console.error("[pvp/leaderboard] error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
