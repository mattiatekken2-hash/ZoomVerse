---
name: admin route auth model
description: How admin/state-modifying endpoints are authenticated in the api-server, and the two real attack vectors to avoid.
---

# Admin & state-modifying route authentication

Auth is centralized in `routes/index.ts` via a `PROTECTED_ROUTES` map that mounts `requireTelegramAuth` (`lib/telegram-auth.ts`). Verified Telegram identity is on `req.tgUser` (HMAC of initData — unforgeable without the bot token).

## The two real attack vectors (both were exploited once)

1. **Body/query `adminId` is NOT a security boundary.** The admin Telegram id is public/hardcoded, so any client can send it. The ONLY trustworthy authorization is the cryptographically verified `req.tgUser.id`. Every admin handler must check `req.tgUser && isAdmin(req.tgUser.id)` (or bind the body field to the verified id). Trusting `req.body.adminId` / `req.query.adminId` alone = broken access control.

2. **`TG_AUTH_MODE=soft` (the default) does NOT reject anything** — it only verifies-and-logs, then calls `next()`. So in soft mode the central middleware is effectively a no-op for blocking. Admin routes must therefore set `forceStrict: true` in their `PROTECTED_ROUTES` entry, which elevates soft→strict (reject 401/403) for those routes regardless of global mode. `off` mode still fully disables auth (local dev only).

**Why:** A real "hack" let anyone toggle maintenance + rewrite the maintenance message by POSTing the public admin id, because `/admin/maintenance` had neither a `req.tgUser` check nor strict enforcement in soft mode.

## How to apply when adding/auditing an admin route

- Add the path to `PROTECTED_ROUTES` with the correct HTTP method and `forceStrict: true`.
- POST routes: bind `bindField: "adminId"` (middleware enforces verified id === body.adminId) AND keep the in-handler `isAdmin()` check.
- GET routes carry no body, so `bindField: ""` (just require valid initData) + in-handler `if (!req.tgUser || !isAdmin(req.tgUser.id))`. Do NOT trust `?adminId=`.
- Frontend: admin GET calls must send `headers: apiHeaders()` (injects `X-Telegram-Init-Data`) or forceStrict rejects them 401. Several admin GET fetches were missing this.
- Watch for method mismatches: a path listed under POST in the map but implemented as GET (or vice-versa) is silently unprotected.

## Express Request type augmentation gotcha

`req.tgUser` typing lives in `lib/telegram-auth.ts`. This project uses `@types/express` v5 with NO directly-resolvable `express-serve-static-core`, so `declare module "express-serve-static-core"` augmentations silently have no effect. Use `declare global { namespace Express { interface Request {...} } }` instead. (esbuild strips types, so untyped `req.tgUser` still works at runtime — masks the problem until typecheck.)
