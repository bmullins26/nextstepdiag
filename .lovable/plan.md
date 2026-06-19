## Diagnostic Grounding Engine v1.1 — Source Trust Ranking

Adds a `SourceTrust` axis (`oem` / `trusted_reference` / `community`) on top of the v1 confidence hierarchy (`exact_model` / `platform_family` / `manufacturer_family` / `low`). Confidence answers *"how specific is this to the model?"*; trust answers *"how authoritative is the source?"*. Both flow into prompts, UI badges, and owner analytics.

## Database

Migration on `public.tech_sheets`:

```sql
ALTER TABLE public.tech_sheets
  ADD COLUMN source_trust text NOT NULL DEFAULT 'community'
  CHECK (source_trust IN ('oem','trusted_reference','community'));

-- Backfill existing rows from source_url hostname
UPDATE public.tech_sheets SET source_trust = CASE
  WHEN source_url ~* '(whirlpool|maytag|kitchenaid|jennair|ge\.com|geappliances|samsung|lg\.com|frigidaire|electrolux|bosch-home|boschappliances|fisherpaykel|miele|haier|amana)\.' THEN 'oem'
  WHEN source_url ~* '(appliantology\.org|applianceblog\.com|manualslib\.com)' THEN 'trusted_reference'
  ELSE 'community'
END;
```

The same classifier lives in code (see `classifySourceTrust` below) so new fetches set it correctly without relying on the default.

## Module updates: `src/lib/tech-sheets/`

- `types.ts` — add `SourceTrust = "oem" | "trusted_reference" | "community"`; extend `TechSheet` and `GroundingResult` with `sourceTrust`. Reserve numeric trust rank for future tiers (Fred's data slotting between OEM and trusted_reference) via a `TRUST_RANK` map.
- `source-trust.ts` (new) — `classifySourceTrust(url: string): SourceTrust` using a small hostname → trust map (OEM domains per brand, trusted reference domains, fallback `community`). Plus `pickBestSource(candidates)` that sorts by `TRUST_RANK` then by `confidence` rank.
- `fetch.server.ts`:
  - `findSourceWithPerplexity` now returns an **array** of candidate `{url, platformFamily}` (Perplexity citations + best match), each classified via `classifySourceTrust`. Pipeline picks highest-trust candidate before scraping.
  - Persists `source_trust` on upsert.
- `lookup.functions.ts` — when reading cache, surface `sourceTrust` in the returned `GroundingResult`.
- `platform-families.ts` / `manufacturer-families.ts` — static entries marked `sourceTrust: 'trusted_reference'` (these are curated by us, not OEM PDFs).

## Diagnostics integration (`src/lib/diagnostics.functions.ts`)

`groundingSource` returned to client now:

```ts
{ url, confidence, sourceType, sourceTrust, platformFamily, displayLabel, trustLabel }
```

System prompt appended (verbatim from spec):

> The provided grounding data may come from OEM documentation, trusted technical references, or community sources. When sources conflict: OEM documentation takes precedence over all other sources. Trusted technical references take precedence over community sources. Community sources should be treated as advisory information only.

The v1 confidence rules (no inventing pins/voltages/codes; low → no test) remain unchanged.

## UI (`src/routes/_authenticated/diagnose.tsx`)

Add a small trust badge next to the existing `Grounded in:` caption:

- `oem` → green badge `OEM Source`
- `trusted_reference` → blue badge `Trusted Technical Reference`
- `community` → gray badge `Community Source`

No layout changes. Uses existing shadcn `Badge`.

## Owner dashboard

Extend `getTechSheetCoverageStats` (`src/lib/owner.functions.ts`) and the Tech Sheet Coverage panel (`src/components/owner-panels.tsx`) with **Source Trust Breakdown**: count + % for OEM / Trusted Reference / Community across cached sheets. Keep existing confidence breakdown.

## Future compatibility

`TRUST_RANK` is a numeric map so future tiers slot in without touching diagnostics code:

```ts
export const TRUST_RANK = {
  oem: 100,
  fred_historical: 80,        // reserved
  trusted_reference: 60,
  community: 20,
} as const;
```

Only `SourceTrust` union and DB CHECK constraint need updating to register a new tier.

## Files

Migration:
- `supabase/migrations/<ts>_tech_sheets_source_trust.sql`

New:
- `src/lib/tech-sheets/source-trust.ts`

Edited:
- `src/lib/tech-sheets/types.ts`
- `src/lib/tech-sheets/fetch.server.ts`
- `src/lib/tech-sheets/lookup.functions.ts`
- `src/lib/tech-sheets/platform-families.ts`
- `src/lib/tech-sheets/manufacturer-families.ts`
- `src/lib/diagnostics.functions.ts` (prompt + return shape)
- `src/routes/_authenticated/diagnose.tsx` (trust badge)
- `src/lib/owner.functions.ts` (stats)
- `src/components/owner-panels.tsx` (breakdown UI)

## Out of scope

Age decoder, Documents feature, Fred's API integration, subscriptions, UI redesign.
