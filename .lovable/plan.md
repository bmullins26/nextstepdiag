## What this plan covers

Two issues in one pass:

1. **Owner sidebar item never appears** even though `bmullins26@gmail.com` has the `owner` role (verified in DB).
2. **Owner needs a richer Users section** to manage accounts now, with room to manage subscriptions later, and to change a user's **displayed dashboard name**.

---

## 1. Fix the Owner sidebar item

**Root cause:** `src/components/app-sidebar.tsx` reads the role once in a `useEffect` on mount. If the sidebar mounts before the Supabase session is hydrated (common right after Google OAuth redirect), `getUser()` returns `null`, the role query is skipped, and `isOwner` stays `false` until a full page reload. There's also no subscription to `onAuthStateChange`, so sign-in in the same tab never re-checks.

**Fix:** rewrite the role check in `app-sidebar.tsx`:
- Track `userId`/`email` from both `supabase.auth.getUser()` AND `supabase.auth.onAuthStateChange` (`SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED`, `INITIAL_SESSION`).
- Use `useQuery({ queryKey: ['user-role', userId], enabled: !!userId })` so the result re-renders the sidebar the moment the role row arrives.
- `isOwner = data === 'owner'`. Hide the Owner item while loading (no flash).

No DB, RLS, route, or server-function changes needed for this part.

---

## 2. Expand the Users section in `/owner`

### Schema additions (one migration)

Add to `profiles`:
- `display_name TEXT` — what shows in the dashboard greeting / header. Falls back to `full_name` then email local part.

Backfill `display_name = full_name` for existing rows. RLS:
- Users may `UPDATE` their own `display_name` only (existing self-update policy already covers this if columns aren't restricted; otherwise add a policy scoped to `auth.uid() = id` for that column).
- Owners may `UPDATE` any profile (already covered by existing owner policy).

### Where the display name is used
- The dashboard header / greeting reads `profile.display_name ?? full_name ?? email`.
- A new self-serve **Account Settings** dialog on `/dashboard` (gear/avatar menu) lets any signed-in user change their own `display_name`. New server fn `updateMyProfile({ displayName })` using `requireSupabaseAuth`.

### Owner → Users tab upgrade

Expand the existing Users table in `src/routes/_authenticated/owner.tsx`:

Columns: Email · Display name · Plan · Role · Status · Last activity · Actions

Actions menu per user (owner-only server fns, all gated by `assertOwner`):
- **Edit display name** — inline edit or small dialog. New: `setUserDisplayName({ userId, displayName })`.
- **Change plan** — existing `setUserPlan` (free / pro / master / lifetime).
- **Grant / revoke Owner** — existing `setUserOwnerRole`.
- **Suspend / Unsuspend** — existing `setUserSuspended` (auth ban).
- **Delete account** — new `deleteUser({ userId })` using `supabaseAdmin.auth.admin.deleteUser`. Confirms with a destructive AlertDialog. Self-delete blocked.
- **Send password reset** — new `sendPasswordReset({ userId })` using `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` and returning success (no email plumbing today; link is shown to the owner to share or copied to clipboard).

The User Detail dialog gets a new top section showing display name (editable) and a placeholder **Subscription** card stub:
- Shows current `plan`, `is_suspended`, role.
- A disabled "Manage subscription" button with helper text "Billing integration coming soon." This reserves the spot without building billing now.

### Out of scope for this turn
- Real billing / Stripe / Paddle integration.
- Emailing the password-reset link automatically (we surface the link to the owner instead).
- Per-plan feature gating in the rest of the app.
- Bulk actions.

---

## Verification

- Sign in as `bmullins26@gmail.com` → Owner item appears in sidebar without a manual reload; `/owner` loads.
- Sign out → Owner item disappears.
- In `/owner` → Users: edit a user's display name → their dashboard greeting updates on next load.
- Change plan, grant/revoke owner, suspend, delete, send password reset → each action succeeds and the row updates.
- Non-owner navigating to `/owner` → owner-only server fns reject with Forbidden.

---

## Files touched

- `src/components/app-sidebar.tsx` — role check via useQuery + auth listener.
- `src/routes/_authenticated/owner.tsx` — Users tab upgrades, detail dialog updates, subscription stub card.
- `src/routes/_authenticated/dashboard.tsx` — show `display_name`, add Account Settings dialog (or new small component).
- `src/lib/owner.functions.ts` — add `setUserDisplayName`, `deleteUser`, `sendPasswordReset`.
- `src/lib/profile.functions.ts` *(new)* — `getMyProfile`, `updateMyProfile`.
- One new migration — add `profiles.display_name` + backfill.
