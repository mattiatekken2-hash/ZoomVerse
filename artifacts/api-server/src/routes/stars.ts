import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router: IRouter = Router();

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
const TELEGRAM_WEBHOOK_SECRET = process.env["TELEGRAM_WEBHOOK_SECRET"] || "";
const TON_WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const TONCENTER_API_KEY = process.env["TONCENTER_API_KEY"] || "";

interface TonCenterTx {
  utime: number;
  transaction_id: { hash: string };
  in_msg?: { value: string; source: string };
}

async function verifyTonPaymentOnChain(expectedTon: number, ourWallet: string): Promise<{ hash: string; source: string; valueNano: string } | null> {
  try {
    const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(ourWallet)}&limit=40`;
    const headers: Record<string, string> = {};
    if (TONCENTER_API_KEY) headers["X-API-Key"] = TONCENTER_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn("[ton-verify] toncenter HTTP", res.status);
      return null;
    }
    const data = await res.json() as { ok: boolean; result?: TonCenterTx[] };
    if (!data.ok || !data.result) return null;
    const expectedNano = BigInt(Math.round(expectedTon * 1e9));
    const tolerance = expectedNano / 50n; // 2% tolerance for fees
    const minTime = Math.floor(Date.now() / 1000) - 900; // last 15 minutes
    for (const tx of data.result) {
      if (tx.utime < minTime) continue;
      const inMsg = tx.in_msg;
      if (!inMsg?.value) continue;
      const val = BigInt(inMsg.value);
      if (val + tolerance >= expectedNano) {
        return { hash: tx.transaction_id.hash, source: inMsg.source, valueNano: inMsg.value };
      }
    }
    return null;
  } catch (err) {
    console.error("[ton-verify] error:", err);
    return null;
  }
}

interface StarsItem {
  id: string;
  title: string;
  description: string;
  starsPrice: number;
  tonPrice: number;
  zoomAmount?: number;
  itemType: string;
}

const SUN_MAX_PER_USER = 5;
const SUN_MAX_GLOBAL = 50;

const STARS_CATALOG: StarsItem[] = [
  { id: "starter_pack", title: "Starter Pack", description: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, tonPrice: 0.5, zoomAmount: 2000, itemType: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", description: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, tonPrice: 1.5, zoomAmount: 8000, itemType: "bundle" },
  { id: "legend_pack", title: "Legend Pack", description: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, tonPrice: 4.0, zoomAmount: 25000, itemType: "bundle" },
  { id: "the_sun", title: "THE SUN", description: "Exclusive limited-edition star — 1000 $ZOOM/hr", starsPrice: 1000, tonPrice: 10, itemType: "sun" },
  { id: "extra_slot", title: "Extra Slot", description: "Unlock 1 additional planet slot", starsPrice: 25, tonPrice: 0.25, itemType: "slot" },
  { id: "wheel_spin_1",  title: "1 Wheel Spin",   description: "1 spin on the Fortune Wheel",   starsPrice: 50,  tonPrice: 0.5, zoomAmount: 1,  itemType: "wheel_spin" },
  { id: "wheel_spin_5",  title: "5 Wheel Spins",  description: "5 spins on the Fortune Wheel — 20% off",  starsPrice: 200, tonPrice: 2.0, zoomAmount: 5,  itemType: "wheel_spin" },
  { id: "wheel_spin_10", title: "10 Wheel Spins", description: "10 spins on the Fortune Wheel — 30% off", starsPrice: 350, tonPrice: 3.5, zoomAmount: 10, itemType: "wheel_spin" },
];

function findItem(itemId: string): StarsItem | undefined {
  return STARS_CATALOG.find((i) => i.id === itemId);
}

async function creditUser(item: StarsItem, telegramId: string) {
  if (item.itemType === "bundle" && item.zoomAmount) {
    await db.update(usersTable)
      .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${item.zoomAmount}` })
      .where(eq(usersTable.telegramId, telegramId));

    const planetType = item.id === "starter_pack" ? "bonusBasic"
      : item.id === "explorer_pack" ? "bonusRare"
      : "bonusEpic";
    await db.update(usersTable)
      .set({ [planetType]: sql`${usersTable[planetType]} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "sun") {
    const result = await db.execute(sql`
      UPDATE users
      SET sun_count = sun_count + 1, bonus_sun = true
      WHERE telegram_id = ${telegramId}
        AND sun_count < ${SUN_MAX_PER_USER}
        AND (SELECT COALESCE(SUM(sun_count), 0) FROM users) < ${SUN_MAX_GLOBAL}
      RETURNING sun_count
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUser] SUN credit denied for ${telegramId} (limit reached at credit time)`);
      throw new Error("SUN_LIMIT_REACHED");
    }
  } else if (item.itemType === "slot") {
    await db.update(usersTable)
      .set({ bonusSlots: sql`${usersTable.bonusSlots} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "wheel_spin") {
    const spins = item.zoomAmount || 1;
    await db.update(usersTable)
      .set({ wheelSpins: sql`${usersTable.wheelSpins} + ${spins}` })
      .where(eq(usersTable.telegramId, telegramId));
  }
}

async function getSunStock(): Promise<{ sold: number; remaining: number }> {
  const [row] = await db.select({ sold: sql<number>`COALESCE(SUM(${usersTable.sunCount}), 0)::int` }).from(usersTable);
  const sold = Number(row?.sold ?? 0);
  return { sold, remaining: Math.max(0, SUN_MAX_GLOBAL - sold) };
}

async function getUserSunCount(telegramId: string): Promise<number> {
  const [row] = await db.select({ c: usersTable.sunCount }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return row?.c ?? 0;
}

async function checkSunPurchasable(telegramId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [stock, userCount] = await Promise.all([getSunStock(), getUserSunCount(telegramId)]);
  if (userCount >= SUN_MAX_PER_USER) return { ok: false, reason: `You already own the maximum of ${SUN_MAX_PER_USER} SUNs` };
  if (stock.remaining <= 0) return { ok: false, reason: "SUN sold out" };
  return { ok: true };
}

router.get("/sun/stock", async (req, res) => {
  try {
    const telegramId = (req.query["telegramId"] as string) || "";
    const stock = await getSunStock();
    const userCount = telegramId ? await getUserSunCount(telegramId) : 0;
    res.json({ ...stock, max: SUN_MAX_GLOBAL, maxPerUser: SUN_MAX_PER_USER, userCount });
  } catch (err) {
    console.error("[sun/stock] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

async function atomicCreditIfPending(txnId: number, paymentId: string, item: StarsItem, telegramId: string): Promise<boolean> {
  // 1. Atomically claim the txn (only one concurrent caller wins)
  const updated = await db.update(transactionsTable)
    .set({ status: "completed", telegramPaymentId: paymentId })
    .where(and(
      eq(transactionsTable.id, txnId),
      eq(transactionsTable.status, "pending")
    ))
    .returning();

  if (updated.length === 0) return false;

  // 2. Credit; if it fails (e.g. SUN limit), roll the txn back to "failed"
  try {
    await creditUser(item, telegramId);
    return true;
  } catch (err) {
    console.error(`[atomicCredit] credit failed for txn ${txnId}, marking failed:`, err);
    await db.update(transactionsTable)
      .set({ status: "failed" })
      .where(eq(transactionsTable.id, txnId));
    throw err;
  }
}

router.get("/stars/catalog", (_req, res) => {
  res.json({ items: STARS_CATALOG });
});

router.post("/stars/create-invoice", async (req, res) => {
  const { telegramId, itemId } = req.body as { telegramId?: string; itemId?: string };
  if (!telegramId || !itemId) {
    res.status(400).json({ error: "Missing telegramId or itemId" });
    return;
  }
  if (!BOT_TOKEN) {
    res.status(500).json({ error: "Bot token not configured" });
    return;
  }

  const item = findItem(itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  if (item.itemType === "sun") {
    const check = await checkSunPurchasable(telegramId);
    if (!check.ok) {
      res.status(409).json({ error: check.reason });
      return;
    }
  }

  try {
    const [txn] = await db.insert(transactionsTable).values({
      telegramId,
      type: item.itemType,
      currency: "XTR",
      amount: item.zoomAmount || 0,
      starsAmount: item.starsPrice,
      itemId: item.id,
      itemName: item.title,
      status: "pending",
    }).returning();

    const payload = JSON.stringify({ txnId: txn.id, itemId: item.id, telegramId });

    const invoiceRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        description: item.description,
        payload,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: item.title, amount: item.starsPrice }],
      }),
    });

    const data = await invoiceRes.json() as { ok: boolean; result?: string; description?: string };
    if (!data.ok || !data.result) {
      console.error("[stars] createInvoiceLink failed:", data);
      res.status(500).json({ error: data.description || "Failed to create invoice" });
      return;
    }

    res.json({ invoiceUrl: data.result, txnId: txn.id });
  } catch (err) {
    console.error("[stars] create-invoice error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/stars/confirm", async (req, res) => {
  const { txnId, telegramId } = req.body as { txnId?: number; telegramId?: string };
  if (!txnId || !telegramId) {
    res.status(400).json({ error: "Missing txnId or telegramId" });
    return;
  }

  try {
    const [txn] = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.id, txnId))
      .limit(1);

    if (!txn) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (txn.status === "completed") {
      res.json({ ok: true, alreadyCredited: true });
      return;
    }

    if (txn.telegramId !== telegramId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const item = findItem(txn.itemId || "");
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.itemType === "sun") {
      const check = await checkSunPurchasable(telegramId);
      if (!check.ok) {
        res.status(409).json({ error: check.reason });
        return;
      }
    }

    const credited = await atomicCreditIfPending(txnId, `stars_confirm_${txnId}_${Date.now()}`, item, telegramId);
    if (!credited) {
      res.json({ ok: true, alreadyCredited: true });
      return;
    }

    console.log(`[stars] Credited user ${telegramId} for item ${item.id} (txn ${txnId})`);
    res.json({ ok: true, itemId: item.id, itemName: item.title });
  } catch (err) {
    console.error("[stars] confirm error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

async function backgroundVerifyTon(txnId: number, item: StarsItem, telegramId: string, expectedTon: number) {
  const attempts = [4_000, 8_000, 12_000, 16_000, 20_000, 30_000, 30_000, 30_000]; // up to ~150s
  for (let i = 0; i < attempts.length; i++) {
    await new Promise((r) => setTimeout(r, attempts[i]));
    const found = await verifyTonPaymentOnChain(expectedTon, TON_WALLET);
    if (!found) continue;
    // Verify the on-chain hash isn't already used by another txn (prevent double-claim of same payment)
    const dupePid = `ton_chain_${found.hash}`;
    const existing = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.telegramPaymentId, dupePid)).limit(1);
    if (existing.length > 0 && existing[0].id !== txnId) {
      console.warn(`[ton-bg] tx hash ${found.hash} already linked to txn ${existing[0].id}`);
      continue;
    }
    try {
      const credited = await atomicCreditIfPending(txnId, dupePid, item, telegramId);
      if (credited) {
        console.log(`[ton-bg] verified+credited txn ${txnId} via on-chain hash ${found.hash}`);
        return;
      }
    } catch (err) {
      console.error(`[ton-bg] credit failed for txn ${txnId}:`, err);
      return;
    }
  }
  // Timed out — mark as failed if still pending
  await db.update(transactionsTable)
    .set({ status: "failed" })
    .where(and(eq(transactionsTable.id, txnId), eq(transactionsTable.status, "pending")));
  console.warn(`[ton-bg] verification timed out for txn ${txnId}`);
}

router.post("/ton/confirm", async (req, res) => {
  const { telegramId, itemId, walletAddress, tonAmount, boc } = req.body as {
    telegramId?: string;
    itemId?: string;
    walletAddress?: string;
    tonAmount?: number;
    boc?: string;
  };

  if (!telegramId || !itemId || !walletAddress || !boc) {
    res.status(400).json({ error: "Missing required fields (telegramId, itemId, walletAddress, boc)" });
    return;
  }

  const item = findItem(itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Server-authoritative amount: ignore client-sent tonAmount, use catalog price
  const expectedTon = item.tonPrice;

  if (item.itemType === "sun") {
    const check = await checkSunPurchasable(telegramId);
    if (!check.ok) {
      res.status(409).json({ error: check.reason });
      return;
    }
  }

  const bocPaymentId = `ton_boc_${boc.substring(0, 96)}`;
  const existing = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.telegramPaymentId, bocPaymentId))
    .limit(1);

  if (existing.length > 0) {
    const txn = existing[0];
    if (txn.status === "completed") {
      res.json({ ok: true, alreadyCredited: true, txnId: txn.id });
      return;
    }
    // Still pending — return current state, background already running
    res.status(202).json({ ok: true, pending: true, txnId: txn.id });
    return;
  }

  try {
    const [txn] = await db.insert(transactionsTable).values({
      telegramId,
      type: item.itemType,
      currency: "TON",
      amount: item.zoomAmount || 0,
      tonAmount: expectedTon,
      itemId: item.id,
      itemName: item.title,
      status: "pending",
      telegramPaymentId: bocPaymentId,
    }).returning();

    // Try a quick first verification (covers fast-confirming txs)
    const fast = await verifyTonPaymentOnChain(expectedTon, TON_WALLET);
    if (fast) {
      const chainPid = `ton_chain_${fast.hash}`;
      const dupe = await db.select().from(transactionsTable)
        .where(eq(transactionsTable.telegramPaymentId, chainPid)).limit(1);
      if (dupe.length === 0) {
        try {
          const credited = await atomicCreditIfPending(txn.id, chainPid, item, telegramId);
          if (credited) {
            console.log(`[ton] fast-verified+credited txn ${txn.id} (item ${item.id}) hash=${fast.hash}`);
            res.json({ ok: true, verified: true, txnId: txn.id, itemId: item.id, itemName: item.title });
            return;
          }
        } catch (err) {
          res.status(500).json({ error: "Credit failed", txnId: txn.id });
          return;
        }
      }
    }

    // Schedule background polling — frontend polls /stars/txn/:txnId
    void backgroundVerifyTon(txn.id, item, telegramId, expectedTon);
    res.status(202).json({ ok: true, pending: true, txnId: txn.id, message: "Awaiting on-chain confirmation" });
    void tonAmount;
    void walletAddress;
  } catch (err) {
    console.error("[ton] confirm error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

const pendingReferrals = new Map<string, string>();

router.get("/referral/pending/:telegramId", (req, res) => {
  const { telegramId } = req.params;
  const referrer = pendingReferrals.get(telegramId);
  if (referrer) {
    pendingReferrals.delete(telegramId);
    res.json({ referrer });
  } else {
    res.json({ referrer: null });
  }
});

router.post("/stars/webhook", async (req, res) => {
  // Verify Telegram secret token (set via setWebhook). In dev (no secret), skip.
  if (TELEGRAM_WEBHOOK_SECRET) {
    const provided = req.header("x-telegram-bot-api-secret-token");
    if (provided !== TELEGRAM_WEBHOOK_SECRET) {
      console.warn("[stars/webhook] rejected: invalid secret token");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const update = req.body as {
    pre_checkout_query?: { id: string; invoice_payload: string };
    message?: {
      from?: { id: number; first_name?: string };
      text?: string;
      successful_payment?: { invoice_payload: string; telegram_payment_charge_id: string; total_amount: number };
    };
  };

  if (update.pre_checkout_query) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }),
    });
    res.json({ ok: true });
    return;
  }

  if (update.message?.from && (update.message.text?.startsWith("/start") || update.message.text?.toLowerCase() === "play zoom")) {
    const text = update.message.text || "";
    const parts = text.split(" ");
    const referrerId = parts.length > 1 ? parts[1]?.trim() : undefined;
    const userId = String(update.message.from.id);

    if (referrerId && referrerId !== userId && /^\d+$/.test(referrerId)) {
      console.log(`[webhook] /start from ${userId} with referrer ${referrerId}`);
      pendingReferrals.set(userId, referrerId);

      const [existingUser] = await db.select().from(usersTable)
        .where(eq(usersTable.telegramId, userId)).limit(1);

      if (existingUser && !existingUser.referredBy) {
        await db.update(usersTable)
          .set({ referredBy: referrerId })
          .where(eq(usersTable.telegramId, userId));

        await db
          .insert(usersTable)
          .values({ telegramId: referrerId, referralCount: 1, zoomBalance: 20 })
          .onConflictDoUpdate({
            target: usersTable.telegramId,
            set: {
              referralCount: sql`${usersTable.referralCount} + 1`,
              zoomBalance: sql`${usersTable.zoomBalance} + 20`,
            },
          });
        console.log(`[webhook] Late-linked ${userId} → referrer ${referrerId}, +20 ZOOM credited`);
      } else if (!existingUser) {
        console.log(`[webhook] Stored pending referral for new user ${userId} → ${referrerId}`);
      }
    } else {
      console.log(`[webhook] /start from ${userId} (no referral)`);
    }

    const chatId = update.message.from.id;
    const appDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0] || process.env["REPLIT_DEV_DOMAIN"] || "";
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "🚀 Welcome to Zoom! Use the 'Play' button in the menu to launch the game.",
        }),
      });
    } catch (err) {
      console.error("[webhook] Failed to send welcome message:", err);
    }
  }

  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    try {
      const payloadData = JSON.parse(payment.invoice_payload) as { txnId: number; itemId: string; telegramId: string };

      const item = findItem(payloadData.itemId);
      if (item) {
        await atomicCreditIfPending(payloadData.txnId, payment.telegram_payment_charge_id, item, payloadData.telegramId);
      }
    } catch (err) {
      console.error("[stars] webhook error:", err);
    }
    res.json({ ok: true });
    return;
  }

  res.json({ ok: true });
});

router.get("/stars/txn/:txnId", async (req, res) => {
  const txnId = parseInt(req.params.txnId, 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid txnId" }); return; }

  const [txn] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txnId)).limit(1);
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ status: txn.status, itemId: txn.itemId, itemName: txn.itemName });
});

export default router;
