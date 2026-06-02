---
name: Telegram Mini App forced auto-update
description: Why/how the app force-reloads to the latest published build inside Telegram's webview cache
---

# Telegram Mini App forced auto-update

Telegram's in-app webview caches the Mini App bundle aggressively; a plain reload
inside Telegram often keeps serving the OLD build even after a fresh publish. A
normal desktop browser refresh does pick up the new build — so the symptom is
"updated in browser, stale in Telegram." There is NO service worker in this
project; the staleness is purely Telegram's document cache.

**Mechanism (do not break the invariant that the two stamps stay in lockstep):**
- One `BUILD_VERSION` constant (`Date.now()`) in `vite.config.ts` is used BOTH as
  a `define` (`__BUILD_VERSION__` baked into the bundle) AND written to
  `dist/public/version.json` by a `closeBundle` plugin. They MUST come from the
  same constant in one config evaluation, or the runtime check infinite-loops.
- Runtime (`src/utils/appVersion.ts`, started from `main.tsx`) fetches
  `version.json?ts=...` (`cache: "no-store"`) on load, on `visibilitychange`/
  `focus`, and every 60s. If fetched version != baked version, it
  `location.replace`s with a `?v=<latest>` query to bust Telegram's document
  cache (initData lives in the URL hash, left untouched).
- Loop guards: in-memory latch + URL `?v=` check + sessionStorage key, so a
  truly-stuck cache reloads at most once per target version.

**Why:** user reported published updates not reaching Telegram users on reload.

**How to apply:** any change to the version-stamping must keep the define and the
emitted `version.json` deriving from the same `BUILD_VERSION`. Production serve is
`serve = "static"` (no custom cache headers), so this client-side check is the
lever — content-hashed assets self-bust, only index.html/the bundle is the stale
file.
