---
name: PvP battle system
description: Durable constraints for the PvP planet-duel flow (transfer persistence, caller-relative battle endpoint, active-only queue status).
---

# PvP battle constraints

## Transfer must be mirrored into client state, not just refetched
After a PvP battle the server atomically moves the staked planet (winner gains it,
loser loses it). The client is authoritative for the `planets` array and a debounced
`/regular-planets/save` runs after any local change.
- **Rule:** on result, mirror the transfer locally *immediately* — winner adds the
  opponent's planet, loser removes their staked planet — before the debounced save
  fires. Done via window events `pvp-planet-won` / `pvp-planet-lost` → useGameState
  `pvpAddPlanet` / `pvpRemovePlanet`.
- **Why:** if the client doesn't update, the debounced save re-uploads the loser's
  stale planet (loser keeps it) or strips the winner's new planet (winner never
  receives it) — it silently undoes the server transfer. The loss survives the
  anti-shrink guard because removing one planet is below the guard's drop threshold.

## /pvp/battle is caller-relative — always pass telegramId
`GET /pvp/battle/:battleId` computes `player`/`opponent` and a perspective-adjusted
`winProbability` (`1 - p` for player2) from the caller id in the query.
- **Rule:** `fetchPvPBattle(battleId, telegramId)` MUST send telegramId.
- **Why:** with no caller id the server defaults to player2's perspective for
  everyone, inverting player1's odds and desyncing the roulette landing.
- Note: this perspective is cosmetic only; the real winner is fixed server-side at
  roulette resolution (`winnerTelegramId`), independent of who asks.

## Queue status must return active battles only
`getQueueStatus` and `enterQueue` must ignore/purge terminal battles
(completed/cancelled/transfer_failed). Battles linger in the in-memory map ~5min.
- **Why:** if terminal battles are returned, `/pvp/status` keeps reporting the last
  result, so starting a new battle shows the previous victory/defeat (stale state).

## Modal init effect must depend only on `open`
The PvPModal init effect kicks off `startQueue()`. `startQueue` is a useCallback
that closes over the `planet` prop, so its identity changes whenever the parent
re-renders with a new `planet` reference.
- **Rule:** the open/init effect must depend on `[open]` only and call the latest
  `startQueue` via a ref (`startQueueRef.current()`), never list `startQueue` in
  its deps.
- **Why:** the game state re-renders the parent ~every second (farming/balance
  ticks) with a fresh `planet` object → `startQueue` identity changes → if the
  effect depended on it, it re-fires every tick and re-queues, yanking the user
  out of an active match back into "searching" ("trova l'amico ma torna subito in
  ricerca").

## Confirm flow
- Resolve the wheel + result exactly once via a `resolvedRef` guard + a single
  `maybeResolve(battle)` helper keyed on `winnerTelegramId` — the server resolves the
  roulette synchronously inside the 2nd confirmer's request, so status poll / match
  poll / confirm response can all observe the finished battle at once.
- Client auto-decline on countdown 0 must only fire when the local player has NOT
  confirmed; otherwise a confirmed player auto-declines and cancels a valid match
  ("both confirmed but it cancelled"). Server confirm window is 20s.
