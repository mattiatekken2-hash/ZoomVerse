# Zoom Master

A planet crafting clicker/idle game where users can craft, farm, and trade planets to earn in-game currency.

## Run & Operate

- `pnpm run typecheck`: Full typecheck across all packages.
- `pnpm run build`: Typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas from OpenAPI spec.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run API server locally.

**Required Environment Variables**:
- `BOT_TOKEN`: Telegram Bot API token (for webhook registration and Telegram WebApp data validation).
- `REPLIT_DEPLOYMENT`: Set to "1" in Replit deployments for correct webhook registration.
- `TG_AUTH_MODE`: "soft" (default) or "strict" for Telegram auth validation.
- `TG_AUTH_MAX_AGE_SEC`: Max age for Telegram `auth_date` (default 24h).

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **Package Manager**: pnpm
- **TypeScript**: 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React, Vite, Three.js, GSAP, Tailwind CSS

## Where things live

- `artifacts/zoom-master`: Frontend React application.
- `artifacts/api-server`: Backend Express API.
- `artifacts/api-spec`: OpenAPI specification for API codegen.
- `artifacts/db`: Drizzle ORM schema and migrations.
- `lib/db/src/schema`: Database schema definitions (source-of-truth for DB).
- `lib/telegram-auth.ts`: Telegram WebApp data validation logic.
- `lib/zoomPrice.ts`: $ZOOM price calculation and persistence.
- `i18n/translations.ts`: Translation dictionary.
- `routes/index.ts`: Centralized policy for protected API routes.

## Architecture decisions

- **Client-Authoritative Balance with Server Reconciliation**: While the client optimistically updates the $ZOOM balance, the server is the ultimate source of truth, especially for offline farming and admin credits. Reconciliation logic uses `Math.max` and epoch versioning to ensure balances only increase on the client during synchronization, preventing accidental loss from admin actions or network races.
- **Transactional Atomicity for Monetary Operations**: All critical operations involving currency (marketplace, Stars, Wheel of Fortune, Lottery) are wrapped in PostgreSQL transactions with `SELECT ... FOR UPDATE` locks to prevent race conditions, double-spending, and ensure data integrity.
- **Idempotent Operations**: Many server-side update functions (e.g., for `sun_farm_started_at_ms`, `last_farming_settled_at_ms`, `claimed_bonus_*`) use `GREATEST()` or `ON CONFLICT DO NOTHING` clauses to ensure that repeated calls or re-synced client data do not roll back state or double-credit users.
- **Telegram WebApp Security Model**: `initData` HMAC verification is enforced on all state-modifying and monetary endpoints to prevent impersonation. A `PROTECTED_ROUTES` map centralizes this policy, ensuring new endpoints are secured by default.
- **Grow-Only Reconciliation for Planets**: Bonus planets and collection bundles are designed to only be created by `applyGrants` and never implicitly deleted by reconciliation logic. Explicit server-side logic (burning, selling) is required for removal, complemented by an anti-shrink guard on `regular-planets/save` to prevent client-side data loss.

## Product

- **Planet Crafting & Farming**: Users can tap to craft planets, which passively earn $ZOOM. Planets have different rarities (BASIC, GOLD, COSMIC, VOID) with varying earnings.
- **Farm Management**: Users can unlock farm slots and manage their planets to optimize $ZOOM generation. Planets have a 24-hour farming cycle.
- **Marketplace**: A peer-to-peer marketplace allows users to list and buy planets from other players.
- **Shop**: In-game shop for purchasing exclusive planets (e.g., V1 NFT Platinum Edition), collection bundles, and lottery tickets using TON or Telegram Stars.
- **Lottery**: A weighted-probability lottery system where users can buy tickets with TON for a chance to win a prize pool (90% to winner, 10% admin profit).
- **Wheel of Fortune**: Users can spin a wheel to win $ZOOM, planets, or other bonuses.
- **Stardust Currency**: A secondary currency (yellow stardust) that can be collected daily (gated by SUN ownership).
- **Referral System / Hall of Fame**: A daily leaderboard for top referrers with stardust prizes.
- **Dynamic Economy**: The $ZOOM price is a global index that fluctuates based on user activities (buying, listing, farming, crafting).
- **Admin Redeem Codes**: Admins can generate and distribute unique codes for $ZOOM, Stardust, or Wheel spins.
- **Space Merchant Encounters**: Random encounters in the Lab for void fusion, allowing users to burn planets for a chance at higher rarity outcomes.
- **User Interface**: Full i18n support for IT/RU/UK/EN, instant navigation (SPA), and visual enhancements (planet glows, float-driven grading).

## User preferences

- _Populate as you build_

## Gotchas

- **Webhook Registration**: In development, `REPLIT_DOMAINS` points to ephemeral hostnames. Ensure `process.env["REPLIT_DEPLOYMENT"] === "1"` check is used for production webhook registration to avoid overwriting the production webhook with dev URLs.
- **Balance Monotonicity**: The client-side balance will never decrease on app re-entry, even if the server reports a lower value (e.g., due to an admin removal during offline). Admin removals must be re-applied after the user re-opens the app if the user's local balance was higher.
- **Marketplace Ownership**: Always verify planet ownership server-side before allowing a listing to prevent users from selling non-existent or already-sold planets.
- **Drizzle Unique Violation Errors**: When checking for unique constraint violations, Drizzle wraps the original PostgreSQL error. Use a helper function that walks the `.cause` chain to find the `23505` error code.
- **Float Sorting on MarketPage**: Non-floatable rarities are pushed to the end when a float sort is active.
- **Stardust Daily Cap**: Stardust collection is capped daily and requires SUN ownership.
- **LAB Items (`itemKind`)**: Items are normal Planets carrying an optional cosmetic `itemKind` tag (20 keys); they reuse all rarity-derived gameplay (rate/farming/burn/sell/marketplace). Thread `itemKind` wherever a planet's identity travels. Reload persistence needs no `regular-planets/save` change because `PlanetRow` uses Zod `.passthrough()`. Marketplace `itemKind` must be validated against the server allowlist (duplicated in `marketplace.ts`) to block cosmetic spoofing.

## Pointers

- **pnpm-workspace skill**: For monorepo structure, TypeScript setup, and package details.
- **OpenAPI Specification**: Defines API contracts and is used for client and server codegen.
- **Drizzle ORM Documentation**: For database schema definitions and query building.
- **Telegram WebApp Validation**: [https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- **TonConnect Documentation**: For wallet integration.
- **Recharts Documentation**: For charting and data visualization.