---
name: Telegram profile photos
description: Why member avatars from Telegram fail to load and how to display them
---

# Telegram profile photo display

Rules for rendering Telegram user photos (`initDataUnsafe.user.photo_url`, served from `t.me/i/userpic/...`) in `<img>` tags.

- **Never add `crossOrigin="anonymous"` to a plain display `<img>`.** The `t.me` userpic CDN sends NO CORS headers, so `crossOrigin` makes the browser block the image. crossOrigin is only needed for canvas pixel reads — never for simple display.
- **Keep `referrerPolicy="no-referrer"`** — required so the CDN serves the image.
- **photo_url URLs are temporary** and expire (a stored one returned 404 within days). A permanent fix means downloading + storing the image in own storage, not persisting the t.me link.
- **Backfill is lazy**: users who registered before photoUrl capture have NULL photo; they only get one when they reopen the app and hit `/register` or `/balance/sync`. Empty leaderboard avatars are mostly missing data, not a render bug.

**Why:** Spent multiple turns chasing "member photos don't show". Real causes were (1) a self-inflicted crossOrigin regression and (2) most rows simply had no photoUrl yet.
