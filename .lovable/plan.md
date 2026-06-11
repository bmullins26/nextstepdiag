## Goal

Make the Document Assistant upload + Q&A flow work reliably on Safari (iPhone/iPad/macOS) and Chrome (Android/Desktop). Root cause of current breakage: a `<label htmlFor>` wrapping a hidden file input + a textarea disabled until analysis completes. Safari frequently drops the label→hidden-input bridge, leaving users stuck with no picker and no way to type.

All changes are confined to `src/routes/_authenticated/documents.tsx` (one file).

## 1. File picker — user-gesture-safe

- Keep a single `<input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden>` mounted once, outside any clickable wrapper.
- Open it explicitly via `inputRef.current?.click()` from:
  - The dropzone (`onClick`, `onKeyDown` for Enter/Space, `role="button"`, `tabIndex={0}`).
  - A visible **Choose file** button inside the dropzone.
  - A secondary **Replace file** button in the preview header (when a file is already loaded).
- Remove the `<label htmlFor="doc-upload">` pattern entirely.

## 2. Drag-and-drop (desktop only)

- Wire `onDragOver` (preventDefault + visual state), `onDragLeave`, `onDrop` (call `onPick(files[0])`) on the dropzone div.
- Detect touch / coarse-pointer (`window.matchMedia('(hover: none)').matches`) and hide the "or drop a file here" copy on those devices. Tap/Choose-file path remains.

## 3. Upload state machine

Replace the boolean `analyzing` with a single status: `'idle' | 'reading' | 'analyzing' | 'ready' | 'error'`.

- `idle` → "Ready — upload a tech sheet or diagram"
- `reading` → "Reading file…" (during `FileReader.readAsDataURL`)
- `analyzing` → "Analyzing document… this can take up to a minute on large PDFs" (with spinner, important for iPad)
- `ready` → green check + "Analysis complete"
- `error` → red inline message with the thrown text + a **Try again** button

Show the status pill in the preview card header and mirror it in the Analysis panel header so the tech always sees progress.

## 4. PDF preview fallback (Safari-safe)

- Try `<object data={dataUrl} type="application/pdf">` first.
- Inside the `<object>` fallback slot (rendered when the plugin can't display), show a "PDF Loaded Successfully" card with:
  - File name
  - Human-readable file size (`(bytes/1024/1024).toFixed(2) MB`)
  - **Open PDF** link (`<a href={dataUrl} target="_blank" rel="noopener" download={fileName}>`).
- Additionally detect iOS Safari (`/iP(hone|ad|od)/.test(navigator.userAgent)` + not Chrome) and skip `<object>` entirely on those devices — render the fallback card directly, since iOS Safari frequently fails to render `<object>` PDFs.
- Critical: preview rendering must never block analysis. Analysis is dispatched from `onPick` independent of preview.

## 5. Follow-up textarea

- Drop `!analysis` from the textarea's `disabled` — only disable while `asking`.
- Keep the Send button disabled until `status === 'ready' && question.trim() && !asking`.
- Update placeholder: "Type your question — sends once analysis completes."
- This lets techs compose the question while analysis is still running and removes the "input is broken" symptom.

## 6. File validation + errors

- Keep MIME allowlist + 15 MB limit.
- On any error in `onPick` (read, validation, server), set `status='error'` and store the message — render it as a visible inline error in the preview card (not only a toast, since iOS Safari sometimes suppresses toasts behind keyboard).
- Always reset the `<input>`'s `value` after pick so re-selecting the same file refires `onChange`.

## 7. Accessibility

- Dropzone: `role="button"`, `tabIndex={0}`, `aria-label="Upload a tech sheet or diagram"`, Enter/Space handler.
- Status pill uses `aria-live="polite"`.

## Out of scope

- No changes to `analyzeDocument` / `askDocumentFollowUp` server functions (current ~20 MB JSON payload limit is fine within the 15 MB file cap; no chunked-base64 work needed).
- No changes to auth, routing, or other pages.
- No styling overhaul — reuse existing tokens and shadcn components.

## Files touched

- `src/routes/_authenticated/documents.tsx` (only)

## Verification (after build mode)

- Manual: open `/documents` on Chrome desktop and on Safari (macOS sim via viewport) — upload PDF, watch status transitions, confirm fallback card appears on iOS UA, confirm typing in the textarea works during `analyzing`, confirm follow-up sends after `ready`.
