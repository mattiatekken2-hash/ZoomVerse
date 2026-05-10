import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { Cell, Address } from "@ton/core";
import { broadcastBoxOpen } from "../lib/activityBus";
import { sendWithdrawalChannelMessage } from "../lib/notify";
import { registerLottoTicketPurchase } from "./lottery";

const router: IRouter = Router();

const BOT_TOKEN = process.env["BOT_TOKEN"] || "";
const TELEGRAM_WEBHOOK_SECRET = process.env["TELEGRAM_WEBHOOK_SECRET"] || "";
const TON_WALLET = "UQCbU2lE4-xTcX2cjX75Uq4LQskpL-Xm71yLrA58QxytkgzS";
const TON_WALLET_RAW = Address.parse(TON_WALLET).toRawString().toLowerCase();
const TONAPI_TOKEN = process.env["TONAPI_TOKEN"] || "";

interface TonApiMsg {
  msg_type?: "ext_in_msg" | "int_msg" | string;
  value?: string;
  destination?: { address: string };
  source?: { address: string };
}

interface TonApiTx {
  hash: string;
  success?: boolean;
  account?: { address: string };
  in_msg?: TonApiMsg;
  out_msgs?: TonApiMsg[];
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

function tryParseRaw(addr: string | undefined): string | null {
  if (!addr) return null;
  try { return Address.parse(addr).toRawString().toLowerCase(); } catch { return null; }
}

/**
 * Cryptographically verifies that `boc` is an on-chain payment of >= expectedNano nanotons
 * to TON_WALLET. Returns the on-chain tx hash, or a reason string for failure.
 *
 * IMPORTANT TON message-type handling:
 * The BOC the user signs through TonConnect is almost always an EXTERNAL message
 * (`ext_in_msg`). When TonAPI returns the resulting transaction:
 *   - `in_msg` describes the external message that *triggered* the user's wallet:
 *     `in_msg.destination` = the user's own wallet (it received the signed payload),
 *     `in_msg.source` is empty, and `in_msg.value` is 0 (externals carry no TON).
 *   - The actual on-chain payment lives in `out_msgs[]`: the user's wallet emits
 *     an internal message whose `destination` is the project wallet and whose
 *     `value` is the real TON amount.
 *
 * For internal-message BOCs (rare here, but possible if a wallet/multisig forwards
 * a pre-built int_msg) the destination/value are on `in_msg` and the sender is
 * `in_msg.source`.
 *
 * Sender binding (anti-spoofing): the connected TonConnect wallet must be the
 * actual originator of the payment. For ext_in_msg the originator is
 * `tx.account.address` (the wallet whose `seqno` was bumped). For int_msg it is
 * `in_msg.source`.
 */
async function verifyTonBoc(boc: string, expectedNano: bigint, expectedSenderRaw: string): Promise<{ ok: true; msgHash: string; txHash: string } | { ok: false; reason: string; retriable: boolean }> {
  const msgHash = computeMsgHashFromBoc(boc);
  if (!msgHash) return { ok: false, reason: "Invalid BOC", retriable: false };

  const tx = await fetchTxByMsgHash(msgHash);
  if (!tx) return { ok: false, reason: "Tx not yet on-chain", retriable: true };
  if (tx.success === false) return { ok: false, reason: "Tx failed on-chain", retriable: false };

  // Resolve the *actual* payment leg (destination + value + sender) depending on
  // whether the BOC was an external or an internal message.
  const isExternal = tx.in_msg?.msg_type === "ext_in_msg";

  let paymentDestRaw: string | null = null;
  let paymentValue: bigint = 0n;
  let paymentSenderRaw: string | null = null;

  if (isExternal) {
    // Find the out_msg that actually pays the project wallet. A wallet contract
    // can emit multiple out_msgs (e.g. wallet-v5 batched send), so we scan all
    // of them and pick the one targeting TON_WALLET.
    const outs = Array.isArray(tx.out_msgs) ? tx.out_msgs : [];
    for (const m of outs) {
      const destRaw = tryParseRaw(m.destination?.address);
      if (destRaw === TON_WALLET_RAW) {
        paymentDestRaw = destRaw;
        paymentValue += BigInt(m.value || "0"); // sum if multiple legs target the same wallet
      }
    }
    paymentSenderRaw = tryParseRaw(tx.account?.address);
  } else {
    // Internal message: payment data is on in_msg directly.
    paymentDestRaw = tryParseRaw(tx.in_msg?.destination?.address);
    paymentValue = BigInt(tx.in_msg?.value || "0");
    paymentSenderRaw = tryParseRaw(tx.in_msg?.source?.address);
  }

  if (!paymentDestRaw) return { ok: false, reason: "No payment leg to project wallet", retriable: false };
  if (paymentDestRaw !== TON_WALLET_RAW) return { ok: false, reason: "Wrong destination wallet", retriable: false };
  if (!paymentSenderRaw) return { ok: false, reason: "No sender on tx", retriable: false };
  if (paymentSenderRaw !== expectedSenderRaw) return { ok: false, reason: "Sender wallet mismatch", retriable: false };

  const tolerance = expectedNano / 50n; // 2% tolerance for forwarding fees
  if (paymentValue + tolerance < expectedNano) return { ok: false, reason: `Insufficient amount: ${paymentValue} < ${expectedNano}`, retriable: false };

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
const SUN_MAX_GLOBAL = 100;
// Increased from 10 → 20 in May 2026 after the first 10 bundles sold out,
// adding 10 fresh bundles for new buyers. The cap is enforced atomically in
// creditUserTx (and stars-reconcile.ts) via a SELECT-COALESCE-SUM guard, so
// raising it is safe and has no effect on already-credited members.
const WHITE_COLLECTION_MAX_GLOBAL = 20;
const EARTH_COLLECTION_MAX_GLOBAL = 50;
// BLACK Collection — ultra-exclusive. Max 3 bundles globally (one per buyer
// unless a single user buys all 3). Cap enforced atomically via advisory lock
// + WHERE-guard on the SUM of black_collection_bundles, mirroring the white /
// earth pattern. Each bundle = 4 black planets @ ~0.333 TON/day combined.
const BLACK_COLLECTION_MAX_GLOBAL = 3;
// V1 NFT Platinum Edition — esclusivo NFT, max 5 venduti GLOBALMENTE.
// Cap enforced atomicamente in creditUserTx via WHERE-guard sulla SOMMA
// di bonus_v1_nft_platinum (stesso pattern di white_collection /
// earth_collection). Pagamento solo TON (20 TON).
const V1_NFT_PLATINUM_MAX_GLOBAL = 5;

const STARS_CATALOG: StarsItem[] = [
  { id: "starter_pack", title: "Starter Pack", description: "2,000 $ZOOM + 1 Basic Planet", starsPrice: 50, tonPrice: 0.5, zoomAmount: 2000, itemType: "bundle" },
  { id: "explorer_pack", title: "Explorer Pack", description: "8,000 $ZOOM + 1 Rare Planet", starsPrice: 150, tonPrice: 1.5, zoomAmount: 8000, itemType: "bundle" },
  { id: "legend_pack", title: "Legend Pack", description: "25,000 $ZOOM + 1 Epic Planet", starsPrice: 400, tonPrice: 4.0, zoomAmount: 25000, itemType: "bundle" },
  { id: "the_sun", title: "THE SUN", description: "Exclusive limited-edition star — 1000 $ZOOM/hr", starsPrice: 1000, tonPrice: 10, itemType: "sun" },
  // Extra Slot pricing is DYNAMIC and TON-ONLY: price escalates per slot
  // already owned (see SLOT_PRICE_LADDER_TON below). starsPrice is set to 0
  // so the create-invoice/webhook guards reject any Stars-path attempt.
  { id: "extra_slot", title: "Extra Slot", description: "Unlock 1 additional planet slot", starsPrice: 0, tonPrice: 0.25, itemType: "slot" },
  { id: "wheel_spin_1",  title: "1 Wheel Spin",   description: "1 spin on the Fortune Wheel",   starsPrice: 50,  tonPrice: 0.5, zoomAmount: 1,  itemType: "wheel_spin" },
  { id: "wheel_spin_5",  title: "5 Wheel Spins",  description: "5 spins on the Fortune Wheel — 20% off",  starsPrice: 200, tonPrice: 2.0, zoomAmount: 5,  itemType: "wheel_spin" },
  { id: "wheel_spin_10", title: "10 Wheel Spins", description: "10 spins on the Fortune Wheel — 30% off", starsPrice: 350, tonPrice: 3.5, zoomAmount: 10, itemType: "wheel_spin" },
  { id: "auto_tap", title: "Auto-Tap", description: "Hold-to-tap auto-clicker on the FORGE PLANET", starsPrice: 300, tonPrice: 3, itemType: "auto_tap" },
  { id: "mystery_box", title: "Mystery Box", description: "Open a space crate — chance for Rare/Epic/Gold and a tiny shot at THE SUN", starsPrice: 150, tonPrice: 1.5, itemType: "mystery_box" },
  { id: "white_collection", title: "White Collection Limited", description: "Unlock 4 exclusive farm slots. Yield: 0.11 TON / Day. Requires SUN module.", starsPrice: 2000, tonPrice: 20, itemType: "white_collection" },
  // Reactivation fee for an expired white-planet farming cycle. Same per-tier
  // fee for W1..W4 (0.005 TON). Server records the payment but applies no
  // grant — the client toggles the specific planet's farming state on success.
  { id: "white_react", title: "White Planet Reactivation", description: "Restart an expired white-planet farming cycle", starsPrice: 50, tonPrice: 0.005, itemType: "white_react" },
  // EARTH Collection — 4 exclusive earth-themed planets per bundle, combined
  // 0.017 TON/day output. Capped at 50 bundles globally. Requires SUN to
  // unlock TON withdrawals.
  { id: "earth_collection", title: "Earth Collection Limited", description: "Unlock 4 exclusive earth planets. Speed: 0.017 TON/day. Requires SUN module.", starsPrice: 700, tonPrice: 5, itemType: "earth_collection" },
  // Reactivation fee for an expired earth-planet farming cycle. Same per-tier
  // fee for E1..E4 (0.001 TON). Server records the payment but applies no
  // grant — the client toggles the specific planet's farming state on success.
  { id: "earth_react", title: "Earth Planet Reactivation", description: "Restart an expired earth-planet farming cycle", starsPrice: 10, tonPrice: 0.001, itemType: "earth_react" },
  // BLACK Collection — ultra-exclusive. Max 3 bundles globally. 4 black
  // planets per bundle with intense purple nebula glow. Combined output
  // ~0.333 TON/day. starsPrice: 0 disables Stars button (TON only, like V1).
  { id: "black_collection", title: "Black Collection Ultra", description: "Unlock 4 exclusive black planets. Speed: 0.333 TON/day. Ultra limited: only 3 ever.", starsPrice: 0, tonPrice: 40, itemType: "black_collection" },
  // Reactivation fee for an expired black-planet farming cycle (0.01 TON).
  // Same payment-only pattern as white/earth — no server-side grant.
  { id: "black_react", title: "Black Planet Reactivation", description: "Restart an expired black-planet farming cycle", starsPrice: 0, tonPrice: 0.01, itemType: "black_react" },
  // LOTTO STELLARE — bundle di biglietti per la lotteria a probabilità
  // ponderate. zoomAmount qui rappresenta il numero di biglietti del bundle
  // (riusato come "count" per non aggiungere campi al catalogo). Lo
  // accreditamento del premio al vincitore avviene MANUALMENTE da parte
  // dell'admin, fuori-app, dal proprio wallet personale.
  { id: "lotto_ticket_1",  title: "Lotto Stellare — 1 biglietto",   description: "1 biglietto per l'estrazione corrente",   starsPrice: 10,  tonPrice: 0.1, zoomAmount: 1,  itemType: "lotto" },
  { id: "lotto_ticket_15", title: "Lotto Stellare — 15 biglietti", description: "15 biglietti — risparmio 33%",            starsPrice: 100, tonPrice: 1.0, zoomAmount: 15, itemType: "lotto" },
  { id: "lotto_ticket_40", title: "Lotto Stellare — 40 biglietti", description: "40 biglietti — risparmio 38%",            starsPrice: 250, tonPrice: 2.5, zoomAmount: 40, itemType: "lotto" },
  // CLASSIFICA MENSILE LAB — quota d'iscrizione 1 TON (no Stars: starsPrice=0).
  // Solo per utenti con SUN. Pre-check in /ton/confirm rifiuta senza SUN.
  { id: "monthly_lab_entry", title: "Classifica Mensile Lab — Iscrizione", description: "Quota d'iscrizione mensile · richiede SUN", starsPrice: 0, tonPrice: 1, itemType: "monthly_lab_entry" },
  // STARDUST bundles — instant top-up of the in-game premium currency.
  // zoomAmount is reused as the stardust amount granted (no schema change).
  // Pricing follows the catalog-wide 100 Stars = 1 TON ratio.
  { id: "stardust_100", title: "Stardust Pack — 100",  description: "Instant top-up · 100 stardust",  starsPrice: 100, tonPrice: 1, zoomAmount: 100, itemType: "stardust" },
  { id: "stardust_500", title: "Stardust Pack — 500",  description: "Instant top-up · 500 stardust",  starsPrice: 500, tonPrice: 5, zoomAmount: 500, itemType: "stardust" },
  // V1 NFT Platinum Edition — esclusivo. SOLO TON (starsPrice=0 segnala
  // ai client di nascondere/disabilitare il pulsante Stars). Max 5 globali
  // gestiti atomicamente in creditUserTx. NON inserito nelle drop-table del
  // Lab (PLANET_CONFIG.V1_NFT.chance = 0).
  { id: "v1_nft_platinum", title: "V1 NFT Platinum Edition", description: "Limited NFT · only 5 ever · 275 $ZOOM/h", starsPrice: 0, tonPrice: 20, itemType: "v1_nft_platinum" },
];

const MYSTERY_BOX_SUN_GLOBAL_CAP = 50;
const MYSTERY_BOX_SUN_COUNTER_KEY = "mystery_box_suns_awarded";

type MysteryAward = "basic" | "rare" | "epic" | "gold" | "sun";

function awardLabel(a: MysteryAward): string {
  switch (a) {
    case "basic": return "a Basic Planet";
    case "rare": return "a Rare Planet";
    case "epic": return "an Epic Planet";
    case "gold": return "a Gold Planet";
    case "sun": return "THE SUN ☀️";
  }
}

async function readMysterySunsAwarded(): Promise<number> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, MYSTERY_BOX_SUN_COUNTER_KEY)).limit(1);
  return Number(row?.valueNum ?? 0);
}

/**
 * Mystery Box drop table:
 *  - SUN: 0.01% (1 in 10000), capped at 50 globally; if cap hit → falls back to Gold
 *  - Rare: 30%
 *  - Epic: 30%
 *  - Gold: 30%
 *  - Basic: ~9.99% (remainder)
 *
 * SUN allocation is fully atomic: a single DB transaction increments the
 * mystery-counter (respecting BOTH the per-feature cap AND the absolute global
 * SUN supply cap, on INSERT and UPDATE branches), then increments the user's
 * sun_count (respecting the per-user cap). If either step is blocked the entire
 * transaction rolls back so no slot is "burned" and we fall back to Gold.
 */
async function rollMysteryBox(telegramId: string): Promise<MysteryAward> {
  const r = Math.floor(Math.random() * 10000);
  if (r === 0) {
    let sunGranted = false;
    try {
      await db.transaction(async (tx) => {
        // Increment the mystery-counter row, only if BOTH caps still allow it.
        // Both INSERT (first ever) and UPDATE branches gate on the global supply.
        const claim = await tx.execute(sql`
          INSERT INTO app_settings (key, value_num, updated_at)
          SELECT ${MYSTERY_BOX_SUN_COUNTER_KEY}, 1, NOW()
          WHERE (SELECT COALESCE(SUM(sun_count), 0) FROM users) < ${SUN_MAX_GLOBAL}
          ON CONFLICT (key) DO UPDATE
            SET value_num = app_settings.value_num + 1, updated_at = NOW()
            WHERE COALESCE(app_settings.value_num, 0) < ${MYSTERY_BOX_SUN_GLOBAL_CAP}
              AND (SELECT COALESCE(SUM(sun_count), 0) FROM users) < ${SUN_MAX_GLOBAL}
          RETURNING value_num
        `);
        if (!claim.rows || claim.rows.length === 0) {
          throw new Error("MYSTERY_SUN_CAP_REACHED");
        }
        // Apply SUN to user, respecting per-user cap. If blocked, ROLLBACK
        // (the throw triggers it) so the global counter is not incremented.
        const sunRes = await tx.execute(sql`
          UPDATE users
          SET sun_count = sun_count + 1, bonus_sun = true
          WHERE telegram_id = ${telegramId}
            AND sun_count < ${SUN_MAX_PER_USER}
          RETURNING sun_count
        `);
        if (!sunRes.rows || sunRes.rows.length === 0) {
          throw new Error("USER_SUN_CAP_REACHED");
        }
        sunGranted = true;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "MYSTERY_SUN_CAP_REACHED" && msg !== "USER_SUN_CAP_REACHED") {
        console.error("[mystery_box] SUN allocation tx failed:", err);
      }
    }
    if (sunGranted) return "sun";
    return "gold";
  }
  if (r < 3000) return "rare";
  if (r < 6000) return "epic";
  if (r < 9000) return "gold";
  return "basic";
}

async function applyMysteryAward(award: MysteryAward, telegramId: string): Promise<void> {
  if (award === "sun") return; // already credited inside rollMysteryBox
  const col = award === "basic" ? "bonusBasic"
    : award === "rare" ? "bonusRare"
    : award === "epic" ? "bonusEpic"
    : "bonusGold";
  await db.update(usersTable)
    .set({ [col]: sql`${usersTable[col as "bonusBasic"]} + 1` })
    .where(eq(usersTable.telegramId, telegramId));
}

function findItem(itemId: string): StarsItem | undefined {
  return STARS_CATALOG.find((i) => i.id === itemId);
}

// `tx` is intentionally typed loosely (`any`) because Drizzle's PgTransaction
// generic is not exported in a stable way across versions; both the top-level
// `db` and the transaction client share the same callable interface here.
type DbExecutor = typeof db;

async function creditUserTx(tx: DbExecutor, item: StarsItem, telegramId: string, txnId?: number): Promise<{ award?: MysteryAward }> {
  if (item.itemType === "mystery_box") {
    // SUN allocation has its own internal transaction (rollMysteryBox); other
    // awards are inlined here so they share the outer credit transaction.
    const award = await rollMysteryBox(telegramId);
    if (award !== "sun") {
      const col = award === "basic" ? "bonusBasic"
        : award === "rare" ? "bonusRare"
        : award === "epic" ? "bonusEpic"
        : "bonusGold";
      await tx.update(usersTable)
        .set({ [col]: sql`${usersTable[col as "bonusBasic"]} + 1` })
        .where(eq(usersTable.telegramId, telegramId));
    }
    return { award };
  }
  if (item.itemType === "bundle" && item.zoomAmount) {
    await tx.update(usersTable)
      .set({
        zoomBalance: sql`${usersTable.zoomBalance} + ${item.zoomAmount}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));

    const planetType = item.id === "starter_pack" ? "bonusBasic"
      : item.id === "explorer_pack" ? "bonusRare"
      : "bonusEpic";
    await tx.update(usersTable)
      .set({ [planetType]: sql`${usersTable[planetType]} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "sun") {
    const result = await tx.execute(sql`
      UPDATE users
      SET sun_count = sun_count + 1, bonus_sun = true
      WHERE telegram_id = ${telegramId}
        AND sun_count < ${SUN_MAX_PER_USER}
        AND (SELECT COALESCE(SUM(sun_count), 0) FROM users) < ${SUN_MAX_GLOBAL}
      RETURNING sun_count
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUserTx] SUN credit denied for ${telegramId} (limit reached at credit time)`);
      throw new Error("SUN_LIMIT_REACHED");
    }
  } else if (item.itemType === "slot") {
    await tx.update(usersTable)
      .set({ bonusSlots: sql`${usersTable.bonusSlots} + 1` })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "stardust" && item.zoomAmount) {
    // Stardust top-up bundle: zoomAmount field is reused as the stardust
    // amount to grant (avoids a schema change to StarsItem). Bumps the
    // balance epoch so the client sees the new total on next sync.
    await tx.update(usersTable)
      .set({
        stardustBalance: sql`${usersTable.stardustBalance} + ${item.zoomAmount}`,
        balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
      })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "wheel_spin") {
    const spins = item.zoomAmount || 1;
    await tx.update(usersTable)
      .set({ wheelSpins: sql`${usersTable.wheelSpins} + ${spins}` })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "auto_tap") {
    await tx.update(usersTable)
      .set({ hasAutoTap: true })
      .where(eq(usersTable.telegramId, telegramId));
  } else if (item.itemType === "white_react") {
    // Reactivation is a paid action with no server-side grant. The transaction
    // row records the payment for audit; the client flips the planet's
    // farming-state on success. Intentional no-op here.
  } else if (item.itemType === "earth_react") {
    // Same as white_react — payment-only, no server-side grant. Client toggles
    // the specific earth planet's farming state on confirmation.
  } else if (item.itemType === "black_react") {
    // Same as white/earth_react — payment-only, no server-side grant. Client
    // toggles the specific black planet's farming state on confirmation.
  } else if (item.itemType === "white_collection") {
    // Serialize all White Collection credits via a transaction-scoped advisory
    // lock so the global cap is enforced strictly even under concurrent buys.
    // The lock id is an arbitrary stable bigint dedicated to this resource.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042041)`);
    // Atomically increment bundle count, gated by GLOBAL cap on the SUM of bundles
    // across all users. No per-user cap (a single user could buy all 10).
    const result = await tx.execute(sql`
      UPDATE users
      SET white_collection_bundles = white_collection_bundles + 1,
          white_collection_unlocked = true
      WHERE telegram_id = ${telegramId}
        AND (SELECT COALESCE(SUM(white_collection_bundles), 0) FROM users) < ${WHITE_COLLECTION_MAX_GLOBAL}
      RETURNING white_collection_bundles
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUserTx] WHITE_COLLECTION sold out at credit time for ${telegramId}`);
      throw new Error("WHITE_COLLECTION_SOLD_OUT");
    }
  } else if (item.itemType === "lotto") {
    // LOTTO STELLARE — registra l'acquisto biglietti nel round attivo. Il
    // txnId è OBBLIGATORIO qui perché lotto_tickets.txn_id ha UNIQUE: senza
    // di esso il sistema non può garantire idempotency. Se manca per
    // qualche motivo (path inatteso) facciamo throw e la transazione esterna
    // fa rollback senza accreditare nulla — meglio non-accredito che doppio.
    if (!txnId) throw new Error("LOTTO_MISSING_TXN_ID");
    const tickets = item.zoomAmount || 0;
    if (tickets <= 0) throw new Error("LOTTO_INVALID_TICKET_COUNT");
    await registerLottoTicketPurchase(tx, {
      telegramId,
      ticketCount: tickets,
      tonPaid: item.tonPrice,
      bundleId: item.id,
      txnId,
    });
  } else if (item.itemType === "v1_nft_platinum") {
    // V1 NFT Platinum — max 5 globali. Stesso pattern di white_collection:
    // advisory lock dedicato + UPDATE atomico gated su SUM globale < cap.
    // Nessun cap per-utente esplicito (il cap globale di 5 è già fortissimo).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042043)`);
    const result = await tx.execute(sql`
      UPDATE users
      SET bonus_v1_nft_platinum = bonus_v1_nft_platinum + 1
      WHERE telegram_id = ${telegramId}
        AND (SELECT COALESCE(SUM(bonus_v1_nft_platinum), 0) FROM users) < ${V1_NFT_PLATINUM_MAX_GLOBAL}
      RETURNING bonus_v1_nft_platinum
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUserTx] V1_NFT_PLATINUM sold out at credit time for ${telegramId}`);
      throw new Error("V1_NFT_PLATINUM_SOLD_OUT");
    }
  } else if (item.itemType === "earth_collection") {
    // Mirrors white_collection but with its own dedicated advisory lock id and
    // global cap. No per-user cap — a single user could buy all 50.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042042)`);
    const result = await tx.execute(sql`
      UPDATE users
      SET earth_collection_bundles = earth_collection_bundles + 1,
          earth_collection_unlocked = true
      WHERE telegram_id = ${telegramId}
        AND (SELECT COALESCE(SUM(earth_collection_bundles), 0) FROM users) < ${EARTH_COLLECTION_MAX_GLOBAL}
      RETURNING earth_collection_bundles
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUserTx] EARTH_COLLECTION sold out at credit time for ${telegramId}`);
      throw new Error("EARTH_COLLECTION_SOLD_OUT");
    }
  } else if (item.itemType === "monthly_lab_entry") {
    // CLASSIFICA MENSILE LAB — registra l'iscrizione al round attivo.
    // 1) Risolvi (o crea) il round attivo
    // 2) UPDATE atomico SOLO se l'utente ha SUN E non è già iscritto a
    //    questo round (lab_round_id != active.id).
    // 3) Incrementa pool e participants del round.
    // Nessuna race: la riga utente è lockata implicitamente dall'UPDATE,
    // e il round attivo è unico per partial UNIQUE index.
    if (!txnId) throw new Error("LAB_ENTRY_MISSING_TXN_ID");

    // Stesso advisory lock usato da /admin/lab-rank/close: serializza
    // entry-credit vs close-season così non si può accreditare in un
    // round che sta venendo chiuso o già chiuso.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042200)`);

    // Risolvi (o crea) il round attivo. Lock di riga FOR UPDATE per
    // bloccare in attesa di chi ha appena aperto un nuovo round.
    const roundRes = await tx.execute(sql`SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1 FOR UPDATE`);
    let activeId: number | undefined;
    if (roundRes.rows && roundRes.rows.length > 0) {
      activeId = Number((roundRes.rows[0] as Record<string, unknown>)["id"]);
    }
    if (!activeId) {
      await tx.execute(sql`INSERT INTO lab_rounds (status) VALUES ('active') ON CONFLICT DO NOTHING`);
      const r2 = await tx.execute(sql`SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1 FOR UPDATE`);
      activeId = Number((r2.rows[0] as Record<string, unknown>)["id"]);
    }
    if (!activeId) throw new Error("LAB_ENTRY_NO_ACTIVE_ROUND");

    const userUpd = await tx.execute(sql`
      UPDATE users
      SET lab_round_id = ${activeId}, lab_points = 0
      WHERE telegram_id = ${telegramId}
        AND sun_count > 0
        AND COALESCE(lab_round_id, 0) <> ${activeId}
      RETURNING telegram_id
    `);
    if (!userUpd.rows || userUpd.rows.length === 0) {
      // Già iscritto a questo round oppure SUN mancante. Throw → rollback,
      // /ton/confirm marcherà il txn come failed e il flusso dirà fallimento.
      // (Pre-check su /ton/confirm respinge prima il caso "no SUN".)
      throw new Error("LAB_ENTRY_INELIGIBLE_OR_DUP");
    }

    // Pool/participants update è gated su status='active': se il round è
    // stato chiuso fra il SELECT e qui (impossibile sotto advisory lock,
    // ma cintura+bretelle), 0 righe → throw → rollback.
    const poolUpd = await tx.execute(sql`
      UPDATE lab_rounds
      SET pool_ton = pool_ton + ${item.tonPrice},
          participants = participants + 1
      WHERE id = ${activeId} AND status = 'active'
      RETURNING id
    `);
    if (!poolUpd.rows || poolUpd.rows.length === 0) {
      throw new Error("LAB_ENTRY_ROUND_ROTATED");
    }
  } else if (item.itemType === "black_collection") {
    // Same pattern as white/earth but with advisory lock id 7913042044 and a
    // global cap of only 3 bundles (ultra-exclusive).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7913042044)`);
    const result = await tx.execute(sql`
      UPDATE users
      SET black_collection_bundles = black_collection_bundles + 1,
          black_collection_unlocked = true
      WHERE telegram_id = ${telegramId}
        AND (SELECT COALESCE(SUM(black_collection_bundles), 0) FROM users) < ${BLACK_COLLECTION_MAX_GLOBAL}
      RETURNING black_collection_bundles
    `);
    if (!result.rows || result.rows.length === 0) {
      console.error(`[creditUserTx] BLACK_COLLECTION sold out at credit time for ${telegramId}`);
      throw new Error("BLACK_COLLECTION_SOLD_OUT");
    }
  }
  return {};
}

async function getWhiteCollectionStock(): Promise<{ sold: number; remaining: number; max: number }> {
  const [row] = await db.select({ sold: sql<number>`COALESCE(SUM(${usersTable.whiteCollectionBundles}), 0)::int` })
    .from(usersTable);
  const sold = Number(row?.sold ?? 0);
  return { sold, remaining: Math.max(0, WHITE_COLLECTION_MAX_GLOBAL - sold), max: WHITE_COLLECTION_MAX_GLOBAL };
}

async function getEarthCollectionStock(): Promise<{ sold: number; remaining: number; max: number }> {
  const [row] = await db.select({ sold: sql<number>`COALESCE(SUM(${usersTable.earthCollectionBundles}), 0)::int` })
    .from(usersTable);
  const sold = Number(row?.sold ?? 0);
  return { sold, remaining: Math.max(0, EARTH_COLLECTION_MAX_GLOBAL - sold), max: EARTH_COLLECTION_MAX_GLOBAL };
}

async function getBlackCollectionStock(): Promise<{ sold: number; remaining: number; max: number }> {
  const [row] = await db.select({ sold: sql<number>`COALESCE(SUM(${usersTable.blackCollectionBundles}), 0)::int` })
    .from(usersTable);
  const sold = Number(row?.sold ?? 0);
  return { sold, remaining: Math.max(0, BLACK_COLLECTION_MAX_GLOBAL - sold), max: BLACK_COLLECTION_MAX_GLOBAL };
}

async function getV1NftPlatinumStock(): Promise<{ sold: number; remaining: number; max: number }> {
  const [row] = await db.select({ sold: sql<number>`COALESCE(SUM(${usersTable.bonusV1NftPlatinum}), 0)::int` })
    .from(usersTable);
  const sold = Number(row?.sold ?? 0);
  return { sold, remaining: Math.max(0, V1_NFT_PLATINUM_MAX_GLOBAL - sold), max: V1_NFT_PLATINUM_MAX_GLOBAL };
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

router.get("/white-collection/stock", async (_req, res) => {
  try {
    const stock = await getWhiteCollectionStock();
    res.json(stock);
  } catch (err) {
    console.error("[white-collection/stock] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/earth-collection/stock", async (_req, res) => {
  try {
    const stock = await getEarthCollectionStock();
    res.json(stock);
  } catch (err) {
    console.error("[earth-collection/stock] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/black-collection/stock", async (_req, res) => {
  try {
    const stock = await getBlackCollectionStock();
    res.set("Cache-Control", "no-store");
    res.json(stock);
  } catch (err) {
    console.error("[black-collection/stock] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/v1-nft-platinum/stock", async (_req, res) => {
  try {
    const stock = await getV1NftPlatinumStock();
    res.set("Cache-Control", "no-store");
    res.json(stock);
  } catch (err) {
    console.error("[v1-nft-platinum/stock] error:", err);
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

/**
 * Posts a public announcement to the withdrawals/announcements channel when an
 * activation or reactivation fee is paid. Covers the 4 paid actions tied to
 * planet farming: White Collection bundle, Earth Collection bundle, white
 * planet reactivation, and earth planet reactivation. Other purchase types
 * (SUN, ZOOM bundles, slots, spins, mystery box, auto-tap) are ignored here.
 */
async function postActivationChannelMessage(item: StarsItem, telegramId: string): Promise<void> {
  let title: string | null = null;
  switch (item.itemType) {
    case "earth_collection":
      title = "🌍 <b>New Earth Collection Activation!</b>";
      break;
    case "white_collection":
      title = "⚪ <b>New White Collection Activation!</b>";
      break;
    case "black_collection":
      title = "⬛ <b>New Black Collection Activation!</b>";
      break;
    case "earth_react":
      title = "🌍 <b>Earth Planet Reactivated!</b>";
      break;
    case "white_react":
      title = "⚪ <b>White Planet Reactivated!</b>";
      break;
    case "black_react":
      title = "⬛ <b>Black Planet Reactivated!</b>";
      break;
    default:
      return; // not an activation event
  }

  const fee = item.tonPrice
    ? `${Number(item.tonPrice).toString()} TON`
    : `${item.starsPrice} ⭐ Stars`;

  const msg =
    `${title}\n` +
    `💎 <b>Fee paid:</b> ${fee}\n` +
    `👤 User ID: <code>${telegramId}</code>\n` +
    `🚀 <i>Status: Solar System expanding!</i>`;

  await sendWithdrawalChannelMessage(msg);
}

async function atomicCreditIfPending(txnId: number, paymentId: string, item: StarsItem, telegramId: string): Promise<boolean> {
  // For mystery boxes we MUST persist `award` together with `status=completed`
  // so a crash between credit and award-write cannot leave the row in an
  // inconsistent state (status completed but award null). Credit + status flip
  // + award write all run in a single DB transaction; on any error the whole
  // transaction rolls back and the txn stays "pending" for retry.
  let creditedAward: MysteryAward | undefined;
  let didFlip = false;
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(transactionsTable)
        .set({ status: "completed", telegramPaymentId: paymentId })
        .where(and(
          eq(transactionsTable.id, txnId),
          eq(transactionsTable.status, "pending")
        ))
        .returning();
      if (updated.length === 0) return; // already-completed or already-failed: leave it
      didFlip = true;

      const result = await creditUserTx(tx, item, telegramId, txnId);
      if (result.award) {
        await tx.update(transactionsTable)
          .set({ award: result.award })
          .where(eq(transactionsTable.id, txnId));
        creditedAward = result.award;
      }
    });
  } catch (err) {
    console.error(`[atomicCredit] credit failed for txn ${txnId}, marking failed:`, err);
    // Outside the rolled-back tx, mark explicitly as failed so the user gets a
    // definitive answer and the row isn't retried forever.
    try {
      await db.update(transactionsTable)
        .set({ status: "failed" })
        .where(and(eq(transactionsTable.id, txnId), eq(transactionsTable.status, "pending")));
    } catch (e2) {
      console.error(`[atomicCredit] failed to mark txn ${txnId} as failed:`, e2);
    }
    throw err;
  }

  if (!didFlip) return false;

  // Fire-and-forget admin notification on every successful Stars purchase.
  // Lets the owner see in real time when payments land (and notice when
  // they don't, so she knows when to use the reconcile button).
  void (async () => {
    try {
      const [u] = await db.select({ uname: usersTable.username, first: usersTable.firstName })
        .from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      const { notifyAdminPurchase } = await import("../lib/notify");
      await notifyAdminPurchase({
        txnId,
        itemName: item.title,
        starsAmount: item.starsPrice,
        telegramId,
        username: u?.uname ?? null,
        firstName: u?.first ?? null,
        source: "webhook",
      });
    } catch (e) {
      console.warn("[admin-notify] webhook notify failed:", e);
    }
  })();

  // Fire-and-forget Telegram channel announcement for activation/reactivation
  // payments AFTER the tx committed (so a rollback never produces a spurious
  // post). Re-uses the withdrawal channel target. Failure is non-fatal.
  void postActivationChannelMessage(item, telegramId).catch((e) => {
    console.warn("[activation-notify] channel post failed:", e);
  });

  // Broadcast the mystery-box opening AFTER the tx committed, so external
  // subscribers never see an event that was rolled back.
  if (creditedAward) {
    try {
      const [u] = await db.select({ first: usersTable.firstName, uname: usersTable.username })
        .from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      const name = u?.first || (u?.uname ? `@${u.uname}` : "Anon");
      broadcastBoxOpen({
        id: txnId,
        userName: name,
        award: creditedAward,
        awardLabel: awardLabel(creditedAward),
        openedAt: Date.now(),
      });
    } catch (e) {
      console.warn("[mystery_box] broadcast failed:", e);
    }
  }
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

  // TON-ONLY items: V1 NFT Platinum, Extra Slot e qualsiasi item con
  // starsPrice<=0 si pagano ESCLUSIVAMENTE in TON. Difesa server-side:
  // rifiuta qualsiasi tentativo di create-invoice in Stars.
  if (item.itemType === "v1_nft_platinum" || item.itemType === "slot" || item.starsPrice <= 0) {
    res.status(400).json({ error: "This item is TON-only and cannot be purchased with Stars" });
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

// Progressive TON price ladder for the Extra Slot purchase. The N-th extra
// slot costs LADDER[min(N, LADDER.length-1)] TON, capped at 3 TON.
// Index 0 = first extra slot (when bonusSlots=0), 1 = second, etc.
export const SLOT_PRICE_LADDER_TON: readonly number[] = [0.25, 0.5, 1, 1.5, 2, 2.5, 3];
export function getSlotPriceTon(currentBonusSlots: number): number {
  const i = Math.max(0, Math.floor(currentBonusSlots));
  return SLOT_PRICE_LADDER_TON[Math.min(i, SLOT_PRICE_LADDER_TON.length - 1)] ?? 3;
}

router.get("/shop/slot-price/:telegramId", async (req, res) => {
  const telegramId = req.params.telegramId;
  if (!telegramId) { res.status(400).json({ error: "Missing telegramId" }); return; }
  try {
    const [u] = await db.select({ bonusSlots: usersTable.bonusSlots })
      .from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    const current = u?.bonusSlots ?? 0;
    res.json({
      bonusSlots: current,
      nextPriceTon: getSlotPriceTon(current),
      ladder: SLOT_PRICE_LADDER_TON,
      maxPriceTon: SLOT_PRICE_LADDER_TON[SLOT_PRICE_LADDER_TON.length - 1],
    });
  } catch (err) {
    console.error("[shop/slot-price] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

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

  // Server-authoritative amount: ignore any client-sent value.
  // For the Extra Slot, price escalates per slot already owned (see ladder).
  let expectedTon = item.tonPrice;
  if (item.itemType === "slot") {
    const [u] = await db.select({ bonusSlots: usersTable.bonusSlots })
      .from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    expectedTon = getSlotPriceTon(u?.bonusSlots ?? 0);
  }
  const expectedNano = BigInt(Math.round(expectedTon * 1e9));

  if (item.itemType === "sun") {
    const check = await checkSunPurchasable(telegramId);
    if (!check.ok) { res.status(409).json({ error: check.reason }); return; }
  }

  if (item.itemType === "white_collection") {
    const stock = await getWhiteCollectionStock();
    if (stock.remaining <= 0) { res.status(409).json({ error: "White Collection sold out" }); return; }
  }

  if (item.itemType === "earth_collection") {
    const stock = await getEarthCollectionStock();
    if (stock.remaining <= 0) { res.status(409).json({ error: "Earth Collection sold out" }); return; }
  }

  if (item.itemType === "v1_nft_platinum") {
    const stock = await getV1NftPlatinumStock();
    if (stock.remaining <= 0) { res.status(409).json({ error: "V1 NFT Platinum sold out" }); return; }
  }

  if (item.itemType === "monthly_lab_entry") {
    // Pre-check: SUN required to participate.
    const sunCount = await getUserSunCount(telegramId);
    if (sunCount <= 0) {
      res.status(409).json({ error: "SUN richiesto per partecipare alla classifica mensile" });
      return;
    }
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

  // Diagnostic logging: dump the keys of every incoming update so we can see
  // exactly what Telegram is delivering. This is critical for tracking down
  // why successful_payment events were not being processed.
  const updateKeys = Object.keys(update || {});
  const messageKeys = update?.message ? Object.keys(update.message) : [];
  console.log(`[stars/webhook] update keys=[${updateKeys.join(",")}] msgKeys=[${messageKeys.join(",")}]`);
  if (update?.message?.successful_payment) {
    console.log(`[stars/webhook] SUCCESSFUL_PAYMENT: payload=${update.message.successful_payment.invoice_payload} chargeId=${update.message.successful_payment.telegram_payment_charge_id} amount=${update.message.successful_payment.total_amount}`);
  }

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
          .values({ telegramId: referrerId, referralCount: 1, zoomBalance: 20, balanceEpoch: 1 })
          .onConflictDoUpdate({
            target: usersTable.telegramId,
            set: {
              referralCount: sql`${usersTable.referralCount} + 1`,
              zoomBalance: sql`${usersTable.zoomBalance} + 20`,
              balanceEpoch: sql`${usersTable.balanceEpoch} + 1`,
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
        // Defense-in-depth: items TON-only non devono mai essere accreditati via Stars,
        // anche se per qualche motivo arriva un successful_payment per loro.
        if (item.itemType === "v1_nft_platinum" || item.itemType === "slot" || item.starsPrice <= 0) {
          console.error(`[stars/webhook] REJECTED Stars payment for TON-only item ${item.id} txn=${payloadData.txnId}`);
        } else {
          await atomicCreditIfPending(payloadData.txnId, payment.telegram_payment_charge_id, item, payloadData.telegramId);
        }
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
  // The `award` (Mystery Box prize) is gated to the owner so external callers
  // cannot enumerate other users' rolls. The owner proves ownership by passing
  // their own telegramId; status/itemName remain public to preserve existing
  // status-polling flows used by other widgets.
  const claimedTelegramId = (req.query["telegramId"] as string) || "";
  const isOwner = !!claimedTelegramId && claimedTelegramId === txn.telegramId;
  res.json({
    status: txn.status,
    itemId: txn.itemId,
    itemName: txn.itemName,
    award: isOwner ? (txn.award ?? null) : null,
  });
});

export default router;
