import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { Cell, Address } from "@ton/core";

const router: IRouter = Router();

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
const TELEGRAM_WEBHOOK_SECRET = process.env["TELEGRAM_WEBHOOK_SECRET"] || "";
const TON_WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const TON_WALLET_RAW = Address.parse(TON_WALLET).toRawString().toLowerCase();
const TONAPI_TOKEN = process.env["TONAPI_TOKEN"] || "";

interface TonApiTx {
  hash: string;
  success?: boolean;
  account?: { address: string };
  in_msg?: { value?: string; destination?: { address: string }; source?: { address: string } };
}

function computeMsgHashFromBoc(boc: string): string | null {
  try {
    const cell = Cell.fromBase64(boc);
    return cell.hash().toString("hex");
  } catch {
    return null;
  }
}

async function fetchTxByMsgHash(msgHashHex: string): Promise<TonApiTx | null> {
  try {
    const url = `https://tonapi.io/v2/blockchain/messages/${msgHashHex}/transaction`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (TONAPI_TOKEN) headers["Authorization"] = `Bearer ${TONAPI_TOKEN}`;
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn("[ton-verify] tonapi HTTP", res.status);
      return null;
    }
    return await res.json() as TonApiTx;
  } catch (err) {
    console.error("[ton-verify] tonapi error:", err);
    return null;
  }
}

/**
 * Cryptographically verifies that `boc` is an on-chain payment of >= expectedNano nanotons
 * to TON_WALLET. Returns the on-chain tx hash, or a reason string for failure.
 */
async function verifyTonBoc(boc: string, expectedNano: bigint, expectedSenderRaw: string): Promise<{ ok: true; msgHash: string; txHash: string } | { ok: false; reason: string; retriable: boolean }> {
  const msgHash = computeMsgHashFromBoc(boc);
  if (!msgHash) return { ok: false, reason: "Invalid BOC", retriable: false };

  const tx = await fetchTxByMsgHash(msgHash);
  if (!tx) return { ok: false, reason: "Tx not yet on-chain", retriable: true };
  if (tx.success === false) return { ok: false, reason: "Tx failed on-chain", retriable: false };

  const destStr = tx.in_msg?.destination?.address || tx.account?.address;
  if (!destStr) return { ok: false, reason: "No destination on tx", retriable: false };
  let destRaw: string;
  try { destRaw = Address.parse(destStr).toRawString().toLowerCase(); }
  catch { return { ok: false, reason: "Bad destination addr", retriable: false }; }
  if (destRaw !== TON_WALLET_RAW) return { ok: false, reason: "Wrong destination wallet", retriable: false };

  // Bind sender: the on-chain in_msg.source MUST match the wallet the user
  // connected via TonConnect. This prevents an attacker from claiming a
  // payment proof originated from someone else's wallet.
  const srcStr = tx.in_msg?.source?.address;
  if (!srcStr) return { ok: false, reason: "No sender on tx", retriable: false };
  let srcRaw: string;
  try { srcRaw = Address.parse(srcStr).toRawString().toLowerCase(); }
  catch { return { ok: false, reason: "Bad sender addr", retriable: false }; }
  if (srcRaw !== expectedSenderRaw) return { ok: false, reason: "Sender wallet mismatch", retriable: false };

  const value = BigInt(tx.in_msg?.value || "0");
  const tolerance = expectedNano / 50n; // 2% tolerance for forwarding fees
  if (value + tolerance < expectedNano) return { ok: false, reason: `Insufficient amount: ${value} < ${expectedNano}`, retriable: false };

  return { ok: true, msgHash, txHash: tx.hash };
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

/**
 * BACKEND-REVENUE-TRACKER
 * Returns the global revenue pool: the sum of every confirmed payment
 * (TON + Telegram Stars) flowing through the bot. Only `status = 'completed'`
 * rows are counted, which means:
 *  - Stars purchases are aggregated only after the Telegram webhook with a
 *    valid `x-telegram-bot-api-secret-token` flips the txn to "completed".
 *  - TON purchases are aggregated only after on-chain verification via
 *    tonapi.io confirms a payment of >= expected nano to the project wallet
 *    from the same TonConnect wallet that initiated the purchase.
 * "pending" and "failed" txns are ignored, so refunds/fraud attempts cannot
 * inflate the counter. Read-only and cache-busting.
 */
router.get("/total-pool", async (_req, res) => {
  try {
    const [row] = await db
      .select({
        ton: sql<string>`COALESCE(SUM(${transactionsTable.tonAmount}), 0)::text`,
        stars: sql<string>`COALESCE(SUM(${transactionsTable.starsAmount}), 0)::text`,
        count: sql<string>`COUNT(*)::text`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.status, "completed"));
    res.set("Cache-Control", "no-store");
    res.json({
      ton: Number(row?.ton ?? 0),
      stars: Number(row?.stars ?? 0),
      count: Number(row?.count ?? 0),
    });
  } catch (err) {
    console.error("[total-pool] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

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

/**
 * Stars confirm is now status-only. Crediting happens EXCLUSIVELY in the webhook
 * (with Telegram secret-token auth), so this endpoint cannot be used to claim
 * unpaid items. Frontend should poll until status becomes "completed" or "failed".
 */
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

    if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
    if (txn.telegramId !== telegramId) { res.status(403).json({ error: "Unauthorized" }); return; }

    if (txn.status === "completed") {
      res.json({ ok: true, alreadyCredited: true, itemId: txn.itemId, itemName: txn.itemName });
      return;
    }
    if (txn.status === "failed") {
      res.json({ ok: false, status: "failed", error: "Payment failed" });
      return;
    }
    // Still pending — webhook hasn't confirmed yet
    res.status(202).json({ ok: true, pending: true });
  } catch (err) {
    console.error("[stars] confirm error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

async function tryVerifyAndCreditTon(txnId: number, item: StarsItem, telegramId: string, boc: string, expectedNano: bigint, expectedSenderRaw: string): Promise<{ status: "ok" | "pending" | "failed"; reason?: string }> {
  const v = await verifyTonBoc(boc, expectedNano, expectedSenderRaw);
  if (v.ok) {
    try {
      // The DB unique constraint on telegram_payment_id (already set to ton_msg_<msgHash>) prevents double-credit.
      // atomicCreditIfPending only flips pending -> completed, then credits.
      const credited = await atomicCreditIfPending(txnId, `ton_msg_${v.msgHash}`, item, telegramId);
      if (credited) {
        console.log(`[ton] verified+credited txn ${txnId} msgHash=${v.msgHash} txHash=${v.txHash}`);
        return { status: "ok" };
      }
      return { status: "ok" }; // already credited
    } catch (err) {
      console.error(`[ton] credit failed for txn ${txnId}:`, err);
      return { status: "failed", reason: "Credit error" };
    }
  }
  if (v.retriable) return { status: "pending", reason: v.reason };
  // Permanent failure
  await db.update(transactionsTable)
    .set({ status: "failed" })
    .where(and(eq(transactionsTable.id, txnId), eq(transactionsTable.status, "pending")));
  console.warn(`[ton] permanent verify failure txn ${txnId}: ${v.reason}`);
  return { status: "failed", reason: v.reason };
}

async function backgroundVerifyTon(txnId: number, item: StarsItem, telegramId: string, boc: string, expectedNano: bigint, expectedSenderRaw: string) {
  const attempts = [5_000, 8_000, 12_000, 18_000, 25_000, 30_000, 30_000, 30_000]; // up to ~160s
  for (const wait of attempts) {
    await new Promise((r) => setTimeout(r, wait));
    const r = await tryVerifyAndCreditTon(txnId, item, telegramId, boc, expectedNano, expectedSenderRaw);
    if (r.status !== "pending") return;
  }
  await db.update(transactionsTable)
    .set({ status: "failed" })
    .where(and(eq(transactionsTable.id, txnId), eq(transactionsTable.status, "pending")));
  console.warn(`[ton-bg] verification timed out for txn ${txnId}`);
}

router.post("/ton/confirm", async (req, res) => {
  const { telegramId, itemId, walletAddress, boc } = req.body as {
    telegramId?: string;
    itemId?: string;
    walletAddress?: string;
    boc?: string;
  };

  if (!telegramId || !itemId || !walletAddress || !boc) {
    res.status(400).json({ error: "Missing required fields (telegramId, itemId, walletAddress, boc)" });
    return;
  }

  const item = findItem(itemId);
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  // Server-authoritative amount: ignore any client-sent value
  const expectedTon = item.tonPrice;
  const expectedNano = BigInt(Math.round(expectedTon * 1e9));

  if (item.itemType === "sun") {
    const check = await checkSunPurchasable(telegramId);
    if (!check.ok) { res.status(409).json({ error: check.reason }); return; }
  }

  // Normalize the connected wallet to raw form; payment must originate from this address.
  let expectedSenderRaw: string;
  try { expectedSenderRaw = Address.parse(walletAddress).toRawString().toLowerCase(); }
  catch { res.status(400).json({ error: "Invalid walletAddress" }); return; }

  // Compute msgHash: this is deterministic from the boc, and is the on-chain
  // in-message hash. We use it as the unique paymentId so the DB unique constraint
  // on telegram_payment_id makes double-credit impossible across all code paths.
  const msgHash = computeMsgHashFromBoc(boc);
  if (!msgHash) { res.status(400).json({ error: "Invalid BOC" }); return; }
  const paymentId = `ton_msg_${msgHash}`;

  // Atomic insert; if same boc already submitted, we get the existing txn
  let txnId: number;
  try {
    const [inserted] = await db.insert(transactionsTable).values({
      telegramId,
      type: item.itemType,
      currency: "TON",
      amount: item.zoomAmount || 0,
      tonAmount: expectedTon,
      itemId: item.id,
      itemName: item.title,
      status: "pending",
      telegramPaymentId: paymentId,
    }).returning();
    txnId = inserted.id;
  } catch (err: unknown) {
    // Unique violation on telegramPaymentId — fetch existing
    const [existing] = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.telegramPaymentId, paymentId)).limit(1);
    if (!existing) {
      console.error("[ton] insert failed and no existing row:", err);
      res.status(500).json({ error: "Internal error" });
      return;
    }
    if (existing.telegramId !== telegramId) {
      res.status(403).json({ error: "Boc already submitted by another user" });
      return;
    }
    if (existing.status === "completed") {
      res.json({ ok: true, alreadyCredited: true, txnId: existing.id, itemId: existing.itemId, itemName: existing.itemName });
      return;
    }
    if (existing.status === "failed") {
      res.json({ ok: false, status: "failed", error: "Payment failed verification" });
      return;
    }
    // Still pending — return; background poller already running
    res.status(202).json({ ok: true, pending: true, txnId: existing.id });
    return;
  }

  // First verification attempt (synchronous, fast-path). If retriable, schedule background.
  const first = await tryVerifyAndCreditTon(txnId, item, telegramId, boc, expectedNano, expectedSenderRaw);
  if (first.status === "ok") {
    res.json({ ok: true, verified: true, txnId, itemId: item.id, itemName: item.title });
    return;
  }
  if (first.status === "failed") {
    res.json({ ok: false, status: "failed", error: first.reason || "Verification failed" });
    return;
  }
  // Pending — schedule background polling, frontend polls txn status
  void backgroundVerifyTon(txnId, item, telegramId, boc, expectedNano, expectedSenderRaw);
  res.status(202).json({ ok: true, pending: true, txnId, message: "Awaiting on-chain confirmation" });
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
  // Fail-closed: in production, reject if secret missing or mismatched.
  // In dev, allow only when no secret is configured (so local Telegram testing works).
  const isProd = process.env["NODE_ENV"] === "production";
  if (!TELEGRAM_WEBHOOK_SECRET) {
    if (isProd) {
      console.error("[stars/webhook] FATAL: TELEGRAM_WEBHOOK_SECRET not set in production");
      res.status(503).json({ error: "Webhook misconfigured" });
      return;
    }
  } else {
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
