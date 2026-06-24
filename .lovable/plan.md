# NextStep v2 + v2.1 — Fast Track, Outcome Learning, Delayed Confirmation

Today's app already runs diagnostics from Brand + Model alone (age is non-blocking). This plan finishes the workflow split, captures real repair outcomes (including delayed confirmation after a return visit), and feeds those outcomes back into recommendations and owner analytics.

## Part 1 — Fast Track Verify UI

`src/components/verify-appliance.tsx`
- Replace the single `Decode` button with two:
  - Primary: **Verify & Start Diagnosis** — runs `decodeAppliance` (serial passed only if filled) and immediately calls `onConfirm`, so `diagnose.tsx` advances to Phase 2.
  - Secondary: **Lookup Age** — runs only the age path and renders the identification card without leaving Verify.
- If a serial was provided, keep populating Built/Age in the background; when it resolves, push an updated appliance back via a new `onUpdate` prop so the Phase 2 chip reflects it.
- Helper copy stays: "Age lookup is optional and does not affect diagnostics." Remove any remaining "required" copy around serial.

`src/routes/_authenticated/diagnose.tsx`
- Accept `onUpdate` from `VerifyAppliance` so late-arriving age refreshes update `appliance` without resetting the phase.

No server changes for Part 1 (the decode + age chain are already non-blocking).

## Part 2 — Data model: `diagnostic_outcomes`

New table `public.diagnostic_outcomes`:
- `id uuid pk default gen_random_uuid()`
- `session_id uuid null` (loose ref to `diagnostic_sessions.id`)
- `user_id uuid not null default auth.uid()`
- `manufacturer text`, `model_number text`, `appliance_type text`, `platform text null`
- `complaint text`
- `recommended_failure text`
- `actual_failure text null`
- `notes text null`
- `outcome text not null check (outcome in ('confirmed','incorrect','partial','pending_repair'))`
- `confirmed_at timestamptz null`
- `created_at timestamptz default now()`, `updated_at timestamptz default now()` (with `set_updated_at` trigger)

Grants + RLS (same migration):
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;`
- RLS: user can `SELECT/INSERT/UPDATE` their own rows (`auth.uid() = user_id`); owners (`has_role(auth.uid(),'admin')`) can `SELECT` all.

Indexes: `(user_id, outcome)`, `(manufacturer, model_number, appliance_type, complaint)`, `(outcome) where outcome = 'pending_repair'`.

## Part 3 — Server functions

New `src/lib/diagnostic-outcomes.functions.ts`:
- `recordOutcome` — insert a new outcome. Input: `{ sessionId?, manufacturer, modelNumber, applianceType, platform?, complaint, recommendedFailure, outcome: 'confirmed'|'incorrect'|'partial'|'pending_repair', actualFailure?, notes? }`. On `confirmed` sets `confirmed_at = now()` and flips `diagnostic_sessions.status` to `completed` when a sessionId is present. `pending_repair` leaves the session active.
- `updateOutcome` — for delayed confirmation. Input: `{ id, outcome: 'confirmed'|'incorrect'|'partial', actualFailure?, notes? }`. Sets `confirmed_at = now()` on confirm; user can only update rows where `user_id = auth.uid()`.
- `listPendingRepairs` — auth user's `pending_repair` rows, newest first.
- `getOutcomeStats({ manufacturer, modelNumber?, applianceType, complaint, platform? })` — weighted aggregation. Pulls rows scoped to each tier and combines with weights:

  | Tier | Match | Weight |
  | --- | --- | --- |
  | exact_model | manufacturer + modelNumber + complaint | 1.00 |
  | platform_family | manufacturer + platform + applianceType + complaint | 0.75 |
  | mfg_type | manufacturer + applianceType + complaint | 0.50 |
  | mfg | manufacturer + complaint | 0.25 |

  Only `confirmed`/`incorrect`/`partial` count (pending excluded). For each row: confirmed adds +1 to `recommendedFailure`; incorrect adds +1 to `actualFailure`; partial adds +0.5 to each. Final score per failure = Σ (weight × count). Return `{ scope, totals: { confirmed, incorrect, partial }, sampleSize, ranked: Array<{ failure, share, count }>, exactModelCount }`. `scope` is the most-specific tier that produced data.
- `getOwnerOutcomeMetrics` (admin-only via `has_role`) — totals by outcome, accuracy %, top confirmed failures, top incorrect recommendations, top complaints, top appliance types, models with highest/lowest accuracy (min 5 resolved outcomes).

Shared helper `src/lib/diagnostic-outcomes.server.ts` exposes `loadOutcomeStats()` for direct server-side reuse from `diagnostics.functions.ts` without re-authing.

## Part 4 — End-of-diagnosis capture UI

New `src/components/outcome-capture.tsx`, rendered inside `Phase3` when `step.done === true` and `step.mostLikelyFailure` is set. Replaces the current "Mark Complete" path for confident hypotheses.

- Header: "Likely Cause: {failure}" + confidence badge.
- Four buttons: `Yes, This Fixed It` / `No, This Was Not The Issue` / `Partially Correct` / `Repair Pending`.
- YES → `recordOutcome({ outcome: 'confirmed' })`, toast "Thanks! This helps improve future diagnostics.", auto-mark session completed, reset.
- NO → reveal input (datalist of recent `actual_failure` for the brand/type + free text) → `recordOutcome({ outcome: 'incorrect', actualFailure })`.
- PARTIAL → reveal textarea for "what else contributed" → `recordOutcome({ outcome: 'partial', notes })`.
- REPAIR PENDING → `recordOutcome({ outcome: 'pending_repair' })`, toast "Repair outcome saved. You can confirm the result later.", session stays active so it appears in Pending Repairs.

Existing manual "Mark Complete / Abandon" controls remain for sessions that never reach a confident hypothesis.

## Part 5 — Pending Repairs (delayed confirmation)

New `src/components/pending-repairs.tsx` — list driven by `listPendingRepairs`. Columns: Appliance (brand · type), Model, Complaint, Recommended Failure, Date Diagnosed. Row actions: `Confirm Repair`, `Mark Incorrect`, `Mark Partial` (same prompts as end-of-diagnosis), each calling `updateOutcome`. Resume button links to `/diagnose?session={id}` when `session_id` is set.

Mounted on:
- `src/routes/_authenticated/history.tsx` — new "Pending Repairs" section above the existing history list.
- `src/routes/_authenticated/dashboard.tsx` — compact card with up to 5 most recent pending rows + "View all" → history.
- `src/components/owner-panels.tsx` — admin-only full table.

## Part 6 — Learning Layer (feed outcomes into the LLM)

`src/lib/diagnostics.functions.ts` (`nextDiagnosticStep`):
- Before the LLM call, call `loadOutcomeStats(...)` (server-side helper).
- If `sampleSize >= 3`, append a prompt block:

  ```
  HISTORICAL TECHNICIAN OUTCOMES
  Scope: {scope}   Sample Size: {sampleSize}   Exact-model repairs: {exactModelCount}
  - {failure}: {share}%
  - ...
  Use these outcomes as historical evidence. Prioritize exact-model data over
  platform-family data; prioritize platform-family over manufacturer-family.
  Current diagnostic evidence may override historical trends when appropriate.
  ```

- Return `historicalOutcomes` on the response (scope, sampleSize, exactModelCount, ranked top 5).

`Phase3` UI: under the Most Likely Failure block, render a small evidence chip:

- Exact-model scope: "Based on N repairs of this exact model"
- Otherwise: "Based on N similar repairs · M confirmed outcomes"

Hidden when no historical data exists.

## Part 7 — Owner Diagnostic Accuracy panel

`src/components/owner-panels.tsx` — new card backed by `getOwnerOutcomeMetrics`:
- Totals: Total Outcomes, Confirmed, Incorrect, Partial, Pending Repair
- **Accuracy %** = `confirmed / (confirmed + incorrect + partial)` — pending excluded until resolved
- Top Confirmed Failures (top 10)
- Most Incorrect Recommendations (top 10)
- Most Common Complaints / Appliance Types
- Highest / Lowest Accuracy Models (≥5 resolved outcomes)

Reuses the existing `/owner` route gating (`amOwner` + `_authenticated`).

## Guardrails preserved
- No external API ever blocks diagnostics; age/serial/platform stay optional.
- Outcome capture is optional per session — skipping it never breaks the flow; the LLM falls back cleanly when `sampleSize < 3`.
- Pending repairs don't pollute accuracy until resolved.

## Files touched
- New: `supabase/migrations/<ts>_diagnostic_outcomes.sql`, `src/lib/diagnostic-outcomes.functions.ts`, `src/lib/diagnostic-outcomes.server.ts`, `src/components/outcome-capture.tsx`, `src/components/pending-repairs.tsx`.
- Edited: `src/components/verify-appliance.tsx`, `src/routes/_authenticated/diagnose.tsx`, `src/routes/_authenticated/history.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/components/owner-panels.tsx`, `src/lib/diagnostics.functions.ts`, `src/integrations/supabase/types.ts` (auto-regen post-migration).
