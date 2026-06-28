# Beta Program Admin v2 + v3 (combined)

Builds full tester lifecycle controls on top of a clean two-field model: **application_status** (review outcome) and **access_status** (account access). All historical data is preserved — status changes never delete sessions, outcomes, feedback, AI usage, tech sheets, or auth accounts.

## 1. Schema (single migration)

`beta_applications`:
- Add `application_status text` — `pending | approved | waitlisted | declined`.
- Add `access_status text` — `not_invited | invited | active | suspended | deactivated`.
- Back-fill from existing `status`:
  - pending/waitlisted/declined → `application_status` = same, `access_status` = `not_invited`.
  - approved → `application_status=approved`, `access_status=not_invited`.
  - invited → `application_status=approved`, `access_status=invited`.
  - active → `application_status=approved`, `access_status=active`.
- Keep old `status` column for now (writes mirror, reads ignore) to avoid breaking any external consumer; remove in a follow-up.
- Add columns:
  - `state text` (normalized US state OR country; analytics source of truth)
  - `location_raw text` (back-filled from `location`)
  - `owner_notes text`, `owner_notes_updated_at timestamptz`, `owner_notes_updated_by uuid`
  - `owner_rating smallint` CHECK 1–5
  - `owner_labels text[]` default `'{}'`
  - `suspended_at timestamptz`, `deactivated_at timestamptz`, `last_status_reason text`
  - `invite_accepted_at timestamptz` (set when user_id first links via `handle_new_user`)
- Drop unused `video_interview` column + CHECK.
- Trigger: stamp `suspended_at` / `deactivated_at` / clear on reinstate.
- Update `handle_new_user`: when linking by email, set `access_status='active'` and `invite_accepted_at=now()` (only if currently `invited` or `not_invited` with `application_status='approved'`).

No separate `user_access` table — `beta_applications` is the single source of truth.

## 2. Location normalization

`src/lib/beta/normalize-location.ts` (+ tests):
- US state abbrev/full-name map (case-insensitive) → canonical state.
- Recognized country aliases → country.
- Handles "Jefferson OH", "123 Main St, Jefferson, OH 44047", "OHIO", etc.
- Returns `{ state, isUS }`.

Applied in `submitBetaApplication` (writes `location_raw` + `state`), in an owner mutation `updateApplicantState`, and in the migration back-fill (SQL CASE for common abbreviations; remainder defaults to last comma-segment title-cased and can be hand-corrected via the UI).

Analytics `byRegion` switches to grouping by `state`.

## 3. Server functions (`src/lib/beta-applications.functions.ts`)

`listBetaApplications`:
- New filters: `applicationStatus?`, `accessStatus?`, `labels?: string[]`, `minRating?`, `sort`.
- `sort`: `newest | oldest | experience | calls | last_login | health | application_status | access_status`.
- Search matches first/last name, email, company, **state**, **role**, **brand** (jsonb), and **labels**.

New / updated mutations (all owner-only, all preserve history):
- `reviewApplication({id, decision: approved|waitlisted|declined|pending, reason?})` — sets `application_status` only. Approving auto-sets `access_status='not_invited'` if currently null.
- `sendBetaInvite` (existing) — only allowed when `application_status='approved'`. Sets `access_status='invited'`, stamps `invited_at`.
- `activateBetaTester({id})` — `access_status='active'`. Allowed from `invited`, `suspended`, `deactivated`.
- `suspendBetaTester({id, reason?})` — `access_status='suspended'` + `supabaseAdmin.auth.admin.signOut(user_id, 'global')`.
- `deactivateBetaTester({id, reason?})` — `access_status='deactivated'` + global sign-out.
- `reinstateBetaTester({id})` — back to `active` (or `invited` if `user_id` is null).
- `deleteBetaApplication({id})` — only when `application_status ∈ {pending, waitlisted, declined}` AND `user_id IS NULL`. Removes only the application row.
- `bulkApplyAction({ids[], action})` — server-side fan-out of the single-row actions. Validates per-row eligibility, returns per-id results.
- `updateOwnerNotes({id, notes})` — debounced autosave from UI.
- `updateOwnerRating({id, rating|null})`.
- `setOwnerLabels({id, labels[]})`.
- `updateApplicantState({id, state})`.
- `exportBetaApplicationsCsv({ids?[]})` — returns CSV string for selected rows (or current filter set).
- `hasBetaAccess()` — returns `{ ok: boolean, accessStatus, isOwner }`. `ok = isOwner || accessStatus==='active'`.

`getBetaProgramStats`:
- Two totals blocks: `applications` (pending/approved/waitlisted/declined) and `access` (not_invited/invited/active/suspended/deactivated).
- "Active Testers", health scores, and engagement counts only include rows with `access_status='active'` AND `user_id IS NOT NULL` AND `last_sign_in_at IS NOT NULL`.
- `byRegion` uses normalized `state`.

`getBetaTesterMetrics` enriched with `inviteSent`, `inviteAccepted`, `techSheetsUploaded` (count from `tech_sheets` by user_id).

## 4. Access gate

`src/routes/_authenticated/route.tsx`:
- After `getUser()`, call `hasBetaAccess`.
- `isOwner` → allow.
- `access_status === 'active'` → allow.
- `access_status ∈ {suspended, deactivated}` → `redirect("/access-denied")`.
- `access_status ∈ {invited, not_invited}` or no application row → existing dashboard behavior unchanged (they're signed in but not gated out — they simply have nothing beta-specific to do yet).

New public route `src/routes/access-denied.tsx`: "Your beta access is currently inactive. If you believe this is an error, please contact NextStep Diagnostics." + sign-out.

## 5. Owner UI (`src/components/owner/beta-program-tab.tsx`)

Stats: two stat strips — Applications row and Access row.

Filters bar:
- Quick-filter chips for Application Status (All/Pending/Approved/Waitlisted/Declined).
- Quick-filter chips for Access Status (All/Not Invited/Invited/Active/Suspended/Deactivated).
- Label multi-select, rating ≥ selector.
- Search box (placeholder: "Search name, email, company, state, brand, role, label").
- Sort dropdown (7 options listed above).

Table:
- Checkbox column for bulk selection; sticky bulk-action toolbar appears when any row is selected (Approve / Waitlist / Decline / Send Invite / Activate / Suspend / Deactivate / Delete Pending / Export CSV).
- Two badges per row: `ApplicationPill` and `AccessPill` (distinct color scales).
- New columns (compact): Last Activity, Last Login, Sessions, Confirmed, Bugs, Features, Tech Sheets, Rating (stars), Labels (chips).
- Row Actions dropdown (gated by status):
  - View Application
  - Approve / Waitlist / Decline (when `application_status='pending'`)
  - Send Invite / Resend Invite (when `application_status='approved'` and `access_status ∈ {not_invited, invited}`)
  - Activate, Suspend, Deactivate, Reinstate (gated by `access_status`)
  - Delete Application (pending/waitlisted/declined + no user_id)
  - Edit Owner Notes / Rating / Labels

Detail dialog redesigned into three sections:
- **Application**: Submitted, Reviewed, Application Status, Reason, Brands, Original Location, Normalized State (inline editable).
- **Access**: Invite Sent, Invite Accepted, Access Status, Last Login, Last Activity.
- **Activity**: Diagnostic Sessions, Confirmed Repairs, Pending Repairs, Feedback, Bug Reports, Feature Requests, Tech Sheet Uploads, Health Score.
- **Owner-only**: Notes (autosave, last edited by + when), Rating (1–5 stars), Labels (preset chips with add/remove).

Preset labels: VIP Tester, Factory Tech, Independent Tech, Service Company, Student, Great Feedback, Needs Follow-up. Owner can add custom labels.

## 6. Preservation guarantee

All access transitions only mutate `beta_applications` + call `auth.admin.signOut`. Deletion is restricted to pre-account application rows. No code path touches `diagnostic_sessions`, `diagnostic_outcomes`, `feedback`, `tech_sheets`, `ai_usage`, or `auth.users` records.

## Files touched

- `supabase/migrations/<new>.sql` (schema + back-fill + trigger + handle_new_user update)
- `src/lib/beta/normalize-location.ts` (+ test)
- `src/lib/beta-applications.functions.ts` (split status fields, new mutations, bulk, CSV)
- `src/routes/_authenticated/route.tsx` (access gate via `hasBetaAccess`)
- `src/routes/access-denied.tsx` (new)
- `src/components/owner/beta-program-tab.tsx` (full UI rebuild against new model)
