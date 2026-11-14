import type { EvidenceProvider } from "../types";
import { priorityFor } from "../types";
import { normalizeBrand, normalizeModel } from "@/lib/appliance/model-family";

/** Approved aggregate patterns only: never reads raw imports or private notes. */
export const repairHistoryProvider: EvidenceProvider = {
  sourceType: "repair_history",
  priority: priorityFor("repair_history"),
  async fetch(q, { supabase }) {
    const modelKey = normalizeModel(q.model);
    const brandKey = normalizeBrand(q.brand);
    if (!modelKey || !brandKey) return [];
    const { data, error } = await supabase.from("model_repair_aggregates").select("*")
      .eq("brand_key", brandKey).eq("model_key", modelKey).maybeSingle();
    if (error || !data) return [];
    const findings: unknown[] = Array.isArray(data.findings) ? data.findings.slice(0, 4) : [];
    return findings.flatMap((value, index) => {
      if (!value || typeof value !== "object") return [];
      const pattern = value as Record<string, unknown>;
      if (typeof pattern.label !== "string" || typeof pattern.count !== "number") return [];
      return [{
        id: `repair_history:${data.id}:${index}`,
        sourceType: "repair_history" as const,
        title: pattern.label,
        summary: `Observed in ${pattern.count} approved exact-model service record${pattern.count === 1 ? "" : "s"}. Historical correlation, not proof of causation.`,
        confidence: Math.min(0.65, 0.25 + Number(pattern.count) * 0.04),
        supportingVerifiedRepairCount: data.confirmed_success_count,
        lastUpdated: data.updated_at,
        metadata: {
          matchTier: "exact",
          recordCount: pattern.count,
          serviceCallCount: data.service_call_count,
          confirmedSuccessCount: data.confirmed_success_count,
          reportedSuccessCount: data.reported_success_count,
          historicalRecordCount: data.historical_record_count,
          liveRecordCount: data.live_record_count,
          model: data.model_display,
        },
      }];
    });
  },
};
