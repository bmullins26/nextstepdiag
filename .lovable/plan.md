## Beta Access Approval Gate

Add an **approval gate** on top of existing auth — sign-up/login stay untouched. Every authenticated user now has an `access_status` that controls whether they reach the app or land on a status page.

### 1. Database

New table `public.user_access` (one row per user; created automatically on signup):
- `user_id` → `auth.users.id` (PK, cascade delete)
- `access_status` enum: `pending | approved | denied | suspended` (default `pending`)
- `status_reason` text (optional, owner-set)
- `status_changed_by` uuid, `status_changed_at` timestamp
- `created_at`, `updated_at`

Why a separate table (not on `beta_applications`): people can sign up without ever submitting a beta application, and an application row isn't guaranteed to exist at signup time. The owner dashboard will join `beta_applications` ↔ `user_access` by `user_id`.

Triggers / functions:
- Extend `handle_new_user()` to also insert a `user_access` row with `pending`.
- If an existing `beta_applications` row matches the email and is already `approved/active`, set the new `user_access` row to `approved` in the same trigger (preserves the existing approval workflow).
- Security-definer RPC `get_my_access_status()` so the client can read its own status without exposing the table broadly.
- RLS: user can `SELECT` own row; only owners can `UPDATE`. Service role full.

Backfill: insert a `pending` row for every existing `auth.users` id that doesn't have one (owner-only initial bootstrap; existing owner account auto-set to `approved`).

### 2. Status Pages (public routes, but require a session)

Create `src/routes/pending-approval.tsx`, `/access-denied.tsx`, `/access-suspended.tsx`. Each:
- Calls `get_my_access_status()` on mount.
- If status is `approved`, redirects to `/diagnose`.
- Renders the exact copy from the spec (Pending / Denied / Suspended) with the specified button.
- Sign-out link in the corner so a user isn't stuck.

### 3. Gate the `_authenticated` Layout

In `src/routes/_authenticated/route.tsx` `beforeLoad`, after `getUser()` succeeds:
- Call `get_my_access_status()`.
- `approved` → continue.
- `pending` → `redirect({ to: "/pending-approval" })`.
- `denied` → `/access-denied`.
- `suspended` → `/access-suspended`.
- Missing row (defensive) → treat as `pending`.

This guarantees no protected route renders for a non-approved user, satisfying "do not rely solely on hiding navigation."

### 4. Owner Dashboard — Beta Program Tab

In `src/components/owner/beta-program-tab.tsx`:
- Join applicant rows with `user_access` (when `user_id` is set).
- New **Access** column with badge: 🟡 Pending / 🟢 Approved / 🔴 Denied / ⚫ Suspended.
- New filter dropdown: All / Pending / Approved / Denied / Suspended.
- Per-row quick actions: **Approve**, **Deny**, **Suspend**, **Revoke Access** (revoke = back to `pending`).
  - Clicking Approve sets `user_access.access_status = 'approved'` immediately — no email/invite step required.
  - Also mirror the change to `beta_applications.status` where it makes sense (approve→active, deny→rejected) to keep the existing workflow coherent. Existing "Send Invite" action stays.
- All actions go through a new owner-only server function `setUserAccessStatus({ userId, status, reason? })` that verifies `has_role('owner')` before writing and logs `status_changed_by/at`.

### 5. Files to Add / Edit

Add:
- Migration: `user_access` table + enum + RLS + grants + `get_my_access_status()` RPC + `handle_new_user` update + backfill.
- `src/lib/user-access.functions.ts` — `getMyAccessStatus`, `setUserAccessStatus` (owner-only).
- `src/routes/pending-approval.tsx`, `src/routes/access-denied.tsx`, `src/routes/access-suspended.tsx`.

Edit:
- `src/routes/_authenticated/route.tsx` — add status gate in `beforeLoad`.
- `src/components/owner/beta-program-tab.tsx` — badges, filter, action buttons.
- `src/lib/beta-applications.functions.ts` — include joined access status in the list query.

### 6. Preserved (unchanged)

Sign-up, login, Google OAuth, `/auth`, existing beta application form/flow, existing invite/wave logic, existing owner dashboard structure.

### Notes

- The gate runs client-side in `beforeLoad` (the layout is already `ssr: false`), so a paused/denied user can never see protected UI even momentarily.
- Owner is identified via the existing `user_roles` + `has_role()` pattern — no new role logic.
