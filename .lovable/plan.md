## Document Assistant — `/documents`

Two new files, zero edits to existing code. To remove later, delete the two files; nothing else needs to change.

### Files

1. **`src/lib/document-assistant.functions.ts`** (new) — two server functions calling Gemini via the existing Lovable AI gateway helper.
   - `analyzeDocument({ fileName, mimeType, dataUrl })` → returns structured analysis (Zod schema below).
   - `askDocumentFollowUp({ file, analysisSummary, history, question })` → returns `{ answer }`.
   - PDFs are sent as `{ type: "file", file: { filename, file_data } }`. JPG/PNG sent as `{ type: "image_url", image_url: { url } }`. Both via OpenAI-compatible chat messages, same gateway as `extractTagFromImage`.
   - Strong system prompt enforcing: **never invent voltage values, connector numbers, fault codes, wire colors, or part numbers**; missing info must read exactly `"Not visible in this document."`

2. **`src/routes/documents.tsx`** (new) — page UI.
   - Header with back link to `/` and `BrandLogo`.
   - Two-column layout (stacks on mobile):
     - **Left:** drag/drop file picker; once uploaded, shows `<img>` for images or `<object data type=application/pdf>` for PDFs.
     - **Right top:** analysis card with all 8 sections (Overview, Visible Text, Components, Circuit Operation, Voltage Paths, Test Points table, Next Diagnostic Step (highlighted), Follow-Up Questions as clickable chips that populate the question box).
     - **Right bottom:** follow-up chat with conversation history + textarea + send button (Enter to send).
   - Client-side validation: only PDF/JPG/PNG, max 15 MB, toast on rejection.
   - Uses existing semantic tokens (`bg-card`, `text-primary`, etc.) — matches `/diagnose` styling.

### Analysis schema (Zod, structured output via `generateObject`)

```
documentOverview: string
visibleText: string                              // verbatim transcription, [illegible] when needed
componentsIdentified: string[]
circuitOperation: string
voltagePaths: string[]                           // e.g. "L1 → F1 → K1 → HE1 → N"
testPoints: { location: string; expectedReading: string }[]
nextDiagnosticStep: string
followUpQuestions: string[]
```

### Model & gateway

Uses existing `getGateway()` + `DEFAULT_MODEL` (`google/gemini-3-flash-preview`) from `src/lib/ai-gateway.server.ts`. No new secrets, no new packages.

### Removal

Delete `src/routes/documents.tsx` and `src/lib/document-assistant.functions.ts`. Done — no other file references them.

Approve to build.