# Age Decoder Accuracy v2 (enhance, do not rebuild)

Everything already in place stays: the brand registry, the per-manufacturer rule files, candidate scoring, the RapidAPI primary lookup, web corroboration, the reconciliation layer, and attempt logging. This plan layers versioned rules, hard validation, weighted confidence, explainability, analytics, and a technician feedback loop on top of them.

## Phase 1 — Versioned rule engine

Rules become data-driven descriptors compiled into the existing `Rule` shape, so `decode.ts` keeps its current flow:

```
{
  manufacturer: "Whirlpool",
  formatId: "whirlpool.format-b",
  serialFormats: ["^[A-Z]{2}\\d{7}$"],
  yearPosition: { index: 1, kind: "letter-cycle" },
  weekPosition: { start: 2, length: 2 },
  lookupTables: { yearLetters: "ABCDEFGHJKLMNPRSTVWXY", cycleStart: 1973, cycleLength: 20 },
  effectiveFrom: "1993-01-01",
  effectiveTo: "2008-12-31",
  priority: 100,
  confidenceWeight: 0.95
}
```

Rule selection uses serial format match, effective date range, model family, then priority. Hand-written rules that do not fit the descriptor (LG legacy, GE letter-month, Bosch FD) stay as code and register into the same list.

Format coverage expands per manufacturer: Whirlpool family (pre-1993 cycle, modern plant+letter+week, Maytag 9/10-char, KitchenAid), GE family (legacy letter-month, modern two-letter, Haier/Hotpoint), Frigidaire/Electrolux eras, LG modern + legacy + plant-prefix, Samsung YYMM + legacy letter, Bosch/BSH FD numbers, plus Sub-Zero, Speed Queen, and Danby.

## Phase 2 — Model production windows

New table `model_production_windows` (manufacturer, brand, model_prefix, introduced_year, discontinued_year, replacement_series), seeded with the prefixes we support and extendable from the owner console. A decoded year outside a known window is rejected before scoring, which removes the common "2003 date on a 2021 model" failure.

## Phase 3 — Validation layer

A shared validator runs on every candidate before scoring: not in the future, valid month, valid week, format matched, within the rule's effective dates, within the model production window, and no contradictory month/week pair. Rejected candidates never reach the confidence engine; each rejection is recorded with its reason and surfaced in the decode explanation and logs.

## Phase 4 — Weighted confidence engine

High/Medium/Low is computed from an additive point model instead of ad-hoc bonuses:

```text
Matched format         30
Model window agrees    25
RapidAPI agrees        20
Historical rule match  15
No ambiguity           10
```

Corroboration trust tiers and reconciliation agreement adjust the total; disagreement subtracts. The result renders as a percent plus a label (e.g. "96% · High"). The current 80% display cap is lifted, since the score is now evidence-backed rather than heuristic.

## Phase 5 — Cross validation

After decoding, the result is compared against the RapidAPI answer, the existing reconciliation output, prior successful decodes for the same model family, and any confirmed technician entries. Agreement raises confidence; conflicts lower it and are shown explicitly rather than silently averaged.

## Phase 6 — Explainability

Each rule returns structured decode steps instead of a sentence. A "Show Decode Logic" button beside the appliance age opens a panel with the rule used, character-by-character derivation, candidate years, rejected candidates with reasons, validation checks, corroborating sources, and the confidence math.

## Phase 7 — Rule analytics

Per-rule counters (attempts, successes, rejections, corrections, average confidence) are aggregated from the existing attempt log plus the new rejection records, and shown as a Rule Performance table in the owner console's Age Decoder tab so weak formats are visible.

## Phase 8 — Technician feedback and community verification

The existing ground-truth capture is extended into a prompt shown right after every decode: "Is this manufacture date correct?" with yes/no, and a correct-date input on no. Stored records include manufacturer, model, serial, decoded result, corrected result, and rule id. Repeat confirmations of the same model/serial pattern add a "Community verified — N technicians confirmed this date" badge and a confidence bonus.

## Phase 9 — Appliance intelligence panel

After a successful decode the result panel shows manufacture date, current age, estimated service life, warranty status, common failures, service bulletins and known recalls (from the existing tech sheet and community evidence providers), and a Start Diagnosis action so the decoder becomes the entry point for a service call. Parts data is included only where an existing source supplies it; nothing is fabricated.

## Phase 10 — Regression test suite

A fixture-driven suite with known-good serial/model/date pairs for every manufacturer and format, asserting decoded year, month/week, and confidence band. Any rule change runs the whole suite, so improving one brand cannot silently break another. Rejection cases (future dates, out-of-window years, malformed serials) are asserted too.

## Technical notes

- New: `rule-format.ts` (descriptor + compiler), `validate.ts`, `explain.ts`, `confidence.ts`, `model-windows.server.ts`, plus a migration for `model_production_windows` and a rule-rejection/feedback column set on the existing decode-attempt logging.
- Edited: `types.ts`, `registry.ts`, `scoring.ts`, `decode.ts`, each `rules/*.ts`, `serial-decode.functions.ts`, `verify-appliance.tsx`, and the owner Age Decoder analytics tab.
- Unchanged: RapidAPI provider and cache, `age-verify/reconcile.server.ts`, corroboration/Firecrawl pipeline, brand alias and Kenmore prefix routing.
- Delivery order: phases 1–4 first (accuracy core), then 5–7, then 8–10.
