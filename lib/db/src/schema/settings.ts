import { pgTable, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  valueNum: bigint("value_num", { mode: "number" }),
  valueText: text("value_text"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
