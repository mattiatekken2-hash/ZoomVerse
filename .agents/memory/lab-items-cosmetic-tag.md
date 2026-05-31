---
name: LAB cosmetic items (itemKind)
description: How the 20 LAB "items" reuse planet logic via an optional itemKind tag, and where it must be threaded.
---

# LAB cosmetic items

An "item" is NOT a separate asset class. It is a normal crafted `Planet` carrying an
optional cosmetic `itemKind` tag (one of 20 keys). It reuses the SAME rarity → rate /
color / glow / float / craft-cost / farming / burn / sell / marketplace logic. The ONLY
difference is the rendered glyph (ItemOrb vs PlanetOrb).

**Why:** keeps gameplay/economy keyed purely on rarity; no parallel item economy to maintain.

**How to apply:**
- Drop split lives in one constant (`ITEM_DROP_CHANCE`, ~0.8 item / 0.2 planet), rolled
  AFTER rarity in `craft()`. Items roll at WHATEVER rarity was produced.
- `itemKind` must be threaded everywhere a planet's identity travels: client state,
  farm/market render (`OrbDisplay` routes to ItemOrb when `itemKind` set), marketplace
  list/listings/sales/buy + SSE, and the DB `market_listings.item_kind` column.
- Reload persistence needs NO `/regular-planets/save` change: `PlanetRow` uses Zod
  `.passthrough()`, so unknown cosmetic fields survive round-trips automatically.
- The 20 canonical keys are duplicated server-side (`ALLOWED_ITEM_KINDS` in
  marketplace.ts) because cross-artifact imports are forbidden — keep both lists in sync.

## Marketplace itemKind must be server-validated
`/market/list` snapshots itemKind from server-owned `planets_json` first, then falls back
to the client-supplied tag. **Always run it through the allowlist sanitizer** (coerce
unknown → null) before storing, or a tampered client can spoof a plain planet as a
high-value item or stamp arbitrary tags.

**Why:** the client fallback exists for legacy listings, but unbounded client input on a
tradeable identity is a cosmetic-spoofing integrity hole.
