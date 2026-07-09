
## Problem

`Maytag MED7230HW3 / ME0305172` (real DOM 01/2025) is coming back wrong. Root causes to address:

1. `callApplianceAgeApi` runs only once against `authMethod="both"`. If RapidAPI is degraded, returns a redirect/HTML, or the plan quota lapses, we silently fall through to the local decoder with no visibility.
2. Local Whirlpool/Maytag rules and API result are never reconciled — whichever one "wins" the priority ladder is shown as truth, even if the other two disagree.
3. Web corroboration only runs when the local decoder has ambiguous candidates. If the API returns confidently-wrong data, nothing challenges it.
4. There's no user-facing way to correct a bad year even though `age_decode_ground_truth` already exists.

## Fix

### 1. Harden the RapidAPI client (`src/lib/appliance-age-api.server.ts`)

- Retry with exponential backoff (2 tries) on 5xx / network / timeout.
- Follow the auth-method fallback chain automatically inside `callApplianceAgeApi`: try `both` → `headers` → `api_token`. If all three fail, return a structured `error` with the last status body so the caller sees why.
- Treat HTML/redirect responses (302, `<html`, homespy login page) as failures even when status is 2xx.
- Add a lightweight `pingApplianceAgeApi()` used by the owner diagnostics panel and by a scheduled health check (logged to `appliance_age_api_log` with `event='health_check'`).

### 2. Always cross-reference (`src/lib/serial-decode.functions.ts` + new `src/lib/age-verify/reconcile.server.ts`)

Replace the current "API wins if present" logic with a reconciler that runs on **every** decode when a serial is provided:

```text
Sources (parallel):
  A. Cache lookup (unchanged)
  B. RapidAPI (hardened; A/B tested)
  C. Local decoder (unchanged)
  D. Firecrawl web sweep (existing corroborateAge, ALWAYS on when serial present)

Reconcile:
  - Collect (year, month?, confidence, weight, sourceType) tuples.
  - Weights: OEM manual/spec sheet 1.0, RapidAPI 0.85, retailer listing 0.6,
    local rule 0.55, review/community 0.35.
  - Score each candidate year = Σ(weight × confidence). Bonus if ≥2 source
    types agree; penalty if a high-weight source explicitly contradicts.
  - Pick highest score. Confidence tier: High (≥2 independent sources agree
    AND top score >> second), Medium (single strong source or weak agreement),
    Low (only one source or conflict unresolved).
  - Record every source & score in the response for the UI's "Sources" list
    and in `age_decode_attempts.metadata` for later analysis.
```

Existing helpers reused: `corroborateAge()` (already Firecrawl-backed with source-type weights), `decodeAge()`, `lookupApplianceAgeWithCache()`. New file only contains the reconciler + scorer.

### 3. Fix the specific Maytag failure

`ME0305172` — leading letters `ME` are a Whirlpool/Maytag plant code (Marion, OH), digits `03` = week 03, `05` looks like year but Whirlpool 12-digit Maytag serials from 2020+ use a different offset. Add a rule for the current 9-char `LL#######` Amana/Maytag format (used since ~2015) that decodes positions 3–4 as year and 5–6 as week, and register it in `src/lib/age-decoder/rules/whirlpool.ts`. Reconciler + web search will catch anything the rule still misses.

### 4. "Report wrong year" (UI)

- In the age card (`src/components/verify-appliance.tsx` region), when a decoded year is shown, add a small "Not right?" button.
- Opens a `Dialog` with: correct year (required), correct month (optional), source (data plate / receipt / owner manual / other), notes.
- On submit, calls existing `submitKnownYear` server fn (already in `src/lib/age-ground-truth.functions.ts`), then re-runs decode with a `groundTruthHint` flag that boosts the user-provided year in the reconciler and refreshes the display.
- Shows a subtle "Thanks — updated" toast; the corrected value is now the source of truth for this (brand, model, serial) via the existing upsert.

### 5. Owner diagnostics

Extend the existing owner API tester (`testApplianceAgeApiFn`) response so the owner panel shows: last successful call time, current auth method working, and cumulative success rate from `appliance_age_api_log` over 24h/7d.

## Technical notes

- No new tables. `age_decode_attempts` already has enough columns; sources list stored in the existing `metadata`-like fields (add a JSONB column if none exists — will confirm via a small migration in step 1 of build).
- `submitKnownYear` already exists; only wiring up UI + reconciler hint.
- No new secrets; Firecrawl + RapidAPI keys are already present.
- Firecrawl cost control: reuse existing 90-day `age_decode_corroborations` cache keyed by `(brand_key, model_number)`; cache hits are free.
- All logic in server functions; no client-side API keys.

## Out of scope

- Rewriting the Firecrawl provider selection or adding new brand rule files beyond the one Maytag/Amana rule.
- Replacing RapidAPI with a different provider.
- Batch re-verification of historical `age_decode_attempts`.

## Files touched (build phase)

- `src/lib/appliance-age-api.server.ts` — retries + auth fallback + HTML detection.
- `src/lib/appliance-age.functions.ts` — plumb structured errors through.
- `src/lib/age-verify/reconcile.server.ts` — NEW.
- `src/lib/serial-decode.functions.ts` — call reconciler, return sources array.
- `src/lib/age-decoder/rules/whirlpool.ts` — add Maytag 9-char rule.
- `src/lib/age-ground-truth.functions.ts` — accept optional hint replay flag.
- `src/components/verify-appliance.tsx` (or the current age card) — "Report wrong year" dialog + sources list.
- One migration: add `sources JSONB` column to `age_decode_attempts` if not already present.
