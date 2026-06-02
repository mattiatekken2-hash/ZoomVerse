---
name: Balance epoch cold-start seed
description: Why the $ZOOM balance can snap downward seconds after app open, and the epoch-seeding invariant that prevents it.
---

# Balance epoch must be seeded on cold start

`_currentBalanceEpoch` in `useGameState.ts` is a module-scope variable initialized to `0`
and only ever increased (monotonic `setCurrentBalanceEpoch`). On a fresh page load it is `0`.

The debounced save+sync effect fires `immediateSyncToServer` ~400ms after the first
state change (the cold-start farming-settle `setState`). If that sync runs before the
async init flow has called `setCurrentBalanceEpoch(serverEpoch)`, it sends
`clientEpoch = 0`.

Server `/balance/sync` uses: `CASE WHEN balance_epoch > clientEpoch THEN server_value ELSE GREATEST(0, client_value) END`.
With `clientEpoch = 0` and any non-zero stored `balance_epoch`, the server treats the
client as stale, returns the stored server value with an advanced epoch, and the client's
`reconcileFromSyncResponse` → `zoom-server-balance-snap` → `handleServerSnap` snaps the
**visible** balance DOWN. Symptom: balance is correct for a moment after open, then drops
a few seconds later.

**Rule:** seed `_currentBalanceEpoch` from the persisted `state.lastBalanceEpoch` once on
first mount (render body, guarded by a ref), BEFORE any sync effect can fire.

**Why:** keeps the cold-start sync carrying the correct `ce`, so the server only snaps the
client down on a GENUINE authoritative change (real admin remove / cross-device spend),
never on every re-entry.

**How to apply:** do not remove the seed. `handleServerSnap` must stay a forced (non-max)
snap — making it grow-only would let the next sync resurrect admin-removed balance via the
epoch-equal `GREATEST(0, client)` branch. The fix is the seed, not weakening the snap.
