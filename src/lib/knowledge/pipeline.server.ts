import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./embeddings.server";
import { factToText, normalizeToFacts } from "./normalize.server";
import {
  AUTO_CLEAR_CONFIDENCE,
  CHUNK_TARGET_CHARS,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  chunkText,
  type KnowledgeAuthority,
  type KnowledgeOrigin,
  type KnowledgeSourceType,
} from "./types";

/**
 * Server-authorized ingestion pipeline.
 *
 * RAW SOURCE -> EXTRACTION (append-only) -> NORMALIZED FACTS -> CHUNKS+EMBEDDINGS
 *
 * Authority rules are enforced here, at the only place that can actually know
 * who produced a row:
 *  - An AI-produced fact/chunk may never be written above
 *    `ai_extracted_pending_review`.
 *  - Extractions are append-only (no UPDATE/DELETE grant in the database).
 *  - Original technician / manufacturer records are referenced, never rewritten.
 */

export const AI_MAX_AUTHORITY: KnowledgeAuthority = "ai_extracted_pending_review";

export function clampAuthorityForOrigin(
  origin: KnowledgeOrigin,
  requested: KnowledgeAuthority,
): KnowledgeAuthority {
  if (origin === "human") return requested;
  if (origin === "ai_inference") return "ai_inference";
  return requested === "reviewed_normalized" ? requested : AI_MAX_AUTHORITY;
}

export function modelFamilyOf(model: string | null | undefined): string | null {
  const m = (model ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!m) return null;
  return m.length > 4 ? m.slice(0, Math.max(4, m.length - 2)) : m;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type RegisterSourceInput = {
  source_type: KnowledgeSourceType;
  source_authority: KnowledgeAuthority;
  title: string;
  brand?: string | null;
  manufacturer?: string | null;
  appliance_type?: string | null;
  model_number?: string | null;
  source_url?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  ref_table?: string | null;
  ref_id?: string | null;
  metadata?: Record<string, unknown>;
  uploaded_by: string;
  content: string;
};

export type IngestResult = {
  source_id: string;
  job_id: string;
  status: string;
  extractions: number;
  facts: number;
  chunks: number;
  needs_review: number;
  error?: string;
  reused?: boolean;
};

/**
 * Registers a source (deduped by content hash or by the record it points at)
 * and runs the full pipeline over the supplied raw content.
 */
export async function ingestSource(
  admin: SupabaseClient,
  input: RegisterSourceInput,
): Promise<IngestResult> {
  const hash = await sha256(`${input.source_type}:${input.content}`);
  const modelFamily = modelFamilyOf(input.model_number);

  // Dedupe: same content, or same underlying record, is never ingested twice.
  let sourceId: string | null = null;
  {
    const q = admin.from("knowledge_sources").select("id").limit(1);
    const { data } = input.ref_id
      ? await q.eq("ref_table", input.ref_table ?? "").eq("ref_id", input.ref_id)
      : await q.eq("content_hash", hash);
    if (data?.[0]) sourceId = (data[0] as { id: string }).id;
  }

  if (sourceId) {
    const { data: done } = await admin
      .from("knowledge_processing_jobs")
      .select("id,status")
      .eq("source_id", sourceId)
      .in("status", ["completed", "needs_review"])
      .limit(1);
    if (done?.[0]) {
      const counts = await countsFor(admin, sourceId);
      return {
        source_id: sourceId,
        job_id: (done[0] as { id: string }).id,
        status: (done[0] as { status: string }).status,
        reused: true,
        ...counts,
      };
    }
  } else {
    const { data, error } = await admin
      .from("knowledge_sources")
      .insert({
        source_type: input.source_type,
        source_authority: input.source_authority,
        title: input.title,
        brand: input.brand ?? null,
        manufacturer: input.manufacturer ?? input.brand ?? null,
        appliance_type: input.appliance_type ?? null,
        model_number: input.model_number ?? null,
        model_family: modelFamily,
        source_url: input.source_url ?? null,
        storage_path: input.storage_path ?? null,
        mime_type: input.mime_type ?? null,
        file_size: input.file_size ?? null,
        content_hash: hash,
        ref_table: input.ref_table ?? null,
        ref_id: input.ref_id ?? null,
        metadata: input.metadata ?? {},
        uploaded_by: input.uploaded_by,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sourceId = (data as { id: string }).id;
  }

  const { data: jobRow, error: jobErr } = await admin
    .from("knowledge_processing_jobs")
    .insert({
      source_id: sourceId,
      status: "processing",
      processing_started_at: new Date().toISOString(),
      extraction_method: "text_segmentation+ai_normalization",
      embedding_model: EMBEDDING_MODEL,
      attempt_count: 1,
      requested_by: input.uploaded_by,
    })
    .select("id")
    .single();
  if (jobErr) throw new Error(jobErr.message);
  const jobId = (jobRow as { id: string }).id;

  try {
    const result = await runPipeline(admin, {
      sourceId: sourceId!,
      jobId,
      content: input.content,
      brand: input.brand ?? null,
      manufacturer: input.manufacturer ?? input.brand ?? null,
      applianceType: input.appliance_type ?? null,
      modelNumber: input.model_number ?? null,
      modelFamily,
      sourceType: input.source_type,
      sourceAuthority: input.source_authority,
      title: input.title,
    });

    const status = result.needs_review > 0 ? "needs_review" : "completed";
    await admin
      .from("knowledge_processing_jobs")
      .update({
        status,
        processing_completed_at: new Date().toISOString(),
        extraction_confidence: result.avgConfidence,
        stats: {
          extractions: result.extractions,
          facts: result.facts,
          chunks: result.chunks,
          needs_review: result.needs_review,
        },
      })
      .eq("id", jobId);

    return {
      source_id: sourceId!,
      job_id: jobId,
      status,
      extractions: result.extractions,
      facts: result.facts,
      chunks: result.chunks,
      needs_review: result.needs_review,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("knowledge_processing_jobs")
      .update({
        status: "failed",
        processing_completed_at: new Date().toISOString(),
        processing_error: message.slice(0, 2000),
      })
      .eq("id", jobId);
    return {
      source_id: sourceId!,
      job_id: jobId,
      status: "failed",
      extractions: 0,
      facts: 0,
      chunks: 0,
      needs_review: 0,
      error: message,
    };
  }
}

async function countsFor(admin: SupabaseClient, sourceId: string) {
  const [e, f, c, r] = await Promise.all([
    admin.from("knowledge_extractions").select("id", { count: "exact", head: true }).eq("source_id", sourceId),
    admin.from("knowledge_facts").select("id", { count: "exact", head: true }).eq("source_id", sourceId),
    admin.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("source_id", sourceId),
    admin
      .from("knowledge_facts")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId)
      .eq("needs_review", true),
  ]);
  return {
    extractions: e.count ?? 0,
    facts: f.count ?? 0,
    chunks: c.count ?? 0,
    needs_review: r.count ?? 0,
  };
}

/** Split raw content into extraction segments, keeping headings and order. */
export function segmentContent(content: string): {
  section: string | null;
  heading: string | null;
  page_number: number | null;
  text: string;
}[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments: { heading: string | null; text: string }[] = [];
  let heading: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) segments.push({ heading, text });
    buf = [];
  };

  for (const line of lines) {
    const md = /^\s{0,3}(#{1,4})\s+(.*)$/.exec(line);
    if (md) {
      flush();
      heading = md[2]!.trim();
      continue;
    }
    buf.push(line);
    if (buf.join("\n").length > 6000) flush();
  }
  flush();

  if (segments.length === 0 && content.trim()) {
    segments.push({ heading: null, text: content.trim() });
  }

  return segments.map((s, i) => ({
    section: s.heading ?? `Segment ${i + 1}`,
    heading: s.heading,
    page_number: null,
    text: s.text,
  }));
}

async function runPipeline(
  admin: SupabaseClient,
  args: {
    sourceId: string;
    jobId: string;
    content: string;
    brand: string | null;
    manufacturer: string | null;
    applianceType: string | null;
    modelNumber: string | null;
    modelFamily: string | null;
    sourceType: KnowledgeSourceType;
    sourceAuthority: KnowledgeAuthority;
    title: string;
  },
) {
  // ---- EXTRACTION (append-only, never rewritten) ----
  const segments = segmentContent(args.content);
  const extractionRows = segments.map((s) => ({
    source_id: args.sourceId,
    job_id: args.jobId,
    page_number: s.page_number,
    section: s.section,
    heading: s.heading,
    text: s.text,
    metadata: { chars: s.text.length },
  }));
  const { data: extractions, error: exErr } = await admin
    .from("knowledge_extractions")
    .insert(extractionRows)
    .select("id,section,heading,text,page_number");
  if (exErr) throw new Error(`Extraction failed: ${exErr.message}`);

  // ---- NORMALIZATION ----
  const origin: KnowledgeOrigin = "ai_extraction";
  const authority = clampAuthorityForOrigin(origin, args.sourceAuthority);

  type FactInsert = Record<string, unknown> & { __text: string };
  const factInserts: FactInsert[] = [];
  let confSum = 0;
  let normalizedModel = "";

  for (const ex of (extractions ?? []) as {
    id: string;
    section: string | null;
    heading: string | null;
    text: string;
    page_number: number | null;
  }[]) {
    if (ex.text.trim().length < 40) continue;
    const { facts, model } = await normalizeToFacts({
      brand: args.brand,
      applianceType: args.applianceType,
      model: args.modelNumber,
      sourceLabel: `${args.title}${ex.heading ? ` — ${ex.heading}` : ""}`,
      text: ex.text.slice(0, 20000),
    });
    normalizedModel = model;

    for (const f of facts) {
      const text = factToText(f as unknown as Record<string, unknown>);
      if (!text.trim()) continue;
      confSum += f.confidence_score;
      factInserts.push({
        __text: text,
        source_id: args.sourceId,
        extraction_id: ex.id,
        job_id: args.jobId,
        brand: args.brand,
        manufacturer: args.manufacturer,
        appliance_type: args.applianceType,
        model_number: args.modelNumber,
        model_family: args.modelFamily,
        symptom: f.symptom,
        complaint: f.complaint,
        component: f.component,
        part: f.part,
        part_number: f.part_number,
        test: f.test,
        test_condition: f.test_condition,
        expected_result: f.expected_result,
        actual_result: f.actual_result,
        failure: f.failure,
        repair: f.repair,
        resolution: f.resolution,
        error_code: f.error_code,
        diagnostic_step: f.diagnostic_step,
        source_authority: authority,
        origin,
        origin_actor: model,
        confidence_score: f.confidence_score,
        confidence_reason: f.confidence_reason,
        needs_review: f.confidence_score < AUTO_CLEAR_CONFIDENCE,
        page_number: ex.page_number,
        section: ex.section,
      });
    }
  }

  if (factInserts.length === 0) {
    return {
      extractions: extractionRows.length,
      facts: 0,
      chunks: 0,
      needs_review: 0,
      avgConfidence: 0,
    };
  }

  const payload = factInserts.map(({ __text, page_number, section, ...rest }) => {
    void __text;
    void page_number;
    void section;
    return rest;
  });
  const { data: factRows, error: factErr } = await admin
    .from("knowledge_facts")
    .insert(payload)
    .select("id,needs_review,confidence_score");
  if (factErr) throw new Error(`Normalization write failed: ${factErr.message}`);

  // ---- CHUNK + EMBED ----
  const chunkDrafts: { factIndex: number; content: string }[] = [];
  factInserts.forEach((f, i) => {
    for (const piece of chunkText(f["__text"] as string, CHUNK_TARGET_CHARS)) {
      chunkDrafts.push({ factIndex: i, content: piece });
    }
  });

  const vectors = await embedTexts(chunkDrafts.map((c) => c.content));
  const chunkRows = chunkDrafts.map((c, i) => {
    const src = factInserts[c.factIndex]!;
    const fact = (factRows ?? [])[c.factIndex] as { id: string } | undefined;
    return {
      source_id: args.sourceId,
      extraction_id: src["extraction_id"] as string,
      fact_id: fact?.id ?? null,
      job_id: args.jobId,
      chunk_index: i,
      content: c.content,
      embedding: JSON.stringify(vectors[i]),
      embedding_model: EMBEDDING_MODEL,
      embedding_dims: EMBEDDING_DIMS,
      token_count: Math.ceil(c.content.length / 4),
      brand: args.brand,
      manufacturer: args.manufacturer,
      appliance_type: args.applianceType,
      model_number: args.modelNumber,
      model_family: args.modelFamily,
      component: (src["component"] as string | null) ?? null,
      error_code: (src["error_code"] as string | null) ?? null,
      symptom_tags: [src["symptom"], src["failure"]].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
      source_type: args.sourceType,
      source_authority: authority,
      origin,
      confidence_score: src["confidence_score"] as number,
      needs_review: src["needs_review"] as boolean,
      page_number: (src["page_number"] as number | null) ?? null,
      section: (src["section"] as string | null) ?? null,
    };
  });

  const { error: chunkErr } = await admin.from("knowledge_chunks").insert(chunkRows);
  if (chunkErr) throw new Error(`Chunk write failed: ${chunkErr.message}`);

  const needsReview = factInserts.filter((f) => f["needs_review"] === true).length;
  return {
    extractions: extractionRows.length,
    facts: factInserts.length,
    chunks: chunkRows.length,
    needs_review: needsReview,
    avgConfidence: Number((confSum / factInserts.length).toFixed(3)),
  };
}

void normalizedModelUnused;
function normalizedModelUnused() {}