import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  detectColumnMapping,
  normalizeImportRecord,
  parseCsv,
  repairRecordKey,
  sha256,
  type ColumnMapping,
} from "./repair-intelligence";

export async function prepareImportRecords(rawCsv: string, mapping?: ColumnMapping) {
  const parsed = parseCsv(rawCsv);
  if (!parsed.headers.length) throw new Error("The CSV has no header row.");
  if (parsed.rows.length > 10000) throw new Error("Imports are limited to 10,000 rows per file.");
  const selectedMapping = mapping && Object.keys(mapping).length ? mapping : detectColumnMapping(parsed.headers);
  const records = parsed.rows.map((raw, index) => normalizeImportRecord(raw, selectedMapping, index + 2));
  const withHashes = await Promise.all(records.map(async (record) => ({ record, hash: await sha256(repairRecordKey(record)) })));
  const mapped = new Set(Object.values(selectedMapping));
  return {
    headers: parsed.headers,
    mapping: selectedMapping,
    unmappedColumns: parsed.headers.filter((header) => !mapped.has(header)),
    records: withHashes,
  };
}

export function toHistoryInsert(batchId: string, item: Awaited<ReturnType<typeof prepareImportRecords>>["records"][number]) {
  const r = item.record;
  return {
    batch_id: batchId,
    row_number: r.rowNumber,
    record_hash: item.hash,
    service_date: r.serviceDate,
    brand_raw: r.brandRaw,
    brand_display: r.brandDisplay,
    brand_key: r.brandKey,
    appliance_type_raw: r.applianceTypeRaw,
    appliance_type: r.applianceType,
    model_raw: r.modelRaw,
    model_display: r.modelDisplay,
    model_key: r.modelKey,
    complaint: r.complaint,
    findings: r.findings,
    error_codes: r.errorCodes,
    parts_ordered: r.partsOrdered,
    parts_installed: r.partsInstalled,
    part_numbers: r.partNumbers,
    repair_actions: r.repairActions,
    tests_performed: r.testsPerformed,
    operational_result: r.operationalResult,
    original_outcome: r.originalOutcome,
    normalized_outcome: r.normalizedOutcome,
    review_status: r.reviewStatus,
    source_verification_status: r.sourceVerificationStatus,
    source_url: r.sourceUrl,
    original_notes: r.originalNotes,
    original_record: r.originalRecord,
    unmapped_fields: r.unmappedFields,
    review_flags: r.reviewFlags,
  };
}

export async function refreshAggregates(
  supabaseAdmin: SupabaseClient<Database>,
  records: Array<{ brandKey: string; modelKey: string; reviewStatus: string }>,
) {
  const keys = new Set(records.filter((r) => r.reviewStatus === "approved" && r.brandKey && r.modelKey).map((r) => `${r.brandKey}:${r.modelKey}`));
  for (const key of keys) {
    const [brandKey, modelKey] = key.split(":");
    const { error } = await supabaseAdmin.rpc("refresh_model_repair_aggregate", { p_brand_key: brandKey, p_model_key: modelKey });
    if (error) throw new Error(`Aggregate refresh failed: ${error.message}`);
  }
}
