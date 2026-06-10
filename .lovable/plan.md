## Enhance Guided Diagnosis with Current Findings & Back-Navigation

Two-file change. Existing flow (Verify → Complaint → Diagnose) stays intact; new functionality slots into Phase 2 and Phase 3.

### 1. `src/lib/diagnostics.functions.ts` (edit)

Extend `StepInput` schema with a new field:
```
currentFindings: z.array(z.string()).default([])
```

Pass findings into the model prompt with a dedicated section:
```
Already verified by the technician (do NOT ask them to repeat these tests):
- 120 VAC Verified
- Drain Pump Runs
- No Fault Codes Present
```

Tighten the system prompt:
- "Treat Current Findings as ground truth. Never ask a question that re-tests anything in that list."
- "Behave as a senior tech joining an active service call already in progress."
- "Every recommendedNextTest must be specific — name the connector/pin, component, or measurement (e.g. 'Measure VAC at J16-4 during spin'). Reject generic advice like 'check the wiring'."

Update the structured-output schema to return `mostLikelyFailures: string[]` (top 2–3) in addition to the existing single `mostLikelyFailure` — UI will show the list, engine fills both for backward compat.

### 2. `src/routes/diagnose.tsx` (edit)

**Current Findings panel** — new component shown in Phase 2 (above complaint) and Phase 3 (above the question card):
- Empty state: "Add anything you've already verified — voltage, fault codes, component tests."
- List of findings as chips with edit (pencil) + remove (×) buttons.
- "+ Add Finding" → inline input with quick-pick suggestions (the 12 examples from the prompt: "120 VAC Verified", "240 VAC Verified", "Control Board Receiving Power", "Drain Pump Runs", "No Fault Codes Present", "Lid Lock Tested Good", "Thermistor Tested Good", "Heater Tested Good", "Compressor Running", "Capacitor Tested Good", "Motor Windings Test Good", plus free-text for codes like "F7E1 Fault Code Present").
- Findings persist across phases and are passed into every `advance()` call.

**State changes:**
- `const [findings, setFindings] = useState<string[]>([])`
- `advance(h)` → pass `currentFindings: findings`
- When findings change mid-diagnosis (Phase 3), show a "Re-evaluate" button that re-runs `advance(history)` so the engine adapts.

**Previous Question button** — in Phase 3 question card:
- `← Previous Question` button visible when `history.length > 0`.
- Click: pops last QA from history, calls `advance(historyWithoutLast)` to regenerate that question (allows changing the answer).
- Also add edit affordance on each row in the "Questions Answered" details list — clicking "Change answer" rewinds history to that point and re-advances.

**Diagnostic screen always displays** (Phase 3 layout, top-to-bottom):
1. Verified Appliance chip (exists)
2. Customer Complaint card (exists)
3. **Current Findings** card (new, editable inline)
4. Questions Answered (exists, made always-visible instead of collapsed, with per-row "Change" button)
5. **Most Likely Failures** card (rendered from new `mostLikelyFailures[]`, falls back to single)
6. Recommended Next Test card (exists, now guaranteed specific by prompt)
7. Question card with `← Previous Question` + answer choices

### Out of scope
No DB persistence (findings live in component state only — survives within a session, cleared on Reset). No schema migrations. No new files.

### Removal
Both changes are additive within existing files. Revert the two files to undo.

Approve to build.