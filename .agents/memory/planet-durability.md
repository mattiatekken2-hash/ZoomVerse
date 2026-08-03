---
name: Planet durability system
description: Durability mechanic — how it decays, freezes, repairs, and where all touch-points are in the codebase.
---

## Rule
Planets have `durability` (0–100, default 100) and `durabilityUpdatedAt` (ms timestamp).

**Decay:** −1% per elapsed 24h on reactivation (fresh-cycle start in `startFarming`), computed from `durabilityUpdatedAt` (falls back to `farmStartedAt`). Only on `startsFreshCycle` AND `wasStarted`. Sets `durabilityUpdatedAt = now` on both first start and reactivation.

**PvP defeat:** −5% clamped at 0, applied in `pvpEngine.ts → transferPlanet()` to the transferred planet.

**Frozen:** `(planet.durability ?? 100) <= 0` → `isFarmActive` returns false AND `startFarming` can't start (FarmPage shows ❄ FROZEN state).

**Repair:** `repairPlanet(id)` in `useGameState.ts` — deducts `REPAIR_STARDUST_COST[planet.name]` (BASIC=100, RARE=300, EPIC=800, GOLD=1500, MYTHIC=3000, NOVA/PLASMA=5000, V1/V1_NFT=10000) and restores durability to 100. Shown as REPAIR button in FarmPage when `durability < 100 && !isListed`.

**UI:** FarmPage shows degraded durability bar (green/amber/red) below PlanetFloatBar when `durability < 100`.

## Why
Requested mechanic: planets wear out from staking and PvP, adding a repair economy loop via Stardust.

## How to apply
- `migratePlanet` defaults `durability: 100, durabilityUpdatedAt: 0` for legacy planets.
- `REPAIR_STARDUST_COST` is exported from `useGameState.ts` and imported in `FarmPage.tsx`.
- `isFarmActive` in `useGameState.ts` checks durability > 0 as a hard gate.
- PvP touch-point: `artifacts/api-server/src/lib/pvpEngine.ts → transferPlanet()`.
