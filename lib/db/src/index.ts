import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// JSONB (PostgreSQL OID 3802) needs an explicit parser in node-postgres.
// Without this, raw SQL queries (tx.execute(sql...)) return JSONB columns
// as unparsed string literals instead of JS objects/arrays. Drizzle's
// builder (db.select()) handles the conversion automatically, but raw SQL
// bypasses that layer and goes straight to the driver. This breaks any
// server-side code that does `Array.isArray(row["planets_json"])`.
pg.types.setTypeParser(3802, (val) => {
  if (val === null || val === undefined) return val;
  return JSON.parse(val);
});

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
