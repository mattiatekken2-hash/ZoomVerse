---
name: Craft leaderboard per-craft points
description: How regular-planets.ts save handler awards 1 labPoint per new craft, with round-awareness.
---

## Rule
In `regular-planets.ts` save handler (both the rejected-save path and the accepted path), whenever `craftsCompleted` is provided, award lab points alongside updating `totalPlanetsBuilt`:

```sql
labPoints = CASE WHEN lab_round_id = (SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1)
            THEN lab_points + GREATEST(0, craftsCompleted - COALESCE(total_planets_built, 0))
            ELSE GREATEST(0, craftsCompleted - COALESCE(total_planets_built, 0))
            END
labRoundId = COALESCE((SELECT id FROM lab_rounds WHERE status = 'active' LIMIT 1), lab_round_id)
```

## Why
Was missing: craftsCompleted incremented totalPlanetsBuilt but never awarded labPoints. 1 point per craft is the spec. The CASE handles round transitions: if the user's labRoundId is stale (old round), reset to just the delta; if current round, accumulate. The COALESCE assigns labRoundId to the new round on first craft of the season.

## How to apply
Both UPDATE blocks in `regular-planets.ts` need this pattern (rejected early-return path AND the main path). They are identical — both use GREATEST merge for bonus counters.
