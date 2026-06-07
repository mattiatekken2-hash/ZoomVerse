---
name: start_param namespace is overloaded
description: Telegram start_param is used for BOTH referral codes and feature deep links; new prefixes must be guarded or they get consumed as referrals.
---

# Telegram start_param is a shared namespace

`start_param` (Telegram deep-link payload) feeds the referral system: in
`useGameState.getTelegramContext()` the resolved `startParam` becomes the
`referrer` passed to `registerUser`. Any non-referral deep-link payload (e.g.
market sharing uses `mkt_<listingId>`) travels through the SAME field.

**Rule:** when adding a new `start_param` prefix for a non-referral purpose,
add a guard in `getTelegramContext()` that nulls it (e.g.
`if (/^mkt_/.test(startParam)) startParam = null`). The routing consumer
(App.tsx mount effect) reads the raw param separately.

**Why:** without the guard, opening the app via a feature deep link silently
"refers" the opener to whatever the payload string is, corrupting referral data
and possibly granting referral rewards.

**How to apply:** any time you mint a new `?startapp=<prefix>_...` link, grep
for `getTelegramContext` and confirm the prefix is excluded from referral
consumption before shipping.
