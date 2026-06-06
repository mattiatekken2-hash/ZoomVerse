---
name: Telegram channel-broadcast cron gating
description: Crons that post to a FIXED Telegram channel/chat must run only in production, or dev+prod both post to the same live channel.
---

# Telegram channel-broadcast cron gating

Any cron/background job that broadcasts to a **fixed** Telegram destination
(a channel/group constant like `ALIEN_CHAT_ID` / `@ZoomVerse_Chat`, not a
per-user `telegramId` read from the DB) MUST be gated behind
`process.env["REPLIT_DEPLOYMENT"] === "1"` — the same gate `registerTelegramWebhook`
uses.

**Why:** the dev workspace api-server runs continuously with the same `BOT_TOKEN`
and posts to the same hard-coded channel as production. Ungated, dev + prod both
fire the cron → the live channel gets duplicate, off-cadence messages. Real
symptom seen: the "alien radar" (Space Merchant) posted two near-identical pings
~12 min apart instead of one every 30 min, with slightly different wording
because the two environments ran different builds.

**Contrast:** per-user notification crons (farm reminders, lottery broadcast)
read recipients from the DB, and dev has its own separate DB, so dev running them
is mostly harmless. The danger is specifically the *fixed-channel* broadcasts.

**How to apply:**
- Gate the cron start (early `return`) on `REPLIT_DEPLOYMENT !== "1"`.
- Periodic "heartbeat"-style messages (radar countdown) must come ONLY from the
  `setInterval`, never from the post-boot `setTimeout` tick — otherwise every
  restart/redeploy injects an off-schedule message and breaks the fixed cadence.
  The boot tick should only handle time-critical idempotent events (e.g. a
  landing flash missed during downtime).
