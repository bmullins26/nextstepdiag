## Diagnosis

Decode silently fails because `generateObject(...)` is being called with the default `mode: 'auto'`, which uses provider-side `response_format: json_schema`. Gemini 3 Flash through the Lovable gateway logs:

```
AI SDK Warning (lovable.chat / google/gemini-3-flash-preview):
The feature "responseFormat" is not supported.
JSON response format schema is only supported with structuredOutputs
```

The provider returns plain text, AI SDK's schema parse rejects it, the server function throws, the UI just toasts the error and clears state — so the user sees "no results."

This affects every `generateObject` call in the project, not just decode.

## Fix

Switch every `generateObject` call to `mode: 'json'` (uses `response_format: { type: 'json_object' }`, which the gateway supports) and keep the existing Zod schema for validation client-side.

Files to edit:

- `src/lib/serial-decode.functions.ts` — add `mode: 'json'` to `decodeAppliance` and `extractTagFromImage`.
- `src/lib/diagnostics.functions.ts` — add `mode: 'json'` to `verifyAppliance`, `nextDiagnosticStep`, and `askDocumentQuestion`.

For `extractTagFromImage` (multimodal), also change the content block from AI-SDK's `{ type: 'image', image: ... }` to the OpenAI-compatible `{ type: 'image_url', image_url: { url: dataUrl } }`, since the gateway is OpenAI-shape passthrough.

## Hardening

In `src/components/verify-appliance.tsx`, surface a more useful error: when the decode call throws, also keep the form populated (already the case) but log the underlying error message to the toast (already the case) — and add a `console.error` so the user/devtools see the real cause if they look.

## Verification

After the edits, re-run the decode in preview with Brand=Whirlpool / Model=WTW5000DW1 / Serial=C81234567 and confirm the result card appears with year ~2018 candidates and "How we decoded this" populated. Confirm no `responseFormat` warnings in the dev-server log.

## Out of scope

- Switching models or moving off `generateObject` to `generateText + Output.object`.
- Persisting decoded results.
