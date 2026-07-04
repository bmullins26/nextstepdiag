import type { EvidenceProvider } from "../types";
import { priorityFor } from "../types";

export const techSheetProvider: EvidenceProvider = {
  sourceType: "tech_sheet",
  priority: priorityFor("tech_sheet"),
  async fetch(q) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("tech_sheets")
        .select("*")
        .ilike("brand", q.brand)
        .ilike("model_number", q.model)
        .order("fetched_at", { ascending: false })
        .limit(1);
      const row: any = rows?.[0];
      if (!row) return [];
      const confMap: Record<string, number> = {
        exact_model: 0.9,
        platform_family: 0.7,
        manufacturer_family: 0.45,
        low: 0.2,
      };
      const trustBonus =
        row.source_trust === "oem" ? 0.05 : row.source_trust === "trusted_reference" ? 0.02 : 0;
      const conf = Math.min(0.95, (confMap[row.confidence as string] ?? 0.3) + trustBonus);
      return [
        {
          id: `tech_sheet:${row.id}`,
          sourceType: "tech_sheet",
          title: `${row.brand} ${row.model_number} service literature`,
          summary:
            row.confidence === "exact_model"
              ? "Exact-model service literature available."
              : row.confidence === "platform_family"
                ? `Platform-family literature (${row.platform_family ?? "family"}).`
                : "Manufacturer-family architecture reference.",
          detail: (row.content_markdown as string | null)?.slice(0, 800) ?? undefined,
          confidence: conf,
          lastUpdated: row.fetched_at as string,
          link: (row.source_url as string | null) ?? undefined,
          metadata: {
            confidence: row.confidence,
            sourceTrust: row.source_trust,
            platformFamily: row.platform_family,
          },
        },
      ];
    } catch {
      return [];
    }
  },
};