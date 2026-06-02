---
name: EARN tasks vs season reset coupling
description: Why season reset must also clear seasonal planet-milestone claims, and why task repair must be orphan-aware
---

EARN "Build N planets" task PROGRESS is computed live from the per-tier crafting
counters (sum of totalCrafted*), but a task's CLAIMED state lives in a separate
`claimed_tasks` CSV column. These two must stay coupled.

**Rule:** any operation that resets the crafting counters (the season reset) MUST
also clear the seasonal planet-milestone ids from `claimed_tasks` in the same
operation. Sponsor task claims (one-time channel joins) are NOT seasonal — preserve
them.

**Why:** if counters reset but claims persist, a planet task renders "CLAIMED" next
to a ~0/200 progress bar — the exact bug users reported after an admin season reset.

**Two task families, two lifetimes:**
- Planet-milestone tasks (ids `planets_*`) — SEASONAL, reset with the counters.
- Sponsor tasks (ids `sponsor_*`) — PERMANENT, never auto-cleared.

**reset-season strips planet claims UNCONDITIONALLY (by id list), not orphan-aware.**
**Why:** a single SQL UPDATE evaluates all SET expressions against the PRE-update row,
so the counters are still at their old (high) values when the claimed_tasks SET runs.
An orphan-aware check there would wrongly keep claims. Since the counters are being
zeroed in the same statement, unconditional strip is the correct intent.

**Repair (admin "RIPARA TASK" / /admin/repair-tasks) IS orphan-aware** — it removes a
planet claim only when live builtSum < that task's threshold, in a standalone UPDATE
(reads current counters). This makes it safe to run anytime.
**Why orphan-aware matters:** /tasks/claim only guards on "id not already in the set"
+ threshold. Removing a still-BACKED claim (builtSum >= threshold) would let the user
re-claim and get the reward AGAIN (double-pay). Never strip a backed claim.
