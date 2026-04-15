import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router: IRouter = Router();

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";

interface StarsItem {
  id: string;
  title: string;
  description: string;
  starsPrice: number;
  tonPrice: number;
  zoomAmount?: number;
  itemType: string;
}

const STARS_CATALOG: StarsItem[] = [
  { id: "starter_pack", title: "Starter Pack", description: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, tonPrice: 0.5, zoomAmount: 2000, itemType: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", description: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, tonPrice: 1.5, zoomAmount: 8000, itemType: "bundle" },
  { id: "legend_pack", title: "Legend Pack", description: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, tonPrice: 4.0, zoomAmount: 25000, itemType: "bundle" },
  { id: "the_sun", title: "THE SUN", description: "Exclusive limited-edition star — 1000 $ZOOM/hr", starsPrice: 1000, tonPrice: 10, itemType: "sun" },
  { id: "extra_slot", title: "Extra Slot", description: "Unlock 1 additional planet slot", starsPrice: 25, tonPrice: 0.25, itemType: "slot" },
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
    await db.update(usersTable)
      .set({ bonusSun: true })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "slot") {
    await db.update(usersTable)
      .set({ bonusSlots: sql`${usersTable.bonusSlots} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
  }
}

async function atomicCreditIfPending(txnId: number, paymentId: string, item: StarsItem, telegramId: string): Promise<boolean> {
  const updated = await db.update(transactionsTable)
    .set({ status: "completed", telegramPaymentId: paymentId })
    .where(and(
      eq(transactionsTable.id, txnId),
      eq(transactionsTable.status, "pending")
    ))
    .returning();

  if (updated.length === 0) return false;

  await creditUser(item, telegramId);
  return true;
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

router.post("/ton/confirm", async (req, res) => {
  const { telegramId, itemId, walletAddress, tonAmount, boc } = req.body as {
    telegramId?: string;
    itemId?: string;
    walletAddress?: string;
    tonAmount?: number;
    boc?: string;
  };

  if (!telegramId || !itemId || !walletAddress) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const item = findItem(itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const paymentId = boc
    ? `ton_${boc.substring(0, 64)}`
    : `ton_${walletAddress}_${telegramId}_${itemId}_${Date.now()}`;

  const existing = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.telegramPaymentId, paymentId))
    .limit(1);

  if (existing.length > 0) {
    res.json({ ok: true, alreadyCredited: true });
    return;
  }

  try {
    const [txn] = await db.insert(transactionsTable).values({
      telegramId,
      type: item.itemType,
      currency: "TON",
      amount: item.zoomAmount || 0,
      tonAmount: tonAmount || item.tonPrice,
      itemId: item.id,
      itemName: item.title,
      status: "completed",
      telegramPaymentId: paymentId,
    }).returning();

    await creditUser(item, telegramId);

    console.log(`[ton] Credited user ${telegramId} for item ${item.id} (txn ${txn.id}) from wallet ${walletAddress}`);
    res.json({ ok: true, txnId: txn.id, itemId: item.id, itemName: item.title });
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

  if (update.message?.text?.startsWith("/start") && update.message.from) {
    const parts = update.message.text.split(" ");
    const referrerId = parts[1]?.trim();
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
