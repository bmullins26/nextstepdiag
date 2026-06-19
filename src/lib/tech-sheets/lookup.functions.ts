import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRUST_LABELS, type GroundingResult, type TechSheet } from "./types";

const Input = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  applianceType: z.string().optional().default(""),
});

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function rowToSheet(row: any): TechSheet {
  return {
    id: row.id,
    brand: row.brand,
    modelNumber: row.model_number,
    platformFamily: row.platform_family,
    sourceUrl: row.source_url,
    sourceType: row.source_type ?? "other",
    sourceTrust: (row.source_trust ?? "community") as TechSheet["sourceTrust"],
    contentMarkdown: row.content_markdown ?? "",
    faultCodes: row.fault_codes ?? [],
    testPoints: row.test_points ?? [],
    confidence: row.confidence,
    fetchedAt: row.fetched_at,
  };
}

function hostnameOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildResult(sheet: TechSheet, cacheHit: boolean): GroundingResult {
  let displayLabel = "";
  switch (sheet.confidence) {
    case "exact_model":
      displayLabel = hostnameOf(sheet.sourceUrl) || "Exact Model Service Literature";
      break;
    case "platform_family":
      displayLabel = `${sheet.platformFamily ?? "Platform"} Service Literature`;
      break;
    case "manufacturer_family":
      displayLabel = sheet.platformFamily ?? `${sheet.brand} ${sheet.modelNumber} Service Architecture`;
      break;
    case "low":
      displayLabel = "No verified service literature";
      break;
  }
  return {
    sheet,
    confidence: sheet.confidence,
    sourceTrust: sheet.confidence === "low" ? null : sheet.sourceTrust,
    sourceUrl: sheet.sourceUrl,
    sourceType: sheet.sourceType,
    platformFamily: sheet.platformFamily,
    displayLabel,
    trustLabel: sheet.confidence === "low" ? "" : TRUST_LABELS[sheet.sourceTrust],
    cacheHit,
  };
}

/**
 * Authoritative server fn for reading or fetching grounding data for an
 * appliance. Cache-aware: returns cached sheet when fresh, otherwise
 * triggers a Firecrawl-backed fetch and persists the result.
 */
export const getTechSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<GroundingResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const brand = data.brand.trim();
    const modelNumber = data.modelNumber.trim();
    const applianceType = data.applianceType?.trim() ?? "";

    // --- 1. cache check ---
    const { data: rows } = await supabaseAdmin
      .from("tech_sheets")
      .select("*")
      .ilike("brand", brand)
      .ilike("model_number", modelNumber)
      .order("fetched_at", { ascending: false })
      .limit(1);

    const cached = rows?.[0];
    if (cached) {
      const { freshnessWindowDays } = await import("./fetch.server");
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      const windowMs = freshnessWindowDays(cached.confidence) * 24 * 3600 * 1000;
      if (ageMs < windowMs) {
        const sheet = rowToSheet(cached);
        await logLookup(supabaseAdmin, context.userId, sheet, true, "hit");
        return buildResult(sheet, true);
      }
    }

    // --- 2. fetch ---
    const { fetchTechSheet } = await import("./fetch.server");
    const fresh = await fetchTechSheet({ brand, modelNumber, applianceType });

    // --- 3. upsert ---
    const { data: upserted, error: upErr } = await supabaseAdmin
      .from("tech_sheets")
      .upsert(
        {
          brand: fresh.brand,
          model_number: fresh.modelNumber,
          platform_family: fresh.platformFamily,
          source_url: fresh.sourceUrl,
          source_type: fresh.sourceType,
          source_trust: fresh.sourceTrust,
          content_markdown: fresh.contentMarkdown,
          fault_codes: fresh.faultCodes,
          test_points: fresh.testPoints,
          confidence: fresh.confidence,
          fetched_at: fresh.fetchedAt,
          created_by: context.userId,
        },
        { onConflict: "brand,model_number" },
      )
      .select("*")
      .maybeSingle();

    if (upErr) console.warn("[tech-sheets] upsert error:", upErr);

    const sheet = upserted ? rowToSheet(upserted) : fresh;
    const outcome = fresh.confidence === "low" ? "miss_low" : "miss_fetched";
    await logLookup(supabaseAdmin, context.userId, sheet, false, outcome);
    return buildResult(sheet, false);
  });

async function logLookup(
  supabaseAdmin: any,
  userId: string,
  sheet: TechSheet,
  cacheHit: boolean,
  outcome: string,
) {
  try {
    await supabaseAdmin.from("tech_sheet_lookups").insert({
      user_id: userId,
      brand: sheet.brand,
      model_number: sheet.modelNumber,
      outcome,
      cache_hit: cacheHit,
      confidence: sheet.confidence,
      source_trust: sheet.sourceTrust,
      source_url: sheet.sourceUrl,
    });
  } catch (err) {
    console.warn("[tech-sheets] lookup log failed:", err);
  }
}

// Silence unused import warning in case `normalize` is removed later
void normalize;