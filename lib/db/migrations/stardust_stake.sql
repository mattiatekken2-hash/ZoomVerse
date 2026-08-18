-- STARDUST market / stake pool (run once on production Neon DB)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stardust_staked integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stardust_stake_index_micro integer NOT NULL DEFAULT 1000000;
