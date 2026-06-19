# Remove camera + rebuild accuracy pipeline (homespy-style)

Two scopes in one plan: a small UI cleanup, then the larger accuracy rebuild.

---

## Part A — Remove the camera / tag-photo option

**`src/components/verify-appliance.tsx`**
- Drop the `Camera` icon import and the `extractTagFromImage` import.
- Remove `ocrBusy` state, the `ocr` server-fn binding, `ocrEnabled`, and the file handler that calls `ocr(...)`.
- Remove the camera badge next to brand entries in the brand picker.
- Remove the "Tag photo available / Photo unsupported" sublabel and the camera `<button>` beside the serial input — the serial field becomes full-width.
- Remove the now-unused `compressImage` helper.

**`src/lib/serial-decode.functions.ts`**
- Remove the `extractTagFromImage` server function (no remaining callers).
- Leave `decodeAppliance` untouched here; rebuilt in Part B.

**Out of scope:** removing the `ocrSupported` field from the brand registry (harmless to keep).

---

## Part B — Build the homespy-style accuracy pipeline

Goal: close most of the gap to homespy without their API by replicating their algorithmic shell — typed multi-source corroboration, weighted aggregation, feedback-driven retraining — on top of our existing serial decoder.

Honest expectation: meaningfully more accurate than today, but won't match homespy's numbers exactly because they have years of feedback tuning we don't. The feedback loop (B3) closes that gap over time.

### B1. Expand serial-rule coverage

Add rules from electrical-forensics for high-volume brands homespy supports and we don't:

Amana, Maytag (Whirlpool variants), KitchenAid, Jenn-Air, Magic Chef, Admiral, Speed Queen / Alliance Laundry, Asko, Haier, Hisense, Sub-Zero, Viking, Thermador.

Each rule returns **all plausible year candidates** with a per-candidate prior (recency-decayed; month/week bonus when encoded). HVAC + water-heater rules deferred.

### B2. Multi-source corroboration (biggest accuracy lever)

Replace today's single Firecrawl query with **4 parallel typed searches**, each with its own template and trust weight. Each source produces year mentions; we aggregate per-year scores, combine with the serial-rule prior, take the argmax.

```text
ManufacturerData  weight 1.00  site:{oem-domain} "{model}" (manual OR specifications OR "date of manufacture")
RetailerData      weight 0.70  "{model}" (site:homedepot.com OR site:lowes.com OR site:bestbuy.com OR site:ajmadison.com)
                               signals: "discontinued" / "no longer available" → year ≤ now-2
                                        "in stock" / current listing          → year ≥ now-5
ReviewData        weight 0.50  "{model}" review (site:consumerreports.org OR site:amazon.com OR site:reddit.com)
                               extract: "bought in YYYY" / "purchased YYYY" / review dates
GeneralData       weight 0.20  today's generic web sweep (lowest priority)
```

Per-source results cached 90 days. Uncached decode = ~4 Firecrawl searches; cached = 0. Skipped entirely when the serial yields a single high-confidence year.

### B3. Feedback-driven weight tuning

The `feedback` table already records correct/incorrect. Add a nightly recompute that stores rolling weights in a new `age_decoder_weights` table keyed by `(brand, source_type)`. Scoring reads these dynamic weights instead of the hardcoded ones in B2. Starts neutral; gets smarter every week.

### B4. Confidence scoring upgrades

- Keep the 80% cap.
- Penalize single-source agreement (one OEM hit alone ≠ high).
- Reward cross-source agreement (OEM + retailer + review aligned → high).
- Penalize wide candidate spread that survives corroboration.

### B5. UI — show the evidence

On the result, show:
- Each candidate year with the sources that voted for it.
- "Searched N sources across manufacturer, retailer, reviews."
- "Still sold / Discontinued" badge when the retailer signal is clear.

Makes it obvious *why* we picked a year, gives users a clear "this is wrong" target, and fuels B3.

---

## Files

**Part A**
- Edit: `src/components/verify-appliance.tsx`
- Edit: `src/lib/serial-decode.functions.ts`

**Part B**
- New: `src/lib/age-decoder/sources/{manufacturer,retailer,review,general}.server.ts`
- New: `src/lib/age-decoder/feedback-weights.server.ts` + migration for `age_decoder_weights`
- Rewrite: `src/lib/age-decoder/corroborate.server.ts` to orchestrate the 4 sources in parallel
- Update: `src/lib/age-decoder/scoring.ts` — cross-source agreement bonus
- New rule files in `src/lib/age-decoder/rules/` for the B1 brands
- Migration: add `source_type` column to `age_decode_corroborations`
- Update: `src/components/verify-appliance.tsx` — per-source evidence UI

## Out of scope
- Image / OCR (being removed in Part A)
- HVAC + water-heater rules
- Homespy API proxy (no token)

## Two choices before I build
1. **Brand expansion scope:** all 13 brands listed in B1, or top 5 only (Amana, Maytag, KitchenAid, Speed Queen, Sub-Zero)?
2. **Firecrawl cost:** up to 4 searches per uncached decode (cached = 0), or cap at 2?
