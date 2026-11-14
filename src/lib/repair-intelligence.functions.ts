import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwner } from "@/lib/owner-admin.server";
import { prepareImportRecords, refreshAggregates, toHistoryInsert } from "./repair-intelligence.server";
import { IMPORT_FIELDS, latestLiveOutcomes, REPAIR_OUTCOMES, sha256, type ColumnMapping } from "./repair-intelligence";

const MappingSchema = z.record(z.string(), z.string()).transform((value) => {
  const result: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) if (value[field]) result[field] = value[field];
  return result;
});

function publicPreview(item: Awaited<ReturnType<typeof prepareImportRecords>>["records"][number]) {
  return {
    rowNumber: item.record.rowNumber,
    brand: item.record.brandDisplay,
    model: item.record.modelDisplay,
    complaint: item.record.complaint,
    outcome: item.record.normalizedOutcome,
    reviewStatus: item.record.reviewStatus,
    reviewFlags: item.record.reviewFlags,
    recordHash: item.hash,
  };
}

export const previewRepairImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    fileName: z.string().trim().min(1).max(255),
    rawCsv: z.string().min(1).max(5_000_000),
    mapping: MappingSchema.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const prepared = await prepareImportRecords(data.rawCsv, data.mapping);
    const fileHash = await sha256(data.rawCsv);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("repair_import_batches")
      .select("id,status,total_rows,imported_rows,duplicate_rows,review_rows")
      .eq("owner_id", context.userId)
      .eq("file_sha256", fileHash)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let batchId = existing?.id;
    if (!batchId) {
      const { data: batch, error } = await supabaseAdmin.from("repair_import_batches").insert({
        owner_id: context.userId,
        file_name: data.fileName,
        file_sha256: fileHash,
        raw_csv: data.rawCsv,
        status: "preview",
        headers: prepared.headers,
        column_mapping: prepared.mapping,
        unmapped_columns: prepared.unmappedColumns,
        total_rows: prepared.records.length,
        review_rows: prepared.records.filter((r) => r.record.reviewStatus === "pending").length,
      }).select("id").single();
      if (error) throw new Error(error.message);
      batchId = batch.id;
    }

    const withinFileDuplicates = prepared.records.length - new Set(prepared.records.map((r) => r.hash)).size;
    return {
      batchId,
      alreadyImported: existing?.status === "imported",
      fileName: data.fileName,
      headers: prepared.headers,
      mapping: prepared.mapping,
      unmappedColumns: prepared.unmappedColumns,
      totalRows: prepared.records.length,
      reviewRows: prepared.records.filter((r) => r.record.reviewStatus === "pending").length,
      withinFileDuplicates,
      preview: prepared.records.slice(0, 30).map(publicPreview),
    };
  });

export const importRepairHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid(), mapping: MappingSchema.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: batch, error: batchError } = await supabaseAdmin.from("repair_import_batches").select("*")
      .eq("id", data.batchId).eq("owner_id", context.userId).single();
    if (batchError || !batch) throw new Error("Import batch not found.");
    if (batch.status === "imported") return {
      batchId: batch.id,
      totalRows: batch.total_rows,
      importedRows: batch.imported_rows,
      duplicateRows: batch.duplicate_rows,
      reviewRows: batch.review_rows,
      alreadyImported: true,
    };

    await supabaseAdmin.from("repair_import_batches").update({ status: "importing", error_message: null }).eq("id", batch.id);
    try {
      const mapping = data.mapping ?? (batch.column_mapping as ColumnMapping);
      const prepared = await prepareImportRecords(batch.raw_csv, mapping);
      let inserted = 0;
      for (let offset = 0; offset < prepared.records.length; offset += 250) {
        const chunk = prepared.records.slice(offset, offset + 250);
        const { count, error } = await supabaseAdmin.from("repair_history_records").upsert(
          chunk.map((item) => toHistoryInsert(batch.id, item)),
          { onConflict: "record_hash", ignoreDuplicates: true, count: "exact" },
        );
        if (error) throw new Error(error.message);
        inserted += count ?? 0;
      }
      await refreshAggregates(supabaseAdmin, prepared.records.map((r) => r.record));
      const summary = {
        status: "imported",
        headers: prepared.headers,
        column_mapping: prepared.mapping,
        unmapped_columns: prepared.unmappedColumns,
        total_rows: prepared.records.length,
        imported_rows: inserted,
        duplicate_rows: prepared.records.length - inserted,
        review_rows: prepared.records.filter((r) => r.record.reviewStatus === "pending").length,
        completed_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from("repair_import_batches").update(summary).eq("id", batch.id);
      if (error) throw new Error(error.message);
      return {
        batchId: batch.id,
        totalRows: prepared.records.length,
        importedRows: inserted,
        duplicateRows: prepared.records.length - inserted,
        reviewRows: summary.review_rows,
        alreadyImported: false,
      };
    } catch (error) {
      await supabaseAdmin.from("repair_import_batches").update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Import failed",
      }).eq("id", batch.id);
      throw error;
    }
  });

export const getRepairIntelligenceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [recordsResult, liveResult, batchesResult] = await Promise.all([
      supabaseAdmin.from("repair_history_records").select("brand_display,appliance_type,model_display,normalized_outcome,review_status,record_hash").limit(50000),
      supabaseAdmin.from("diagnostic_outcomes").select("id,session_id,normalized_outcome,updated_at").order("updated_at", { ascending: false }).limit(50000),
      supabaseAdmin.from("repair_import_batches").select("id,file_name,status,total_rows,imported_rows,duplicate_rows,review_rows,unmapped_columns,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (recordsResult.error) throw new Error(recordsResult.error.message);
    if (liveResult.error) throw new Error(liveResult.error.message);
    if (batchesResult.error) throw new Error(batchesResult.error.message);
    const records = recordsResult.data ?? [];
    const live = latestLiveOutcomes(liveResult.data ?? []);
    const group = (key: "brand_display" | "appliance_type" | "model_display") => {
      const counts = new Map<string, number>();
      for (const row of records) {
        const label = row[key] || "Unspecified";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 12);
    };
    const countOutcome = (outcome: string) => records.filter((r) => r.normalized_outcome === outcome).length + live.filter((r) => r.normalized_outcome === outcome).length;
    return {
      importedRecords: records.length,
      liveRecords: live.length,
      confirmedSuccess: countOutcome("confirmed_success"),
      reportedSuccess: countOutcome("reported_success"),
      pending: countOutcome("diagnosed_pending_parts") + countOutcome("diagnosed_not_repaired"),
      unsuccessful: countOutcome("unsuccessful_repair"),
      reviewRequired: records.filter((r) => r.review_status === "pending").length,
      duplicates: (batchesResult.data ?? []).reduce((sum, b) => sum + b.duplicate_rows, 0),
      byBrand: group("brand_display"),
      byType: group("appliance_type"),
      byModel: group("model_display"),
      batches: batchesResult.data ?? [],
    };
  });

export const listRepairHistoryRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().max(100).optional(),
    reviewStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    let query = context.supabase.from("repair_history_records").select("id,batch_id,row_number,service_date,brand_display,model_display,appliance_type,complaint,normalized_outcome,review_status,source_verification_status,review_flags,created_at").order("created_at", { ascending: false }).limit(300);
    if (data.reviewStatus) query = query.eq("review_status", data.reviewStatus);
    if (data.search?.trim()) query = query.or(`brand_display.ilike.%${data.search.trim()}%,model_display.ilike.%${data.search.trim()}%,complaint.ilike.%${data.search.trim()}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRepairHistoryRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("repair_history_records").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row;
  });

export const reviewRepairHistoryRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    reviewStatus: z.enum(["pending", "approved", "rejected"]),
    sourceVerificationStatus: z.enum(["unverified", "verified", "rejected"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: before, error: readError } = await context.supabase.from("repair_history_records").select("brand_key,model_key").eq("id", data.id).single();
    if (readError) throw new Error(readError.message);
    const { error } = await context.supabase.from("repair_history_records").update({
      review_status: data.reviewStatus,
      source_verification_status: data.sourceVerificationStatus ?? "unverified",
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await refreshAggregates(supabaseAdmin, [{ brandKey: before.brand_key, modelKey: before.model_key, reviewStatus: "approved" }]);
    return { ok: true };
  });

export const REPAIR_OUTCOME_OPTIONS = REPAIR_OUTCOMES;
