# Age Decoder accuracy fix — never present a guessed date

## Resolved decisions (owner-approved)

1. Whirlpool digit years / dual letters: option 1A. All valid candidates are returned as ambiguous, expected year first. No unsourced decade filter.
2. Two-letter prefix: when the 2nd character is a letter and the 3rd a digit, emit BOTH readings (a: letter year + week; b: source letter + digit year + week) and merge them under 9d. A reading with week outside 01–53 drops out. When the 3rd character is a letter (HRC1848014), it's read as source letter + letter year only.
3. ServiceBench: split `manufacturedDate` from a new `shippedDate` in servicebench.server.ts. Warranty labels and display are unchanged.
4. `source`/`updated_at` already exist on model_production_windows (0 rows). The migration adds only what's missing.
5. Same-serial reports never add score. A prior plate-confirmed row decides at step (a) (see item 9); otherwise it does nothing.
6. Kenmore 592 → Samsung (per item 8).
7. Neptune/Norge: Whirlpool family plus the older Maytag rule, with candidates merged.

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
  ADD COLUMN IF NOT EXISTS brand_key text,
  ADD COLUMN IF NOT EXISTS evidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_min_year integer,
  ADD COLUMN IF NOT EXISTS observed_max_year integer;
ALTER TABLE public.model_production_windows
  ADD CONSTRAINT model_production_windows_source_chk
    CHECK (source IS NULL OR source IN ('owner','tech_confirmed')),
  ADD CONSTRAINT model_production_windows_observed_chk
    CHECK (observed_min_year IS NULL OR observed_max_year IS NULL OR observed_min_year <= observed_max_year);
CREATE UNIQUE INDEX IF NOT EXISTS model_production_windows_brandkey_prefix_uidx
  ON public.model_production_windows (brand_key, upper(model_prefix));
CREATE INDEX IF NOT EXISTS age_decode_ground_truth_lookup_idx
  ON public.age_decode_ground_truth (lower(manufacturer), upper(serial_number));
GRANT ALL ON public.model_production_windows TO service_role;
REVOKE ALL ON public.model_production_windows FROM anon;
```

The table has 0 rows, so there's no backfill. `brand_key` stays nullable in this migration; app code always writes it, and NOT NULL can be added later. Existing policies stay: authenticated read, owner insert/update/delete. Technician confirmations are written server-side with the service role. I'll check for an existing `updated_at` trigger before adding one. The journal and snapshot are updated as for 0010/0011.

## How each item is implemented

1. **Whirlpool:** the parser tries every reading: (i) plant + year char + week; (ii) when the 2nd character is a letter and the 3rd a digit, also plant + source letter + digit year + week; (iii) when the 2nd and 3rd are both letters, plant + source + letter year + week. Every reading that passes the week check is kept. Year map from the published table: digits give 2010+d and 1980+d and 1970+d; X gives 2020/1990; A–H give 2021–28 / 1991–98; J gives 1999 only (2029 is future); K–Y give one year each. Week 01–53 is required. Week is converted to an approximate month for display, but the precision stays "week". Source URLs go in code comments.
2. **Older Maytag:** `^\d{6,}([A-Z])([A-Z])$`. Year from the 24-year table, both cycles, capped at 2013; month from the letter pairs.
3. **Alliance commercial:** last two characters are letters, read as year and month. A year letter outside the table returns unknown "format recognized, year not in the published table — read the date on the plate". Alias "alliance laundry" added.
4. **Samsung:** year map gains P2007, Q2008, S2009, Z2010, B2011, with the pattern updated to accept them. Where a letter is in both cycles, both years are kept as candidates.
5. Delete `lg.yym` and `frigidaire.yy-ww`. LG stays as year digit + two-digit month, with decade candidates.
6. **Bosch FD:** as specified. Plain `FD0103` (4 digits) is accepted.
7. **Frigidaire:** `^[A-Z0-9][A-Z]\d\d{2}\d+$`. Year digit gives decade candidates; week 01–53.
8. **Aliases and Kenmore:** as listed. An unknown Kenmore prefix returns unknown reason `kenmore_prefix_needed`, shown as "Need the Kenmore model number's first 3 digits to know who built it".
9. **Date selection (decode + reconcile):** gather every valid candidate from all matching rules, then filter in this order:
   a. A confirmed plate-printed date. This includes a prior `age_decode_ground_truth` row for the same canonical brand key + normalized serial whose source is the data plate (internal `plate_printed_prior`). Tapped picks without the plate tick, receipts, and ServiceBench or decoder values never count here. If prior rows disagree, their dates become the candidates (ambiguous). A typed plate date (parsed from `2019.03`, `03/2019`, `MFD 2019-03`, or an FD code) returns `ok` immediately, internal source `plate_printed`.
   b. ServiceBench `manufacturedDate` returns `ok`, source `factory_record`. `shippedDate` only removes candidates after it and is never labelled built.
   c. A receipt or invoice year removes later candidates.
   d. A production window narrows candidates, but only if every candidate pair is at least 5 years apart, and only from: a tech window with `evidence_count >= 1`; an owner row with an introduced/discontinued range; or the official Sub-Zero/Wolf timeline (`data/subzero-wolf-timeline.ts`, values unchanged). For the timeline, first/last production years bound the candidates and last = null means up to now. A code comment at the narrowing site points to `SUBZERO_WOLF_SOURCES` and the two official subzero-wolf.com model-number-timeline index pages.
   e. One candidate left gives `ok`. More than one gives `ambiguous` with every candidate and no chosen year or age.
   
   A user-entered year is used only as "on or before" (receipt) or as a confirmation; it never outranks ServiceBench. A candidate the tech taps sets the session date with internal `tech_picked`; it is not used for learning unless "I read this on the plate" is ticked. Removed: recency sort, the reconciler's score summing, the `historicalYears` and community bonuses, and the corroboration cache reads. The cache table is left in place, not dropped. ServiceBench dates are not written to ground truth.
10. **Window learning:** key = canonical registry brand key (e.g. "GE Appliances" → `ge`; Kenmore → the real maker from the prefix map; Magic Chef → `maytag_legacy`) + normalized model, the same on read and write. An unknown Kenmore prefix means no window is read or written. Model normalization (approved): uppercase, A–Z0–9 only, cut at `/` or space, then trailing revision digits removed (`MTW6205RW1` → `MTW6205RW`, `WT7150CW/03` → `WT7150CW`, `GSS25IYNZHFS` unchanged). No colour-letter stripping. Each confirmation upserts: `evidence_count+1`, widen observed min/max, `source='tech_confirmed'` (an owner row keeps `owner`). Owner console: a table with delete. Technicians never see where a window came from.
11. **Age display:** a shared helper `formatAge(candidateOrRange, now)`: floor; "X yr" when month or week is known; "X–Y yr" when only the year is known; nothing when ambiguous. Used by verify-appliance, the history detail page and the stored `age_years` (floor). The source label is renamed and the unsupported-format copy changes as specified.
12. **Input normalization:** `normalizeSerial` uppercases and strips spaces, dashes and dots. Each rule declares the positions that must be digits; O→0 and I→1 are applied only there, and the corrected serial is returned as `normalizedSerial`, shown to the tech as "Read as: …". Ground-truth lookups use `ilike` on manufacturer and serial.
13. **AI identification:** `generateObject` is wrapped in try/catch. On failure, appliance type is null, the age result is still returned, and the tech picks the type with the existing manual override.
14. **Tests:** as listed below.

## Protected items (unchanged)

Migrations 0010/0011; two-stage retrieval; neutral technician labels; the thin-evidence caution; repair-history counts only; warranty labels without "Verified"; next-test rule; CPSC 9-second fallback; WP parts dedupe; Start Diagnosis guard; Fred's Academy; pricing; question flow.

## Expected test results

New and updated cases:
- Whirlpool ambiguous, expected year first: C04101002 {2010, 1980, 1970} wk41; R64597418 {2016, 1986, 1976} wk45, never 2026; M92510000 {2019, 1989, 1979} wk25, never 2029; CF0104204 {2026, 1996} wk1; MX06404786 {2020, 1990} wk6; HRC1848014 {2023, 1993} wk18.
- Two-letter readings: CR2512345 → 2004 wk25 + {2012, 1982} wk51. CU2012345 → 2007 wk20 + {2012, 1982} wk01. FP5013998 → 2003 wk50 + {2015, 1985} wk01. MU5110613 → 2007 wk51 + {2015, 1985} wk11. All are ambiguous.
- Invalid-week reading drops out: e.g. a serial whose reading (b) gives week 00 or 54+ keeps only reading (a).
- Prior plate row for the same brand key + serial → that date with no ambiguity. Two disagreeing prior plate rows → ambiguous. A tapped pick without the plate tick, or a receipt row → not used at step (a).
- Window key: "GE Appliances" and "GE" share the window; Kenmore 795 reads the LG window; Kenmore 999 reads and writes nothing.
- Sub-Zero/Wolf timeline narrows a ≥5-year-apart candidate set; open-ended last year is bounded by now.


All new fixture cases pass under conflict option 1A (digit-year Whirlpool cases ambiguous, expected year first). That includes:
- `909KWAT04496` gives candidates including Sep 2009, with no single pick.
- The ordering cases: plate 2019.03 gives Mar 2019; window 2014–2018 with `603…` gives Mar 2016; receipt 2018 with {2026, 2016} gives 2016.
- An LG serial entered as Samsung gives unknown.
- The AI-failure mock still returns an age.
- The history page shows a floored age.
- `rg -i "verified|confidence"` over technician components/routes finds only internal identifiers.

Existing tests that asserted single dates for cases that are now ambiguous (for example `engine.test.ts:109`) get updated. The full suite should be about 93 + ~45 new tests, all passing, with typecheck clean. Live check: a browser run of the decoder with one ambiguous serial, candidate tap, and the plate date input, signed in. Not tested live: ServiceBench shipped-only records (none available to test against).
