import type { EvidenceItem, EvidenceProvider, EvidenceQuery, EvidenceSourceType } from "../types";
import { INTERNAL_TIER_CODE, TIER_WEIGHT_CAP, internalTierFor, priorityFor } from "../types";
import {
  AUTHORITY_WEIGHT,
  MIN_APPROVED_HITS,
  MIN_APPROVED_SIMILARITY,
  type KnowledgeAuthority,
} from "@/lib/knowledge/types";

/**
 * Knowledge Intelligence Engine → evidence engine bridge.
 *
 * Approved knowledge is preferred. When it is insufficient, broader and
 * unreviewed material can inform the next test without blocking diagnosis.
 * Review state and tier codes remain server-side metadata only.
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
  review_status: "unreviewed" | "approved" | "rejected" | "quarantined";
  similarity: number;
  score: number;
  retrievalStage: 1 | 2;
  parent_source_authority?: KnowledgeAuthority | null;
};

export type KnowledgeRetrieval = {
  hits: Hit[];
  stage1Sufficient: boolean;
  fallbackUsed: boolean;
  topScore: number;
};

const EMPTY_RETRIEVAL: KnowledgeRetrieval = {
  hits: [],
  stage1Sufficient: false,
  fallbackUsed: false,
  topScore: 0,
};

/** One embedding and a shared retrieval result per diagnosis for 60 seconds. */
const cache = new Map<string, { at: number; result: KnowledgeRetrieval }>();
const TTL_MS = 60_000;

function dedupe(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = hit.fact_id ?? hit.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function usableHit(hit: Pick<Hit, "review_status">): boolean {
  return hit.review_status === "approved" || hit.review_status === "unreviewed";
}

async function retrieve(q: EvidenceQuery): Promise<KnowledgeRetrieval> {
  if (!knowledgeEvidenceEnabled()) return EMPTY_RETRIEVAL;
  const queryText = [q.complaint, q.errorCode, q.brand, q.applianceType, q.model]
    .filter(Boolean)
    .join(" ");
  if (queryText.trim().length < 3) return EMPTY_RETRIEVAL;

  const key = queryText.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.result;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedOne } = await import("@/lib/knowledge/embeddings.server");
    const embedding = await embedOne(queryText);
    const rpc = async (options: {
      includePending: boolean;
      model: boolean;
      errorCode: boolean;
      brand: boolean;
    }): Promise<Array<Omit<Hit, "retrievalStage" | "parent_source_authority">>> => {
      const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
        query_embedding: JSON.stringify(embedding),
        query_text: queryText,
        filter_brand: options.brand ? q.brand || null : null,
        filter_appliance_type: q.applianceType || null,
        filter_model_family: options.model ? q.model || null : null,
        filter_error_code: options.errorCode ? q.errorCode || null : null,
        include_pending: options.includePending,
        match_count: 24,
      } as any);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<Omit<Hit, "retrievalStage" | "parent_source_authority">>).filter(
        usableHit,
      );
    };

    const approved = dedupe(
      (await rpc({ includePending: false, model: true, errorCode: true, brand: true }))
        .filter((hit) => hit.review_status === "approved")
        .map((hit) => ({ ...hit, retrievalStage: 1 as const })),
    ).slice(0, 12);
    const stage1Sufficient =
      approved.filter((hit) => hit.similarity >= MIN_APPROVED_SIMILARITY).length >= MIN_APPROVED_HITS;

    let hits = approved;
    if (!stage1Sufficient) {
      const combined = [...approved];
      const stages = [
        { includePending: true, model: true, errorCode: true, brand: true },
        { includePending: true, model: false, errorCode: false, brand: true },
        { includePending: true, model: false, errorCode: false, brand: false },
      ];
      for (const stage of stages) {
        if (combined.length >= 6) break;
        try {
          const rows = await rpc(stage);
          const fallbackRows = rows
            .filter(
              (hit) =>
                hit.review_status === "approved" ||
                (hit.review_status === "unreviewed" && hit.source_type !== "external_repair_data"),
            )
            .map((hit) => ({ ...hit, retrievalStage: 2 as const }));
          for (const hit of dedupe([...combined, ...fallbackRows]).slice(combined.length)) {
            combined.push(hit);
            if (combined.length >= 6) break;
          }
        } catch (err) {
          console.warn("[evidence] fallback knowledge retrieval failed", err);
        }
      }
      hits = combined;
    }

    const sourceIds = [...new Set(hits.map((hit) => hit.source_id).filter(Boolean))];
    if (sourceIds.length) {
      try {
        const { data: sources, error } = await supabaseAdmin
          .from("knowledge_sources")
          .select("id, source_authority")
          .in("id", sourceIds);
        if (error) throw new Error(error.message);
        const authorityById = new Map(
          (sources ?? []).map((source) => [source.id, source.source_authority as KnowledgeAuthority]),
        );
        hits = hits.map((hit) => ({
          ...hit,
          parent_source_authority: authorityById.get(hit.source_id) ?? null,
        }));
      } catch (err) {
        console.warn("[evidence] knowledge source lookup failed", err);
      }
    }

    const result: KnowledgeRetrieval = {
      hits,
      stage1Sufficient,
      fallbackUsed: hits.some((hit) => hit.retrievalStage === 2 && hit.review_status === "unreviewed"),
      topScore: Math.max(0, ...hits.map((hit) => Number(hit.score) || 0)),
    };
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), result });
    return result;
  } catch (err) {
    console.warn("[evidence] knowledge retrieval failed", err);
    return EMPTY_RETRIEVAL;
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? text;
  return line.slice(0, 220);
}

function toItem(h: Hit, sourceType: EvidenceSourceType): EvidenceItem {
  const authorityWeight = AUTHORITY_WEIGHT[h.source_authority] ?? 0.3;
  const where = [h.section, h.page_number ? `p.${h.page_number}` : null].filter(Boolean).join(" · ");
  const calculated = Math.min(
    0.95,
    Math.max(0.05, authorityWeight * h.confidence_score * Math.max(0.35, h.similarity)),
  );
  return {
    id: `knowledge:${h.id}`,
    sourceType,
    title: where ? `Knowledge base — ${where}` : "Knowledge base entry",
    summary: firstLine(h.content),
    detail: h.content.slice(0, 900),
    confidence: Math.min(calculated, TIER_WEIGHT_CAP[sourceType]),
    lastUpdated: new Date().toISOString(),
    metadata: {
      knowledgeSourceId: h.source_id,
      factId: h.fact_id,
      knowledgeSourceType: h.source_type,
      authority: h.source_authority,
      component: h.component,
      errorCode: h.error_code,
      similarity: Number(h.similarity?.toFixed?.(3) ?? h.similarity),
      reviewStatus: h.review_status,
      internalTier: INTERNAL_TIER_CODE[sourceType],
      score: h.score,
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
const TECHNICIAN_REPORT_TYPES = new Set(["service_call", "technician_note", "other"]);
const EXTERNAL_TYPES = new Set(["external_repair_data"]);

/** Approved chunks whose parent source is manufacturer documentation. */
export const knowledgeManufacturerDocProvider: EvidenceProvider = {
  sourceType: "manufacturer_doc",
  priority: priorityFor("manufacturer_doc"),
  async fetch(q) {
    const { hits } = await retrieve(q);
    return hits
      .filter(
        (h) =>
          h.review_status === "approved" &&
          DOC_TYPES.has(h.source_type) &&
          h.parent_source_authority === "manufacturer_verified",
      )
      .slice(0, 5)
      .map((h) => toItem(h, "manufacturer_doc"));
  },
};

/** Approved technical literature from non-manufacturer parent sources. */
export const knowledgeTechLiteratureProvider: EvidenceProvider = {
  sourceType: "tech_sheet",
  priority: priorityFor("tech_sheet"),
  async fetch(q) {
    const { hits } = await retrieve(q);
    return hits
      .filter(
        (h) =>
          h.review_status === "approved" &&
          DOC_TYPES.has(h.source_type) &&
          h.parent_source_authority !== "manufacturer_verified",
      )
      .slice(0, 5)
      .map((h) => toItem(h, "tech_sheet"));
  },
};

/** Approved normalized repair records only. */
export const knowledgeRepairRecordProvider: EvidenceProvider = {
  sourceType: "verified_repair",
  priority: priorityFor("verified_repair"),
  async fetch(q) {
    const { hits } = await retrieve(q);
    return hits
      .filter((h) => h.review_status === "approved" && h.source_type === "repair_record")
      .slice(0, 5)
      .map((h) => toItem(h, "verified_repair"));
  },
};

/** Approved technician-entered reports, distinct from repair records. */
export const knowledgeTechnicianReportedProvider: EvidenceProvider = {
  sourceType: "technician_reported",
  priority: priorityFor("technician_reported"),
  async fetch(q) {
    const { hits } = await retrieve(q);
    return hits
      .filter((h) => h.review_status === "approved" && TECHNICIAN_REPORT_TYPES.has(h.source_type))
      .slice(0, 5)
      .map((h) => toItem(h, "technician_reported"));
  },
};

/** Approved externally published repair references only. */
export async function knowledgeExternalRepairHits(q: EvidenceQuery): Promise<EvidenceItem[]> {
  const { hits } = await retrieve(q);
  return hits
    .filter((h) => h.review_status === "approved" && EXTERNAL_TYPES.has(h.source_type))
    .slice(0, 5)
    .map((h) => {
      const item = toItem(h, "external_repair_guide");
      return { ...item, title: item.title.replace("Knowledge base", "External repair reference") };
    });
}

/** Lower-weight fallback used only when approved retrieval is insufficient. */
export const knowledgeFallbackProvider: EvidenceProvider = {
  sourceType: "fallback_unreviewed",
  priority: priorityFor("fallback_unreviewed"),
  async fetch(q) {
    const { hits } = await retrieve(q);
    return hits
      .filter((h) => h.retrievalStage === 2 && h.review_status === "unreviewed")
      .slice(0, 5)
      .map((h) => toItem(h, "fallback_unreviewed"));
  },
};

export function computeEvidenceThin(
  retrieval: Pick<KnowledgeRetrieval, "stage1Sufficient" | "topScore">,
  evidence: EvidenceItem[],
): boolean {
  const hasStrongItem = evidence.some((item) => /^T[1-3]_/.test(internalTierFor(item)));
  return (!retrieval.stage1Sufficient && retrieval.topScore < 0.45) || !hasStrongItem;
}

/** Server-only audit summary; reuses the retrieval cache populated by providers. */
export async function knowledgeEvidenceAudit(q: EvidenceQuery, evidence: EvidenceItem[]) {
  const retrieval = await retrieve(q);
  return {
    stage1Sufficient: retrieval.stage1Sufficient,
    fallbackUsed: retrieval.fallbackUsed,
    evidenceThin: computeEvidenceThin(retrieval, evidence),
  };
}
