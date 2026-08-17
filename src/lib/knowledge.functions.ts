import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Knowledge Intelligence Engine — owner-facing server functions.
 *
 * Every write path is owner-gated here and executed with the admin client, so
 * provenance and authority are decided by the server, never by the caller.
 */

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listKnowledgeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sources, error } = await supabaseAdmin
      .from("knowledge_sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = (sources ?? []).map((s: any) => s.id);
    if (ids.length === 0) return { sources: [] as any[] };

    const [{ data: jobs }, { data: facts }, { data: chunks }] = await Promise.all([
      supabaseAdmin
        .from("knowledge_processing_jobs")
        .select("id,source_id,status,processing_error,extraction_confidence,stats,created_at")
        .in("source_id", ids)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("knowledge_facts").select("id,source_id,needs_review").in("source_id", ids),
      supabaseAdmin.from("knowledge_chunks").select("id,source_id").in("source_id", ids),
    ]);

    const latestJob = new Map<string, any>();
    for (const j of jobs ?? []) if (!latestJob.has(j.source_id)) latestJob.set(j.source_id, j);

    return {
      sources: (sources ?? []).map((s: any) => ({
        ...s,
        job: latestJob.get(s.id) ?? null,
        fact_count: (facts ?? []).filter((f: any) => f.source_id === s.id).length,
        pending_count: (facts ?? []).filter((f: any) => f.source_id === s.id && f.needs_review).length,
        chunk_count: (chunks ?? []).filter((c: any) => c.source_id === s.id).length,
      })),
    };
  });

export const getKnowledgeSourceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ sourceId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: source }, { data: jobs }, { data: extractions }, { data: facts }, { data: chunks }] =
      await Promise.all([
        supabaseAdmin.from("knowledge_sources").select("*").eq("id", data.sourceId).maybeSingle(),
        supabaseAdmin
          .from("knowledge_processing_jobs")
          .select("*")
          .eq("source_id", data.sourceId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("knowledge_extractions")
          .select("id,page_number,section,heading,text,created_at")
          .eq("source_id", data.sourceId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("knowledge_facts")
          .select("*")
          .eq("source_id", data.sourceId)
          .order("confidence_score", { ascending: false }),
        supabaseAdmin
          .from("knowledge_chunks")
          .select("id,fact_id,extraction_id,content,section,page_number,embedding_model,embedding_dims,confidence_score,needs_review,source_authority,origin")
          .eq("source_id", data.sourceId)
          .order("chunk_index", { ascending: true }),
      ]);

    if (!source) throw new Error("Source not found");
    return { source, jobs: jobs ?? [], extractions: extractions ?? [], facts: facts ?? [], chunks: chunks ?? [] };
  });

export const listReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("knowledge_facts")
      .select("*, knowledge_sources(title,source_type,source_authority)")
      .eq("needs_review", true)
      .is("superseded_by", null)
      .order("confidence_score", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return { facts: data ?? [] };
  });

/** Ingest one existing tech sheet by id — the Phase 1 first test path. */
export const ingestTechSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ techSheetId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestSource } = await import("@/lib/knowledge/pipeline.server");

    const { data: sheet, error } = await supabaseAdmin
      .from("tech_sheets")
      .select("*")
      .eq("id", data.techSheetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sheet) throw new Error("Tech sheet not found");

    const content = [
      (sheet as any).content_markdown ?? "",
      Array.isArray((sheet as any).fault_codes) && (sheet as any).fault_codes.length
        ? `\n\n## Fault codes\n${JSON.stringify((sheet as any).fault_codes, null, 2)}`
        : "",
      Array.isArray((sheet as any).test_points) && (sheet as any).test_points.length
        ? `\n\n## Test points\n${JSON.stringify((sheet as any).test_points, null, 2)}`
        : "",
    ]
      .join("")
      .trim();
    if (!content) throw new Error("This tech sheet has no stored content to ingest.");

    return ingestSource(supabaseAdmin as any, {
      source_type: "tech_sheet",
      // Manufacturer literature only counts as manufacturer-verified when the
      // fetch itself came from an OEM source.
      source_authority:
        (sheet as any).source_trust === "oem" ? "manufacturer_verified" : "technician_entered",
      title: `${(sheet as any).brand} ${(sheet as any).model_number} tech sheet`,
      brand: (sheet as any).brand,
      manufacturer: (sheet as any).brand,
      model_number: (sheet as any).model_number,
      source_url: (sheet as any).source_url,
      ref_table: "tech_sheets",
      ref_id: (sheet as any).id,
      metadata: {
        source_trust: (sheet as any).source_trust,
        platform_family: (sheet as any).platform_family,
        confidence: (sheet as any).confidence,
      },
      uploaded_by: context.userId,
      content,
    });
  });

/** Candidate tech sheets that have content and have not been ingested yet. */
export const listIngestCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sheets }, { data: outcomes }, { data: existing }] = await Promise.all([
      supabaseAdmin
        .from("tech_sheets")
        .select("id,brand,model_number,source_trust,confidence,fetched_at,content_markdown")
        .order("fetched_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("diagnostic_outcomes")
        .select("id,manufacturer,model_number,appliance_type,complaint,actual_failure,outcome,created_at")
        .eq("outcome", "confirmed")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("knowledge_sources").select("ref_id").not("ref_id", "is", null),
    ]);

    const ingested = new Set((existing ?? []).map((r: any) => r.ref_id));
    return {
      techSheets: (sheets ?? [])
        .filter((s: any) => (s.content_markdown ?? "").trim().length > 0)
        .map((s: any) => ({
          id: s.id,
          brand: s.brand,
          model_number: s.model_number,
          source_trust: s.source_trust,
          confidence: s.confidence,
          chars: (s.content_markdown ?? "").length,
          ingested: ingested.has(s.id),
        })),
      outcomes: (outcomes ?? []).map((o: any) => ({
        id: o.id,
        label: `${o.manufacturer} ${o.model_number} — ${o.complaint}`,
        failure: o.actual_failure,
        appliance_type: o.appliance_type,
        created_at: o.created_at,
        ingested: ingested.has(o.id),
      })),
    };
  });

/** Backfill a small, explicitly-sized sample of confirmed repair outcomes. */
export const ingestOutcomeSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(25).default(10), dryRun: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestSource } = await import("@/lib/knowledge/pipeline.server");

    const { data: existing } = await supabaseAdmin
      .from("knowledge_sources")
      .select("ref_id")
      .eq("ref_table", "diagnostic_outcomes");
    const done = new Set((existing ?? []).map((r: any) => r.ref_id));

    const { data: rows, error } = await supabaseAdmin
      .from("diagnostic_outcomes")
      .select("*")
      .eq("outcome", "confirmed")
      .order("created_at", { ascending: false })
      .limit(data.limit + done.size);
    if (error) throw new Error(error.message);

    const batch = (rows ?? []).filter((r: any) => !done.has(r.id)).slice(0, data.limit);

    if (data.dryRun) {
      return {
        dryRun: true,
        wouldIngest: batch.map((r: any) => ({
          id: r.id,
          label: `${r.manufacturer} ${r.model_number} — ${r.complaint}`,
          failure: r.actual_failure ?? r.recommended_failure,
        })),
        results: [] as any[],
      };
    }

    const results = [];
    for (const r of batch as any[]) {
      const content = [
        `## Confirmed technician repair`,
        `Brand: ${r.manufacturer}`,
        `Appliance: ${r.appliance_type}`,
        `Model: ${r.model_number}`,
        r.platform ? `Platform: ${r.platform}` : "",
        `Complaint: ${r.complaint}`,
        r.predicted_top_failure ? `Predicted failure: ${r.predicted_top_failure}` : "",
        `Confirmed failure: ${r.actual_failure ?? r.recommended_failure}`,
        r.confirming_test ? `Confirming test: ${r.confirming_test}` : "",
        r.part_replaced ? `Part replaced: ${r.part_replaced}` : "",
        typeof r.repair_successful === "boolean"
          ? `Repair successful: ${r.repair_successful ? "yes" : "no"}`
          : "",
        r.unusual_notes ? `Unusual notes: ${r.unusual_notes}` : "",
        r.public_notes ? `Technician notes: ${r.public_notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      try {
        const res = await ingestSource(supabaseAdmin as any, {
          source_type: "repair_record",
          source_authority: "technician_verified_repair",
          title: `${r.manufacturer} ${r.model_number} — ${r.complaint}`,
          brand: r.manufacturer,
          manufacturer: r.manufacturer,
          appliance_type: r.appliance_type,
          model_number: r.model_number,
          ref_table: "diagnostic_outcomes",
          ref_id: r.id,
          metadata: { outcome_id: r.id, session_id: r.session_id },
          uploaded_by: context.userId,
          content,
        });
        results.push({ id: r.id, ...res });
      } catch (e) {
        results.push({ id: r.id, status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { dryRun: false, wouldIngest: [] as any[], results };
  });

/** Owner review action — approve / reject a normalized fact. */
export const reviewKnowledgeFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        factId: z.string().uuid(),
        action: z.enum(["approved", "rejected"]),
        reason: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin
      .from("knowledge_facts")
      .select("*")
      .eq("id", data.factId)
      .maybeSingle();
    if (!before) throw new Error("Fact not found");

    if (data.action === "approved") {
      // Human review promotes AI output to reviewed knowledge. It never
      // reaches manufacturer/technician authority through review alone.
      await supabaseAdmin
        .from("knowledge_facts")
        .update({
          needs_review: false,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          source_authority: "reviewed_normalized",
        })
        .eq("id", data.factId);
      await supabaseAdmin
        .from("knowledge_chunks")
        .update({ needs_review: false, source_authority: "reviewed_normalized" })
        .eq("fact_id", data.factId);
    } else {
      await supabaseAdmin
        .from("knowledge_facts")
        .update({
          needs_review: true,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          superseded_by: data.factId,
        })
        .eq("id", data.factId);
      await supabaseAdmin.from("knowledge_chunks").delete().eq("fact_id", data.factId);
    }

    await supabaseAdmin.from("knowledge_review_log").insert({
      fact_id: data.factId,
      source_id: (before as any).source_id,
      reviewer_id: context.userId,
      action: data.action,
      before_state: before,
      reason: data.reason ?? null,
    });

    return { ok: true };
  });

/** Retrieval smoke test — hybrid search, independent of the diagnostic engine. */
export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        query: z.string().min(2).max(500),
        brand: z.string().max(80).optional().nullable(),
        applianceType: z.string().max(80).optional().nullable(),
        errorCode: z.string().max(40).optional().nullable(),
        includePending: z.boolean().default(false),
        limit: z.number().int().min(1).max(25).default(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedOne } = await import("@/lib/knowledge/embeddings.server");

    const embedding = await embedOne(data.query);
    const { data: hits, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(embedding),
      query_text: data.query,
      filter_brand: data.brand || null,
      filter_appliance_type: data.applianceType || null,
      filter_error_code: data.errorCode || null,
      include_pending: data.includePending,
      match_count: data.limit,
    } as any);
    if (error) throw new Error(error.message);
    return { hits: (hits ?? []) as any[] };
  });