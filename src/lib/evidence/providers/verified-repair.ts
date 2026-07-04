import type { EvidenceProvider } from "../types";
import { priorityFor } from "../types";
import { candidateModels, normalizeModel } from "@/lib/appliance/model-family";

export const verifiedRepairProvider: EvidenceProvider = {
  sourceType: "verified_repair",
  priority: priorityFor("verified_repair"),
  async fetch(q, { supabase }) {
    if (!q.brand || !q.complaint) return [];
    const cand = candidateModels(q.brand, q.model);
    const { data, error } = await supabase
      .from("diagnostic_outcomes")
      .select("id,manufacturer,model_number,appliance_type,complaint,recommended_failure,actual_failure,outcome,confirmed_at,created_at")
      .eq("outcome", "confirmed")
      .ilike("manufacturer", q.brand)
      .limit(200);
    if (error || !data) return [];

    type Row = {
      id: string;
      model_number: string | null;
      appliance_type: string | null;
      complaint: string | null;
      recommended_failure: string | null;
      created_at: string;
      confirmed_at: string | null;
    };
    const buckets = new Map<
      string,
      { count: number; latest: string; tier: "exact" | "family" | "brand_type" | "brand"; latestId: string }
    >();
    const complaintTokens = new Set(
      q.complaint.toLowerCase().split(/\W+/).filter((t) => t.length >= 4),
    );
    for (const r of data as unknown as Row[]) {
      const rc = (r.complaint ?? "").toLowerCase();
      const rTokens = rc.split(/\W+/).filter((t) => t.length >= 4);
      const matchC = rTokens.some((t) => complaintTokens.has(t));
      if (!matchC) continue;
      const rModel = normalizeModel(r.model_number ?? "");
      const rType = (r.appliance_type ?? "").trim().toLowerCase();
      const qType = q.applianceType.trim().toLowerCase();
      let tier: "exact" | "family" | "brand_type" | "brand" = "brand";
      if (rModel && rModel === cand.exact) tier = "exact";
      else if (rModel && rModel.startsWith(cand.familyStem) && cand.familyStem.length >= 3) tier = "family";
      else if (qType && rType === qType) tier = "brand_type";
      const key = (r.recommended_failure ?? "").trim();
      if (!key) continue;
      const prev = buckets.get(key);
      const latest = r.confirmed_at ?? r.created_at;
      if (!prev) {
        buckets.set(key, { count: 1, latest, tier, latestId: r.id });
      } else {
        prev.count += 1;
        if (latest > prev.latest) {
          prev.latest = latest;
          prev.latestId = r.id;
        }
        const order = ["brand", "brand_type", "family", "exact"];
        if (order.indexOf(tier) > order.indexOf(prev.tier)) prev.tier = tier;
      }
    }

    const tierWeight: Record<string, number> = { exact: 1, family: 0.8, brand_type: 0.55, brand: 0.3 };
    return Array.from(buckets.entries())
      .map(([failure, v]) => ({
        id: `verified_repair:${v.latestId}`,
        sourceType: "verified_repair" as const,
        title: failure,
        summary: `Confirmed by ${v.count} technician${v.count === 1 ? "" : "s"} (${v.tier.replace("_", " ")} match).`,
        confidence: Math.min(0.95, tierWeight[v.tier] * 0.6 + Math.min(v.count / 10, 0.35)),
        supportingVerifiedRepairCount: v.count,
        lastUpdated: v.latest,
        metadata: { failure, matchTier: v.tier, count: v.count },
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  },
};