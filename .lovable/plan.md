Two changes: brand the app with the new logo, and replace the static error-code table with an AI-researched lookup that caches results.

## 1. Logo

- Upload the new image to Lovable Assets, overwriting `src/assets/nextstep-logo.asset.json`:
  `lovable-assets create --file /mnt/user-uploads/ChatGPT_Image_Jun_11_2026_02_16_06_PM-2.png --filename nextstep-logo.png > src/assets/nextstep-logo.asset.json`
- `BrandLogo` already reads that pointer, so every consumer picks up the new artwork automatically. Adjust layouts since the new image already contains the wordmark + tagline:
  - **Sidebar expanded header**: render the full logo only (wide, ~48px tall, fits header width); remove the duplicate "NextStep Diagnostics" wordmark and "A technician in your pocket." tagline lines.
  - **Sidebar collapsed rail**: render the logo at 44px square with `object-contain` (the pocket-mark portion still reads).
  - **Dashboard signature footer**: render the full logo centered, ~360px wide; remove the duplicate wordmark + tagline lines.
  - **Auth page** (if it uses BrandLogo): same — logo only.
- Favicon `<link rel="icon">` in `__root.tsx`: point at the new asset URL.

## 2. Error Code Lookup — AI-researched with cache

### Database (new migration)
Replace the static `error_codes` table with an `error_code_cache`:

```sql
create table public.error_code_cache (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  appliance_type text not null default '',
  model_number text not null default '',
  code text not null,
  meaning text not null,
  common_causes jsonb not null default '[]',
  affected_components jsonb not null default '[]',
  recommended_tests jsonb not null default '[]',
  service_notes text not null default '',
  confidence text not null,        -- 'high' | 'medium' | 'low'
  sources jsonb not null default '[]', -- [{ title, url }]
  cached_at timestamptz not null default now(),
  unique (brand, appliance_type, model_number, code)
);
```
GRANT SELECT to `authenticated`, GRANT ALL to `service_role`. RLS on, single policy: authenticated users may select. Inserts happen via the server function using `service_role` (no user-write policy needed). Drop the old `error_codes` table.

### Server function — `researchErrorCode` (`src/lib/error-codes.functions.ts`)
Input: `{ brand, applianceType?, modelNumber?, code }`.

Flow:
1. **Cache hit** — query `error_code_cache` for exact `(brand, applianceType ?? '', modelNumber ?? '', code)`. If present and `cached_at` within 90 days, return it with `source: 'cache'`.
2. **Research** — call Lovable AI (`google/gemini-3-flash-preview`) with `streamText` not needed → use `generateText` + structured `Output.object` schema:
   ```
   { meaning, common_causes[], affected_components[], recommended_tests[], service_notes, confidence: 'high'|'medium'|'low', sources: [{title,url}] }
   ```
   System prompt: "You are an appliance repair reference. Research the given fault code from manufacturer service manuals and reputable repair sources (ApplianceJunk, RepairClinic, manufacturer tech sheets). Prefer model-specific meaning when a model number is provided. Set confidence='high' only when sourced from an OEM tech sheet or manufacturer doc; 'medium' for reputable repair sites; 'low' when uncertain or inferred. If the code cannot be confirmed, return meaning='Unknown' and confidence='low'. Output JSON only."
   User prompt builds from brand/appliance/model/code.
3. **Persist** — `supabaseAdmin` upsert into `error_code_cache` (unique key handles dedupe). Lazy-load `client.server` inside handler.
4. Return `{ row, confidence, sources, source: 'fresh' }`.

Errors: rate-limit (429) and credit-exhausted (402) from the gateway surface as user-readable messages; cache misses on AI failure return `{ notFound: true, reason }` without writing.

Remove `lookupErrorCode` and `listErrorCodesByBrand` exports.

### UI — `src/routes/_authenticated/error-codes.tsx`
- Form: Brand (required), Appliance Type (optional select), Model Number (required — bolded label), Error Code (required). Helper copy under the heading: "Researches your code from manufacturer service docs. Cached for faster future lookups."
- Submit triggers `useServerFn(researchErrorCode)`; show "Researching…" state with model spinner (this can take a few seconds on cache miss).
- Result panel adds:
  - Confidence badge ("High / Medium / Low confidence").
  - Existing sections: Meaning (H2), Common Causes, Affected Components, Recommended Tests, Service Notes.
  - **Sources** section at the bottom — list `{title, url}` as outbound links.
  - Tiny footer line: "Cached" or "Freshly researched · just now" using the returned `source`.

### Types
After migration, regenerated `types.ts` will pick up `error_code_cache`. Update `ErrorCodeRow` to read from the new table.

## Files

- New migration: drop `error_codes`, create `error_code_cache` with GRANTs + RLS.
- Asset: overwrite `src/assets/nextstep-logo.asset.json`.
- Edited: `src/components/app-sidebar.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/route.tsx` (auth/header logo), `src/routes/auth.tsx` (if it shows BrandLogo), `src/routes/__root.tsx` (favicon), `src/lib/error-codes.functions.ts`, `src/routes/_authenticated/error-codes.tsx`.

## Out of scope

Diagnose workflow logic, Documents assistant, History, brand/appliance lists. The Diagnose flow's own error-code inference (if any) is untouched.
