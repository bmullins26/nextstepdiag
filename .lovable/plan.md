# Age Decoder Accuracy Upgrade (refactor, not rebuild)

The existing decoder already has a brand registry, per-manufacturer rule files, candidate scoring, web corroboration, and attempt logging. This plan keeps all of that and strengthens the parts that actually drive wrong answers: rule coverage per era, date validation, ambiguity resolution, and explainability.

## 1. Declarative manufacturer rule format

Today each rule is hand-written TypeScript with a regex plus an `extract` function. Rules stay in the same files, but gain a declarative descriptor so new manufacturers/formats can be added as data:

```
{
  manufacturer: "Whirlpool",
  formatId: "whirlpool.format-b",
  serialFormats: ["^[A-Z]{2}\\d{7}$"],
  yearPosition: { index: 1, kind: "letter-cycle" },
  weekPosition: { start: 2, length: 2 },
  monthPosition: null,
  lookupTables: { yearLetters: "ABCDEFGHJKLMNPRSTVWXY", cycleStart: 1973, cycleLength: 20 },
  effectiveDateRanges: [{ from: 1993, to: null }],
  weight: 0.9
}
```

A generic compiler turns each descriptor into the existing `Rule` shape, so `decode.ts` and `scoring.ts` are untouched structurally. Hand-written rules that don't fit the descriptor (LG legacy, GE letter-month) can still be registered directly — both kinds live in the same registry.

## 2. Expanded per-manufacturer format coverage

Add missing historical formats, each with its own effective date range so the decoder picks the rule that was actually in use:

- Whirlpool family: pre-1993 letter cycle, modern plant+year-letter+week, 2-letter prefix (e.g. `CY`), Maytag 9/10-char, KitchenAid variants.
- GE family: legacy letter-month + year-digit, modern 2-letter (month/year) prefix, Haier-built and Hotpoint variants.
- Frigidaire/Electrolux: `XX` + year-digit + week, 2000s `4A`-style, current 8+ digit format.
- LG: keep modern YY+M and legacy Y+MM, add the newer 3-digit-plant variant.
- Samsung: current YYMM prefix plus older letter-coded year.
- Bosch/BSH: FD-number decoding (4-digit FD → month/year) alongside serial prefix.
- Also add Sub-Zero, Speed Queen, and Danby as new brands, since the format is now data-driven.

Kenmore keeps model-prefix routing to the real builder.

## 3. Validation gate before returning a result

A shared validator runs on every candidate:

- Reject dates in the future (beyond current month).
- Reject week > 53, month outside 1–12, and week/month pairs that contradict each other.
- Reject years before the manufacturer's earliest known format date.
- Constrain to the model's plausible production window when the model number implies one (existing model-family and corroboration data supply this).

Candidates failing validation are dropped with a recorded reason instead of silently scoring low.

## 4. Ambiguity resolution + confidence

When a letter/digit cycle yields multiple years (the main accuracy problem), resolution order is:

1. Model-number production window, when known.
2. Web corroboration evidence (already implemented) and retailer discontinued/in-stock signal.
3. Production-era plausibility for the matched format.
4. Recency decay as the final tie-breaker.

Confidence mapping stays High / Medium / Low with the current 80% cap, but a single surviving validated candidate with a matched format now reaches High, and unresolved multi-cycle results are capped at Low.

## 5. "Why?" explainability

Each rule returns structured decode steps rather than only a sentence, e.g.:

```
Format:      Whirlpool Format B
Character 2: year code "X" -> 2019
Chars 3-4:   week 42
Result:      October 2019
Confidence:  High (single validated candidate, corroborated by 2 sources)
```

A "Why?" button next to the decoded age in the appliance verification panel opens a popover showing these steps, the rule id, rejected candidates with reasons, and any corroborating sources.

## 6. Failure logging

Extend the existing `age_decode_attempts` logging to record every rule attempted and why it failed (pattern mismatch, no date code, validation rejection, unresolved ambiguity) — not just the final reason. The owner console's Age Decoder tab gains a "rules attempted" column so weak formats surface quickly.

## Technical notes

- New: `src/lib/age-decoder/rule-format.ts` (descriptor type + compiler), `src/lib/age-decoder/validate.ts` (date validation), `src/lib/age-decoder/explain.ts` (structured steps type).
- Edited: `types.ts` (steps + rejected candidates on the outcome), `registry.ts` (register descriptors), each `rules/*.ts` (converted to descriptors + new formats), `scoring.ts` (validation-aware confidence), `serial-decode.functions.ts` (richer logging), `verify-appliance.tsx` ("Why?" popover).
- Existing fixtures in `age-decoder/tests` are extended with known-good serial/year pairs per new format so accuracy changes are measurable, and the RapidAPI primary lookup and reconciliation layer stay exactly as they are.
