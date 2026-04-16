# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### ZOOM MASTER (`artifacts/zoom-master`)
- **Type**: react-vite, frontend only (no backend)
- **Preview path**: `/`
- **Stack**: React, TypeScript, Vite, Three.js, GSAP, Tailwind CSS
- **Game**: Planet crafting clicker/idle game
  - Lab: tap/click to craft planets (20 taps per planet, costs 1 coin each tap)
  - Planet types: BASIC (10/hr, 65%), GOLD (100/hr, 25%), COSMIC (500/hr, 8%), VOID (2000/hr, 2%)
  - Farm: up to 6 slots passively earn coins; unlock extra slots for 250 coins
  - Shop: placeholder upgrades displayed
  - Rank: tier progression based on total coins earned; mock leaderboard
  - Progress saved to localStorage
  - Three.js 3D planet with CSS fallback when WebGL is unavailable

## Fortune Wheel
- **DB**: `spin_logs` table tracks all spins (telegramId, prize, starsSpent, isFree, createdAt)
- **API**: `GET /api/wheel/status/:id` (free spin check + cost), `POST /api/wheel/spin` (server-side roll), `GET /api/wheel/log` (recent 30 spins)
- **Probabilities**: ZOOM 73.94%, RARE 20%, BLACK_HOLE 5%, EPIC 1%, GOLD 0.05%, SUN 0.01%, TON/STARS 0%
- **Pricing**: 1 free spin/day, then Stars: 20, 25, 30, 35... (resets daily UTC)
- **Near-miss logic**: Landing always tries to stop near TON jackpot segment for psychological effect
- **Black Hole glow**: Canvas detects when pointer passes over Black Hole during spin, applies purple glow
- **TON segment**: Visually thin (0.3 weight vs 1.0 normal) and sparkly gradient
- **Variable-width segments**: SEGMENT_ANGLES/SEGMENT_STARTS arrays computed from weight for non-uniform slicing
- **Prize claim**: Planet prizes (RARE/EPIC/GOLD/SUN) increment user's bonus columns; ZOOM prizes add to zoomBalance
- **Files**: `artifacts/api-server/src/routes/wheel.ts`, `artifacts/zoom-master/src/components/FortuneWheel.tsx`, `artifacts/zoom-master/src/pages/LabPage.tsx`

## Recent Changes

- **Official Production Overhaul**:
  - **Instant DB Sync (Client-Authoritative)**: Every balance change triggers immediate server sync (no debounce). Uses queue-based sync to avoid flooding: if a sync is in-flight, the next one queues and fires as soon as the current one completes. `beforeunload` uses `navigator.sendBeacon` for guaranteed delivery on page close. `visibilitychange` settles farming and syncs on resume. **Client is authoritative for balance**: server stores whatever the client sends (no GREATEST), `doSync` only pushes to server (never pulls balance back), and admin credits are detected on init by reading server balance first via `fetchBalanceRecord` and computing the difference.
  - **P2P Marketplace**: New `market_listings` DB table + API endpoints (`/market/list`, `/market/buy`, `/market/delist`, `/market/listings`). Users listing a planet creates a server-side record visible to ALL users. Buyers pay 25% fee, seller receives full price. Buy uses PostgreSQL transaction with optimistic locking (`UPDATE ... WHERE status='active'` + RETURNING) to prevent double-spend race conditions.
  - **Global Live Zoom Pool**: New `/api/global-pool` endpoint sums all users' `zoomBalance`. Displayed in the Rank/Exchange tab as real-time counter updated every 15s.
  - **Glow Restyling**: All planets (Basic, Rare, Epic, Gold) and the Lab forge planet now have premium sun-like glow effects — no more grey circles. Multi-layer atmospheric glow, bright white specular highlights, vibrant radial gradients, and deep color-matched box-shadows. Basic planet color changed from grey (#8892b0) to vibrant blue (#64b5f6).
  - **Production URL**: API_BASE uses `window.location.origin` (auto-resolves to deployed domain). Webhook registration uses `REPLIT_DOMAINS`. Server runs on Reserved VM for always-on uptime.

- Fixed the ZOOM MASTER universal admin panel so admin asset actions use the typed Telegram ID with fallback to `8144744644`, show target-specific confirmation feedback, write a synchronous server snapshot after admin mutations, apply slot grants from server data, and refresh authoritative server assets on app resume/section changes with per-user local storage separation.
- Provisioned the missing PostgreSQL `users` table and adjusted balance refresh so admin credits and Zoom Season leaderboard reads return successful server data instead of 500 errors.
- Fixed bonus planet reconciliation so admin planet removals delete excess server-granted planets and burned bonus planets are saved immediately without being recreated on refresh.
- Updated ZOOM MASTER Rank page so Season 1 progress is reset from April 14, 2026 and advances smoothly over the 90-day season.
- Updated Zoom Season ranking to use live wallet balances: the current user rank is based on `balance`, and the visible leaderboard re-sorts automatically as balances change.
- Reset the Rank Live $ZOOM Pool to 0 by tracking `seasonPoolEarned`, which only increases from real active farming ticks, and removed all fake/demo leaderboard wallets from Zoom Season.
- Added live activity events for GOLD planet forging and THE SUN acquisition, plus a clickable 0.25 TON Farm slot unlock wallet popup with the configured TON address.
- Disabled automatic payment confirmation actions in wallet popups: payment popups now only show the address/copy action and no longer unlock slots, activate THE SUN, or acquire items immediately.
- Updated THE SUN card in Farm with FARM/PAUSE and BURN controls matching planet interaction patterns.
- Added `zoomBalance` (real) and `firstName` (text) columns to the users DB table.
- Added `POST /api/balance/sync` and `GET /api/leaderboard` endpoints to the API server; leaderboard returns top 5 by $ZOOM balance with real Telegram first_name.
- Frontend syncs balance to DB on startup and every 30 seconds; reads real first_name from Telegram WebApp context.
- LIVE SEASON RANK leaderboard now shows real top 5 from the database (with 🥇🥈🥉 medals), highlights the current user, and auto-refreshes every 30 seconds.
- Added `visibilitychange` lifecycle handler: when the app is resumed from background, it re-syncs state from localStorage and server without requiring a manual refresh.
- **Anti-Freeze / Server Timestamp farming**: `settleFarmingState()` computes exact elapsed earnings from `lastFarmingSettledAt` using per-planet farm windows (farm duration cap + 24h collect cap). The 1-second interval now uses this function instead of raw per-second rate accumulation. On resume from background, earnings are settled instantly before syncing to the server — no loading delay.
- **Fullscreen instant**: `configureTelegramViewport()` runs synchronously before React mounts — calls `expand()`, sets header/bg/bottom-bar colors to `#060810`, disables vertical swipes, and fires `ready()`.
- **Server time calibration**: `/api/time` endpoint returns server timestamp; `calibrateServerOffset()` computes RTT-adjusted offset on startup. `serverOffsetRef` stored for future use but all farming timestamps use consistent `Date.now()` basis to avoid drift.
- **Database scalability**: Added indexes on `zoomBalance` (leaderboard queries) and `referredBy` (referral lookups). Connection pool configured: max 20, idle timeout 30s, connection timeout 5s. New `transactions` table tracks all purchases (Stars/TON) with status, payment IDs, and item metadata.
- **Telegram Stars (XTR) Shop**: Backend endpoints at `/api/stars/catalog`, `/api/stars/create-invoice`, `/api/stars/webhook`, `/api/stars/txn/:txnId`. Creates invoices via Bot API with `provider_token=""` and `currency="XTR"`. Frontend uses `WebApp.openInvoice()` to open the payment flow. Webhook handles `pre_checkout_query` and `successful_payment`, auto-crediting $ZOOM/planets/slots/sun to the user's account.
- **TON Connect**: `@tonconnect/ui-react` integrated with `TonConnectUIProvider` wrapping the app. Manifest at `/tonconnect-manifest.json`. Shop page has "Connect Wallet" button and payment mode toggle (Stars vs TON).
- **Always-on deployment**: API server artifact configured with `deploymentTarget = "vm"` for persistent 24/7 uptime — farming and DB connections never go to sleep.
- **Shop redesign**: Unified ShopPage with Stars/TON toggle, per-item pricing in both currencies, loading states, toast notifications, and wallet connection status.
