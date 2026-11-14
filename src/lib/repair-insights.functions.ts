import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBrand, normalizeModel } from "@/lib/appliance/model-family";

export type RepairPattern = { label: string; count: number };

export type RepairInsightsData = {
  repair_count: number;
  top_failures: string[];
  top_repairs: string[];
  top_parts: string[];
  confidence_score: number;
  brand: string;
  model: string;
  applianceType: string;
  matchTier: "exact_model";
  historicalRecordCount: number;
  liveRecordCount: number;
  confirmedSuccessCount: number;
  reportedSuccessCount: number;
  pendingCount: number;
  unsuccessfulCount: number;
  otherOutcomeCount: number;
  evidenceStrength: "limited" | "moderate" | "strong";
  complaints: RepairPattern[];
  findings: RepairPattern[];
  errorCodes: RepairPattern[];
  partsInstalled: RepairPattern[];
  repairActions: RepairPattern[];
  confirmationTests: RepairPattern[];
  updatedAt: string;
};

export type RepairInsightsResult =
  | { enabled: false }
  | { enabled: true; available: false }
  | { enabled: true; available: true; data: RepairInsightsData };

function patterns(value: unknown): RepairPattern[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.label === "string" && typeof row.count === "number"
      ? [{ label: row.label, count: row.count }]
      : [];
  });
}

export const getRepairInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    model: z.string().trim().min(1).max(64),
    brand: z.string().trim().max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<RepairInsightsResult> => {
    if (process.env.FORCE_DISABLE_REPAIR_INSIGHTS === "true") return { enabled: false };
    const modelKey = normalizeModel(data.model);
    if (!modelKey) return { enabled: true, available: false };
    let query = context.supabase.from("model_repair_aggregates").select("*").eq("model_key", modelKey);
    if (data.brand) query = query.eq("brand_key", normalizeBrand(data.brand));
    const { data: rows, error } = await query.order("service_call_count", { ascending: false }).limit(data.brand ? 1 : 2);
    if (error) throw new Error(error.message);
    // Without a brand, never merge or guess across same-model different manufacturers.
    if (!rows?.length || (!data.brand && rows.length > 1)) return { enabled: true, available: false };
    const row = rows[0];
    const findings = patterns(row.findings);
    const actions = patterns(row.repair_actions);
    const parts = patterns(row.parts_installed);
    return {
      enabled: true,
      available: true,
      data: {
        repair_count: row.service_call_count,
        top_failures: findings.map((p) => p.label),
        top_repairs: actions.map((p) => p.label),
        top_parts: parts.map((p) => p.label),
        confidence_score: row.evidence_strength === "strong" ? 85 : row.evidence_strength === "moderate" ? 60 : 30,
        brand: row.brand_display,
        model: row.model_display,
        applianceType: row.appliance_type,
        matchTier: "exact_model",
        historicalRecordCount: row.historical_record_count,
        liveRecordCount: row.live_record_count,
        confirmedSuccessCount: row.confirmed_success_count,
        reportedSuccessCount: row.reported_success_count,
        pendingCount: row.pending_count,
        unsuccessfulCount: row.unsuccessful_count,
        otherOutcomeCount: row.other_outcome_count,
        evidenceStrength: row.evidence_strength === "strong" ? "strong" : row.evidence_strength === "moderate" ? "moderate" : "limited",
        complaints: patterns(row.complaints),
        findings,
        errorCodes: patterns(row.error_codes),
        partsInstalled: parts,
        repairActions: actions,
        confirmationTests: patterns(row.confirmation_tests),
        updatedAt: row.updated_at,
      },
    };
  });
