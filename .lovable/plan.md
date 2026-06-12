## Repair Insights Engine (RIE) — Additive Integration

Existing diagnostic flow (age verify, brand selection, model lookup, AI analysis, results, UX) is not touched. Everything below is new and isolated.

### Environment variables

Add to `.env` (server-only, no `VITE_` prefix):
- `FORCE_DISABLE_REPAIR_INSIGHTS=false` — kill switch, evaluated first
- `ENABLE_REPAIR_INSIGHTS=false`
- `RIE_BASE_URL=https://repairinsightsengine.lovable.app`

All requests go through `${RIE_BASE_URL}/api/v1`. No URLs hardcoded anywhere else.

### Kill switch

`FORCE_DISABLE_REPAIR_INSIGHTS=true` makes NextStep behave as if RIE does not exist:
- Server fn returns `{ enabled: false }` before any other check.
- No health checks, no API calls, no cache reads/writes.
- Card hidden everywhere.
- Test page still loads but always reports unavailable (no network).

Use case: instant rollback during a demo without redeploying.

### Server function — `src/lib/repair-insights.functions.ts`

`getRepairInsights({ model })` — `createServerFn({ method: 'POST' })` with `requireSupabaseAuth`, Zod-validated input. All env vars read inside `.handler()`.

Logic:
1. If `process.env.FORCE_DISABLE_REPAIR_INSIGHTS === 'true'` → return `{ enabled: false }`. Stop.
2. If `process.env.ENABLE_REPAIR_INSIGHTS !== 'true'` → return `{ enabled: false }`. Stop.
3. Normalize model to uppercase. Check 24h success cache → return cached result if present.
4. Check 60s engine-down cache → if set, return `{ enabled: true, available: false }`.
5. Health check `GET ${RIE_BASE_URL}/api/v1/health` (AbortController 2s). Failure of any kind → set 60s engine-down cache, return `{ enabled: true, available: false }`.
6. Model lookup `GET ${RIE_BASE_URL}/api/v1/models/{MODEL}` (2s timeout). Any failure → `{ enabled: true, available: false }`.
7. Validate with Zod (`repair_count: number`, `top_failures: string[]`, `top_repairs: string[]`, `top_parts: string[]`, `confidence_score: number`). Invalid → unavailable.
8. Cache valid responses (including `repair_count === 0`) for 24h. Return `{ enabled: true, available: true, data }`.

Caches are module-scope `Map`s keyed by uppercase model. All errors are caught and swallowed; the function never throws to the client.

### UI component — `src/components/repair-insights-card.tsx`

- Uses `useQuery(['repair-insights', model], …, { staleTime: 24h, retry: false })`.
- Returns `null` unless `enabled === true && available === true && data.repair_count >= 3`.
- Renders "Historical Repair Insights" with: Repairs Analyzed, Most Common Failures, Most Common Repairs, Common Parts, Confidence Score.
- No warnings, empty states, or errors in the diagnostic flow.

### Diagnostic flow integration

Mount `<RepairInsightsCard model={verifiedModel} />` after successful appliance verification in `src/components/verify-appliance.tsx` (sibling render). No verification, AI, results, or state-machine changes.

### Test page — `src/routes/_authenticated/repair-insights-test.tsx`

`/repair-insights-test` (any signed-in user).
- Input: Model Number; Button: Lookup Model → calls `getRepairInsights`.
- Output: Repairs Found, Top Failures, Top Repairs, Top Parts, Confidence Score.
- Only this page surfaces "Insights Unavailable" when `enabled === false` or `available === false`.

### Owner dashboard link

Edit `src/components/owner-panels.tsx` to add a "Repair Insights Test" link to `/repair-insights-test`. Page itself is open to any signed-in user.

### Files

Created:
- `src/lib/repair-insights.functions.ts`
- `src/components/repair-insights-card.tsx`
- `src/routes/_authenticated/repair-insights-test.tsx`

Edited:
- `.env` — add `FORCE_DISABLE_REPAIR_INSIGHTS`, `ENABLE_REPAIR_INSIGHTS`, `RIE_BASE_URL`
- `src/components/verify-appliance.tsx` — render card after successful verification
- `src/components/owner-panels.tsx` — add test page link

### Success criteria

- `FORCE_DISABLE_REPAIR_INSIGHTS=true`: zero RIE logic runs, card hidden everywhere, instant rollback.
- `ENABLE_REPAIR_INSIGHTS=false` (and force-disable off): zero RIE network calls, no UI changes.
- Flag on + RIE healthy + `repair_count ≥ 3`: card appears; diagnostics unchanged.
- Flag on + RIE healthy + `repair_count < 3`: card hidden; diagnostics unchanged.
- Flag on + RIE down/slow/invalid: card hidden, no error surfaced, 60s engine-down cache prevents repeat failures.
- Repeat lookups within 24h served from cache.