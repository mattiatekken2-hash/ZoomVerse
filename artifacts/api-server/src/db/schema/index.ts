export * from "./chat";
export * from "./history";
export * from "./labRanking";
export * from "./lottery";
export * from "./redeemCodes";
export * from "./roomInvites";
export * from "./settings";
export * from "./users";

// Forziamo gli export identici a come li cercano i file in src/routes/
import { pgTable, serial, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users_mock", {
  id: serial("id").primaryKey(),
});

export const transactionsTable = pgTable("transactions_mock", {
  id: serial("id").primaryKey(),
});

export const marketListingsTable = pgTable("market_listings_mock", {
  id: serial("id").primaryKey(),
});

export const farmCyclesTable = pgTable("farm_cycles_mock", {
  id: serial("id").primaryKey(),
});
