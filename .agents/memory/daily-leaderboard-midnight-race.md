---
name: Daily leaderboard midnight race
description: How the day-key reset pattern (referrals/HoF/PvP) can lose a finished day's prize, and the guard that prevents it.
---

# Daily leaderboard midnight-race (day-key reset pattern)

Daily leaderboards in this repo (referrals/Hall of Fame, PvP) store a score
column + a `*_day_key` text column on `users`, and a 60s self-healing cron
settles rows where `day_key < today` (freeze top-N, credit prizes, then zero).

## The race
The naive award UPDATE uses `CASE WHEN day_key = today THEN points+1 ELSE 1 END`
plus `day_key = today`. If a yesterday-scorer earns a point in the ≤60s window
after 00:00 UTC but **before** the cron tick, the `ELSE 1` clobbers their key to
today and wipes their finished-day standing → the cron never sees them as stale
→ they lose their entire prize.

**Why it matters:** the referrals/HoF leaderboards ship with this exact race.
PvP added a guard; if you touch those others, consider the same fix.

## The guard (PvP awardPvpPoint)
Add `AND (day_key = today OR day_key IS NULL)` to the award UPDATE's WHERE so a
STALE row (yesterday's key) is never matched. A win in the post-midnight window
simply awards no point (the planet/transfer still commits); within 60s the cron
zeroes the stale row and subsequent wins start today's count at 1.

**How to apply:** trade a ≤60s/day point gap (minor) for never losing a prize
(severe). Avoid the alternative of triggering settlement from the award path —
it reintroduces double-prize concurrency unless you add advisory locks, and
diverges from the established single-counter HoF pattern.
