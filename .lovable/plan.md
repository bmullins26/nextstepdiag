# Repair Outcome Feedback Loop

Extends the existing outcome capture (`diagnostic_outcomes`, `OutcomeCapture`, owner accuracy tab). No new parallel outcome system, no changes to historical rows.

## What the technician sees

A 3-step panel replaces the current single-question outcome box at the end of a diagnosis (and on pending repairs in History). Target: 30-60 seconds.

**Step 1 — What Did You Find?**
- Actual Failure (required)
- Part Replaced
- Confirming Test
- Repair Successful? Yes / No
- Anything Unusual? (optional)

**Step 2 — Did NextStep Get It Right?** (required, one tap)
- Yes — correct failure identified
- Partially — helped, actual failure differed
- No — recommendation was incorrect

**Step 3 — Optional**
- Technician notes
- Photo upload (private storage, author + owner only)
- "Share with the Community" button, pre-filled from what was just entered — brand, appliance type, model, complaint, confirmed failure, repair, outcome. No re-typing.

Existing fast paths stay: "Repair Pending" still saves instantly and can be finished later from History.

## Prediction vs actual

At the moment the outcome is submitted, the recommendation the technician actually saw is snapshotted onto the outcome row: top recommended failure, other recommended failures, confidence values, tests performed, and the evidence sources that fed it (manufacturer doc, tech sheet, verified repair, community, external). The original session and its AI recommendation are never overwritten — the snapshot is a copy, so every outcome can answer "predicted vs actual".

## Accuracy metrics

Server-side aggregation returns: total completed, confirmed repairs, outcomes with feedback, correct / partial / incorrect rates, and accuracy %. Below a minimum sample (20 outcomes with feedback) the API returns no percentage and the UI shows "Not enough data".

## Owner dashboard

The existing Diagnostic Accuracy tab gains a "NextStep Diagnostic Accuracy" section: totals, correct/partial/incorrect counts, accuracy %, and a monthly trend. Filters: brand, appliance type, model, failure type, date range. Nothing beyond that this phase — the point is clean underlying data.

## Feedback loop rules

Technician verdicts are recorded as data points only. They adjust the confidence signal attached to a recommendation's evidence sources in aggregate; a single response never changes diagnostic logic. Verified repair outcomes remain the authoritative record of what fixed the appliance.

## Technical notes

- Migration adds additive nullable columns to `public.diagnostic_outcomes`: `part_replaced`, `confirming_test`, `repair_successful` (bool), `unusual_notes`, `nextstep_verdict` (`correct` | `partial` | `incorrect`), `predicted_top_failure`, `predicted_failures` (jsonb), `predicted_confidence` (jsonb), `tests_performed` (jsonb), `evidence_snapshot` (jsonb), `photo_path`. Existing rows keep NULLs; no backfill, no drops. Grants match the current table (`authenticated`, `service_role`).
- RLS unchanged in shape — technicians insert/update only their own rows; owners read aggregates through the existing owner policy.
- Private storage bucket `repair-photos`, path `{user_id}/{outcome_id}`, policies scoped to the path owner plus the `owner` role.
- `recordOutcome` / `updateOutcome` in `src/lib/diagnostic-outcomes.functions.ts` accept the new optional fields plus the prediction snapshot, validated with Zod. Existing callers keep working unchanged.
- `src/components/outcome-capture.tsx` becomes the 3-step flow; `src/components/pending-repairs.tsx` reuses the same step component when completing a pending repair.
- `src/routes/_authenticated/diagnose.tsx` passes `most_likely_failures`, confidence, findings/tests and `evidence_used` from the session into the capture component.
- New owner-gated `getAccuracyMetrics` server fn with filter inputs, consumed by the owner accuracy tab.
- Community share reuses the existing `/community/new` prefill, extended with the confirmed repair and outcome fields.

---

# Phase 2 — Confirmed Repairs in the Community

`public.diagnostic_outcomes` stays the single authoritative repair record. The Community references it by ID and adds discussion around it; the repair is never copied into a second table.

## Confirmed Repairs section

Community Home gains a **Confirmed Repairs** section alongside Recent Discussions, Popular Repairs, Trending Models and Newest Uploads, with a "View all confirmed repairs" link to a new `/community/confirmed-repairs` page.

Each repair card shows: brand, appliance type, model, complaint, confirmed failure, part replaced, confirming test, repair successful, technician display name, date confirmed, helpful count, and a link to the attached discussion when one exists. A **Verified Repair** badge appears on every card.

Never shown publicly: private technician notes, photos, owner notes, unusual-notes, internal diagnostic data, or any customer information. The feed serves an explicit safe-column projection only.

## Sharing controls what becomes public

A confirmed outcome is only visible in the Community once the technician chooses to share it. The outcome row gets a `shared_to_community` flag set at the moment they share, plus optional `public_notes` (the only free text ever shown publicly — separate from private notes). Everything already recorded stays private by default; nothing is retroactively exposed.

## Detail view

`/community/confirmed-repairs/{outcomeId}` shows the full public repair record — brand, appliance type, model, complaint, confirmed failure, part replaced, confirming test, repair successful, publicly shared notes, date confirmed — plus the supporting discussion, its replies and helpful votes when a discussion is attached.

## Search, filter, sort

Filter by brand, appliance type, model, complaint, confirmed failure, part and date range. Sort by newest, most helpful, most discussed, or most confirmed (repeat confirmations of the same failure on the same model).

## Verified Repair badge rules

A discussion shows the badge only when `verified_outcome_id` resolves to a real `diagnostic_outcomes` row with `outcome = 'confirmed'` that belongs to the discussion author. The badge is computed server-side; it can never be self-claimed, and a technician cannot attach another technician's outcome — the server rejects any `verified_outcome_id` not owned by the caller.

## Share flow and duplicate prevention

The existing "Share this repair with the Community?" prompt carries brand, appliance type, model, complaint, confirmed failure, part replaced, confirming test, repair notes and the outcome ID into `/community/new`, where the technician can edit before publishing. Publishing sets `discussion_type = 'confirmed_repair'` and `verified_outcome_id`.

Before opening the composer, the app checks whether that outcome already has a discussion. If so it shows "This repair is already shared with the Community." with a button to open the existing discussion — one outcome, one auto-created post (enforced by a unique index on `verified_outcome_id`).

## Model page counts

Community model views show a confirmed-repair count and the most common confirmed failures for that brand + model, computed live from `diagnostic_outcomes`. No duplicated counter columns.

## Diagnostic evidence

The existing `community_verified` evidence provider is pointed at shared confirmed outcomes so verified repairs feed diagnostics as higher-quality community evidence, labelled "Verified Repair". Evidence priority order is unchanged.

## Contribution foundation

Sharing a confirmed repair records a contribution event (type `confirmed_repair_shared`, higher weight than a normal discussion) in a lightweight append-only ledger table for the future contribution system. No points or rewards in this phase.

## Phase 2 technical notes

- Migration: add `shared_to_community boolean not null default false`, `shared_at timestamptz`, `public_notes text` to `public.diagnostic_outcomes`; add a SELECT policy allowing authenticated users to read rows where `outcome = 'confirmed' AND shared_to_community` (existing own-row and owner policies untouched); add a unique index on `community_discussions.verified_outcome_id` where not null; create `public.contribution_events` (user_id, event_type, outcome_id, discussion_id, weight) with grants and RLS — insert own, read own, owner reads all.
- New `src/lib/confirmed-repairs.functions.ts`: `listConfirmedRepairs` (filters + sort + pagination, safe-column projection), `getConfirmedRepair`, `getModelConfirmedRepairStats`, `shareOutcomeToCommunity` (verifies caller owns the outcome, sets the share flags, records the contribution event), `getOutcomeDiscussion` (duplicate check).
- `createDiscussion` in `src/lib/community.functions.ts` validates that any supplied `verified_outcome_id` is owned by the caller and confirmed; discussion cards and detail views compute the Verified Repair badge from that join.
- New routes: `src/routes/_authenticated/community.confirmed-repairs.tsx` (list) and `community.confirmed-repairs.$outcomeId.tsx` (detail); a `ConfirmedRepairCard` component reused by Community Home and the feed.
- `src/components/outcome-capture.tsx` share button routes through the duplicate check and passes the extended prefill including `verifiedOutcomeId`; `community.new.tsx` search schema gains `partReplaced`, `confirmingTest`.
- `src/lib/evidence/providers/community.ts` verified provider reads shared confirmed outcomes joined to their discussions.