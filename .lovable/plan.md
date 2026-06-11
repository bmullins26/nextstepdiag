## Goal

When an owner logs in, the normal **Dashboard** should become the owner dashboard area instead of relying on a separate hidden Owner sidebar link.

## What will change

### 1. Dashboard detects owner status
On `/dashboard`, check whether the signed-in user has the owner role.

- Owner users see owner dashboard content
- Regular users keep seeing the technician dashboard they have now

### 2. Owner tools appear directly on Dashboard
For owner accounts, add an **Owner Dashboard** section at the top of `/dashboard` with the existing owner tools:

- Overview
- AI Usage
- Users
- Feedback
- AI Cost

This uses the owner functionality that already exists on `/owner`, but makes it visible from the main Dashboard experience.

### 3. Keep technician tools available
Owners should still be able to use normal technician tools.

The Dashboard will keep the existing quick actions and recent diagnostics below or alongside the owner section, so owner access does not replace the app workflow.

### 4. Keep `/owner` as a backup route
The `/owner` page can remain for direct access, but it will no longer be the only way to see owner UI.

### 5. Sidebar can stay simple
Since the Dashboard will show owner tools automatically, the sidebar Owner link becomes less important. I can leave it in place for owners as a shortcut, but the critical owner UI will now be on `/dashboard`.

## Technical details

- Reuse the existing owner server functions from `src/lib/owner.functions.ts`.
- Refactor the owner tab UI in `src/routes/_authenticated/owner.tsx` so the same owner panels can be imported and rendered by `src/routes/_authenticated/dashboard.tsx`.
- Add an owner check on Dashboard using `amOwner`.
- Render owner tabs only when `isOwner` is true.
- No database changes are needed because your account already has the owner role.
- No separate PIN/password flow will be added in this pass.

## Verification

- Sign in as `bmullins26@gmail.com`.
- Go to `/dashboard`.
- Confirm owner tabs/controls appear directly on Dashboard.
- Confirm regular users still only see the normal technician dashboard.
- Confirm `/owner` still works as a direct backup route.