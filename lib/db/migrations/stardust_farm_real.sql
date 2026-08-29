-- Lab stardust farms yield fractional ★/h (0.20–0.42). Integer truncated every settle.
ALTER TABLE users
  ALTER COLUMN stardust_balance TYPE real USING stardust_balance::real;
