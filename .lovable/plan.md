# Beta Program → Technician Management Platform (Phase 1 + 2 + 2.5)

Build out the existing beta scaffold into the permanent NextStep Technician & Community Management module. Single migration adds all new tables/columns; UI layered onto the existing Owner Beta tab plus a new Technician Profile surface.

## A. Public `/beta` polish (Phase 1)

`src/routes/beta.tsx` + `application-form.tsx`:

- Add NextStep overview, 6 feature cards, 4 screenshot placeholders, beta expectations, FAQ accordion.
- Form gains **State** (split from location), **Referral source** select (FB, YouTube, Reddit, Word of mouth, Search, Trade show, Other).
- Upgraded thank-you state with "What happens next" steps.

## B. Schema migration (additive, single migration)

**Extend `beta_applications`:**
- `state text`, `referral_source text`, `owner_notes text`, `owner_rating int` (1–5 nullable), `tags text[] default '{}'`, `beta_cohort text`
- Indexes: `(state)`, `(referral_source)`, `(beta_cohort)`, GIN on `tags`

**New table `applicant_timeline_events`** — generic timeline:
- `id, application_id fk, event_type text, actor_user_id uuid null, actor_kind text ('owner'|'system'|'tester'), notes text, metadata jsonb, created_at`
- Indexed by `(application_id, created_at desc)`
- Used for: submitted, reviewed, notes_added, approved, waitlisted, declined, wave_assigned, cohort_assigned, invite_sent, account_created, first_login, first_diagnostic_started, first_diagnostic_completed, first_outcome_confirmed, tech_sheet_uploaded, feedback_submitted, etc. — `event_type` is open text so we add new events without migrations.

**New table `applicant_communications`**:
- `id, application_id fk, channel text ('email'|'manual'|'discord'), template text, subject text, sender_user_id uuid null, delivery_status text, provider_message_id text, metadata jsonb, created_at`

**New table `technician_profiles`** (permanent, separate from `beta_applications` so it outlives the beta):
- `id, user_id uuid unique fk auth.users, application_id uuid null fk beta_applications`
- `display_name, company, location, state, country, years_experience int, primary_brands jsonb, primary_appliance_types jsonb, cohort text, beta_wave int, status text, bio text, avatar_url text`
- `tags text[]`, `owner_rating int`, `owner_notes text`
- Auto-created by extending `handle_new_user` trigger: when a `beta_applications` row links via email, also insert a `technician_profiles` row seeded from the application.

**New table `technician_contributions`** — append-only contribution events (knowledge graph base):
- `id, technician_id fk, contribution_type text, ref_table text, ref_id uuid, weight numeric default 1, metadata jsonb, created_at`
- Types: `diagnostic_started`, `diagnostic_completed`, `outcome_confirmed`, `outcome_corrected`, `outcome_partial`, `tech_sheet_uploaded`, `tech_sheet_analyzed`, `repair_insight_submitted`, `feature_request`, `bug_report`, `feedback`, `multi_failure_documented`
- Indexes: `(technician_id, created_at desc)`, `(contribution_type)`

**New table `technician_badges`** (schema only, no UI yet):
- `id, technician_id fk, badge_key text, awarded_at, metadata jsonb`, unique `(technician_id, badge_key)`

**New view `technician_metrics_v`** — aggregates contributions by type per technician for fast dashboard reads (replaces per-request joins, scales to 5k+ testers).

**Knowledge-graph hooks** — `technician_contributions.ref_table/ref_id` lets future AI services join contributions back to `diagnostic_sessions`, `diagnostic_outcomes`, `tech_sheets`, `repair_insights`, etc., without schema changes. `metadata jsonb` carries appliance/model/complaint/failure for grounding queries (exact model → platform family → manufacturer).

**Grants & RLS:** all new tables get standard GRANTs; owners-only SELECT/UPDATE on `applicant_*`; technicians can SELECT their own `technician_profiles` and `technician_contributions`; owners SELECT all. Service role full access.

**Triggers/automation:**
- Insert `applicant_timeline_events` rows from existing UPDATE actions (status changes, wave/cohort assignment, invite sent, notes added) via DB triggers on `beta_applications`.
- Trigger on `diagnostic_sessions` / `diagnostic_outcomes` / `feedback` / `tech_sheets` insert → write `technician_contributions` row + appropriate timeline event (first_* events only when no prior row of that type).

## C. Server functions

`src/lib/beta-applications.functions.ts` extends with:
- Accept `state`, `referralSource`, `tags`, `cohort`, `ownerRating`, `ownerNotes` in update fn.
- `getBetaProgramStats` returns `byState`, `byReferralSource`, `byCohort`, `byTag`.
- `getApplicantTimeline({ id })`, `getApplicantCommunications({ id })`, `findDuplicateApplicants({ id })` — checks email exact, name fuzzy (`similarity()` via pg_trgm), company exact.
- `listBetaApplications` — paginated (cursor/offset + limit), default 50, filters: status, wave, cohort, tags, search.
- `getOwnerActivityFeed({ limit })` — UNION across recent timeline events + contributions, newest first.

`src/lib/technicians.functions.ts` (new):
- `getTechnicianProfile({ userId|id })`
- `listTechnicians({ cohort?, tags?, search?, sort? })` — paginated
- `getTechnicianMetrics({ id })` — reads `technician_metrics_v`
- `getTechnicianTimeline({ id })`
- `updateTechnicianProfile` (owner: rating/tags/notes/cohort; tester: bio/avatar/primary brands/types)

## D. Owner UI

**Beta Program tab** (`beta-program-tab.tsx`):
- Stat strip + 4 bar charts (State, Experience, Brand, Referral Source) using existing `chart.tsx`.
- Applications table gains Company, State, Calls/Wk, Brands, Tags, Owner Rating (★ readonly). Filters: status, wave, cohort, tag chips, search. Server-paginated.
- Row click → right-side **Sheet** with tabs: **Application | Timeline | Communications | Duplicates | Notes & Rating | Tester Dashboard**.
  - Duplicate warning banner at top when matches found; approve still allowed.
  - Owner Rating: 1–5 star picker (private).
  - Tag multi-select with create-new.
  - Cohort free-text + suggestions (Appliance Academy, Discord Community, YouTube, Facebook, Service Companies, Whirlpool Specialists, Refrigeration Specialists).
  - Communications list shows all `applicant_communications` rows (invites auto-logged when `sendBetaInvite` runs).
  - Tester Dashboard tab (only when active): last login, sessions, confirmed/partial/incorrect repairs, feedback, bugs, feature requests, tech sheets, health badge.

**New "Activity Feed" card** at top of Owner panel — live feed (TanStack Query 30s refetch), newest first, links to applicant/technician.

**New Owner sub-tab "Technicians"** — directory of `technician_profiles`, searchable/filterable by cohort/tags/specialty/rating, opens Technician Profile detail.

## E. Technician Profile surface

New route `src/routes/_authenticated/technicians.$id.tsx` (owner-only via `has_role` check in loader; profile owner can view own):
- Header: name, company, location, status, beta wave/cohort, health badge, owner rating (owner-only).
- Specialties: primary brands + appliance type chips, editable by profile owner.
- **Contributions card** — counts for every contribution type from `technician_metrics_v`.
- **Reputation card** — informational metrics (confirmed repairs, contribution score, outcome accuracy %, feedback quality, tech-sheet contributions). Never gates access.
- **Timeline card** — chronological events from `applicant_timeline_events` + `technician_contributions`, newest first.
- **Badges placeholder** — hidden until first badge exists (schema ready, no awarding logic yet).

## F. Scalability & integration guardrails

- All list endpoints paginate server-side; default 50, max 200.
- `technician_metrics_v` aggregated view avoids N+1 joins for 5k+ testers.
- Append-only event tables (`applicant_timeline_events`, `technician_contributions`, `applicant_communications`) — no UPDATEs in hot path, easy to shard later.
- `metadata jsonb` everywhere keeps future fields (Discord username, mobile push token, API usage, badges) additive.
- `ref_table/ref_id` polymorphic links keep the knowledge-graph open: Technician → Session → Complaint → Appliance → Failure → Outcome → Tech Sheet → Insight all join without schema redesign.
- `applicant_communications` decouples from the email backend — switching providers or adding Discord/SMS is a new `channel` value.

## Files

**New:**
- `supabase/migrations/<ts>_technician_platform.sql`
- `src/lib/technicians.functions.ts`
- `src/components/owner/activity-feed.tsx`
- `src/components/owner/technicians-tab.tsx`
- `src/components/owner/applicant-detail-sheet.tsx` (replaces current Dialog)
- `src/components/owner/applicant-timeline.tsx`
- `src/components/owner/applicant-communications.tsx`
- `src/components/owner/applicant-duplicates.tsx`
- `src/components/owner/owner-rating.tsx`
- `src/components/owner/tag-picker.tsx`
- `src/components/technician/profile-header.tsx`
- `src/components/technician/contributions-card.tsx`
- `src/components/technician/reputation-card.tsx`
- `src/components/technician/timeline-card.tsx`
- `src/routes/_authenticated/technicians.$id.tsx`

**Edited:**
- `src/routes/beta.tsx` — overview, features, screenshots, expectations, FAQ
- `src/components/beta/application-form.tsx` — state, referral source
- `src/lib/beta-applications.functions.ts` — new fields, pagination, timeline/communications/duplicates/feed
- `src/components/owner/beta-program-tab.tsx` — charts, expanded table, sheet integration, activity feed, technicians sub-tab
- `src/components/owner-panels.tsx` — wire Technicians sub-tab
