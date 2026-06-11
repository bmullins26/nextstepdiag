## 1. Branding refinement

### Sidebar (`src/components/app-sidebar.tsx`)
- **Collapsed state (~64px rail):** Replace the small 36px icon tile with a larger 44px `BrandLogo` mark, no background tile, centered. Brand mark dominates the rail.
- **Expanded state:** Replace the current tiny logo + small "NextStep / Diagnostics" stack with:
  - `BrandLogo` at ~56px
  - "NextStep Diagnostics" wordmark (bold, single-line where possible)
  - Tagline "A technician in your pocket." directly underneath
  - Slightly more vertical padding so the header feels like a real brand block, not a chip.
- Keep nav, footer, and sign-out untouched.

### Dashboard signature footer (`src/routes/_authenticated/dashboard.tsx`)
- Remove the small "NextStep Diagnostics" eyebrow above the greeting; greeting stays as the page H1.
- Add a new centered branding section AFTER the Recent Diagnostics + Field Tips grid:
  - Large `BrandLogo` (~120px)
  - "NextStep Diagnostics" wordmark (large, tracking-tight)
  - "A technician in your pocket." tagline (muted)
  - Generous top margin (e.g. `mt-16`), centered, subtle divider or none.

### Consistency pass
- Diagnose, Documents, Error Codes, History already share the `glass-card` / token system from the previous refactor. Verify each page's header uses the same eyebrow + H1 pattern and lives inside the sidebar shell. No structural rewrites — only spacing/typography normalization where they drift.

---

## 2. Error Code Lookup redesign

### Database (new migration)
Add columns to `public.error_codes` so the table can hold brand-, appliance-, and model-specific entries without future migrations:

```text
appliance_type  text  not null  default ''
model_number    text  not null  default ''   -- '' = applies to all models
affected_components  jsonb  not null  default '[]'
service_notes        text   not null  default ''
```

- Drop the existing `unique(brand, code)` constraint; add `unique(brand, appliance_type, model_number, code)` so a code can repeat across appliance types and models.
- Backfill existing rows with a best-guess `appliance_type` per brand (script will set sensible defaults; user can refine later) and `model_number = ''`.
- Re-seed with a small expanded set covering Washer / Dryer / Dishwasher / Refrigerator / Range across the major brands, including a few model-specific examples so the priority logic is observable.
- Keep RLS + GRANTs as-is (already authenticated read).

### Server fn (`src/lib/error-codes.functions.ts`)
Rewrite `lookupErrorCode` input to `{ brand, applianceType, modelNumber?, code }`. Resolution order, first hit wins:

1. **Exact model match** — `brand` + `appliance_type` + `model_number` + `code` (only if user supplied a model).
2. **Brand + appliance type** — `brand` + `appliance_type` + `model_number = ''` + `code`.
3. **Brand only** — `brand` + `appliance_type = ''` + `model_number = ''` + `code`.

Return `{ notFound: false, row, confidence: 'exact-model' | 'brand-appliance' | 'brand' }` or `{ notFound: true }`. `confidence` drives a badge in the UI.

### UI (`src/routes/_authenticated/error-codes.tsx`)
- Left form gains **Appliance Type** (required, select) and **Model Number** (optional text) between Brand and Code.
- Right result panel adds:
  - Confidence badge ("Exact model match" / "Brand + appliance" / "Brand-level — verify for your model").
  - **Affected Components** section (chips).
  - **Service Notes** section (prose, only when present).
- Keep Common Causes + Recommended Tests sections.

### Types
After the migration runs, the regenerated `types.ts` will include the new columns; update `ErrorCodeRow` accordingly.

---

## Files

**New:** migration adding columns + new unique constraint + reseed.
**Edited:** `app-sidebar.tsx`, `dashboard.tsx`, `error-codes.functions.ts`, `error-codes.tsx`. Light touch-ups on `diagnose.tsx` / `documents.tsx` / `history.tsx` headers only if they drift from the shared pattern.

**Out of scope:** Diagnose workflow logic, auth, AI gateway, Documents assistant internals, Account/Settings, AI-generated error codes.
