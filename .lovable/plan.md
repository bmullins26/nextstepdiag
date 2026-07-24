
## Paywall Structure — Free vs Pro (with grandfathering)

### Grandfathering rule

Every user who exists at the time this ships is unaffected by the paywall:
- Migration inserts a `subscriptions` row for **every existing `auth.users` id** with `tier='pro'`, `status='active'`, `plan_type='grandfathered'`, `current_period_end=null` (never expires), `stripe_customer_id=null`.
- `has_pro_access()` treats `plan_type='grandfathered'` as always Pro (no period-end check).
- New signups after deploy start on Free with the 8/mo quota unless they subscribe.
- Owner dashboard gets a "Grandfathered" filter and the ability to revoke a specific user's grandfathered status if ever needed.

### Tiers

**Free** (new signups only) — 8 AI-powered lookups per calendar month across diagnose, age verify, error code lookup, document assistant. Full Community, history, outcome capture. No tech sheet upload, no Tech Talk.

**Pro** — $1 / 7-day pass · $9.99 / month · $99 / year (2 months free). Unlimited lookups, Tech Sheet upload, Tech Talk.

### Data model (migration)

`public.subscriptions`
- `user_id uuid PK → auth.users`
- `tier` (`free` | `pro`), `status` (`active` | `canceled` | `past_due` | `trialing` | `grandfathered`)
- `plan_type` (`week_pass` | `monthly` | `annual` | `grandfathered`)
- `stripe_customer_id`, `stripe_subscription_id`
- `current_period_end timestamptz` (nullable for grandfathered)
- `cancel_at_period_end bool`, timestamps
- RLS: user selects own; service_role full
- **Backfill INSERT** for every existing `auth.users.id` as grandfathered Pro
- Trigger on `auth.users` insert: new users get a `tier='free'` row (no grandfather)

`public.usage_counters` — `(user_id, period_month date)` PK, `lookups_used int`. RLS: own row.

`public.tech_talk_messages` — `id`, `user_id`, `channel`, `body`, `parent_id`, `created_at`. RLS gated by `has_pro_access(auth.uid())`.

Functions:
- `has_pro_access(_user_id uuid)` — true if row exists with `tier='pro'` AND (`plan_type='grandfathered'` OR `current_period_end > now()`).
- `increment_lookup(_user_id uuid)` — bypasses when Pro; else atomically bumps monthly counter under limit 8; returns `{allowed, used, limit}`.

### Server functions (`src/lib/billing.functions.ts`)

- `getMyEntitlements()` → `{ tier, planType, isGrandfathered, lookupsUsed, lookupsLimit, currentPeriodEnd, cancelAtPeriodEnd }`
- `createCheckoutSession({ plan })` — Stripe Checkout
- `createBillingPortalSession()` — Stripe customer portal
- Wrap `runDiagnostic`, serial decode/age verify, error code lookup, document assistant with `increment_lookup`; return `{ error: 'quota_exceeded' }` on deny.

Public route `src/routes/api/public/stripe-webhook.ts` — HMAC verify, upsert subscription on `checkout.session.completed`, `customer.subscription.updated/deleted`; `week_pass` sets `current_period_end = now() + 7 days`.

### UI

- `paywall/upgrade-dialog.tsx` — three plan cards (Week $1 / Monthly $9.99 / Annual $99 "2 months free")
- `paywall/usage-meter.tsx` — "X of 8 lookups used" chip; hidden for Pro/grandfathered
- Account Settings dialog: shows "Grandfathered — thanks for being an early user" for grandfathered accounts; "Upgrade" for Free; "Manage subscription" (Stripe portal) for paid Pro
- Tech Sheet upload gated by `has_pro_access`
- New route `src/routes/_authenticated/tech-talk.tsx` + sidebar link (lock badge for Free)
- Diagnose / Age Verify / Error Codes / Documents: intercept `quota_exceeded` → open upgrade dialog
- Owner dashboard: subscribers tab with filter incl. Grandfathered, revoke action

### Stripe setup

- `stripe--enable_stripe_payments` (seamless)
- Three prices: Week Pass ($1 one-time, 7-day access), Monthly ($9.99 recurring), Annual ($99 recurring)
- Secrets: `STRIPE_PRICE_WEEK`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_WEBHOOK_SECRET`

### Rollout

1. Enable Stripe payments
2. Migration (tables + `has_pro_access` + `increment_lookup` + backfill all existing users as grandfathered + new-user trigger)
3. Billing server fns + Stripe webhook
4. Quota wrap on 4 AI server fns
5. Paywall UI + Account Settings integration
6. Tech Sheet upload gate
7. Tech Talk route
8. QA: existing account stays unlimited with "Grandfathered" badge; new test account hits cap → upgrade → week pass → webhook grants Pro → Tech Talk accessible → cancel via portal
