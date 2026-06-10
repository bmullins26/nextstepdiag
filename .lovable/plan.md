# Diagnostic History, Persistence & Resume

Cloud + login was chosen, so sessions are stored in Lovable Cloud per authenticated user and sync across devices. Multiple parallel Active sessions are supported.

## 1. Enable Lovable Cloud + Auth

- Enable Lovable Cloud (provisions DB, auth, storage).
- Add email/password + Google sign-in on a new `/auth` page.
- No `profiles` table needed (no display name/avatar requested) — auth.users only.
- Wrap the existing app under `src/routes/_authenticated/` so Dashboard, Diagnose, Documents, History all require login. The landing `/` and `/auth` stay public.

## 2. Database (one migration)

Table `public.diagnostic_sessions`:

```
id uuid pk
user_id uuid → auth.users (RLS scope)
status text check in ('active','completed','abandoned')
is_favorite boolean
brand, appliance_type, model_number, serial_number text
manufacture_year int, age_years numeric
complaint text
findings jsonb         -- string[]
history jsonb          -- {question, answer}[]
most_likely_failures jsonb  -- string[]
most_likely_failure text
recommended_next_test text
current_findings_summary text
appliance jsonb        -- full verifyAppliance result (manufacturer, confidence, notes)
created_at, updated_at timestamptz
```

Indexes on `(user_id, updated_at desc)` and `(user_id, status)`.

RLS: owner-only SELECT/INSERT/UPDATE/DELETE via `auth.uid() = user_id`. Standard GRANTs to `authenticated` + `service_role`.

## 3. Server functions (`src/lib/sessions.functions.ts`)

All `.middleware([requireSupabaseAuth])`, RLS-scoped:
- `listSessions({ search?, status?, favoritesOnly? })`
- `getSession({ id })`
- `upsertSession(payload)` — used by autosave; insert if no id, otherwise patch
- `setSessionStatus({ id, status })`
- `toggleFavorite({ id })`
- `deleteSession({ id })`

## 4. Diagnose route changes (`src/routes/diagnose.tsx`)

- On mount: load most recent `active` session for user. If found, show **Resume Previous Diagnosis?** card (Appliance / Complaint / Last Updated) with **Resume** + **Start New** buttons. With multiple actives, show a list.
- Track current `sessionId` in state.
- Add a debounced (~600ms) autosave effect: whenever appliance, complaint, findings, history, or engine output changes → call `upsertSession`. Show **✓ Auto Saved** indicator (states: Saving… / Saved · 2s ago).
- "Mark Complete" and "Abandon" buttons set status. Reset = new session (old one stays Active until user marks it).
- Previous Question + Current Findings already exist from prior turn — keep them; they now persist via autosave.

## 5. New History route (`src/routes/_authenticated/history.tsx`)

- Search bar (model/serial/type/brand/complaint — filtered server-side with `ilike`).
- Tabs: All / Active / Completed / Abandoned.
- **Favorites** row pinned at top.
- Cards show Appliance Type · Brand · Model · Complaint · Date · Status badge · star icon.
- Card actions: **Resume** (navigates `/diagnose?session=<id>`), **View Details**, **Delete** (confirm).

## 6. View Details (`/history/$id`)

Read-only layout: Verified Appliance, Complaint, Current Findings, Questions Answered (timeline), Most Likely Failures, Recommended Next Test, Status. "Resume" + "Delete" actions.

## 7. Navigation

Update top nav (in `__root.tsx` or shared header): Dashboard · Diagnose · Documents · History · Account. Account dropdown = email + Sign Out.

## Out of scope
- No team sharing, no PDF export, no offline queue (Cloud handles sync once online).
- Documents route stays as-is; not tied to a session.

## Removal
Drop `_authenticated/history.tsx`, `history.$id.tsx`, `sessions.functions.ts`, revert diagnose.tsx, drop the migration. Auth/Cloud can stay enabled or be turned off separately.

Approve to build.