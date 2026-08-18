-- STARDUST stake 30-day withdraw lock (run once on production Neon DB)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stardust_stake_locked_until_ms bigint NOT NULL DEFAULT 0;
