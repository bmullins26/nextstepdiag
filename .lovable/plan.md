# Make Age Lookup Optional — Never Block Diagnostics

## Goal
A technician must be able to verify an appliance and start diagnosing with **only Brand + Model Number**. Serial number, manufacture date, and age all become optional metadata that **enhance** diagnostics but never gate them.

## Behavior changes

**Verify Appliance form (`src/components/verify-appliance.tsx`)**
- Required: Brand, Model Number.
- Optional: Serial Number (label changes to `Serial Number (optional)`).
- Decode button enabled as soon as Brand + Model are filled.
- If serial is empty: skip age lookup entirely, return identification-only result (Built: Unknown, Age: Unknown).
- If serial is present: run age lookup in background; on any failure show "Age unavailable" instead of an error toast.
- Replace the existing error message "Brand, model number, and serial number are all required to decode" with a helper line under the serial field: *"Age lookup is optional and does not affect diagnostics."*
- Result card always renders. Built/Age rows show `Unknown` when missing. No blocking warnings.

**Decode server function (`src/lib/serial-decode.functions.ts`)**
- Loosen Zod schema: `serialNumber: z.string().optional().nullable()`.
- Skip `lookupApplianceAgeWithCache`, `decodeAge`, corroboration, and legacy comparison when no serial.
- Wrap the API lookup and local decoder in try/catch — any throw becomes `ok: false` and the function continues.
- Always return a successful response with the AI-identified `manufacturer / applianceType / platform`. `manufactureDate`, `ageYears`, `ageProvider`, `candidates`, `corroboration` become `null` / empty when unavailable.
- Persist `age_decode_attempts` only when a decode was actually attempted.

**Diagnose flow (`src/routes/_authenticated/diagnose.tsx`)**
- `advance()` precondition: require only `manufacturer + applianceType + modelNumber`. Drop the implicit serial/age requirement. Pass `manufactureYear` / `ageYears` only if present.
- Phase 2 chip: render "Built: Unknown / Age: Unknown" when missing, no warning style.
- Autosave: nullable age fields already supported — confirm payload sends `null` cleanly.

**Diagnostics + downstream features**
- `nextDiagnosticStep`, error codes, repair insights, document assistant, session create: confirm none throw when `manufactureYear` / `ageYears` are null. If a prompt currently interpolates age, fall back to `"unknown age"` text — never short-circuit.

**Verify card UI strings**
- Replace any "couldn't decode / required" copy with: *"Age lookup is optional and does not affect diagnostics."*
- "Age unavailable" badge (neutral muted) replaces error toasts when API + local both fail.

## Priority order (unchanged, but each step is non-fatal)
1. Cached age result
2. Appliance Age Finder API
3. Local deterministic decoder
4. Unknown → continue

## Data model
Already nullable in `diagnostic_sessions` (`manufacture_year`, `age_years`, `serial_number`). No migration required. Treat `null` as valid data everywhere.

## Future-proofing
All external age providers are isolated behind `lookupApplianceAgeWithCache` and `decodeAge`. Both are now wrapped so removal, rate-limiting, or paywall surfaces as `Age: Unknown` only — diagnostics, error codes, repair insights, grounding, document assistant, and session creation are unaffected.

## Preserved
- Existing age decoder, rules, scoring, corroboration, cache, owner analytics, ground-truth collection.
- Appliance Age Finder API integration and cache table.
- Type override learning system.
- Grounding engine fallback behavior from previous change.

## Files touched
- `src/components/verify-appliance.tsx` — make serial optional, soften messaging, always render result.
- `src/lib/serial-decode.functions.ts` — optional serial, non-throwing age path, null-safe response.
- `src/routes/_authenticated/diagnose.tsx` — drop age/serial preconditions; show `Unknown` cleanly.
- (Spot-check) `src/lib/diagnostics.functions.ts`, `src/lib/error-codes.functions.ts`, `src/lib/repair-insights.functions.ts`, `src/lib/document-assistant.functions.ts`, `src/lib/sessions.functions.ts` — confirm null age is tolerated; small guard edits only if needed.
