import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface WheelPrize {
  index: number;
  type: "zoom" | "planet" | "stars" | "ton";
  zoomAmount?: number;
  planetType?: "BASIC" | "RARE" | "EPIC";
  starsAmount?: number;
  tonAmount?: number;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  weight: number;
}

// 12 segments. Decoys (stars/ton) have weight 0 — visible but never selected.
export const WHEEL_PRIZES: WheelPrize[] = [
  { index: 0,  type: "zoom",   zoomAmount: 100,   label: "100 $ZOOM",   shortLabel: "100",   icon: "🪐", color: "#8892b0", weight: 35 },
  { index: 1,  type: "stars",  starsAmount: 100,  label: "100 STARS",   shortLabel: "100",   icon: "⭐", color: "#ffd700", weight: 0 },
  { index: 2,  type: "zoom",   zoomAmount: 500,   label: "500 $ZOOM",   shortLabel: "500",   icon: "🪐", color: "#4facfe", weight: 25 },
  { index: 3,  type: "ton",    tonAmount: 1,      label: "1 TON",       shortLabel: "1",     icon: "💎", color: "#0098ea", weight: 0 },
  { index: 4,  type: "zoom",   zoomAmount: 1000,  label: "1K $ZOOM",    shortLabel: "1K",    icon: "🪐", color: "#00f2fe", weight: 15 },
  { index: 5,  type: "planet", planetType: "BASIC", label: "BASIC PLANET", shortLabel: "BASIC", icon: "◇", color: "#a0aec0", weight: 10 },
  { index: 6,  type: "zoom",   zoomAmount: 2500,  label: "2.5K $ZOOM",  shortLabel: "2.5K",  icon: "🪐", color: "#43e97b", weight: 7 },
  { index: 7,  type: "stars",  starsAmount: 200,  label: "200 STARS",   shortLabel: "200",   icon: "⭐", color: "#ffb347", weight: 0 },
  { index: 8,  type: "planet", planetType: "RARE",  label: "RARE PLANET",  shortLabel: "RARE",  icon: "◈", color: "#4facfe", weight: 5 },
  { index: 9,  type: "ton",    tonAmount: 10,     label: "10 TON",      shortLabel: "10",    icon: "💎", color: "#00d4ff", weight: 0 },
  { index: 10, type: "zoom",   zoomAmount: 5000,  label: "5K $ZOOM",    shortLabel: "5K",    icon: "🪐", color: "#f093fb", weight: 2.5 },
  { index: 11, type: "planet", planetType: "EPIC",  label: "EPIC PLANET",  shortLabel: "EPIC",  icon: "⬡", color: "#c471ed", weight: 0.5 },
];

function pickPrize(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of WHEEL_PRIZES) {
    if (p.weight <= 0) continue;
    r -= p.weight;
    if (r <= 0) return p;
  }
  return WHEEL_PRIZES[0];
}

router.get("/wheel/config", (_req, res) => {
  res.json({
    prizes: WHEEL_PRIZES.map(({ index, type, zoomAmount, planetType, starsAmount, tonAmount, label, shortLabel, icon, color }) => ({
      index, type, zoomAmount, planetType, starsAmount, tonAmount, label, shortLabel, icon, color,
    })),
  });
});

async function getStatus(telegramId: string) {
  const [row] = await db
    .select({ spins: usersTable.wheelSpins, lastDaily: usersTable.lastWheelDailyAt })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  const spins = row?.spins ?? 0;
  const lastDaily = row?.lastDaily ? row.lastDaily.getTime() : 0;
  const nextClaimAt = lastDaily ? lastDaily + DAILY_COOLDOWN_MS : 0;
  const canClaimDaily = !lastDaily || Date.now() >= nextClaimAt;
  return { spins, canClaimDaily, nextClaimAt };
}

router.get("/wheel/status/:telegramId", async (req, res) => {
  try {
    const status = await getStatus(req.params.telegramId);
    res.json(status);
  } catch (err) {
    console.error("[wheel/status] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Backwards-compatible
router.get("/wheel/spins/:telegramId", async (req, res) => {
  try {
    const status = await getStatus(req.params.telegramId);
    res.json({ spins: status.spins, canClaimDaily: status.canClaimDaily, nextClaimAt: status.nextClaimAt });
  } catch (err) {
    console.error("[wheel/spins] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/wheel/claim-daily", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }
  try {
    const cutoff = new Date(Date.now() - DAILY_COOLDOWN_MS);
    const updated = await db.execute(sql`
      UPDATE users
      SET wheel_spins = wheel_spins + 1,
          last_wheel_daily_at = NOW()
      WHERE telegram_id = ${telegramId}
        AND (last_wheel_daily_at IS NULL OR last_wheel_daily_at <= ${cutoff.toISOString()})
      RETURNING wheel_spins, last_wheel_daily_at
    `);

    if (!updated.rows || updated.rows.length === 0) {
      // Need to also create user row if missing
      const [exists] = await db.select({ id: usersTable.telegramId }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      if (!exists) {
        await db.insert(usersTable).values({ telegramId, wheelSpins: 1, lastWheelDailyAt: new Date() }).onConflictDoNothing();
        const status = await getStatus(telegramId);
        res.json({ ok: true, ...status });
        return;
      }
      const status = await getStatus(telegramId);
      res.status(409).json({ error: "Daily already claimed", ...status });
      return;
    }

    const status = await getStatus(telegramId);
    res.json({ ok: true, ...status });
  } catch (err) {
    console.error("[wheel/claim-daily] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

interface FeedEntry {
  ts: number;
  name: string;
  prizeLabel: string;
  prizeIcon: string;
  prizeColor: string;
  prizeType: "zoom" | "planet" | "stars" | "ton";
}
const FEED_MAX = 40;
const recentSpins: FeedEntry[] = [];
function pushFeed(entry: FeedEntry) {
  recentSpins.unshift(entry);
  if (recentSpins.length > FEED_MAX) recentSpins.length = FEED_MAX;
}
function maskName(first: string | null | undefined, username: string | null | undefined, telegramId: string): string {
  const raw = (first && first.trim()) || (username && username.trim()) || `Player${telegramId.slice(-4)}`;
  if (raw.length <= 2) return raw + "•";
  if (raw.length <= 4) return raw.slice(0, 2) + "•".repeat(raw.length - 2);
  return raw.slice(0, 3) + "•".repeat(Math.min(3, raw.length - 4)) + raw.slice(-1);
}

router.get("/wheel/feed", (_req, res) => {
  res.json({ entries: recentSpins });
});

router.post("/wheel/spin", async (req, res) => {
  const { telegramId } = req.body as { telegramId?: string };
  if (!telegramId) {
    res.status(400).json({ error: "Missing telegramId" });
    return;
  }

  try {
    const dec = await db.execute(sql`
      UPDATE users
      SET wheel_spins = wheel_spins - 1
      WHERE telegram_id = ${telegramId}
        AND wheel_spins > 0
      RETURNING wheel_spins
    `);

    if (!dec.rows || dec.rows.length === 0) {
      res.status(409).json({ error: "No spins available" });
      return;
    }

    const prize = pickPrize();

    if (prize.type === "zoom" && prize.zoomAmount) {
      await db.update(usersTable)
        .set({
          zoomBalance: sql`${usersTable.zoomBalance} + ${prize.zoomAmount}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, telegramId));
    } else if (prize.type === "planet" && prize.planetType) {
      const col = prize.planetType === "BASIC" ? "bonusBasic"
        : prize.planetType === "RARE" ? "bonusRare"
        : "bonusEpic";
      await db.update(usersTable)
        .set({ [col]: sql`${usersTable[col as keyof typeof usersTable.$inferSelect] as never} + 1` })
        .where(eq(usersTable.telegramId, telegramId));
    }

    const remaining = Number((dec.rows[0] as { wheel_spins: number }).wheel_spins);

    // Push to public feed (best-effort, non-blocking on errors)
    try {
      const [u] = await db
        .select({ first: usersTable.firstName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .limit(1);
      pushFeed({
        ts: Date.now(),
        name: maskName(u?.first ?? null, u?.username ?? null, telegramId),
        prizeLabel: prize.label,
        prizeIcon: prize.icon,
        prizeColor: prize.color,
        prizeType: prize.type,
      });
    } catch { /* ignore */ }

    res.json({
      prizeIndex: prize.index,
      prize: {
        type: prize.type,
        zoomAmount: prize.zoomAmount,
        planetType: prize.planetType,
        starsAmount: prize.starsAmount,
        tonAmount: prize.tonAmount,
        label: prize.label,
        color: prize.color,
        icon: prize.icon,
      },
      spinsRemaining: remaining,
    });
  } catch (err) {
    console.error("[wheel/spin] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
