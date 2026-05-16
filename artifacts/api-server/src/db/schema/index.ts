export * from "./chat";
export * from "./history";
export * from "./labRanking";
export * from "./lottery";
export * from "./redeemCodes";
export * from "./roomInvites";
export * from "./settings";
export * from "./users";

// Creiamo degli export al volo per non far piangere esbuild sulle cose del market che mancano
import { pgTable, serial, varchar, integer } from "drizzle-orm/pg-core";

export const transactionsTable = pgTable("transactions_mock", {
  id: serial("id").primaryKey(),
});

export const marketListingsTable = pgTable("market_listings_mock", {
  id: serial("id").primaryKey(),
});

