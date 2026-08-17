/**
 * Knowledge Intelligence Engine — shared, client-safe types.
 *
 * Provenance is server-authorized: the database never tries to guess whether a
 * write came from a human or from AI. Every fact/chunk carries an explicit
 * `origin` written by the server pipeline, and CHECK constraints stop an
 * AI-origin row from ever claiming verified authority.
 */

export const SOURCE_TYPES = [
  "service_manual",
  "tech_sheet",
  "wiring_diagram",
  "error_code_doc",
  "parts_doc",
  "technician_note",
  "repair_record",
  "service_call",
  "community_thread",
  "other",
] as const;
export type KnowledgeSourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_AUTHORITIES = [
  "manufacturer_verified",
  "technician_verified_repair",
  "technician_entered",
  "reviewed_normalized",
  "ai_extracted_pending_review",
  "ai_inference",
] as const;
export type KnowledgeAuthority = (typeof SOURCE_AUTHORITIES)[number];

export const AUTHORITY_WEIGHT: Record<KnowledgeAuthority, number> = {
  manufacturer_verified: 1.0,
  technician_verified_repair: 0.9,
  technician_entered: 0.75,
  reviewed_normalized: 0.6,
  ai_extracted_pending_review: 0.3,
  ai_inference: 0.15,
};

export const AUTHORITY_LABEL: Record<KnowledgeAuthority, string> = {
  manufacturer_verified: "Manufacturer verified",
  technician_verified_repair: "Verified technician repair",
  technician_entered: "Technician entered",
  reviewed_normalized: "Reviewed knowledge",
  ai_extracted_pending_review: "AI extracted — pending review",
  ai_inference: "AI inference",
};

export type KnowledgeOrigin = "human" | "ai_extraction" | "ai_inference";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review";

/** Embedding model verified live against the Lovable AI Gateway (3072 dims). */
export const EMBEDDING_MODEL = "google/gemini-embedding-001";
export const EMBEDDING_DIMS = 3072;
/** Gemini embeddings cap at 2048 tokens per input and 100 inputs per batch. */
export const EMBEDDING_BATCH_MAX = 100;
export const CHUNK_TARGET_CHARS = 1100;
export const CHUNK_OVERLAP_CHARS = 150;

/** Facts at or above this confidence skip the review queue. */
export const AUTO_CLEAR_CONFIDENCE = 0.82;

export type KnowledgeSourceRow = {
  id: string;
  source_type: KnowledgeSourceType;
  source_authority: KnowledgeAuthority;
  title: string;
  manufacturer: string | null;
  brand: string | null;
  appliance_type: string | null;
  model_number: string | null;
  model_family: string | null;
  source_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  content_hash: string | null;
  ref_table: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeJobRow = {
  id: string;
  source_id: string;
  status: JobStatus;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processing_error: string | null;
  extraction_method: string | null;
  extraction_confidence: number | null;
  embedding_model: string | null;
  attempt_count: number;
  stats: Record<string, unknown>;
  created_at: string;
};

export type KnowledgeExtractionRow = {
  id: string;
  source_id: string;
  job_id: string | null;
  page_number: number | null;
  section: string | null;
  heading: string | null;
  text: string;
  tables: unknown[];
  ocr_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type KnowledgeFactRow = {
  id: string;
  source_id: string;
  extraction_id: string | null;
  brand: string | null;
  manufacturer: string | null;
  appliance_type: string | null;
  model_number: string | null;
  model_family: string | null;
  symptom: string | null;
  complaint: string | null;
  component: string | null;
  part: string | null;
  part_number: string | null;
  test: string | null;
  test_condition: string | null;
  expected_result: string | null;
  actual_result: string | null;
  failure: string | null;
  repair: string | null;
  resolution: string | null;
  error_code: string | null;
  diagnostic_step: string | null;
  notes: string | null;
  source_authority: KnowledgeAuthority;
  origin: KnowledgeOrigin;
  origin_actor: string | null;
  confidence_score: number;
  confidence_reason: string | null;
  needs_review: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  superseded_by: string | null;
  created_at: string;
};

export type KnowledgeSearchHit = {
  id: string;
  source_id: string;
  fact_id: string | null;
  extraction_id: string | null;
  content: string;
  brand: string | null;
  appliance_type: string | null;
  model_family: string | null;
  component: string | null;
  error_code: string | null;
  page_number: number | null;
  section: string | null;
  source_type: KnowledgeSourceType;
  source_authority: KnowledgeAuthority;
  origin: KnowledgeOrigin;
  confidence_score: number;
  needs_review: boolean;
  similarity: number;
  score: number;
};

/** Split long text into embeddable chunks, never dropping any content. */
export function chunkText(
  text: string,
  target = CHUNK_TARGET_CHARS,
  overlap = CHUNK_OVERLAP_CHARS,
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];

  const paragraphs = clean.split(/\n{2,}/);
  const out: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = "";
  };

  for (const p of paragraphs) {
    if (p.length > target) {
      flush();
      // Hard-split oversized paragraphs with overlap so nothing is lost.
      for (let i = 0; i < p.length; i += target - overlap) {
        out.push(p.slice(i, i + target).trim());
        if (i + target >= p.length) break;
      }
      continue;
    }
    if ((buf + "\n\n" + p).length > target) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  return out.filter(Boolean);
}