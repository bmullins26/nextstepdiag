## Goal

Replace the current free-text verification step on `/diagnose` with a HomeSpy-style "Appliance Age & ID Finder" that decodes the serial number into manufacturer, model family, appliance type, and approximate manufacture date — then feeds that into the existing diagnostic engine.

## User flow

1. Tech opens **Verify Appliance**.
2. Picks **Brand** from a curated dropdown (≈60 brands, matching HomeSpy's supported list — Whirlpool, GE, Samsung, LG, Frigidaire, Maytag, KitchenAid, Bosch, Kenmore, etc.). Searchable combobox; "Other" allowed.
3. Enters **Model #** and **Serial #** (required) and **Serial #** (optional second line if dual-tag).
4. Optional: taps a **camera button** on the serial field. If the selected brand supports OCR, the button is **green**; otherwise greyed with tooltip "Image recognition coming soon". Tapping opens the device camera / file picker, uploads the photo, and auto-fills brand / model / serial from the data plate.
5. Taps **Decode**. We show a result card:
   - Manufacturer (confirmed)
   - Appliance type + configuration (e.g. "Top-Load Washer, VMW platform")
   - **Manufacture date** with range + confidence ("Built ~Mar 2017, High confidence")
   - Age in years
   - Decoded serial breakdown (year code, week/month code, plant code) — collapsible "How we decoded this"
   - Buttons: **Looks right → continue to complaint** / **Not my appliance → edit**
6. Verified appliance object (including manufacture date and age) is passed to the existing `nextDiagnosticStep` engine, which can now factor age into its hypotheses ("13-year-old drain pump, check for wear first").

## Decode engine (AI + rules)

New server module `src/lib/serial-decode.server.ts` containing a rules table for major brands. Each rule = `{ brand, pattern: RegExp, extract: (m) => { yearCandidates: number[], weekOrMonth?, plant? } }`. Coverage at launch (matches HomeSpy's most-used decoders):

- Whirlpool family (Whirlpool, KitchenAid, Maytag, Amana, Jenn-Air, Roper, Estate, Inglis, Magic Chef, Admiral, Crosley) — letter+digit week/year (`C` = 2013, etc.)
- GE / Hotpoint / Cafe / Haier-GE — 2-letter month/year code
- Samsung — position 7 = year, position 8 = month (alphanumeric)
- LG — positions 1–3 = YYM
- Frigidaire / Electrolux / Gibson / Tappan / Kelvinator / Westinghouse — 2-digit year + week
- Bosch / Thermador / Gaggenau / Siemens — FD code
- Speed Queen / Alliance / Huebsch — YYMM prefix
- Sub-Zero, Wolf, Viking, Dacor — passthrough to AI
- Anything else → fall back to AI-only decode

New server function `decodeAppliance({ brand, modelNumber, serialNumber })`:
1. Run brand-specific rule → list of candidate manufacture dates.
2. Call AI (existing `generateObject` + Lovable Gateway, `google/gemini-3-flash-preview`) with: brand, model, serial, candidate dates from step 1. Prompt instructs it to:
   - Confirm/refine appliance type & configuration from the **model number**.
   - Pick the most likely date from candidates (or say "ambiguous").
   - Return structured `{ manufacturer, applianceType, platform, manufactureDate: {year, month?, rangeStart, rangeEnd}, ageYears, confidence: High|Medium|Low|Unknown, decodedBreakdown: string, notes: string }`.
3. If rules produced zero candidates AND AI confidence < Medium, return `identified: false` with a clarifying question for the tech (e.g. "Serial format not recognized — is there a second tag inside the door?").

Replaces the current `verifyAppliance` server function; downstream `nextDiagnosticStep` is extended to accept `manufactureDate` and `ageYears` so the diagnostic prompt can reason about age.

## Photo OCR auto-fill

New server function `extractTagFromImage({ imageBase64, brand? })` using the Lovable AI Gateway multimodal chat-completions endpoint with `google/gemini-3-flash-preview`. Prompt: "Read the data plate from this appliance. Return `{brand, modelNumber, serialNumber, typeHints}` exactly as printed; leave blank if not visible." On client:

- `<input type="file" accept="image/*" capture="environment">` triggered by the camera button.
- Compress to ≤1.5 MB JPEG (canvas re-encode) before sending.
- On return, prefill the form fields; tech can correct before pressing Decode.

OCR-supported brand list (camera button green) starts with the Whirlpool family, GE, Samsung, LG, Frigidaire, Bosch, Maytag, KitchenAid — same brands we have decode rules for. All other brands show the camera as disabled with a "coming soon" tooltip (matches HomeSpy behavior).

## UI changes

- `src/routes/diagnose.tsx` — replace the current brand/model/serial inputs with the new `<VerifyAppliance>` step component. Result card + "How we decoded this" disclosure. Mobile-first, dark theme, brand tokens unchanged.
- New `src/components/verify-appliance.tsx` — combobox + inputs + camera button + Decode action + result card. Uses existing shadcn `Command`, `Popover`, `Input`, `Button`, `Badge`, `Card`.
- New `src/lib/appliance-brands.ts` — flat list of supported brands with `{name, slug, ocrSupported, decodeSupported}` flags.
- Keep the existing complaint + guided-engine phases; they receive the richer appliance object automatically.

## Files

Create:
- `src/lib/appliance-brands.ts`
- `src/lib/serial-decode.server.ts`
- `src/lib/serial-decode.functions.ts` (exports `decodeAppliance`, `extractTagFromImage`)
- `src/components/verify-appliance.tsx`

Edit:
- `src/lib/diagnostics.functions.ts` — remove old `verifyAppliance`; extend `StepInput.appliance` with `manufactureDate?` and `ageYears?`; update the senior-tech system prompt to use age.
- `src/routes/diagnose.tsx` — swap verification step to the new component; thread the new appliance object through to the engine.

No DB, no auth changes, no new packages — everything runs through the existing AI Gateway helper and shadcn primitives.

## Out of scope

- Voice-to-text for serial input (not selected).
- Persisting decode history (no Cloud yet).
- reCAPTCHA (this is a technician tool, not a public form).
