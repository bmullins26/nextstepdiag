## Goal

1. Stop returning "unknown" when we actually have candidates — show the top-scoring year as a best guess (with a clear "best guess" label and the confidence percent).
2. Add a "Submit known year" flow so users can tell us the actual manufacture year, building a ground-truth dataset we can later use to tune the decoder.

## Part A — Show best-guess year instead of "unknown"

**`src/lib/age-decoder/decode.ts`**
- Remove the `confidence === "Low"` → `unknown` branch. Always return `status: "ok"` when a rule matched and a candidate was chosen.
- Keep `unknown` only for the genuine no-signal cases: `unsupported_manufacturer`, `invalid_serial_format`, `missing_date_code`, `insufficient_information`, `ambiguous_year_cycle` (no chosen candidate).
- Drop `"low_confidence"` from the active reason set (leave it in the type for back-compat, just never emit it).

**`src/lib/age-decoder/scoring.ts`**
- Keep three confidence labels but add a `"Low"` pass-through (was previously demoted to Unknown). Threshold stays 65/40.

**`src/components/verify-appliance.tsx`**
- When `confidence === "Low"`, render the year with a "Best guess" badge and a one-liner: "Multiple candidates — confirm on the data plate." Show the candidate list inline.
- High/Medium render unchanged.

**Out of scope:** rewriting the scoring math, changing the 80% cap, or removing the data-plate suggestion.

## Part B — Capture known year (ground-truth dataset)

**New table `public.age_decode_ground_truth`** (migration):
```
id uuid pk, user_id uuid, manufacturer text, model_number text,
serial_number text not null, known_year int not null,
known_month int null, source text,   -- 'data_plate' | 'receipt' | 'owner_manual' | 'other'
notes text, decoder_year int null,    -- what we guessed at submit time
decoder_confidence text null, created_at timestamptz default now()
unique (user_id, serial_number, manufacturer)
```
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`; no anon.
- RLS: users can `SELECT/INSERT/UPDATE/DELETE` their own rows; admins (`has_role(auth.uid(),'admin')`) can `SELECT` all.

**New `src/lib/age-ground-truth.functions.ts`**
- `submitKnownYear` — `createServerFn({method:'POST'}).middleware([requireSupabaseAuth])`, Zod-validates `{brand, model?, serial, knownYear, knownMonth?, source?, notes?, decoderYear?, decoderConfidence?}`, upserts on `(user_id, serial_number, manufacturer)`.

**`src/components/verify-appliance.tsx`**
- Under the result card, add a collapsed "Know the actual year? Help us improve" section with:
  - year input (number, 1970..currentYear)
  - optional month select
  - source select (data plate / receipt / manual / other)
  - optional notes
  - Submit button → calls `submitKnownYear`, toasts on success, disables after submit.
- Shown for every successful or best-guess decode (not for `unsupported_manufacturer`/`invalid_serial_format`).

**Out of scope:** an admin UI for browsing ground truth, automatic weight re-tuning from this dataset (still future work), and bulk import.

## Verification

- Decode a known-low-confidence Whirlpool serial → result card shows the top-scored year with a "Best guess" badge instead of "Unknown".
- Submit a known year → row appears in `age_decode_ground_truth` for the user; second submit for same serial updates the row.
- Decoder unit tests updated so previously `unknown/low_confidence` fixtures now expect `ok` + `Low` confidence.