import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { randomBytes, createHmac } from "node:crypto";

const router: IRouter = Router();

const FREE_LIFE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_Z_PER_RUN = 500;
const EXTRA_LIFE_TON_COST = 0.10;
const SESSION_TTL_MS = 15 * 60 * 1000;

const SECRET = process.env["ARCADE_SECRET"] || "zoom-arcade-fallback-secret";

type Session = { telegramId: string; createdAt: number; lifeKind: "free" | "extra" };
const sessions = new Map<string, Session>();

function gcSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.createdAt > SESSION_TTL_MS) sessions.delete(k);
  }
}

function makeToken(telegramId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const ts = Date.now().toString(36);
  const payload = `${telegramId}.${ts}.${nonce}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

function verifyToken(token: string, telegramId: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [tid, ts, nonce, sig] = parts;
  if (tid !== telegramId) return false;
  const expected = createHmac("sha256", SECRET).update(`${tid}.${ts}.${nonce}`).digest("hex").slice(0, 16);
  return expected === sig;
}

function freeLifeAvailable(lastUsed: Date | null): boolean {
  if (!lastUsed) return true;
  return Date.now() - lastUsed.getTime() >= FREE_LIFE_COOLDOWN_MS;
}

function nextFreeLifeIn(lastUsed: Date | null): number {
  if (!lastUsed) return 0;
  const delta = FREE_LIFE_COOLDOWN_MS - (Date.now() - lastUsed.getTime());
  return Math.max(0, delta);
}

router.get("/arcade/state/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }
  try {
    const [u] = await db.select({
      zCoins: usersTable.zCoins,
      zCoinsBest: usersTable.zCoinsBest,
      arcadeFreeLastUsedAt: usersTable.arcadeFreeLastUsedAt,
      arcadeExtraLives: usersTable.arcadeExtraLives,
      tonBalance: usersTable.tonBalance,
    }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);

    if (!u) {
      res.json({
        zCoins: 0,
        zCoinsBest: 0,
        freeLifeAvailable: true,
        nextFreeLifeMs: 0,
        extraLives: 0,
        tonBalance: 0,
        extraLifeCostTon: EXTRA_LIFE_TON_COST,
      });
      return;
    }

    res.json({
      zCoins: u.zCoins,
      zCoinsBest: u.zCoinsBest,
      freeLifeAvailable: freeLifeAvailable(u.arcadeFreeLastUsedAt),
      nextFreeLifeMs: nextFreeLifeIn(u.arcadeFreeLastUsedAt),
      extraLives: u.arcadeExtraLives,
      tonBalance: u.tonBalance,
      extraLifeCostTon: EXTRA_LIFE_TON_COST,
    });
  } catch (err) {
    console.error("[arcade/state] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/arcade/leaderboard", async (_req, res) => {
  try {
    const rows = await db.select({
      telegramId: usersTable.telegramId,
      firstName: usersTable.firstName,
      username: usersTable.username,
      zCoins: usersTable.zCoins,
      zCoinsBest: usersTable.zCoinsBest,
    })
      .from(usersTable)
      .where(sql`${usersTable.zCoins} > 0`)
      .orderBy(desc(usersTable.zCoins))
      .limit(10);

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      telegramId: r.telegramId,
      firstName: r.firstName || r.username || "Player",
      zCoins: r.zCoins,
      zCoinsBest: r.zCoinsBest,
    }));
    res.json({ leaderboard });
  } catch (err) {
    console.error("[arcade/leaderboard] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const StartBody = z.object({ telegramId: z.string().min(1) });
router.post("/arcade/start-life", async (req, res) => {
  const parsed = StartBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId } = parsed.data;
  gcSessions();

  try {
    const [u] = await db.select({
      arcadeFreeLastUsedAt: usersTable.arcadeFreeLastUsedAt,
      arcadeExtraLives: usersTable.arcadeExtraLives,
    }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);

    const lastUsed = u?.arcadeFreeLastUsedAt ?? null;
    const extra = u?.arcadeExtraLives ?? 0;

    if (freeLifeAvailable(lastUsed)) {
      // Atomic CAS: only consume free life if still eligible.
      const now = new Date();
      const cutoff = new Date(Date.now() - FREE_LIFE_COOLDOWN_MS);
      const updated = await db.update(usersTable)
        .set({ arcadeFreeLastUsedAt: now })
        .where(and(
          eq(usersTable.telegramId, telegramId),
          sql`(${usersTable.arcadeFreeLastUsedAt} IS NULL OR ${usersTable.arcadeFreeLastUsedAt} <= ${cutoff})`,
        ))
        .returning({ telegramId: usersTable.telegramId });

      if (updated.length === 0) {
        // Race: free life consumed concurrently. Fall back to extra life.
        if (extra <= 0) {
          res.status(402).json({ error: "no_lives", message: "No lives available" });
          return;
        }
      } else {
        const token = makeToken(telegramId);
        sessions.set(token, { telegramId, createdAt: Date.now(), lifeKind: "free" });
        res.json({ ok: true, lifeKind: "free", sessionToken: token, maxZ: MAX_Z_PER_RUN });
        return;
      }
    }

    if (extra <= 0) {
      res.status(402).json({ error: "no_lives", message: "No lives available", nextFreeLifeMs: nextFreeLifeIn(lastUsed) });
      return;
    }

    // Atomic decrement of extra lives.
    const dec = await db.update(usersTable)
      .set({ arcadeExtraLives: sql`${usersTable.arcadeExtraLives} - 1` })
      .where(and(eq(usersTable.telegramId, telegramId), sql`${usersTable.arcadeExtraLives} > 0`))
      .returning({ left: usersTable.arcadeExtraLives });

    if (dec.length === 0) {
      res.status(402).json({ error: "no_lives", message: "No lives available" });
      return;
    }

    const token = makeToken(telegramId);
    sessions.set(token, { telegramId, createdAt: Date.now(), lifeKind: "extra" });
    res.json({ ok: true, lifeKind: "extra", sessionToken: token, maxZ: MAX_Z_PER_RUN });
  } catch (err) {
    console.error("[arcade/start-life] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const FinishBody = z.object({
  telegramId: z.string().min(1),
  sessionToken: z.string().min(1),
  zEarned: z.number().int().min(0),
  durationMs: z.number().int().min(0),
});
router.post("/arcade/finish", async (req, res) => {
  const parsed = FinishBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId, sessionToken, zEarned, durationMs } = parsed.data;

  if (!verifyToken(sessionToken, telegramId)) {
    res.status(403).json({ error: "Invalid session token" });
    return;
  }
  const session = sessions.get(sessionToken);
  if (!session || session.telegramId !== telegramId) {
    res.status(409).json({ error: "Session not found or already submitted" });
    return;
  }
  // One-shot consume.
  sessions.delete(sessionToken);

  // Server-authoritative cap and basic plausibility.
  // First clamp to per-run hard cap, then enforce time-based plausibility:
  // at most ~4 Z/sec sustained + a small grace allowance for very short runs.
  const credited = Math.max(0, Math.min(MAX_Z_PER_RUN, Math.floor(zEarned)));
  const maxByTime = Math.floor((durationMs / 1000) * 4) + 50;
  const safeCredit = Math.min(credited, maxByTime);

  try {
    const [row] = await db.update(usersTable)
      .set({
        zCoins: sql`${usersTable.zCoins} + ${safeCredit}`,
        zCoinsBest: sql`GREATEST(${usersTable.zCoinsBest}, ${safeCredit})`,
      })
      .where(eq(usersTable.telegramId, telegramId))
      .returning({ zCoins: usersTable.zCoins, zCoinsBest: usersTable.zCoinsBest });

    res.json({
      ok: true,
      credited: safeCredit,
      capped: zEarned > MAX_Z_PER_RUN,
      zCoins: row?.zCoins ?? safeCredit,
      zCoinsBest: row?.zCoinsBest ?? safeCredit,
    });
  } catch (err) {
    console.error("[arcade/finish] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const BuyLifeBody = z.object({ telegramId: z.string().min(1) });
router.post("/arcade/buy-life", async (req, res) => {
  const parsed = BuyLifeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { telegramId } = parsed.data;
  const cost = EXTRA_LIFE_TON_COST;

  try {
    // Atomic conditional debit + grant. Bumps balance_epoch so client snaps
    // to the new server-side TON balance on next sync.
    const updated = await db.update(usersTable)
      .set({
        tonBalance: sql`${usersTable.tonBalance} - ${cost}`,
        arcadeExtraLives: sql`${usersTable.arcadeExtraLives} + 1`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(and(eq(usersTable.telegramId, telegramId), sql`${usersTable.tonBalance} >= ${cost}`))
      .returning({
        tonBalance: usersTable.tonBalance,
        arcadeExtraLives: usersTable.arcadeExtraLives,
        balanceEpoch: usersTable.balanceEpoch,
      });

    if (updated.length === 0) {
      res.status(402).json({ error: "insufficient_ton", message: "Saldo TON insufficiente", costTon: cost });
      return;
    }
    const r = updated[0]!;
    res.json({
      ok: true,
      tonBalance: r.tonBalance,
      extraLives: r.arcadeExtraLives,
      balanceEpoch: r.balanceEpoch,
      costTon: cost,
    });
  } catch (err) {
    console.error("[arcade/buy-life] error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
