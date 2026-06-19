# Age Decoder Rebuild (homespy.io parity)

## Why the current decoder fails

Quick check against your two test cases:

**LG WM0642HW/02 · serial `909KWAT04496`** → Correct answer is **Sept 2009**.
LG's convention is `YYM…` at positions 1–3 (year=09, month=9). Our current `src/lib/age-decoder/rules/lg.ts` doesn't apply this pattern correctly, so it misses.

**Kenmore 11092573210 · serial `CF2328200`** → `110…` model prefix = Whirlpool-built. Whirlpool serial format is `LL WW SSSSS` (plant-letter, year-letter, 2-digit week, sequence). Year letter `F` is **ambiguous** (recycles every ~20 yrs: 1997 / 2017 / …). Our current rule returns one guess instead of all candidates and has no way to disambiguate with the model number — exactly the failure homespy designed around.

The root cause is architectural: our rules return one date, our brand coverage is thin, and there's no model-number corroboration step.

## What homespy actually does (from their methodology page)

1. Decode serial via brand-specific convention → emit **all possible years** (date codes recycle every ~12–30 years).
2. Search the web for the model number (manufacturer pages, owner's manuals, retailer listings, reviews) and use those hits to pick the most likely candidate.
3. Cap confidence at 80% because the process is inherently inferential.

Their cited source for date-code conventions is the electrical-forensics.com major appliances reference, which is far more comprehensive than our hand-written rules.

## Rebuild plan

### 1. Replace rule library

Rewrite `src/lib/age-decoder/rules/*` against the electrical-forensics conventions:

- **LG**: `YYM` at positions 1–3 (digits). Single-candidate, unambiguous.
- **Samsung**: position 7 = year letter, position 8 = month code (1–9, A–C). Two 10-year cycles → 2 candidates.
- **Whirlpool family (incl. Kenmore 110/106/665 model prefixes)**: `L L WW SSSSS` — 2nd letter = year. Returns **all matching years** (~3 candidates spanning ~60 yrs). Adds Kenmore prefix detection so `11092573210` routes to Whirlpool rules instead of failing brand resolution.
- **GE**: 2-letter year+month prefix (e.g. `AL` = Jan 2022). 12-year cycle → multiple candidates.
- **Frigidaire/Electrolux**: `YYWW…` 4-digit prefix.
- **Bosch (BSH)**: FD code from model plate; serial position 3–4 = year+month in newer scheme.
- **Fisher & Paykel**: existing rule preserved, audited against ref.
- **Miele**: serial-to-year table from ref.
- **New brands** to match homespy coverage: Maytag-direct, Speed Queen / Alliance Laundry, Sub-Zero, Wolf, Viking, Dacor, U-Line, Marvel, Asko, Blomberg, Summit, Avanti, Danby, Haier-direct, Insignia, Hisense, Midea, A.O. Smith, Bradford White, Rheem, Rinnai, Navien, State, Lochinvar (HVAC/water-heater brands from building-center.org tables).

Each rule's `extract()` now returns **every plausible year** (not just one) along with a per-candidate score = years-from-now decay (recent more likely) × month/week-present bonus.

### 2. Add model-number corroboration via Firecrawl

New file `src/lib/age-decoder/corroborate.server.ts`:

- Input: candidate years + brand + model number.
- Calls `firecrawl.search(`"<model>" <brand> manual OR review OR discontinued`, { limit: 8 })`.
- Scrapes the top 3 hits for `markdown` + `metadata.publishedDate`.
- Extracts year mentions near the model number (regex windows + manufacturer-domain bonus).
- Weights by source tier (reuses `source-trust.ts` from the grounding engine — OEM > trusted > community).
- Returns adjusted scores per candidate + an `evidence[]` array.

Cached 90 days in a new `age_decode_corroborations` table keyed by `(brand, model)` to avoid re-spending Firecrawl credits.

### 3. Confidence scoring (capped at 80%)

`scoring.ts` rewritten:

```text
base = serial-only score of chosen candidate
if corroborated by OEM hit:   +0.30
if corroborated by trusted:   +0.20
if corroborated by community: +0.10
if only one serial candidate: +0.20
final = min(0.80, base + bonuses)
```

UI labels:
- ≥ 0.65 → **High (capped 80%)**
- 0.40–0.64 → **Medium**
- < 0.40 → **Low** → returns `status: "unknown"` with reason `low_confidence` (matches v1.1 grounding contract — no guessing).

### 4. Output contract change

`DecodeOutcome` adds:
- `candidates: { year, month?, week?, score, sources: SourceHit[] }[]` (always populated, sorted)
- `corroboration: { used: boolean; query?: string; hits: SourceHit[] }`
- `confidencePercent: number` (0–80)

The diagnose UI shows the chosen year prominently and a collapsible "Other possible years" list when >1 candidate exists — same UX as homespy.

### 5. Server-fn wiring

`src/lib/serial-decode.functions.ts` rewritten as a single `decodeApplianceAge` server fn that:
1. Runs pure serial decode (fast, offline).
2. If >1 candidate AND model number provided → calls corroborate.server with Firecrawl.
3. Persists result in existing `serial_decodes` table for analytics.

### 6. Tests

`src/lib/age-decoder/tests/decoder.test.ts` expanded with:
- **`WM0642HW/02` / `909KWAT04496` → Sept 2009, High confidence** (LG unambiguous).
- **`11092573210` / `CF2328200` → multi-candidate; with corroboration mocked to OEM "2007 model" → 2007, Medium confidence**.
- One regression case per brand from manufacturer-documented examples.

### 7. Cleanup

- Owner panel "Age decoder" tab gains a Firecrawl-call counter and cache-hit rate (mirrors the tech-sheets tab from v1.1).
- Old `scoring.ts` heuristics and confidence enum (`High/Medium/Low/Unknown`) preserved for backwards compat; `confidencePercent` is additive.

## Out of scope

- Tech-sheet / diagnostic grounding (v1.1) — untouched.
- UI redesign beyond the candidate list + confidence chip.
- HVAC/water-heater logic for non-appliance categories beyond brand registration (rule bodies for those can ship in a follow-up).

## Files touched

- Rewrite: `src/lib/age-decoder/{decode,scoring,registry,types}.ts`, all files in `src/lib/age-decoder/rules/`, `src/lib/serial-decode.functions.ts`
- New: `src/lib/age-decoder/corroborate.server.ts`, `src/lib/age-decoder/kenmore-prefixes.ts`
- New: `src/lib/age-decoder/rules/{speedqueen,subzero,viking,asko,haier,…}.ts`
- Migration: `age_decode_corroborations` cache table (brand, model, hits jsonb, expires_at) + RLS + grants
- Edit: `src/routes/_authenticated/diagnose.tsx` (verify-appliance card → show candidate list + 80%-capped chip)
- Edit: `src/components/owner-panels.tsx` (analytics tab)
- Tests: `src/lib/age-decoder/tests/decoder.test.ts`
