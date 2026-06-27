# NextStep Beta Program + Cohort Management & Tester Analytics

Build a public beta landing page, application form, owner review tools, separated approval/invitation workflow, wave-based rollouts, and engagement analytics.

## Part 1 — Public Landing Page (`/beta`)

New public route `src/routes/beta.tsx` (SSR on, full `head()` with title, description, OG tags).

Sections:
- **Hero** — "Help Build the Future of Appliance Diagnostics" + subheading + CTA scrolling to `#apply`.
- **Features grid** — 9 capability cards (Guided diagnostics, AI troubleshooting, Error codes, Tech sheet analysis, Document assistant, Repair insights, Appliance ID, Outcome learning, Continuous improvement).
- **Screenshots / Demo** — 5 placeholder cards (Dashboard, Diagnostic workflow, Verify appliance, Tech sheet assistant, Repair insights). Neutral gradient placeholders, easy to swap for real `<img>` later.
- **Beta Expectations** — bullet list (real service calls, report bugs, suggest improvements, confirm outcomes, help improve recommendations).
- **Application form** at `#apply`.

Design: clean, professional, reuses existing tokens and `Card`/`Button`. No marketing hype.

## Part 2 — Beta Application Form

Single-page form, <2 minute completion, Zod-validated client + server.

Fields:
- First Name, Last Name (≤80)
- Email (lowercased, unique)
- Company (optional)
- Location (State/Country)
- Experience Years (0–60)
- Role (Independent Tech, Service Company Tech, Business Owner, Factory Service, Student, Other)
- Calls Per Week (0–500)
- Primary Brands — checkbox group (Whirlpool, GE, LG, Samsung, Frigidaire, Bosch, Speed Queen, Other) stored as jsonb
- Reason (textarea, 20–2000 chars)
- **Video interview willingness** (Yes / Maybe / No) — optional
- Feedback consent (required)
- Beta-software acknowledgement (required)

Submit → public `submitBetaApplication` server fn. Duplicate email → friendly toast. Success → thank-you panel.

## Part 3 — Database

New migration `beta_applications`:

```
id uuid pk default gen_random_uuid()
first_name text not null
last_name text not null
email text not null unique
company text
location text not null
experience_years int not null
role text not null
calls_per_week int not null
primary_brands jsonb not null default '[]'::jsonb
reason text not null
video_interview text check (video_interview in ('yes','maybe','no'))
status text not null default 'pending'
  check (status in ('pending','approved','invited','active','waitlisted','declined'))
beta_wave int not null default 1
source text not null default 'public_form'    -- future: invite_code, referral, company_invite
invite_code text
referred_by uuid
notes text
reviewed_by uuid references auth.users(id)
reviewed_at timestamptz
approved_by uuid references auth.users(id)
approved_at timestamptz
invited_at timestamptz
activated_at timestamptz
user_id uuid references auth.users(id)        -- linked when applicant signs up
created_at timestamptz default now()
updated_at timestamptz default now()
```

Grants + RLS:
- `GRANT INSERT ON public.beta_applications TO anon;` for the public form (publishable-key server client).
- `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated; GRANT ALL TO service_role;`
- Anon INSERT policy: `WITH CHECK (status='pending' AND beta_wave=1 AND source='public_form')`.
- Admin (`has_role('admin')`) full SELECT/UPDATE.
- Authenticated non-admins: no SELECT (no PII leak).
- `set_updated_at` trigger.
- Indexes: `(status, created_at desc)`, `(email)`, `(beta_wave)`, `(user_id)`.

DB trigger `link_beta_application_on_signup` on `auth.users` insert: if `new.email` matches a `beta_applications.email`, sets `user_id = new.id`, `activated_at = now()`, `status = 'active'` (only if previous status was `'invited'`).

Future-proof fields (`source`, `invite_code`, `referred_by`, `beta_wave`) cover closed/open beta, invite codes, referrals, company invites without redesign.

## Part 4 — Server Functions (`src/lib/beta-applications.functions.ts`)

- `submitBetaApplication` — **public** (no auth middleware). Server publishable client. Zod-validated. Returns `{ ok }` / `{ ok:false, reason:'duplicate' }`.
- `listBetaApplications({ status?, wave?, search?, page? })` — admin-only.
- `getBetaApplication(id)` — admin-only, returns full row + computed engagement metrics (Part 5).
- `updateBetaApplicationStatus({ id, status, notes?, wave? })` — admin-only. Stamps `reviewed_by/reviewed_at`. On `approved` → stamps `approved_by/approved_at` (no invite). Allows direct moves: waitlist, decline, deactivate (sets back to `waitlisted` from `active`).
- `assignBetaWave({ id, wave })` — admin-only.
- `sendBetaInvite({ id })` — admin-only. Dynamically imports `client.server`, calls `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data:{first_name,last_name,source:'beta',wave}, redirectTo: site/auth })`. Stamps `invited_at`, transitions `status` to `'invited'`. Allowed from `approved` or `invited` (resend).
- `getBetaProgramStats` — admin-only. Returns counts by status, by wave, by experience bucket (0–2/3–5/6–10/10+), by brand, by region (parse first comma in location), avg activity, most active testers (top 10), inactive testers (top 10 by `last_activity desc null first`).
- `getBetaTesterMetrics(id)` — admin-only. For an `active`/`invited` row with `user_id`, joins `auth.users`, `diagnostic_sessions`, `diagnostic_outcomes`, `feedback` to compute:
  - last_login (auth.users.last_sign_in_at)
  - account_created (auth.users.created_at)
  - total_sessions, completed_sessions, pending_repairs (diagnostic_outcomes where outcome='pending_repair')
  - outcome_confirmations (diagnostic_outcomes where outcome='confirmed')
  - bug_reports, feature_requests, feedback_entries (feedback rows by category — assumes `feedback.category` text; if absent, counts all feedback and labels as "Feedback Entries")
  - last_activity_date (max of session updated_at, outcome created_at, feedback created_at, last_sign_in_at)
  - health_score (Part 5)

All admin fns share a `requireAdmin(context)` helper. Uses existing `requireSupabaseAuth` middleware.

## Part 5 — Health Score

Computed server-side in `getBetaTesterMetrics`. Weighted scoring, capped at 100:

```
score =
  min(completed_sessions, 30) * 1.5     // up to 45
+ min(outcome_confirmations, 20) * 1.0  // up to 20
+ min(bug_reports, 10) * 1.5            // up to 15
+ min(feature_requests, 10) * 1.0       // up to 10
+ recency_bonus                         // up to 10: 10 if active <7d, 7 if <30d, 3 if <60d, 0 if >90d
- inactivity_penalty                    // -10 if no activity >60d
```

Badge mapping:
- 80–100 → ⭐⭐⭐⭐⭐ Power Tester
- 60–79 → ⭐⭐⭐⭐ Active Tester
- 35–59 → ⭐⭐⭐ Occasional Tester
- 15–34 → ⭐⭐ Needs Attention
- <15 → ⭐ Inactive

Informational only. Returned with metrics.

## Part 6 — Owner Panel: Beta Tab

New tab in `src/components/owner-panels.tsx` → **Beta**, split into two sub-views via internal tabs:

**Stats sub-view** (`beta-stats-card.tsx`):
- Applications Received, Pending Review, Approved, Invited, Active, Waitlisted, Declined
- Beta Waves Summary (counts per wave)
- Avg Years Experience, Avg Calls/Week, Avg Tester Activity (avg sessions/active tester)
- Most Active Testers (top 10) and Inactive Testers (top 10)
- Applications by Experience Level (bucket bars), by Primary Brand (top 8), by Geographic Region (top 8)

**Applications sub-view** (`beta-applications-panel.tsx`):
- Toolbar: search (name/email), status filter, wave filter
- Table: Applicant, Email, Experience, Role, Calls/Week, Wave, Applied, Status badge, Actions menu
- Actions menu: `Approve`, `Send Invite`, `Resend Invite`, `Move to Waitlist`, `Decline`, `Deactivate Tester`, `Assign Wave…`, `View Full Application`
- Action visibility depends on current status (e.g. Send Invite only when `approved`; Resend only when `invited`; Deactivate only when `active`).

**Tester Detail Dialog** (`beta-tester-detail.tsx`):
- Opens from "View Full Application"
- Header: name, email, status badge, health badge (when active)
- Application section: every field + reason + video interview willingness + notes textarea
- Engagement section (only when `user_id` present): last login, account created, total/completed sessions, pending repairs, outcome confirmations, bug reports, feature requests, feedback entries, last activity, health score breakdown
- Footer: status select, wave select, Save (calls `updateBetaApplicationStatus` / `assignBetaWave`)

## Part 7 — Navigation

- Add `Beta` link in `/`'s public marketing/footer area so visitors find `/beta`.
- No signed-in sidebar entry (page is for prospects).

## Workflow Summary

```
Submitted → Pending → Approved → (Send Invite) → Invited → (signup trigger) → Active
                          ↓                                      ↓
                      Waitlisted                            Deactivate → Waitlisted
                          ↓
                       Declined
```

Approval never auto-invites. `Send Invite` is a separate explicit action so cohorts can be released in waves or paused.

## Guardrails

- Public form uses publishable-key server client + narrow anon INSERT policy; never touches admin client client-side.
- All admin ops gated by `has_role('admin')` server-side.
- Non-admin authenticated users cannot read applications (no PII leak).
- Health score is informational; no automated gating.
- `source`/`invite_code`/`referred_by`/`beta_wave` future-proof closed beta, open beta, early access, company invites, invite codes, referrals.

## Files

**New:**
- `supabase/migrations/<ts>_beta_applications.sql`
- `src/routes/beta.tsx`
- `src/components/beta/hero.tsx`, `features.tsx`, `screenshots.tsx`, `expectations.tsx`, `application-form.tsx`
- `src/components/owner/beta-applications-panel.tsx`
- `src/components/owner/beta-stats-card.tsx`
- `src/components/owner/beta-tester-detail.tsx`
- `src/lib/beta-applications.functions.ts`

**Edited:**
- `src/components/owner-panels.tsx` — add Beta tab
- `src/routes/index.tsx` — add `/beta` link
- `src/integrations/supabase/types.ts` — auto-regenerated post-migration
