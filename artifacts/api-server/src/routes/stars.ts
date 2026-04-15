import { Router, type IRouter } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";

interface StarsItem {
  id: string;
  title: string;
  description: string;
  starsPrice: number;
  zoomAmount?: number;
  itemType: string;
}

const STARS_CATALOG: StarsItem[] = [
  { id: "starter_pack", title: "Starter Pack", description: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, zoomAmount: 2000, itemType: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", description: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, zoomAmount: 8000, itemType: "bundle" },
  { id: "legend_pack", title: "Legend Pack", description: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, zoomAmount: 25000, itemType: "bundle" },
  { id: "the_sun", title: "THE SUN", description: "Exclusive limited-edition star — 1000 $ZOOM/hr", starsPrice: 1000, itemType: "sun" },
  { id: "extra_slot", title: "Extra Slot", description: "Unlock 1 additional planet slot", starsPrice: 25, itemType: "slot" },
];

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

  const item = STARS_CATALOG.find((i) => i.id === itemId);
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
      res.status(500).json({ error: data.description || "Failed to create invoice" });
      return;
    }

    res.json({ invoiceUrl: data.result, txnId: txn.id });
  } catch (err) {
    console.error("[stars] create-invoice error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/stars/webhook", async (req, res) => {
  const update = req.body as {
    pre_checkout_query?: { id: string; invoice_payload: string };
    message?: { successful_payment?: { invoice_payload: string; telegram_payment_charge_id: string; total_amount: number } };
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

  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    try {
      const payloadData = JSON.parse(payment.invoice_payload) as { txnId: number; itemId: string; telegramId: string };

      await db.update(transactionsTable)
        .set({
          status: "completed",
          telegramPaymentId: payment.telegram_payment_charge_id,
        })
        .where(eq(transactionsTable.id, payloadData.txnId));

      const item = STARS_CATALOG.find((i) => i.id === payloadData.itemId);
      if (item) {
        const { usersTable } = await import("@workspace/db");
        const { sql } = await import("drizzle-orm");

        if (item.itemType === "bundle" && item.zoomAmount) {
          await db.update(usersTable)
            .set({ zoomBalance: sql`${usersTable.zoomBalance} + ${item.zoomAmount}` })
            .where(eq(usersTable.telegramId, payloadData.telegramId));

          const planetType = item.id === "starter_pack" ? "bonusBasic"
            : item.id === "explorer_pack" ? "bonusRare"
            : "bonusEpic";
          await db.update(usersTable)
            .set({ [planetType]: sql`${usersTable[planetType]} + 1` })
            .where(eq(usersTable.telegramId, payloadData.telegramId));
        } else if (item.itemType === "sun") {
          await db.update(usersTable)
            .set({ bonusSun: true })
            .where(eq(usersTable.telegramId, payloadData.telegramId));
        } else if (item.itemType === "slot") {
          await db.update(usersTable)
            .set({ bonusSlots: sql`${usersTable.bonusSlots} + 1` })
            .where(eq(usersTable.telegramId, payloadData.telegramId));
        }
      }
    } catch (err) {
      console.error("[stars] webhook payment processing error:", err);
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
