import type { EvidenceItem, EvidenceProvider, EvidenceQuery, EvidenceSourceType } from "../types";
import { priorityFor } from "../types";
import { AUTHORITY_WEIGHT, type KnowledgeAuthority } from "@/lib/knowledge/types";

/**
 * Knowledge Intelligence Engine → evidence engine bridge (Phase 1, step 6).
 *
 * Retrieval is additive: when the corpus is empty, or the flag is off, or the
 * search fails, these providers return [] and diagnostics behave exactly as
 * they did before the knowledge engine existed.
 *
 * Kill switch: set KNOWLEDGE_EVIDENCE_ENABLED=false (no code change needed).
 */
export function knowledgeEvidenceEnabled(): boolean {
  return (process.env["KNOWLEDGE_EVIDENCE_ENABLED"] ?? "true").toLowerCase() !== "false";
}

type Hit = {
  id: string;
  source_id: string;
  fact_id: string | null;
  content: string;
  brand: string | null;
  appliance_type: string | null;
  component: string | null;
  error_code: string | null;
  page_number: number | null;
  section: string | null;
  source_type: string;
  source_authority: KnowledgeAuthority;
  confidence_score: number;
  needs_review: boolean;
  similarity: number;
  score: number;
};

/**
 * One embedding + one RPC per diagnosis, shared by every knowledge-backed
 * provider. Short TTL so the parallel provider fan-out reuses a single call.
 */
const cache = new Map<string, { at: number; hits: Hit[] }>();
const TTL_MS = 60_000;

async function retrieve(q: EvidenceQuery): Promise<Hit[]> {
  if (!knowledgeEvidenceEnabled()) return [];
  const queryText = [q.complaint, q.errorCode, q.brand, q.applianceType, q.model]
    .filter(Boolean)
    .join(" ");
  if (queryText.trim().length < 3) return [];

  const key = queryText.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.hits;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedOne } = await import("@/lib/knowledge/embeddings.server");
    const embedding = await embedOne(queryText);
    const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(embedding),
      query_text: queryText,
      filter_brand: q.brand || null,
      filter_appliance_type: q.applianceType || null,
      filter_error_code: q.errorCode || null,
      // Never surface unreviewed AI output to a technician's diagnosis.
      include_pending: false,
      match_count: 12,
    } as any);
    if (error) throw new Error(error.message);
    const hits = ((data ?? []) as Hit[]).filter((h) => !h.needs_review);
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), hits });
    return hits;
  } catch (err) {
    console.warn("[evidence] knowledge retrieval failed", err);
    return [];
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? text;
  return line.slice(0, 220);
}

function toItem(h: Hit, sourceType: EvidenceSourceType): EvidenceItem {
  const authorityWeight = AUTHORITY_WEIGHT[h.source_authority] ?? 0.3;
  const where = [h.section, h.page_number ? `p.${h.page_number}` : null].filter(Boolean).join(" · ");
  return {
    id: `knowledge:${h.id}`,
    sourceType,
    title: where ? `Knowledge base — ${where}` : "Knowledge base entry",
    summary: firstLine(h.content),
    detail: h.content.slice(0, 900),
    // Ranking mirrors the retrieval score: authority × confidence × similarity.
    confidence: Math.min(
      0.95,
      Math.max(0.05, authorityWeight * h.confidence_score * Math.max(0.35, h.similarity)),
    ),
    lastUpdated: new Date().toISOString(),
    metadata: {
      knowledgeSourceId: h.source_id,
      factId: h.fact_id,
      knowledgeSourceType: h.source_type,
      authority: h.source_authority,
      component: h.component,
      errorCode: h.error_code,
      similarity: Number(h.similarity?.toFixed?.(3) ?? h.similarity),
    },
  };
}

const DOC_TYPES = new Set([
  "service_manual",
  "tech_sheet",
  "wiring_diagram",
  "error_code_doc",
  "parts_doc",
]);

/** External published repair references — their own evidence class. */
const EXTERNAL_TYPES = new Set(["external_repair_data"]);

/** Manufacturer-verified documentation chunks — highest evidence tier. */
export const knowledgeManufacturerDocProvider: EvidenceProvider = {
  sourceType: "manufacturer_doc",
  priority: priorityFor("manufacturer_doc"),
  async fetch(q) {
    const hits = await retrieve(q);
    return hits
      .filter((h) => DOC_TYPES.has(h.source_type) && h.source_authority === "manufacturer_verified")
      .slice(0, 5)
      .map((h) => toItem(h, "manufacturer_doc"));
  },
};

/** Non-OEM-verified service literature in the knowledge base. */
export const knowledgeServiceBulletinProvider: EvidenceProvider = {
  sourceType: "service_bulletin",
  priority: priorityFor("service_bulletin"),
  async fetch(q) {
    const hits = await retrieve(q);
    return hits
      .filter((h) => DOC_TYPES.has(h.source_type) && h.source_authority !== "manufacturer_verified")
      .slice(0, 5)
      .map((h) => toItem(h, "service_bulletin"));
  },
};

/** Normalized knowledge from confirmed repair records and technician notes. */
export const knowledgeRepairRecordProvider: EvidenceProvider = {
  sourceType: "verified_repair",
  priority: priorityFor("verified_repair"),
  async fetch(q) {
    const hits = await retrieve(q);
    return hits
      .filter((h) => !DOC_TYPES.has(h.source_type) && !EXTERNAL_TYPES.has(h.source_type))
      .slice(0, 5)
      .map((h) => toItem(h, "verified_repair"));
  },
};

/**
 * Retrieval bridge for externally published repair data. Kept separate from
 * manufacturer documentation and technician repair evidence on purpose.
 */
export async function knowledgeExternalRepairHits(q: EvidenceQuery): Promise<EvidenceItem[]> {
  const hits = await retrieve(q);
  return hits
    .filter((h) => EXTERNAL_TYPES.has(h.source_type))
    .slice(0, 5)
    .map((h) => {
      const item = toItem(h, "external_repair_guide");
      return { ...item, title: item.title.replace("Knowledge base", "External repair reference") };
    });
}
