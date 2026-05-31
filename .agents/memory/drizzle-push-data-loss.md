---
name: Drizzle push data-loss prompt
description: Why `pnpm --filter @workspace/db run push` can stall on an unrelated destructive prompt, and the safe additive workaround.
---

# Drizzle push can block on unrelated data-loss prompts

`drizzle-kit push` is interactive and diffs the WHOLE schema against the live DB.
The repo currently has pre-existing drift (e.g. `market_listings.item_kind` exists
in the DB but not in the schema source), so `push` opens a blocking
"about to delete column … THIS WILL CAUSE DATA LOSS" prompt that you must NOT
accept — it would drop populated columns unrelated to your change.

**Why:** the project schema and the live DB are out of sync beyond your edit, and
`push` wants to "fix" all of it at once.

**How to apply:** for a purely additive change (e.g. adding a nullable column),
skip `push` and apply the single DDL directly:
`psql "$DATABASE_URL" -c "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;"`
Then keep the Drizzle schema source as the source of truth. Do not run `push` to
completion until the unrelated drift is intentionally reconciled.
