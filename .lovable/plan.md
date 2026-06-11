
# Owner Dashboard

A protected `/owner` area gated by `role = 'owner'` that surfaces user activity, plans, AI usage, feedback, and cost estimates. Owner-only sidebar entry. No changes to Diagnose, Documents, auth flow, or billing logic.

## Data model (one migration)

Four new tables + one enum. RLS on all; GRANT to `authenticated` + `service_role`.

**`app_role` enum:** `'owner' | 'user'`. Roles are stored separately from profile data per the user-roles security pattern (no role column on `profiles`).

**`public.user_roles`** — `(id, user_id → auth.users, role app_role, created_at)`. Unique on `(user_id, role)`.
- Policy: a user can `SELECT` their own roles.
- `SECURITY DEFINER` function `public.has_role(_user_id uuid, _role app_role)` returns boolean — used by every owner-only policy and by the sidebar/route gate.
- Seed row: `INSERT INTO user_roles (user_id, role) SELECT id, 'owner' FROM auth.users WHERE lower(email) = 'bmullins26@gmail.com'`.

**`public.profiles`** — `(id PK = auth.users.id, email, full_name, plan plan_tier default 'free', is_suspended bool default false, created_at, last_login_at, last_activity_at, updated_at)`.
- Enum `plan_tier`: `'free' | 'pro' | 'master' | 'lifetime'`.
- Policies: user can SELECT/UPDATE own row; owner can SELECT/UPDATE all via `has_role(auth.uid(),'owner')`.
- Trigger `on_auth_user_created` (on `auth.users` AFTER INSERT) inserts a profile row with `email`/`full_name` from `raw_user_meta_data`. Backfill existing users in the same migration.
- `last_login_at` updated by a server fn on first auth event per session; `last_activity_at` updated whenever `upsertSession` runs (cheap touch from the existing diagnose flow — single new line).

**`public.ai_usage`** — `(id, user_id, feature text, model text, input_tokens int, output_tokens int, created_at)`.
- `feature` is a free string with these recognized values: `next_diagnostic_step`, `decode_appliance`, `extract_tag_from_image`, `analyze_document`, `ask_document_question`, `error_code_research`.
- Policies: user can SELECT own rows; owner can SELECT all. INSERT via service role only (server fns).
- Index on `(created_at desc)` and `(user_id, created_at desc)`.

**`public.feedback`** — `(id, user_id, kind feedback_kind, subject text, body text, status feedback_status default 'open', created_at)`.
- Enums: `feedback_kind` = `'bug' | 'feature' | 'general'`; `feedback_status` = `'open' | 'reviewed' | 'closed'`.
- Policies: user can INSERT own and SELECT own; owner can SELECT/UPDATE all.

All tables follow the four-step pattern (CREATE → GRANT → ENABLE RLS → POLICY). All security-definer functions use `SET search_path = public`.

## Server functions

New file **`src/lib/owner.functions.ts`** — every fn uses `requireSupabaseAuth` middleware and starts with a `has_role(userId,'owner')` check (throws `Forbidden` otherwise). Service-role admin client loaded inside handlers via `await import('@/integrations/supabase/client.server')`.

| Function | Purpose |
|---|---|
| `getOwnerOverview` | Returns counts: total users, active today/week/month (distinct `user_id` in `diagnostic_sessions` within window), plan counts (free/pro/master/lifetime). One SQL round-trip via a SQL function `public.owner_overview()` (security definer). |
| `getAiUsageStats` | Today / week / month / total AI call counts + per-feature breakdown. Backed by `public.owner_ai_usage_stats()`. |
| `getAiCostEstimate` | Today / month totals and per-user averages. Pricing constants in `src/lib/ai-cost.ts` (Gemini Flash rates: input $0.30 / output $2.50 per 1M tokens, labeled "estimate"). |
| `listUsers` | Search by email/name with pagination. Returns profile + role + counts. |
| `getUserDetail` | Single-user view: totals (diagnoses, documents, AI calls), last active, plan, per-feature AI breakdown. |
| `setUserPlan` | `'free' \| 'pro' \| 'master' \| 'lifetime'` → updates `profiles.plan`. Covers Upgrade to Pro / Remove Pro / Grant Master / Grant Lifetime. |
| `setUserSuspended` | Calls Supabase Admin `auth.admin.updateUserById(id, { ban_duration: '876000h' })` to block sign-in (≈100 yrs); `null` ban_duration to unsuspend. Also flips `profiles.is_suspended` for display. |
| `grantOwnerRole` / `revokeOwnerRole` | Owner-only role management. |
| `listFeedback` | Filter by kind/status. |
| `updateFeedbackStatus` | Owner can mark reviewed/closed. |

New shared file **`src/lib/feedback.functions.ts`** — `submitFeedback({kind, subject, body})` available to any authenticated user (used by a future user-facing feedback form; out of scope to add a UI for it now per the request, but the server fn ships so feedback can flow in).

**`src/lib/diagnostics.functions.ts` / `serial-decode.functions.ts` / `document-assistant.functions.ts` / `error-codes.functions.ts`** — at the end of each AI handler, fire-and-forget insert into `ai_usage` using the admin client. Each call site already has `userId` (from `requireSupabaseAuth`) or is anonymous in the case of cached lookups — the cached error-code branch records nothing; only the AI research branch records. Token counts come from `result.usage` returned by `generateObject`. Failure to log never blocks the user response (wrapped in try/catch).

**`src/lib/sessions.functions.ts`** — `upsertSession` adds `UPDATE profiles SET last_activity_at = now() WHERE id = userId` after the upsert.

## Routes

**`src/routes/_authenticated/owner.tsx`** — single page with tabbed sections (shadcn `Tabs`):
1. **Overview** — 8 stat cards (Total Users, Active Today/Week/Month, Free/Pro/Master/Lifetime) using existing glass-card style.
2. **AI Usage** — 4 totals + a per-feature breakdown table.
3. **Users** — search input (debounced), table with Email / Plan / Role / Signup / Last Login / Last Activity, action menu per row (Upgrade Pro, Remove Pro, Grant Master, Grant Lifetime, Suspend/Unsuspend, View Detail).
4. **User Detail** — drawer/dialog opened from row action; shows totals + per-feature AI breakdown.
5. **Feedback** — table with Kind/Status filters and inline status update.
6. **AI Cost** — 3 cards (Today, This Month, Avg Per User).

`beforeLoad` calls `getOwnerOverview` (which throws Forbidden if not owner); 403 redirects to `/dashboard` with a toast. Loader-fed reads use TanStack Query (`ensureQueryData` + `useSuspenseQuery`) per the standard pattern.

**`src/components/app-sidebar.tsx`** — read role via `supabase.from('user_roles').select('role').eq('user_id', user.id)` on mount; if `'owner'` is present, append `{ to: '/owner', label: 'Owner', icon: Shield }` to the rendered nav. No flicker for non-owners (default = hidden).

## Out of scope

- A user-facing feedback submission form (server fn exists; UI to be added in a follow-up).
- Real billing integration (plan is a manual column).
- Per-call cost displayed to end users (separate prior request).
- Document Assistant logic changes — only an `ai_usage` insert is added.
- Email notifications when feedback arrives.

## Verification

1. Sign in as `Bmullins26@gmail.com` → "Owner" appears in sidebar; `/owner` loads.
2. Sign in as any other user → no Owner item; visiting `/owner` redirects to `/dashboard`.
3. Run a Diagnose session as a non-owner user → AI Usage tab shows incremented counts and breakdown; Overview "Active Today" includes that user.
4. Use the Users tab to flip a user to Pro, then to Lifetime → `profiles.plan` updates and stat cards re-count.
5. Suspend a user → that user can no longer sign in (Supabase returns "User is banned").
6. Insert a test feedback row → appears in Feedback tab; marking "closed" persists.
