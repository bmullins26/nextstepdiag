## Goal
Give signed-in testers a one-click way to submit a bug report or general feedback from anywhere in the app. Submissions flow into the existing admin Feedback tab.

## What already exists (reusing, not rebuilding)
- `public.feedback` table with `kind` (bug/feature/general), `subject`, `body`, `status`.
- `submitFeedback` server function (`src/lib/feedback.functions.ts`) — auth-gated, Zod-validated.
- Owner admin UI already has a **Feedback** tab in `src/components/owner-panels.tsx` listing all submissions with filters.

So this is purely a frontend addition.

## What to build

**1. New `src/components/feedback-widget.tsx`**
- Floating button fixed to bottom-right (mobile-safe spacing), `MessageSquare` icon, label "Feedback". Subtle, not intrusive.
- Opens a shadcn `Dialog` containing a form:
  - Type: Bug / Feature idea / General (segmented control or Select, default General)
  - Subject (required, max 200)
  - Message (required, max 5000, textarea)
  - Small helper line: "We'll include the page URL and your browser info to help reproduce."
- On submit: calls `submitFeedback` via `useServerFn`, appends auto-captured context to the body:
  ```
  ---
  Page: <location.pathname + search>
  UA: <navigator.userAgent>
  Viewport: <w>x<h>
  ```
- Toast on success ("Thanks — we got it"), reset + close. Toast on error.
- Only rendered for signed-in users (mounted inside `_authenticated/route.tsx` so the button doesn't appear on `/auth` or the landing page).

**2. Mount the widget**
- Add `<FeedbackWidget />` inside the `_authenticated/route.tsx` layout, alongside the existing `<Outlet />`.

**3. Admin side — minor polish only**
- The Feedback tab already exists; no schema changes. Confirm it surfaces new submissions (it does — queries `kind` + `status` with default `open`).

## Out of scope
- Screenshot uploads / storage bucket.
- Public (logged-out) submissions.
- Email notifications to admins.
- Editing the existing admin Feedback tab beyond verifying it works.

## Files
- **Create**: `src/components/feedback-widget.tsx`
- **Edit**: `src/routes/_authenticated/route.tsx` (mount widget)
