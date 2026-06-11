import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brand: z.string().min(1),
  applianceType: z.string().optional().default(""),
  modelNumber: z.string().optional().default(""),
  code: z.string().min(1),
});

export type ErrorCodeSource = { title: string; url: string };
export type ErrorCodeConfidence = "high" | "medium" | "low";

export type ErrorCodeResult = {
  id: string;
  brand: string;
  appliance_type: string;
  model_number: string;
  code: string;
  meaning: string;
  common_causes: string[];
  affected_components: string[];
  recommended_tests: string[];
  service_notes: string;
  confidence: ErrorCodeConfidence;
  sources: ErrorCodeSource[];
  cached_at: string;
};

const MAX_CACHE_AGE_DAYS = 90;

function isFresh(cachedAt: string): boolean {
  const ageMs = Date.now() - new Date(cachedAt).getTime();
  return ageMs < MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export const researchErrorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const brand = data.brand.trim();
    const applianceType = (data.applianceType ?? "").trim();
    const modelNumber = (data.modelNumber ?? "").trim();
    const code = data.code.trim();

    // 1) Cache check
    const { data: cached, error: cacheErr } = await context.supabase
      .from("error_code_cache")
      .select("*")
      .ilike("brand", brand)
      .ilike("appliance_type", applianceType)
      .ilike("model_number", modelNumber)
      .ilike("code", code)
      .maybeSingle();
    if (cacheErr) throw new Error(cacheErr.message);

    if (cached && isFresh(cached.cached_at)) {
      return {
        notFound: false as const,
        source: "cache" as const,
        result: cached as unknown as ErrorCodeResult,
      };
    }

    // 2) Research with Lovable AI
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI lookup is not configured.");

    const { generateObject } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");

    const ResearchSchema = z.object({
      meaning: z.string(),
      common_causes: z.array(z.string()),
      affected_components: z.array(z.string()),
      recommended_tests: z.array(z.string()),
      service_notes: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
    });

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "You are an expert appliance repair reference for service technicians.",
      "Research the given fault code using manufacturer service manuals, OEM tech sheets, and reputable repair sources (e.g. ApplianceJunk, RepairClinic, ApplianceBlog).",
      "Prefer model-specific meaning when a model number is provided. Codes can mean different things across model families on the same brand — do not guess from a generic table when the model is given.",
      "Set confidence='high' only when the result is supported by an OEM tech sheet or manufacturer service documentation.",
      "Set confidence='medium' for reputable third-party repair sources.",
      "Set confidence='low' when the code is uncertain, inferred from a related family, or cannot be confirmed.",
      "If the code truly cannot be identified, return meaning='Unknown' and confidence='low' with empty arrays.",
      "Each source must be a real, well-known URL (manufacturer site or established repair site). Do not invent URLs.",
      "Keep arrays concise: 3-6 items each. Service notes <= 3 sentences.",
    ].join(" ");

    const userPrompt = [
      `Brand: ${brand}`,
      applianceType ? `Appliance type: ${applianceType}` : "Appliance type: (not provided)",
      modelNumber ? `Model number: ${modelNumber}` : "Model number: (not provided)",
      `Error code: ${code}`,
    ].join("\n");

    let researched: z.infer<typeof ResearchSchema>;
    try {
      const { object } = await generateObject({
        model,
        schema: ResearchSchema,
        system,
        prompt: userPrompt,
      });
      researched = object;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/429/.test(message)) {
        throw new Error("Rate limited by AI service. Please retry shortly.");
      }
      if (/402/.test(message)) {
        throw new Error("AI credits exhausted. Add credits in workspace billing.");
      }
      throw new Error("AI research failed. Please try again.");
    }

    // 3) Persist with service role (cache for everyone)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const upsertRow = {
        brand,
        appliance_type: applianceType,
        model_number: modelNumber,
        code,
        meaning: researched.meaning,
        common_causes: researched.common_causes,
        affected_components: researched.affected_components,
        recommended_tests: researched.recommended_tests,
        service_notes: researched.service_notes,
        confidence: researched.confidence,
        sources: researched.sources,
        cached_at: new Date().toISOString(),
      };
      const { data: upserted, error: upErr } = await supabaseAdmin
        .from("error_code_cache")
        .upsert(upsertRow, {
          onConflict: "brand,appliance_type,model_number,code",
        })
        .select("*")
        .single();
      if (upErr) throw upErr;
      return {
        notFound: false as const,
        source: "fresh" as const,
        result: upserted as unknown as ErrorCodeResult,
      };
    } catch {
      // Persist failure shouldn't block the user — return the researched payload directly.
      return {
        notFound: false as const,
        source: "fresh" as const,
        result: {
          id: "uncached",
          brand,
          appliance_type: applianceType,
          model_number: modelNumber,
          code,
          ...researched,
          cached_at: new Date().toISOString(),
        } satisfies ErrorCodeResult,
      };
    }
  });