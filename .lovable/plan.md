## Professional Appliance Age Decoder — Final Plan

Deterministic rule-engine that replaces AI-driven age inference. AI is restricted to explanatory text only. Legacy decoder retained for comparison until validated.

### 1. Rule engine layout

```text
src/lib/age-decoder/
  types.ts            // DateCandidate, Rule, DecodeOutcome, Confidence, UnknownReason
  registry.ts         // brand → Rule[]; brand-family aliases; register() for new mfrs
  scoring.ts          // pickBestCandidate(candidates, modelHints, now)
  decode.ts           // decodeAge({ brand, model, serial }) — pure, no AI, no I/O
  rules/
    whirlpool.ts      // covers Whirlpool, Maytag, Amana, JennAir, KitchenAid, Roper,
                      // Estate, Inglis, Magic Chef, Admiral, Crosley, Kenmore
    ge.ts             // GE, Hotpoint, Cafe, Haier, Profile, Monogram
    frigidaire.ts     // Frigidaire, Electrolux, Gibson, Tappan, Kelvinator, Westinghouse
    lg.ts             // LG, Kenmore-LG
    samsung.ts        // Samsung
    bosch.ts          // Bosch, Thermador, Gaggenau, Siemens
    fisherpaykel.ts   // Fisher & Paykel — stub w/ pattern + Unknown reason for now
    miele.ts          // Miele — stub
  tests/
    fixtures.ts       // representative serials per brand w/ expected year/month/week/conf/rule
    decoder.test.ts   // vitest — runs decodeAge over fixtures, no AI
```

Each `Rule`:
```ts
type Rule = {
  id: string;           // "whirlpool.year-letter-week"
  name: string;         // "Whirlpool Year-Letter / Week Decoder"
  family: string;       // "Whirlpool"
  pattern: RegExp;
  weight: number;       // 0..1 base confidence
  extract: (serial: string, model?: string) => DateCandidate[];
  explain: (serial: string, candidate: DateCandidate) => string;
};
```

### 2. Confidence + scoring

- **High** — single rule matched, single candidate, model-compatible.
- **Medium** — one candidate dominates by ≥ 0.3 score.
- **Low** — partial match (year only or ambiguous cycle).
- **Unknown** — `status="unknown"`.

`UnknownReason`: `unsupported_manufacturer | invalid_serial_format | missing_date_code | ambiguous_year_cycle | insufficient_information`.

### 3. Extensibility

Adding Maytag/Amana/JennAir/KitchenAid/Fisher & Paykel/Miele/Haier requires only:
1. Add a file in `rules/`.
2. `registerRule(brand, rule)` in `registry.ts`.

Core `decode.ts` and `scoring.ts` never change.

### 4. Legacy retention + comparison mode

- Rename `src/lib/serial-decode.server.ts` → `src/lib/serial-decode.legacy.ts` (no imports reference it after migration).
- `decodeAppliance` server fn imports both engines. In production it returns the new engine's result. When `process.env.NODE_ENV !== "production"` (server) **or** when called from a DEV client, also run the legacy decoder and `console.log` differences:
  ```
  [age-decoder/compare] brand=Whirlpool serial=CX4812345 legacy=2018 new=2024 ruleId=whirlpool.year-letter-week
  ```
- The returned payload always uses the new engine.

### 5. AI guardrails

`decodeAppliance` AI call schema is reduced to:
```ts
{ applianceType: string, platform: string, notes: string }
```
No date/year/age/candidate-index fields. System prompt: "Never state a year or age. The engine decides dates. Describe the appliance only."

### 6. Database

Migration creates `public.age_decode_attempts`:

| column | type | notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid | FK auth.users ON DELETE SET NULL |
| decoder_version | text NOT NULL | `v1-legacy` or `v2-rule-engine` |
| manufacturer | text NOT NULL | |
| appliance_type | text | |
| model_number | text NOT NULL | |
| serial_number | text NOT NULL | |
| status | text NOT NULL CHECK in ('ok','unknown') | |
| confidence | text | |
| rule_id | text | |
| manufacture_year | int | |
| manufacture_month | int | |
| unknown_reason | text | |
| created_at | timestamptz | default now() |

Index on `(created_at desc)` and `(manufacturer, status)`.
GRANTs: `authenticated INSERT/SELECT own row`; owners SELECT all via `has_role(uid,'owner')`; `service_role ALL`. RLS enabled.

Every decode (success and unknown) writes one row with `decoder_version='v2-rule-engine'` from inside the server fn. In DEV comparison mode a second row with `decoder_version='v1-legacy'` is also written for the legacy result, enabling cross-version success-rate comparison.

### 7. Owner dashboard

New `AgeDecoderAnalyticsPanel` in `src/components/owner-panels.tsx`, mounted on `/owner`:
- Totals (last 30d): Lookups / Successful / Unknown / Success Rate %
- **Success Rate Trend** (last 30d, daily) — sparkline
- **Unknown Rate Trend** (last 30d, daily) — sparkline
- Per-manufacturer table (Whirlpool, GE, Frigidaire, LG, Samsung, Bosch, Other): lookups, success rate, broken down by `decoder_version`
- Top 5 unknown reasons
- Last 20 unknown serials (mfr, model, serial, reason)

Data via owner-gated server fn `getAgeDecoderStats` (verifies `has_role(uid,'owner')`).

### 8. UI updates

`verify-appliance.tsx`:
- Show `Applied Rule` (rule.name).
- On Unknown: show human-readable reason; "Built" stays `Unknown` — no AI fallback.

### 9. Tests

`bunx vitest run src/lib/age-decoder` — pure functions, no AI, no network. Fixtures cover all 6 priority brands with known-good serials and expected `{ year, month?, week?, confidence, ruleId }`.

### Files changed
- **new**: `src/lib/age-decoder/{types,registry,scoring,decode}.ts`, `rules/{whirlpool,ge,frigidaire,lg,samsung,bosch,fisherpaykel,miele}.ts`, `tests/{fixtures.ts,decoder.test.ts}`
- **rename**: `src/lib/serial-decode.server.ts` → `src/lib/serial-decode.legacy.ts`
- **edit**: `src/lib/serial-decode.functions.ts` (uses new engine + DEV comparison), `src/components/verify-appliance.tsx`, `src/components/owner-panels.tsx`, `src/routes/_authenticated/owner.tsx`
- **new migration**: `age_decode_attempts` + RLS + grants
- **new server fn**: `getAgeDecoderStats` (owner-only)

### Safety invariants enforced in code
- Date/age never present in AI response schema.
- `decodeAge` is a pure function — no `generateObject`, no `fetch`.
- `manufactureDate`/`ageYears` in the response are computed only from `decodeAge` output.
- Unknown is the default outcome whenever no rule matches.
