# Knowledge Intelligence Engine — Phase 1

Foundation for a structured ingestion → extraction → normalization → retrieval pipeline that feeds the existing diagnostic engine. No new app, no UI redesign, no chatbot.

## What already exists (verified)

| Capability | Where it lives today | Verdict |
|---|---|---|
| Document upload + AI analysis | `src/lib/document-assistant.functions.ts` | Works, but the file is base64-inlined to the model and **never persisted**. Extend, don't rebuild. |
| Service literature store | `tech_sheets` (+ `tech_sheet_lookups` log), Firecrawl fetcher | Reuse as one *source type*, do not duplicate. |
| Error-code knowledge | `error_code_cache` | Reuse; currently not wired into the evidence engine — will be. |
| Confirmed technician knowledge | `diagnostic_outcomes` (predicted vs actual, part replaced, confirming test, evidence snapshot) | Already the highest-value corpus. Stays the immutable source of truth. |
| Community knowledge | `community_discussions`, `community_replies` | Reuse as lower-authority source. |
| Retrieval + ranking | `src/lib/evidence/*` — 7 providers, tier priorities, `tieredPromptBlock` | **This is the retrieval seam.** Phase 1 plugs into it. |
| Empty provider slots | `manufacturer_doc`, `service_bulletin`, `external_repair_guide` in `providers/stubs.ts` | Exactly where the knowledge engine lands. |
| Vector search | none anywhere | pgvector 0.8.0 available, not enabled. Enable in Phase 1. |
| Admin surface | `owner-panels.tsx` tabs + `/owner/*` routes | Add one new `/owner/knowledge` route. |

Nothing here needs replacing. Phase 1 is additive.

## New database objects

Five new tables, mirroring the requested pipeline stages. Every stage is preserved — normalization never mutates or deletes the stage before it.

1. **`knowledge_sources`** — one row per raw source (document, URL, or a pointer to an existing record).
   `source_type` (service_manual, tech_sheet, wiring_diagram, error_code_doc, parts_doc, technician_note, repair_record, service_call), `title`, `manufacturer`, `brand`, `appliance_type`, `model_number`, `model_family`, `source_url`, `storage_path`, `mime_type`, `file_size`, `source_authority`, `uploaded_by`, `content_hash` (dedupe).
   Can reference an existing row instead of a file via `ref_table` / `ref_id`, so a `diagnostic_outcomes` or `tech_sheets` row becomes a source without copying it.

2. **`knowledge_processing_jobs`** — processing tracked separately from the source.
   `status` (pending / processing / completed / failed / needs_review), `processing_started_at`, `processing_completed_at`, `processing_error`, `extraction_method`, `extraction_confidence`, `attempt_count`.

3. **`knowledge_extractions`** — raw extracted content, immutable.
   `page_number`, `section`, `heading`, `text`, `tables` (jsonb), `ocr_text`, `metadata`. Never rewritten by normalization.

4. **`knowledge_facts`** — normalized structured knowledge, the diagnostic-shaped record:
   `symptom`, `complaint`, `appliance_type`, `component`, `part`, `part_number`, `test`, `test_condition`, `expected_result`, `actual_result`, `failure`, `repair`, `resolution`, `error_code`, `diagnostic_step`, plus `brand`, `manufacturer`, `model_number`, `model_family`, `confidence_score`, `confidence_reason`, `needs_review`, `reviewed_by`, `reviewed_at`, `source_authority`, and FKs back to source + extraction.

5. **`knowledge_chunks`** — retrieval unit.
   `content`, `embedding vector(3072)`, `embedding_model`, `embedding_dims`, `token_count`, denormalized filter columns (brand, appliance_type, model_family, component, error_code, symptom tags), `source_authority`, `confidence_score`, and FKs to source/extraction/fact. Every chunk is traceable to its origin.

Supporting: `source_authority` enum ordered
`manufacturer_verified > technician_verified_repair > technician_entered > reviewed_normalized > ai_extracted_pending_review > ai_inference`,
and a `knowledge_review_log` for audit of human accept/reject/edit actions.

### Provenance and immutability — server-authorized, not trigger-guessed

The database cannot tell whether a write originated from AI or a human, so it will not try. Instead:

- Every fact/chunk row carries explicit provenance written by the server: `origin` (`human` | `ai_extraction` | `ai_inference`), `origin_actor` (user id or model id), `origin_run_id` (the processing job), `source_authority`, and the FK chain back to extraction → source.
- Only server functions may write these tables; clients have no INSERT/UPDATE grant. The server function is the authorization point: an ingestion run may only insert rows with an AI origin and an authority no higher than `ai_extracted_pending_review`, and may never target an existing human/manufacturer row.
- Database-level rules stay to what SQL can actually enforce: `knowledge_extractions` has no UPDATE/DELETE grant to any app role (append-only), and CHECK constraints keep `origin` and `source_authority` consistent so an AI-origin row cannot claim verified authority.
- Corrections are new rows plus a `knowledge_review_log` entry, never in-place edits of original technician or manufacturer content.

## Extensions and storage

### Embedding model — verify before writing the migration

Default choice is `google/gemini-embedding-001` via the Lovable AI Gateway (3072 dims, 2048-token input cap, max 100 inputs per batch). **First implementation step is a live call to the gateway to confirm the model id is accepted and to read back the actual vector length**, and the migration is written only after that number is confirmed. Chunking targets ~1000 characters with overlap so every chunk stays well inside the input cap. If a 1536-dim column is preferred for cost/index reasons, that means `openai/text-embedding-3-small` — the model and column are decided together, never mismatched.

- Enable `vector` (pgvector 0.8.0) and `pg_trgm`.
- HNSW index on `knowledge_chunks.embedding`. At 3072 dims that exceeds pgvector's 2000-dim index limit, so the index and every query use a matching `::halfvec(3072)` cast. btree/GIN on the filter columns; trigram index on fact text for keyword fallback.
- `embedding_model` is stored per chunk so a future model change can re-embed instead of silently comparing incompatible vectors.
- New private storage bucket `knowledge-documents`, path `{user_id}/{source_id}.{ext}`, owner-write + owner/uploader-read RLS. `repair-photos` stays as-is.

## Security / RLS

- All five tables: RLS on, explicit GRANTs.
- Uploaders read their own sources/jobs/extractions; owners read all.
- `knowledge_facts` and `knowledge_chunks`: signed-in users may read rows that are **reviewed or high-confidence and not `needs_review`** — pending AI output never reaches technicians until reviewed.
- Writes to facts/chunks only via server functions (service role) — never from the client.
- Review actions (`needs_review` clearing, authority promotion) gated on owner role via `has_role`.

## Processing pipeline

Implemented as server functions, no edge functions:

```text
upload/register  → knowledge_sources row + storage object
      ↓
enqueue          → knowledge_processing_jobs (pending)
      ↓
extract          → AI (Lovable AI Gateway) or Firecrawl for URLs
                 → knowledge_extractions (raw, immutable)
      ↓
normalize        → structured facts w/ Zod schema + confidence
                 → knowledge_facts (needs_review when confidence low)
      ↓
chunk + embed    → knowledge_chunks (+ embedding)
      ↓
status           → completed | needs_review | failed
```

Processing is invoked explicitly (upload action or an owner "reprocess" button) and is idempotent per job — a failed job can be retried without duplicating extractions. Backfill of existing `diagnostic_outcomes` / `tech_sheets` / `error_code_cache` into sources+facts is a Phase 1 owner-triggered action, not an automatic migration.

## Retrieval architecture

- `search_knowledge` server function: hybrid — vector similarity on `knowledge_chunks` plus keyword/trigram, with hard filters on brand, manufacturer, appliance type, model, model family, symptom, component, error code, test, source type, source authority.
- Results ranked by `authority weight × confidence × similarity × recency`, reusing the existing weighting philosophy in `src/lib/evidence/types.ts`.

## Connection to the diagnostic engine

Minimal and safe: implement the currently-stubbed `manufacturerDocProvider` and `serviceBulletinProvider` in `src/lib/evidence/providers/stubs.ts` as real providers backed by `search_knowledge`, and add one `knowledge_fact` provider. `gatherEvidence`, `tieredPromptBlock`, and `diagnostics.functions.ts` need **no structural change** — the new evidence flows through the existing tier ordering and prompt block. If retrieval returns nothing, diagnostics behave exactly as they do today.

**The diagnostic engine is not touched until ingestion and retrieval pass testing.** Steps 1–4 below ship and are verified with the evidence providers still returning empty, exactly as today. Only step 5 wires retrieval in, behind a flag that can be turned off without a code change.

## Incremental delivery order

Each step is completed and verified before the next begins.

1. **Confirm the embedding model.** Live gateway call, read back the real vector length, then write the migration against that number.
2. **Schema + storage.** Tables, enums, grants, RLS, bucket. Nothing reads from them yet.
3. **Ingest one tech sheet.** Upload a single real tech sheet end to end: source → job → extraction → facts → chunks → embedding. Inspect every stage in the admin UI and confirm page/section attribution, confidence, and provenance are correct before ingesting anything else.
4. **Backfill a small `diagnostic_outcomes` sample.** Ten to twenty confirmed outcomes, owner-triggered, with a dry-run preview. Verify the normalized facts match the original records, that the originals are untouched, and that every chunk traces back to its outcome id. Only then consider a wider backfill.
5. **Retrieval smoke test.** Run `search_knowledge` directly against the ingested corpus with filters and a realistic query ("Whirlpool washer fills, agitates, won't spin") and inspect the ranked results — still with no diagnostic-engine change.
6. **Wire into the evidence engine.** Enable the knowledge-backed providers behind a flag, compare diagnoses with the flag on and off, and confirm behavior is unchanged when the corpus is empty.

## Admin UI (minimum)

New route `/owner/knowledge` (added to `OWNER_NAV`), three tabs:
- **Sources** — table of uploaded/registered documents with processing status, upload action, reprocess/retry.
- **Inspect** — drill into one source: raw extractions by page/section, normalized facts, chunks, confidence and reason, source attribution.
- **Review queue** — items with `needs_review`; approve, edit, or reject, which writes to `knowledge_review_log` and promotes authority.

No chat interface, no generic AI screen.

## Risks and duplication watch

- **Duplication with `tech_sheets` / `error_code_cache`**: avoided by referencing those rows as sources rather than copying content. They remain their own caches.
- **Cost**: embedding + extraction are AI calls. Mitigated by `content_hash` dedupe, explicit (not automatic) processing, and no re-embedding of unchanged content.
- **Bad AI extraction polluting diagnostics**: mitigated by the authority ordering, the `needs_review` gate on reads, server-authorized provenance, and the append-only extraction table.
- **Model dimension lock-in**: embedding dimension is fixed at table creation; the model is verified live before the migration and recorded per chunk so a future re-embed is possible.
- **Provenance loss**: every chunk and fact keeps its FK chain to extraction → source, plus page/section and the originating job, so any retrieved statement can be traced to the exact document page or repair record it came from. A row that cannot state its origin is not written.

## Phase 1 exit criteria

Upload a tech sheet → it is stored, extracted, normalized, chunked, embedded, visible in the owner console with confidence and attribution, retrievable by filtered semantic search, and surfacing in a diagnosis as an evidence item — with existing diagnostics unchanged when the corpus is empty.
