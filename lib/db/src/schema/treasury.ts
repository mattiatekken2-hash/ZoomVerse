import { pgTable, text, integer, timestamp, real, serial, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Inflows to the platform treasury wallet (5% P2P $ZMC fee, and later
 * other on-chain credits). `amount_zmc` is human $ZMC (9-decimal jetton
 * converted down). `tx_hash` is unique so a replayed confirm cannot
 * double-count the same chain event.
 *
 * The 4M TGE airdrop reserve sits in the same treasury wallet on-chain;
 * this ledger only records fee inflows that add on top of that base.
 */
export const treasuryLedgerTable = pgTable("treasury_ledger", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").notNull(),
  type: text("type").notNull(),
  amountZmc: real("amount_zmc").notNull(),
  userId: text("user_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_treasury_tx_hash").on(table.txHash),
  index("idx_treasury_user").on(table.userId),
  index("idx_treasury_ts").on(table.timestamp),
  index("idx_treasury_type").on(table.type),
]);

export type TreasuryLedgerRow = typeof treasuryLedgerTable.$inferSelect;
