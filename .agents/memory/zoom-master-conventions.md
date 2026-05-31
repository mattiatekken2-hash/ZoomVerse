---
name: Zoom Master conventions
description: Non-obvious conventions for the Zoom Master codebase — market endpoints, typecheck noise, passthrough persistence.
---

# Zoom Master conventions

- **Marketplace endpoints are hand-written `fetch`, NOT OpenAPI codegen.** To add a new
  field to a listing, follow the existing `planetFloat` passthrough pattern: add it to the
  client `api.ts` types/params, the server route (list/listings/sales/buy + SSE broadcast),
  and the DB column. Do NOT expect codegen to wire it up.
- **`regular-planets/save` uses `PlanetRow.passthrough()`** — extra fields on a planet
  survive save/reload without any route or schema change.
- **api-server has PRE-EXISTING typecheck errors** in unrelated route files (admin.ts,
  lottery.ts, stars.ts, withdrawals.ts: mostly TS7030 "not all code paths return", plus
  lottery `nextDrawAt` and stars `$client`). These are NOT caused by feature work — verify
  your changes by confirming your touched files are absent from the error list, and that
  `pnpm --filter @workspace/zoom-master run typecheck` is clean.
