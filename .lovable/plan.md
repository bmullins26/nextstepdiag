# Critical Accuracy Fixes — Plan

## Root cause findings

### 1. Age Finder returns incorrect ages

`src/lib/serial-decode.functions.ts` runs the rules-based decoder (`decodeSerial`) only to produce **candidate years**. It then hands those candidates to the AI (`generateObject`) and asks the AI to return `manufactureDate` AND `ageYears`. So:

- `ageYears` is **AI-generated**, not computed from the chosen date.
- When the rules table produces no candidates (Bosch with no FD code, unknown families), the system prompt explicitly tells the AI to "infer from your knowledge" — pure guessing.
- Several rules in `src/lib/serial-decode.server.ts` are wrong or fragile:
  - Whirlpool uses a non-standard letter table and looks for the year letter at index 1; modern WP serials encode year differently per plant.
  - LG path parses the first 3 chars as an integer (`parseInt(s.slice(0,3))`) — silently breaks when char 1 is a letter (common).
  - Frigidaire matches *any* `\d{2}\d{2}` anywhere in the serial — first hit may not be YYWW.
  - GE's 12-year cycle is correct in shape but never narrowed by model number on the server; AI is left to pick.
- "Age" displayed in `verify-appliance.tsx` is `Math.round(result.ageYears)` straight from the AI.

### 2. GE appliances get Whirlpool diagnostic steps

`nextDiagnosticStep` (`src/lib/diagnostics.functions.ts`) does include `manufacturer` in the prompt, but:

- The **system prompt never tells the model to stay brand-specific** ("never apply Whirlpool procedures to a GE appliance"). With a generic system prompt the model defaults to the most-trained brand (Whirlpool).
- `manufacturer`/`applianceType` are not enforced as non-empty — an empty string slips through Zod (`z.string()` with no `.min(1)`), so a resumed session with missing brand data still calls the AI.
- On resume (`hydrateFrom` in `diagnose.tsx`) the appliance is rebuilt from row columns with `manufacturer: r.brand`; that's fine, but there is no log to confirm what was actually sent.
- No server-side logging of `{manufacturer, model, brand sent to AI}` makes contamination invisible.

### 3. Document panel on Diagnose

`DocPanel` in `src/routes/_authenticated/diagnose.tsx` duplicates `/documents` and adds noise; needs to be removed and replaced with a single link.

---

## Changes

### A. Deterministic age (no AI)

**`src/lib/serial-decode.server.ts`**
- Tighten brand rules:
  - Whirlpool: anchor on the documented year-letter position per format; if ambiguous, return multiple candidates but never a single guess.
  - LG: parse Y/Y/M as characters with the documented map (digit→year, A–C→month) instead of `parseInt`.
  - Frigidaire/Electrolux: only match YYWW at the documented offset (after the alpha prefix), not anywhere in the string.
  - GE: keep month+year letter map; add explicit "needs model to disambiguate" flag.
  - Bosch FD: keep formula but require the literal `FD` token.
- Add a new exported helper `pickBestCandidate(candidates, modelHints)` that returns either a single date or `null` (deterministic — no AI).

**`src/lib/serial-decode.functions.ts` — `decodeAppliance`**
- Remove `ageYears` from the AI schema. Keep AI only for: `manufacturer`, `applianceType`, `platform`, `confidence`, `decodedBreakdown`, `notes`, and selecting one of the rule candidates (`selectedCandidateIndex: number | null`).
- After AI returns, compute `ageYears` on the server from the chosen candidate's year/month: `(today - date) / 365.25`, rounded.
- If `selectedCandidateIndex === null` OR no rule candidates exist → return `manufactureDate: null`, `ageYears: null`, `confidence: "Unknown"`, and a `notes` value asking the tech to read the date code on the plate. Never fabricate.
- Add a server-side log line for every call:
  ```
  [age-finder] manufacturer=... model=... serial=... rule=... date=YYYY-MM age=Nyr
  ```

**`src/components/verify-appliance.tsx`**
- Handle `manufactureDate: null` / `ageYears: null` — show "Unknown" instead of "0 yr".
- Render a small debug strip (gated on `import.meta.env.DEV`) showing: Manufacturer / Serial / Applied Rule / Manufacture Date / Calculated Age — matches the required output format.

### B. Manufacturer-strict diagnostics

**`src/lib/diagnostics.functions.ts` — `nextDiagnosticStep`**
- Make `manufacturer` and `applianceType` required and non-empty (`z.string().min(1)`); reject the call otherwise with a clear error.
- Rewrite the system prompt to lead with manufacturer lock:
  > "The appliance is a **{manufacturer} {applianceType}** (model {model}). Every recommended test, terminal name, fault code, and component reference MUST match this manufacturer's service literature. NEVER apply procedures from another manufacturer (e.g. do not use Whirlpool VMW procedures on a GE appliance, do not cite Samsung error codes on an LG)."
- Echo manufacturer/model at the top of the user prompt in a single anchored line:
  ```
  MANUFACTURER: GE
  APPLIANCE: Dishwasher
  MODEL: GDT550PGRWW
  ```
- Add a server log: `[diagnose] mfg=... type=... model=... brandSentToAI=...` so contamination is traceable.

**`src/routes/_authenticated/diagnose.tsx`**
- Before calling `advance()`, assert `appliance.manufacturer || appliance.brand` and `appliance.applianceType` are present; if not, send the tech back to Phase 1 with a toast instead of calling the AI.
- In `hydrateFrom`, prefer the stored `appliance` JSON's `manufacturer` over the column-level `brand` when both exist (already does this — keep, just document).
- "Re-evaluate" and "Previous Question" already pass the same `appliance` ref — no change needed once the assertion is added.

### C. Remove document panel from Diagnose

**`src/routes/_authenticated/diagnose.tsx`**
- Delete `DocPanel`, the doc state (`docText`, `docName`, `docOpen`, `docQ`, `docA`, `docAsking`, `fileRef`, `onFile`, `handleAskDoc`), and the `askDocumentQuestion` import/call.
- Stop sending `documentExcerpt` from the diagnose page.
- Add a single inline link above `CurrentFindings` on Phase 2/3:
  > "Need help reading a wiring diagram? **Open Document Assistant →**" (links to `/documents`)

**`src/lib/diagnostics.functions.ts`**
- Leave `askDocumentQuestion` and the `documentExcerpt` field intact (still used by `/documents`); only the diagnose page stops sending it.

---

## Files changed

- `src/lib/serial-decode.server.ts` — tightened brand rules, `pickBestCandidate` helper
- `src/lib/serial-decode.functions.ts` — deterministic age computation, logging, schema change
- `src/components/verify-appliance.tsx` — handle null date/age, dev debug strip
- `src/lib/diagnostics.functions.ts` — manufacturer-lock system prompt, required fields, logging
- `src/routes/_authenticated/diagnose.tsx` — remove DocPanel, add `/documents` link, guard against missing manufacturer

## Example before / after

**Age Finder — LG washer, serial `409KW...`**
- Before: AI returns `ageYears: 7` (guessed).
- After: rule decodes `4`=2024, `0`=invalid month → single candidate `{year:2024}`; age computed = `2 yr`; if rule fails → "Unknown — please read date code on plate."

**Diagnose — GE dishwasher, complaint "won't drain"**
- Before: prompt is generic; AI returns Whirlpool steps ("check P1 connector at VMW board"). Log shows nothing.
- After: system prompt forces GE-specific guidance; AI returns "GE Triton/GDT series — check J1300-2 on the main control for drain pump command." Server log: `[diagnose] mfg=GE type=Dishwasher model=GDT550PGRWW brandSentToAI=GE`.
