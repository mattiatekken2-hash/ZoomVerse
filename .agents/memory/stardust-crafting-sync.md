---
name: Stardust crafting balance sync
description: How local GameState.stardustBalance and server useStardust hook interact during planet crafting
---

When crafting planets with Stardust, there are **two stardust balances** in play:

1. **`state.stardustBalance`** (local, in `GameState`) — authoritative for UI and gating
2. **`stardust.balance`** (server hook, ~5 min refresh) — authoritative for collection/limit enforcement

**Sync rule:**
- On first server load: seed local from server if local is still 0
- On subsequent server refreshes: only grow UPWARD (server grants, admin credits) — never overwrite downwards, because local deducts immediately on forge tap 1
- When user collects stardust via star tap: increment both local and server
- LabPage uses `Math.max(local, server)` for display, but `craft()` gates on the passed `availableStardust` (which is the local value)

**Server deduct endpoint:**
- `POST /stardust/deduct` is protected by `PROTECTED_ROUTES` Telegram auth binding
- Uses `GREATEST(0, balance - amount)` SQL guard for atomicity
- Called fire-and-forget from `craft()`; if it fails, the local deduction still stands and the next server refresh will correct

**Why not idempotent:**
- The client is a single WebApp with no retry logic on this path. A proper idempotency key would be needed if the client ever retries or if network flakiness is a concern.
