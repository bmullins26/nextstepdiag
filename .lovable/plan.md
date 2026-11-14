# Age Decoder accuracy fix — never present a guessed date

## Conflicts to resolve before build (please answer)

1. **Whirlpool digit years vs. rule 9d.** A digit year decodes to 2010–2019, 1980s or 1970s, so `C04101002`, `R64597418`, `M92510000` all have 2–3 candidates 10+ years apart. Rule 9d says they must come back "ambiguous", but the fixtures expect one answer (2010 / 2016 / 2019). Likewise `CF0104204` (F = 2026 or 1996) is expected to be Jan 2026. Options:
   - A. Fixtures become ambiguous, with the expected year listed first (follows 9d strictly). **This is my default.**
   - B. Add a sourced rule that drops 1970s/80s/90s readings for this format. I have no source for one, so I won't do B unless you give me one.
2. **Two-letter prefix makes letter-year serials ambiguous.** If any second letter can be a source letter, `CR2512345` also reads as source R, year 2, week 51 (2012), and `CU2012345`, `FP5013998` and `MU5110613` get second readings too. Proposal: treat the second letter as a source letter only when the third character is also a letter that's valid as a year (as in `HRC1848014`). Then a source letter followed by a digit year isn't decoded; it gets "read the plate".
3. **ServiceBench "built" date already falls back to the shipped date.** `servicebench.server.ts:59` sets `manufacturedDate = manufacturedDate ?? actualGoodsIssueDate`. Item 9b needs them split into `manufacturedDate` and `shippedDate`. This touches the warranty file, but only that field. The warranty display and labels stay as they are, and warranty start still uses the same date it uses now.
4. **The `source` and `updated_at` columns already exist** on `model_production_windows` (table has 0 rows, `source` is all null). The migration only adds what's missing, plus a CHECK on `source`.
5. **Same-serial "ground truth" bonus.** `loadCrossChecks` gives +0.8 to the year most reported for that same serial (the "Community verified" path). Per 9, I'll drop it from scoring. Those reports only feed production windows (item 10), and only when source = data plate.
6. **Kenmore 592 is currently mapped to LG.** Item 8 changes it to Samsung. Noting this; I'll follow item 8.
7. **Neptune / Norge** go to the Whirlpool family (item 8) and also get the older Maytag rule (item 2). Both rules run, and their candidates are merged under 9d.

## Files to change

- `src/lib/age-decoder/rules/whirlpool.ts`: new year table, two-letter prefix, delete `modern-9char`, add the older Maytag rule (tagged so it only runs for Maytag / Amana / Jenn-Air / Admiral / Magic Chef / Crosley / Norge / Neptune).
- `rules/hvac-water-laundry.ts`: Alliance commercial letter rule. The residential YYMM rule stays.
- `rules/samsung.ts`: add P/Q/S/Z/B to the year table and pattern; delete `samsung.pos7-year-pos8-month`.
- `rules/lg.ts`: delete `lg.yym`. `rules/frigidaire.ts`: delete `yy-ww`; plant character may be a letter or digit.
- `rules/bosch.ts`: FD 00–59 → 20YY, 60–99 → 19YY; month.
- `registry.ts`: alias changes (item 8); new `maytag_legacy` key for Magic Chef; Haier removed (unsupported); Kenmore table 592→Samsung, 596/647 removed, no Whirlpool default for unknown Kenmore prefixes.
- `decode.ts`, `scoring.ts`, `confidence.ts`, `types.ts`, `validate.ts`: new date-selection order; ambiguous status; input normalization; no recency pick.
- `model-windows.server.ts`: remove `historicalYears`; window key normalizer; confirmation-based narrowing.
- `src/lib/age-verify/reconcile.server.ts`: no score summing; apply the strict order; relabel.
- `src/lib/serial-decode.functions.ts`: plate-date input, stop reading the corroboration cache, try/catch around AI identification, record confirmations.
- `src/lib/age-ground-truth.functions.ts`: on source = data plate, upsert the window (service role, server side).
- `src/lib/warranty/servicebench.server.ts`: split the shipped date only (see conflict 3).
- `src/components/verify-appliance.tsx`: "Date printed on plate" input, candidate buttons, "I read this on the plate" checkbox, age display, copy changes, remove the corroboration evidence block.
- `src/lib/age-decoder/age-math.ts`: floor-based age formatter.
- `src/routes/_authenticated/history_.$id.tsx`: floored age.
- `src/components/owner-panels.tsx` (or a new owner panel component): list and delete production windows.
- New server function file `src/lib/model-windows.functions.ts` (owner list/delete, owner-checked through `has_role`).
- Tests: replace `tests/fixtures.ts`; update `engine.test.ts`, `multibrand.test.ts`, `decoder.test.ts`, `age-math.test.ts`; new `tests/ordering.test.ts`, `tests/window-key.test.ts`, `serial-decode.failsoft.test.ts`.

## Migration — `drizzle/migrations/0012_model_window_confirmations.sql`

```sql
ALTER TABLE public.model_production_windows
  ADD COLUMN IF NOT EXISTS evidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_min_year integer,
  ADD COLUMN IF NOT EXISTS observed_max_year integer;
ALTER TABLE public.model_production_windows
  ADD CONSTRAINT model_production_windows_source_chk
    CHECK (source IS NULL OR source IN ('owner','tech_confirmed')),
  ADD CONSTRAINT model_production_windows_observed_chk
    CHECK (observed_min_year IS NULL OR observed_max_year IS NULL OR observed_min_year <= observed_max_year);
CREATE UNIQUE INDEX IF NOT EXISTS model_production_windows_mfr_prefix_uidx
  ON public.model_production_windows (lower(manufacturer), upper(model_prefix));
CREATE INDEX IF NOT EXISTS age_decode_ground_truth_lookup_idx
  ON public.age_decode_ground_truth (lower(manufacturer), upper(serial_number));
GRANT ALL ON public.model_production_windows TO service_role;
REVOKE ALL ON public.model_production_windows FROM anon;
```

The existing policies stay: authenticated users can read, owners can insert/update/delete. Technician confirmations are written only from server functions using the admin client. The table already has RLS on. Existing rows: none (verified), so the CHECK is safe. `updated_at` already exists; I'll confirm whether it already has an update trigger before adding one. The journal and snapshot are updated the same way as for 0010/0011.

## How each item is implemented

1. **Whirlpool:** pattern `^[A-Z]([A-Z](?=[A-HJ-NPR-Y]))?([0-9X A-HJ KLMPRSTUWY])(\d{2})\d+$`. Year map from the published table: digits give 2010+d and 1980+d and 1970+d; X gives 2020/1990; A–H give 2021–28 / 1991–98; J gives 1999 only (2029 is future); K–Y give one year each. Week 01–53 is required. Week is converted to an approximate month for display, but the precision stays "week". Source URLs go in code comments.
2. **Older Maytag:** `^\d{6,}([A-Z])([A-Z])$`. Year from the 24-year table, both cycles, capped at 2013; month from the letter pairs.
3. **Alliance commercial:** last two characters are letters, read as year and month. A year letter outside the table returns unknown "format recognized, year not in the published table — read the date on the plate". Alias "alliance laundry" added.
4. **Samsung:** year map gains P2007, Q2008, S2009, Z2010, B2011, with the pattern updated to accept them. Where a letter is in both cycles, both years are kept as candidates.
5. Delete `lg.yym` and `frigidaire.yy-ww`. LG stays as year digit + two-digit month, with decade candidates.
6. **Bosch FD:** as specified. Plain `FD0103` (4 digits) is accepted.
7. **Frigidaire:** `^[A-Z0-9][A-Z]\d\d{2}\d+$`. Year digit gives decade candidates; week 01–53.
8. **Aliases and Kenmore:** as listed. An unknown Kenmore prefix returns unknown reason `kenmore_prefix_needed`, shown as "Need the Kenmore model number's first 3 digits to know who built it".
9. **Date selection (decode + reconcile):** gather every valid candidate from all matching rules, then filter in this order:
   a. A confirmed plate-printed date (parsed from `2019.03`, `03/2019`, `MFD 2019-03`, or an FD code) returns `ok` immediately, internal source `plate_printed`.
   b. ServiceBench `manufacturedDate` returns `ok`, source `factory_record`. `shippedDate` only removes candidates after it and is never labelled built.
   c. A receipt or invoice year removes later candidates.
   d. A production window narrows candidates, but only if `evidence_count >= 1` and every candidate pair is at least 5 years apart. An owner row with a manual introduced/discontinued range counts too, and so does the static OEM timeline (Sub-Zero/Wolf).
   e. One candidate left gives `ok`. More than one gives `ambiguous` with every candidate and no chosen year or age.
   
   A user-entered year is used only as "on or before" (receipt) or as a confirmation; it never outranks ServiceBench. A candidate the tech taps sets the session date with internal `tech_picked`; it is not used for learning unless "I read this on the plate" is ticked. Removed: recency sort, the reconciler's score summing, the `historicalYears` and community bonuses, and the corroboration cache reads. The cache table is left in place, not dropped. ServiceBench dates are not written to ground truth.
10. **Window learning:** the key is the normalized model: uppercase, A–Z0–9 only, cut at `/` or space, then trailing revision digits removed (`MTW6205RW1` → `MTW6205RW`, `WT7150CW/03` → `WT7150CW`, `GSS25IYNZHFS` unchanged). I'm proposing not to strip colour letters, because it's brand-specific and would merge different models. Confirm or give the rule you want. Each confirmation upserts: `evidence_count+1`, widen observed min/max, `source='tech_confirmed'` (an owner row keeps `owner`). Owner console: a table with delete. Technicians never see where a window came from.
11. **Age display:** a shared helper `formatAge(candidateOrRange, now)`: floor; "X yr" when month or week is known; "X–Y yr" when only the year is known; nothing when ambiguous. Used by verify-appliance, the history detail page and the stored `age_years` (floor). The source label is renamed and the unsupported-format copy changes as specified.
12. **Input normalization:** `normalizeSerial` uppercases and strips spaces, dashes and dots. Each rule declares the positions that must be digits; O→0 and I→1 are applied only there, and the corrected serial is returned as `normalizedSerial`, shown to the tech as "Read as: …". Ground-truth lookups use `ilike` on manufacturer and serial.
13. **AI identification:** `generateObject` is wrapped in try/catch. On failure, appliance type is null, the age result is still returned, and the tech picks the type with the existing manual override.
14. **Tests:** as listed below.

## Protected items (unchanged)

Migrations 0010/0011; two-stage retrieval; neutral technician labels; the thin-evidence caution; repair-history counts only; warranty labels without "Verified"; next-test rule; CPSC 9-second fallback; WP parts dedupe; Start Diagnosis guard; Fred's Academy; pricing; question flow.

## Expected test results

All new fixture cases pass under conflict option 1A (digit-year Whirlpool cases ambiguous, expected year first). That includes:
- `909KWAT04496` gives candidates including Sep 2009, with no single pick.
- The ordering cases: plate 2019.03 gives Mar 2019; window 2014–2018 with `603…` gives Mar 2016; receipt 2018 with {2026, 2016} gives 2016.
- An LG serial entered as Samsung gives unknown.
- The AI-failure mock still returns an age.
- The history page shows a floored age.
- `rg -i "verified|confidence"` over technician components/routes finds only internal identifiers.

Existing tests that asserted single dates for cases that are now ambiguous (for example `engine.test.ts:109`) get updated. The full suite should be about 93 + ~45 new tests, all passing, with typecheck clean. Live check: a browser run of the decoder with one ambiguous serial, candidate tap, and the plate date input, signed in. Not tested live: ServiceBench shipped-only records (none available to test against).
