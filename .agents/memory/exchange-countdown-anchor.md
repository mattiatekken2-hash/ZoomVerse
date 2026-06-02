---
name: ZOOM~TON exchange countdown anchoring
description: How the LAB-page exchange "SOON" countdown computes its launch target
---

The LAB-page ExchangeWidget "ZOOM~TON SOON" countdown does NOT use a hardcoded launch date.
It is anchored to `seasonEpoch + 90 days` (EXCHANGE_DELAY_MS), read from the global store
(`useGlobalStore(s => s.seasonEpoch)`, sourced from `/season/epoch`).

**Why:** the launch must be identical for every user AND auto-restart whenever a season is
reset. Anchoring to the single server `season_epoch` timestamp guarantees both — a RESET
STAGIONE automatically pushes the exchange opening 90 days out again with zero code change.

**How to apply:** if asked to change the exchange opening delay, edit `EXCHANGE_DELAY_MS` in
ExchangeWidget.tsx, not a date. Priority order for the launch target:
localStorage["zm.exchangeLaunchAtMs"] override (QA) > seasonEpoch+delay > FALLBACK_LAUNCH_AT_MS
(used only until season epoch loads). Tick interval is 1s for a live countdown.
