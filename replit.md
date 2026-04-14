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
