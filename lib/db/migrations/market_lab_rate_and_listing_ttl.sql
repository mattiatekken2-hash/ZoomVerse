-- Lab forge rates are fractional (pizza 3.5, flower 2.6, …).
ALTER TABLE market_listings
  ALTER COLUMN planet_rate TYPE double precision
  USING planet_rate::double precision;

-- Ensure shop shelf clock column exists (noop if already present).
ALTER TABLE market_listings
  ADD COLUMN IF NOT EXISTS last_activated_at timestamp;

-- Backfill: treat legacy active listings as freshly activated now so they
-- keep showing for one more hour after deploy.
UPDATE market_listings
SET last_activated_at = COALESCE(last_activated_at, created_at, NOW())
WHERE status = 'active' AND last_activated_at IS NULL;
