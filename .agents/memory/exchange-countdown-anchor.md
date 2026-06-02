---
name: ZOOM~TON exchange countdown anchoring
description: How the LAB-page exchange "SOON" countdown computes its launch target
---

The LAB-page ExchangeWidget "ZOOM~TON SOON" countdown does NOT use a hardcoded launch date.
It is anchored to `seasonEpoch + 90 days` (EXCHANGE_DELAY_MS), read from the global store
(`useGlobalStore(s => s.seasonEpoch)`, sourced from `/season/epoch`). Fallback
FALLBACK_LAUNCH_AT_MS is used only until the season epoch loads. Tick interval is 1s (live).

**Why:** the launch must be identical for every user AND auto-restart whenever a season is
reset. Anchoring to the single server `season_epoch` timestamp guarantees both — a RESET
STAGIONE automatically pushes the exchange opening 90 days out again with zero code change.

**Why NO localStorage override:** an earlier version supported
`localStorage["zm.exchangeLaunchAtMs"]` as a QA override that took priority. It silently
pinned an OLD launch date on browsers that still had it set, making the countdown show the
wrong number of days even after the season-anchored change shipped. The override was removed
— do NOT reintroduce a client-side pin; it is a foot-gun that desyncs the countdown.

**Dev vs prod gotcha:** the days remaining depend on each DB's own `season_epoch`. Dev and
prod are SEPARATE databases, so dev can show e.g. ~43 days (old dev season) while prod shows
~90 days (season reset recently). This is expected, not a bug.

**How to apply:** to change the exchange opening delay, edit `EXCHANGE_DELAY_MS`, not a date.
