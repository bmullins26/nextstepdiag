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