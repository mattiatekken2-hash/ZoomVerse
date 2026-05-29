import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tonWithdrawalsTable } from "@workspace/db/schema";
import { eq, and, desc, sql, ne, gt } from "drizzle-orm";
import { z } from "zod";
import { sendWithdrawalChannelMessage, notifyAdminWithdrawalRequest, sendBotMessage } from "../lib/notify";
import { recordHistoryAsync } from "../lib/history";

const router = Router();

const ADMIN_ID = "8144744644";

export const WITHDRAWAL_MIN_TON = 1;
export const WITHDRAWAL_FEE_TON = 0.02;
export const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isAdmin(adminId: string): boolean {
  return adminId === ADMIN_ID;
}

const TON_ADDRESS_RE = /^(EQ|UQ|kQ|0Q|Ef|Uf|kf|0f)[A-Za-z0-9_-]{46}$/;
function isValidTonAddress(addr: string): boolean {
  const trimmed = addr.trim();
  if (!trimmed) return false;
  if (TON_ADDRESS_RE.test(trimmed)) return true;
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(trimmed)) return true;
  return false;
}

const RequestBody = z.object({
  telegramId: z.string().min(1),
  amountTon: z.number().positive(),
  walletAddress: z.string().min(40).max(120),
});

router.post("/withdrawals/request", async (req, res) => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid request body" });
  }
  const { telegramId, amountTon, walletAddress } = parsed.data;
  const wallet = walletAddress.trim();

  if (!isValidTonAddress(wallet)) {
    return res.status(400).json({ ok: false, error: "Indirizzo TON non valido" });
  }
  if (amountTon < WITHDRAWAL_MIN_TON) {
    return res.status(400).json({ ok: false, error: `Importo minimo: ${WITHDRAWAL_MIN_TON} TON` });
  }

  try {
    const totalDeduction = amountTon + WITHDRAWAL_FEE_TON;

    // Run the entire flow in one transaction with a row lock on the user.
    // SELECT ... FOR UPDATE serializes concurrent requests for the same user,
    // closing the cooldown-bypass and double-spend race windows.
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({
          tonBalance: usersTable.tonBalance,
          whiteCollectionUnlocked: usersTable.whiteCollectionUnlocked,
          earthCollectionUnlocked: usersTable.earthCollectionUnlocked,
          isDisabled: usersTable.isDisabled,
        })
        .from(usersTable)
        .where(eq(usersTable.telegramId, telegramId))
        .for("update")
        .limit(1);

      if (!user) return { kind: "err" as const, status: 404, error: "Utente non trovato" };
      if (user.isDisabled) {
        return { kind: "err" as const, status: 403, error: "Account disabilitato. Contatta l'admin." };
      }
      if (!user.whiteCollectionUnlocked && !user.earthCollectionUnlocked) {
        return { kind: "err" as const, status: 403, error: "Solo gli holder della White Collection o Earth Collection possono prelevare" };
      }
      // Withdrawals are paid out of the EARNED balance only (column kept
      // as ton_balance for back-compat). Deposits sit in deposit_balance and
      // can only be spent in the Shop — never withdrawn.
      if ((user.tonBalance ?? 0) < WITHDRAWAL_MIN_TON) {
        return {
          kind: "err" as const,
          status: 400,
          error: `Minimo ${WITHDRAWAL_MIN_TON} TON guadagnati per prelevare`,
        };
      }
      if ((user.tonBalance ?? 0) < totalDeduction) {
        return {
          kind: "err" as const,
          status: 400,
          error: `Saldo TON guadagnato insufficiente. Servono ${totalDeduction.toFixed(4)} TON (importo + ${WITHDRAWAL_FEE_TON} di fee)`,
        };
      }

      // Cooldown enforced inside the same transaction (with the user row locked,
      // no other request for this user can interleave).
      const cutoff = new Date(Date.now() - WITHDRAWAL_COOLDOWN_MS);
      const [recent] = await tx
        .select({ id: tonWithdrawalsTable.id, createdAt: tonWithdrawalsTable.createdAt })
        .from(tonWithdrawalsTable)
        .where(
          and(
            eq(tonWithdrawalsTable.telegramId, telegramId),
            ne(tonWithdrawalsTable.status, "rejected"),
            gt(tonWithdrawalsTable.createdAt, cutoff),
          ),
        )
        .orderBy(desc(tonWithdrawalsTable.createdAt))
        .limit(1);

      if (recent) {
        const nextAllowed = new Date(recent.createdAt.getTime() + WITHDRAWAL_COOLDOWN_MS);
        const hoursLeft = Math.ceil(Math.max(0, nextAllowed.getTime() - Date.now()) / (60 * 60 * 1000));
        return {
          kind: "err" as const,
          status: 429,
          error: `Hai già una richiesta recente. Riprova fra ~${hoursLeft}h`,
        };
      }

      const [updated] = await tx
        .update(usersTable)
        .set({
          tonBalance: sql`${usersTable.tonBalance} - ${totalDeduction}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({ tonBalance: usersTable.tonBalance, balanceEpoch: usersTable.balanceEpoch });

      const [row] = await tx
        .insert(tonWithdrawalsTable)
        .values({
          telegramId,
          amountTon,
          feeTon: WITHDRAWAL_FEE_TON,
          walletAddress: wallet,
          status: "pending",
        })
        .returning();

      return {
        kind: "ok" as const,
        withdrawal: row,
        newTonBalance: updated!.tonBalance,
        balanceEpoch: updated!.balanceEpoch,
      };
    });

    if (result.kind === "err") {
      return res.status(result.status).json({ ok: false, error: result.error });
    }
    recordHistoryAsync({
      telegramId,
      kind: "withdraw_request",
      delta: -(amountTon + WITHDRAWAL_FEE_TON),
      currency: "ton",
      meta: {
        withdrawalId: result.withdrawal.id,
        amountTon,
        feeTon: WITHDRAWAL_FEE_TON,
        wallet,
      },
    });
    // Notify the admin via the personal bot chat with inline approve/reject
    // buttons so withdrawals can be processed without opening the dashboard.
    void notifyAdminWithdrawalRequest({
      withdrawalId: result.withdrawal.id,
      amountTon,
      walletAddress: wallet,
      telegramId,
    });
    return res.json({
      ok: true,
      withdrawal: result.withdrawal,
      newTonBalance: result.newTonBalance,
      balanceEpoch: result.balanceEpoch,
    });
  } catch (err) {
    console.error("[withdrawals/request] error:", err);
    return res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

router.get("/withdrawals/me/:telegramId", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(tonWithdrawalsTable)
      .where(eq(tonWithdrawalsTable.telegramId, req.params.telegramId))
      .orderBy(desc(tonWithdrawalsTable.createdAt))
      .limit(50);
    res.json({ withdrawals: rows });
  } catch (err) {
    res.status(500).json({ error: "Errore interno" });
  }
});

router.get("/admin/withdrawals", async (req, res) => {
  const adminId = String(req.query.adminId || "");
  if (!isAdmin(adminId)) return res.status(403).json({ error: "Forbidden" });
  const status = String(req.query.status || "pending");
  try {
    const rows = await db
      .select({
        w: tonWithdrawalsTable,
        firstName: usersTable.firstName,
        username: usersTable.username,
      })
      .from(tonWithdrawalsTable)
      .leftJoin(usersTable, eq(tonWithdrawalsTable.telegramId, usersTable.telegramId))
      .where(eq(tonWithdrawalsTable.status, status))
      .orderBy(desc(tonWithdrawalsTable.createdAt))
      .limit(200);
    res.json({
      withdrawals: rows.map((r) => ({ ...r.w, firstName: r.firstName, username: r.username })),
    });
  } catch (err) {
    res.status(500).json({ error: "Errore interno" });
  }
});

const ApproveBody = z.object({
  adminId: z.string(),
  withdrawalId: z.number().int().positive(),
  txHash: z.string().min(4).max(200),
});

router.post("/admin/withdrawals/approve", async (req, res) => {
  const parsed = ApproveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid body" });
  const { adminId, withdrawalId, txHash } = parsed.data;
  if (!isAdmin(adminId)) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    const updated = await db
      .update(tonWithdrawalsTable)
      .set({
        status: "paid",
        txHash: txHash.trim(),
        processedAt: new Date(),
        processedBy: adminId,
      })
      .where(and(eq(tonWithdrawalsTable.id, withdrawalId), eq(tonWithdrawalsTable.status, "pending")))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ ok: false, error: "Richiesta non trovata o già elaborata" });
    }

    // Fire-and-forget channel announcement (don't block the response on Telegram).
    const w = updated[0];
    const amount = Number(w.amountTon ?? 0).toFixed(4).replace(/\.?0+$/, "");
    const addr = typeof w.walletAddress === "string" ? w.walletAddress : "";
    const shortAddr = addr.length >= 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : (addr || "—");
    const msg =
      `✅ <b>Withdrawal Paid</b>\n` +
      `💎 <b>${amount} TON</b>\n` +
      `👤 User ID: <code>${w.telegramId}</code>\n` +
      `📬 ${shortAddr}`;
    void sendWithdrawalChannelMessage(msg);

    res.json({ ok: true, withdrawal: updated[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

const RejectBody = z.object({
  adminId: z.string(),
  withdrawalId: z.number().int().positive(),
  reason: z.string().max(300).optional(),
});

router.post("/admin/withdrawals/reject", async (req, res) => {
  const parsed = RejectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid body" });
  const { adminId, withdrawalId, reason } = parsed.data;
  if (!isAdmin(adminId)) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    const result = await db.transaction(async (tx) => {
      // Conditional update: only the first reject for a still-pending row wins.
      // This prevents (a) approve+reject double-credit and (b) two concurrent
      // rejects both refunding.
      const updated = await tx
        .update(tonWithdrawalsTable)
        .set({
          status: "rejected",
          rejectReason: reason?.trim() || null,
          processedAt: new Date(),
          processedBy: adminId,
        })
        .where(and(eq(tonWithdrawalsTable.id, withdrawalId), eq(tonWithdrawalsTable.status, "pending")))
        .returning();

      if (updated.length === 0) {
        // Either not found or already paid/rejected — no refund.
        const [existing] = await tx
          .select({ id: tonWithdrawalsTable.id, status: tonWithdrawalsTable.status })
          .from(tonWithdrawalsTable)
          .where(eq(tonWithdrawalsTable.id, withdrawalId))
          .limit(1);
        return { kind: "err" as const, status: existing ? 400 : 404, error: existing ? `Richiesta già ${existing.status}` : "Richiesta non trovata" };
      }

      const w = updated[0]!;
      const refund = w.amountTon + (w.feeTon ?? 0);
      await tx
        .update(usersTable)
        .set({
          tonBalance: sql`${usersTable.tonBalance} + ${refund}`,
          balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
        })
        .where(eq(usersTable.telegramId, w.telegramId));

      return { kind: "ok" as const, refund };
    });

    if (result.kind === "err") return res.status(result.status).json({ ok: false, error: result.error });
    res.json({ ok: true, refunded: result.refund });
  } catch (err) {
    console.error("[withdrawals/reject] error:", err);
    res.status(500).json({ ok: false, error: "Errore interno" });
  }
});

export default router;
