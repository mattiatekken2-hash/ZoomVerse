import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordHistory } from "./history";

// ═══════════════════════════════════════════════════════════════════════
// PvP MATCHMAKING ENGINE — in-memory state.
// ═══════════════════════════════════════════════════════════════════════

// Rarity weight for roulette probability. Higher = larger wheel slice.
const RARITY_WEIGHT: Record<string, number> = {
  BASIC: 1,
  RARE: 2,
  EPIC: 3,
  GOLD: 4,
  MYTHIC: 5,
  PLASMA: 6,
  V1: 7,
  V1_NFT: 8,
};

export function getRarityWeight(name: string): number {
  return RARITY_WEIGHT[name.toUpperCase()] ?? 1;
}

export function calcWinProbability(p1Rarity: string, p2Rarity: string): number {
  const w1 = getRarityWeight(p1Rarity);
  const w2 = getRarityWeight(p2Rarity);
  const total = w1 + w2;
  return total === 0 ? 0.5 : w1 / total;
}

export interface PlanetEntry {
  id: string;
  name: string;
  rarity: string;
  rate: number;
  float?: number | null;
}

export interface QueueEntry {
  telegramId: string;
  planet: PlanetEntry;
  joinedAt: number;
  username?: string;
}

export interface BattlePlayer {
  telegramId: string;
  planet: PlanetEntry;
  confirmed: boolean;
  username?: string;
}

export type BattleStatus = "pending" | "confirming" | "roulette" | "completed" | "cancelled" | "transfer_failed";

export interface Battle {
  id: string;
  player1: BattlePlayer;
  player2: BattlePlayer;
  status: BattleStatus;
  createdAt: number;
  confirmDeadline: number; // epoch ms
  winnerTelegramId?: string;
  loserTelegramId?: string;
  winProbability?: number; // p1 win probability
  resultTimestamp?: number;
}

// In-memory state
const queue = new Map<string, QueueEntry>(); // telegramId -> QueueEntry
const battles = new Map<string, Battle>(); // battleId -> Battle

const QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min auto-remove from queue
const CONFIRM_TIMEOUT_MS = 20_000; // 20s confirmation window — the second player
// only learns of the match via 2s polling + human reaction time, so 10s was too
// tight and caused "both confirmed but it cancelled" reports.

// A battle is "active" while it still needs both players' attention. Terminal
// battles (completed/cancelled/transfer_failed) must NOT be reported by
// getQueueStatus — otherwise a finished battle lingers in the map for 5 min and
// /pvp/status keeps returning the previous result, so starting a new battle
// shows the old victory/defeat.
const ACTIVE_STATUSES: BattleStatus[] = ["pending", "confirming", "roulette"];
function isActive(b: Battle): boolean {
  return ACTIVE_STATUSES.includes(b.status);
}

// ─── Queue ───────────────────────────────────────────────────────────

export function enterQueue(telegramId: string, planet: PlanetEntry, username?: string): {
  ok: boolean;
  error?: string;
  battle?: Battle;
} {
  // Purge any terminal battles this user was part of, so a finished battle can
  // never block or be reported when the user starts a fresh one.
  for (const [id, b] of battles.entries()) {
    if ((b.player1.telegramId === telegramId || b.player2.telegramId === telegramId) && !isActive(b)) {
      battles.delete(id);
    }
  }
  // Block if already in an active battle or queue
  const existing = getQueueStatus(telegramId);
  if (existing.battle && isActive(existing.battle)) {
    return { ok: false, error: "ALREADY_IN_BATTLE" };
  }
  if (existing.inQueue) {
    return { ok: false, error: "ALREADY_IN_QUEUE" };
  }
  // Remove from queue if already there (should not happen due to check above)
  queue.delete(telegramId);
  // Try to find a match immediately
  const match = findMatch(planet);
  if (match) {
    // Create battle immediately
    const battle = createBattle(telegramId, planet, match.telegramId, match.planet, username, match.username);
    return { ok: true, battle };
  }
  // No match found — enter queue
  queue.set(telegramId, { telegramId, planet, joinedAt: Date.now(), username });
  return { ok: true };
}

export function leaveQueue(telegramId: string): { ok: boolean } {
  queue.delete(telegramId);
  return { ok: true };
}

export function getQueueStatus(telegramId: string): {
  inQueue: boolean;
  joinedAt?: number;
  battle?: Battle;
} {
  // Check if in active battle. Terminal battles (completed/cancelled/
  // transfer_failed) are intentionally ignored — they're fetched by explicit
  // battle id only — so a finished battle never lingers in /pvp/status.
  for (const b of battles.values()) {
    if (!isActive(b)) continue;
    if (b.player1.telegramId === telegramId || b.player2.telegramId === telegramId) {
      return { inQueue: false, battle: b };
    }
  }
  const q = queue.get(telegramId);
  if (q) {
    return { inQueue: true, joinedAt: q.joinedAt };
  }
  return { inQueue: false };
}

export function getBattle(battleId: string): Battle | undefined {
  return battles.get(battleId);
}

// ─── Matchmaking ─────────────────────────────────────────────────────

function findMatch(_planet: PlanetEntry): QueueEntry | null {
  // Any rarity can battle any other rarity — match the first waiting opponent.
  // Rarity only affects the win probability (calcWinProbability), never whether
  // a match is found. (Previously a ±1-tier tolerance blocked e.g. V1 vs MYTHIC.)
  for (const entry of queue.values()) {
    return entry;
  }
  return null;
}

// ─── Battle Lifecycle ────────────────────────────────────────────────

function createBattle(
  p1Id: string,
  p1Planet: PlanetEntry,
  p2Id: string,
  p2Planet: PlanetEntry,
  p1Username?: string,
  p2Username?: string,
): Battle {
  const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const battle: Battle = {
    id,
    player1: { telegramId: p1Id, planet: p1Planet, confirmed: false, username: p1Username },
    player2: { telegramId: p2Id, planet: p2Planet, confirmed: false, username: p2Username },
    status: "pending",
    createdAt: Date.now(),
    confirmDeadline: Date.now() + CONFIRM_TIMEOUT_MS,
  };
  battles.set(id, battle);
  // Remove both from queue
  queue.delete(p1Id);
  queue.delete(p2Id);
  // Start confirmation timer
  startConfirmTimer(battle);
  return battle;
}

export async function confirmBattle(battleId: string, telegramId: string): Promise<{
  ok: boolean;
  error?: string;
  battle?: Battle;
}> {
  const b = battles.get(battleId);
  if (!b) return { ok: false, error: "NOT_FOUND" };
  if (b.status !== "pending" && b.status !== "confirming") {
    return { ok: false, error: "NOT_PENDING" };
  }
  const isP1 = b.player1.telegramId === telegramId;
  const isP2 = b.player2.telegramId === telegramId;
  if (!isP1 && !isP2) return { ok: false, error: "NOT_PARTICIPANT" };

  if (isP1) b.player1.confirmed = true;
  if (isP2) b.player2.confirmed = true;

  if (b.player1.confirmed && b.player2.confirmed) {
    b.status = "roulette";
    // Run roulette synchronously before returning
    await runRoulette(b);
  } else {
    b.status = "confirming";
  }
  return { ok: true, battle: b };
}

export function declineBattle(battleId: string, telegramId: string): {
  ok: boolean;
  error?: string;
} {
  const b = battles.get(battleId);
  if (!b) return { ok: false, error: "NOT_FOUND" };
  const isP1 = b.player1.telegramId === telegramId;
  const isP2 = b.player2.telegramId === telegramId;
  if (!isP1 && !isP2) return { ok: false, error: "NOT_PARTICIPANT" };
  // Can only decline if still pending or confirming
  if (b.status !== "pending" && b.status !== "confirming") {
    return { ok: false, error: "NOT_CANCELLABLE" };
  }
  b.status = "cancelled";
  // Clean up after a short delay
  setTimeout(() => battles.delete(battleId), 30_000);
  return { ok: true };
}

function startConfirmTimer(battle: Battle) {
  const delay = Math.max(0, battle.confirmDeadline - Date.now());
  setTimeout(() => {
    const b = battles.get(battle.id);
    if (!b) return;
    if (b.status === "pending" || b.status === "confirming") {
      // Timeout: not both confirmed
      b.status = "cancelled";
      // Clean up
      setTimeout(() => battles.delete(battle.id), 30_000);
    }
  }, delay);
}

// ─── Roulette ────────────────────────────────────────────────────────

async function runRoulette(battle: Battle) {
  const p1 = battle.player1;
  const p2 = battle.player2;
  const winProb = calcWinProbability(p1.planet.rarity, p2.planet.rarity);
  battle.winProbability = winProb;

  // Random winner based on weight
  const winnerIsP1 = Math.random() < winProb;
  const winner = winnerIsP1 ? p1 : p2;
  const loser = winnerIsP1 ? p2 : p1;

  battle.winnerTelegramId = winner.telegramId;
  battle.loserTelegramId = loser.telegramId;

  // Transfer planet BEFORE marking completed — atomic outcome
  const transferred = await transferPlanet(loser.telegramId, winner.telegramId, loser.planet.id, battle.id);

  if (transferred) {
    battle.status = "completed";
  } else {
    battle.status = "transfer_failed";
  }
  battle.resultTimestamp = Date.now();

  // Clean up after 5 minutes
  setTimeout(() => battles.delete(battle.id), 5 * 60 * 1000);
}

// ─── Atomic Planet Transfer ─────────────────────────────────────────

async function transferPlanet(
  fromTelegramId: string,
  toTelegramId: string,
  planetId: string,
  battleId: string,
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      // Read both users with FOR UPDATE
      const [fromUser] = await tx
        .select({ planetsJson: usersTable.planetsJson })
        .from(usersTable)
        .where(eq(usersTable.telegramId, fromTelegramId))
        .for("update")
        .limit(1);
      const [toUser] = await tx
        .select({ planetsJson: usersTable.planetsJson })
        .from(usersTable)
        .where(eq(usersTable.telegramId, toTelegramId))
        .for("update")
        .limit(1);

      if (!fromUser || !toUser) {
        throw new Error("User not found during planet transfer");
      }

      const fromPlanets = Array.isArray(fromUser.planetsJson)
        ? (fromUser.planetsJson as Array<Record<string, unknown>>)
        : [];
      const toPlanets = Array.isArray(toUser.planetsJson)
        ? (toUser.planetsJson as Array<Record<string, unknown>>)
        : [];

      // Find the planet in from user's inventory
      const planetIdx = fromPlanets.findIndex(
        (p) => p && typeof p === "object" && p["id"] === planetId,
      );
      if (planetIdx === -1) {
        throw new Error(`Planet ${planetId} not found in ${fromTelegramId}'s inventory`);
      }

      const planet = fromPlanets[planetIdx];
      // Remove from loser
      const newFromPlanets = fromPlanets.filter((_, i) => i !== planetIdx);
      // Add to winner (reset farming state)
      const transferredPlanet = {
        ...planet,
        farmStartedAt: undefined,
        isFarmingActive: false,
        slotIndex: null,
      };
      const newToPlanets = [...toPlanets, transferredPlanet];

      // Write both
      await tx
        .update(usersTable)
        .set({ planetsJson: sql`${JSON.stringify(newFromPlanets)}::jsonb` })
        .where(eq(usersTable.telegramId, fromTelegramId));
      await tx
        .update(usersTable)
        .set({ planetsJson: sql`${JSON.stringify(newToPlanets)}::jsonb` })
        .where(eq(usersTable.telegramId, toTelegramId));
    });

    // Record history for both
    void recordHistory({
      telegramId: fromTelegramId,
      kind: "pvp_battle_lost",
      delta: 0,
      currency: "planet",
      meta: { battleId, planetId, opponentId: toTelegramId },
    });
    void recordHistory({
      telegramId: toTelegramId,
      kind: "pvp_battle_won",
      delta: 0,
      currency: "planet",
      meta: { battleId, planetId, opponentId: fromTelegramId },
    });

    logger.info({ battleId, from: fromTelegramId, to: toTelegramId, planetId }, "[pvp] planet transferred");
    return true;
  } catch (err) {
    logger.error({ err, battleId, from: fromTelegramId, to: toTelegramId }, "[pvp] planet transfer FAILED");
    return false;
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────

// Run every 60s: remove stale queue entries
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of queue.entries()) {
    if (now - entry.joinedAt > QUEUE_TIMEOUT_MS) {
      queue.delete(id);
      logger.info({ telegramId: id }, "[pvp] queue timeout");
    }
  }
}, 60_000);

// Also clean up stale battles (older than 10 min, still pending)
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of battles.entries()) {
    if (b.status === "cancelled" && now - b.resultTimestamp! > 60_000) {
      battles.delete(id);
      continue;
    }
    if ((b.status === "pending" || b.status === "confirming") && now - b.createdAt > 5 * 60_000) {
      b.status = "cancelled";
      setTimeout(() => battles.delete(id), 30_000);
    }
  }
}, 60_000);
