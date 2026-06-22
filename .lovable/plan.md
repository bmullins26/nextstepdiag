## Goal

Let testers manually correct the appliance type (e.g. Washer vs. Dryer) when the decoder misclassifies a model (Kenmore date-code edge cases, etc.). Remember the correction so future scans of the same brand+model auto-apply the right type instead of repeating the mistake.

## UX

On the Verify Appliance card (and in the session header on `/diagnose`), next to the "Appliance Type" field, add a small **Edit** (pencil) button. Clicking opens a popover with:

- **Type** select: Washer, Dryer, Refrigerator, Dishwasher, Range/Oven, Microwave, Freezer, Ice Maker, Other (free text)
- **Sub-type** (optional free text, e.g. "Top-Load", "Side-by-Side")
- Save / Cancel

On Save:
1. Update the current diagnostic session's `appliance_type` immediately so the running diagnosis uses the corrected type (error codes, repair insights, document assistant all re-key off it).
2. Upsert a row in a new `appliance_type_overrides` table keyed by `(brand, model)` (case-insensitive, trimmed). Stores the corrected type, sub-type, `corrected_by`, count, and last-seen timestamp.
3. Toast: "Saved. Future scans of {brand} {model} will use {type}."

A subtle badge on the Verify card shows **"Type corrected by user"** when the displayed type came from an override (vs. API/local decoder), so testers can see the system learned.

## Learning loop

Inside `decodeAppliance` (server fn), after the API + local decoder produce a result, look up `appliance_type_overrides` by `(brand, model)`:

- If a match exists, replace `applianceType` (and optionally `platform`) with the override, set `typeSource: "user_override"`, and bump the override's `hit_count` + `last_used_at`.
- Otherwise leave the decoded type as-is.

This keeps the existing API → local-decoder fallback chain intact; the override is a thin top layer that grows as users correct mistakes. Multiple corrections for the same brand+model just upsert (last write wins) and increment `correction_count`, giving owners a signal in the admin panel about ambiguous models.

## Admin visibility

Add a small **Type Overrides** tab in the existing owner admin UI (alongside Feedback) listing recent overrides: brand, model, corrected type, who corrected it, hit count, last used. Owner can delete a bad override (button → DELETE row). No new permission model — uses existing `has_role('admin')` gate.

## Data model

New table `public.appliance_type_overrides`:

| column            | type        | notes                                       |
| ----------------- | ----------- | ------------------------------------------- |
| id                | uuid PK     |                                             |
| brand_key         | text        | lower(trim(brand)), part of unique key      |
| model_key         | text        | lower(trim(model)), part of unique key      |
| brand_display     | text        | original casing for UI                      |
| model_display     | text        |                                             |
| appliance_type    | text NOT NULL |                                           |
| sub_type          | text        |                                             |
| corrected_by      | uuid → auth.users |                                       |
| correction_count  | int default 1 |                                           |
| hit_count         | int default 0 | bumped when decoder applies the override   |
| last_used_at      | timestamptz |                                             |
| created_at / updated_at | timestamptz |                                       |

Unique index on `(brand_key, model_key)`.

RLS:
- `authenticated` can SELECT and INSERT/UPDATE their own corrections (any signed-in tester can teach the system).
- `service_role` full access.
- Only admins (`has_role(auth.uid(),'admin')`) can DELETE.

GRANTs follow the standard pattern in the same migration.

## Files

- **Migration**: create `appliance_type_overrides` + grants + RLS + policies.
- **New** `src/lib/appliance-type-overrides.functions.ts`: `getOverride({brand, model})`, `upsertOverride(...)`, `listOverrides()` (admin), `deleteOverride(id)` (admin), `bumpOverrideHit(id)`.
- **Edit** `src/lib/serial-decode.functions.ts` (`decodeAppliance`): after API/local decode, apply override if present; include `typeSource` in the returned object.
- **Edit** `src/components/verify-appliance.tsx`: add Edit pencil + popover; show "Type corrected by user" badge when `typeSource === 'user_override'`.
- **Edit** `src/routes/_authenticated/diagnose.tsx`: add a small inline type editor in the session header so the user can also correct after a session is already running; update the session's `appliance_type` via the existing session-update path.
- **Edit** `src/components/owner-panels.tsx` (or the file holding the admin tabs): add a **Type Overrides** tab.
- **Edit** `src/integrations/supabase/types.ts`: regenerated after the migration is approved.

## Non-goals / preserved

- No changes to the age decoder, API fallback chain, error code system, document assistant, or owner permissions.
- No changes to the existing Feedback widget.
- The override only affects appliance **type/sub-type**, not the decoded age/year.
