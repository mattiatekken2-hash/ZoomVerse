import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const STARS_CATALOG_MAP: Record<string, { itemType: string; zoomAmount?: number; id: string }> = {
  starter_pack:  { itemType: "bundle",          zoomAmount: 2000,  id: "starter_pack" },
  explorer_pack: { itemType: "bundle",          zoomAmount: 8000,  id: "explorer_pack" },
  legend_pack:   { itemType: "bundle",          zoomAmount: 25000, id: "legend_pack" },
  the_sun:       { itemType: "sun",                                 id: "the_sun" },
  extra_slot:    { itemType: "slot",                                id: "extra_slot" },
  wheel_spin_1:  { itemType: "wheel_spin",      zoomAmount: 1,     id: "wheel_spin_1" },
  wheel_spin_5:  { itemType: "wheel_spin",      zoomAmount: 5,     id: "wheel_spin_5" },
  wheel_spin_10: { itemType: "wheel_spin",      zoomAmount: 10,    id: "wheel_spin_10" },
  auto_tap:      { itemType: "auto_tap",                            id: "auto_tap" },
  mystery_box:   { itemType: "mystery_box",                         id: "mystery_box" },
  white_collection: { itemType: "white_collection",                  id: "white_collection" },
};

const SUN_MAX_PER_USER = 5;
const SUN_MAX_GLOBAL = 100;
const WHITE_COLLECTION_MAX_GLOBAL = 10;

type ReconcileResult =
  | { status: "credited" }
  | { status: "already_done" }
  | { status: "not_found"; reason: string }
  | { status: "error"; reason: string };

/**
 * Atomically credits a single pending Stars purchase as if the webhook had
 * fired. Mirrors the credit logic in stars.ts/atomicCreditIfPending but
 * standalone so the admin reconcile endpoint can call it without circular
 * imports. Idempotent: if the txn isn't `pending`, returns `already_done`.
 */
export async function reconcilePendingStarPayment(
  txnId: number,
  itemId: string,
  telegramId: string,
  telegramPaymentChargeId: string,
): Promise<ReconcileResult> {
  const item = STARS_CATALOG_MAP[itemId];
  if (!item) return { status: "not_found", reason: `Unknown itemId ${itemId}` };

  // Look up the row first to avoid surprising errors.
  const [row] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txnId)).limit(1);
  if (!row) return { status: "not_found", reason: `Txn ${txnId} not in DB` };
  if (row.telegramId !== telegramId) {
    return { status: "error", reason: `Telegram ID mismatch for txn ${txnId}` };
  }
  if (row.status !== "pending") {
    return { status: "already_done" };
  }

  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(transactionsTable)
        .set({ status: "completed", telegramPaymentId: telegramPaymentChargeId })
        .where(and(
          eq(transactionsTable.id, txnId),
          eq(transactionsTable.status, "pending"),
        ))
        .returning();
      if (updated.length === 0) {
        // Concurrently completed by another path — do nothing.
        return;
      }

      // Apply the credit identical to creditUserTx in stars.ts.
      if (item.itemType === "bundle" && item.zoomAmount) {
        await tx.update(usersTable)
          .set({
            zoomBalance: sql`${usersTable.zoomBalance} + ${item.zoomAmount}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          })
          .where(eq(usersTable.telegramId, telegramId));
        const planetCol = item.id === "starter_pack" ? "bonusBasic"
          : item.id === "explorer_pack" ? "bonusRare"
          : "bonusEpic";
        await tx.update(usersTable)
          .set({ [planetCol]: sql`${usersTable[planetCol as "bonusBasic"]} + 1` })
          .where(eq(usersTable.telegramId, telegramId));
      } else if (item.itemType === "sun") {
        const result = await tx.execute(sql`
          UPDATE users
          SET sun_count = sun_count + 1, bonus_sun = true,
              balance_epoch = balance_epoch + 1
          WHERE telegram_id = ${telegramId}
            AND sun_count < ${SUN_MAX_PER_USER}
            AND (SELECT COALESCE(SUM(sun_count), 0) FROM users) < ${SUN_MAX_GLOBAL}
          RETURNING sun_count
        `);
        if (!result.rows || result.rows.length === 0) {
          throw new Error("SUN_LIMIT_REACHED");
        }
      } else if (item.itemType === "slot") {
        await tx.update(usersTable)
          .set({
            bonusSlots: sql`${usersTable.bonusSlots} + 1`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          })
          .where(eq(usersTable.telegramId, telegramId));
      } else if (item.itemType === "wheel_spin") {
        const spins = item.zoomAmount || 1;
        await tx.update(usersTable)
          .set({
            wheelSpins: sql`${usersTable.wheelSpins} + ${spins}`,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          })
          .where(eq(usersTable.telegramId, telegramId));
      } else if (item.itemType === "auto_tap") {
        await tx.update(usersTable)
          .set({
            hasAutoTap: true,
            balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
          })
          .where(eq(usersTable.telegramId, telegramId));
      } else if (item.itemType === "white_collection") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042041)`);
        const result = await tx.execute(sql`
          UPDATE users
          SET white_collection_bundles = white_collection_bundles + 1,
              white_collection_unlocked = true,
              balance_epoch = balance_epoch + 1
          WHERE telegram_id = ${telegramId}
            AND (SELECT COALESCE(SUM(white_collection_bundles), 0) FROM users) < ${WHITE_COLLECTION_MAX_GLOBAL}
          RETURNING white_collection_bundles
        `);
        if (!result.rows || result.rows.length === 0) {
          throw new Error("WHITE_COLLECTION_SOLD_OUT");
        }
      } else if (item.itemType === "mystery_box") {
        // Mystery box reconcile is intentionally NOT supported here: the award
        // is randomized and persisting it after the fact would change the
        // user's expected outcome. Fail loudly so the admin can refund Stars
        // out-of-band instead of silently rolling a new prize.
        throw new Error("MYSTERY_BOX_RECONCILE_UNSUPPORTED");
      }
    });
    console.log(`[reconcile-stars] credited txn ${txnId} item=${itemId} for ${telegramId}`);
    return { status: "credited" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reconcile-stars] failed txn ${txnId}: ${msg}`);
    return { status: "error", reason: msg };
  }
}
