import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TestInput = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  serial: z.string().min(1),
});

/**
 * Server function that probes the Appliance Age Finder API with all 3 auth
 * methods and returns which one works. Used for diagnostics from the owner UI.
 */
export const testApplianceAgeApiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    // Owner-only diagnostic.
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) {
      throw new Error("Forbidden: owners only");
    }
    const { testApplianceAgeApi } = await import("./appliance-age-api.server");
    const r = await testApplianceAgeApi(data);
    return {
      success: r.success,
      statusCode: r.statusCode,
      rawResponse: JSON.stringify(r.rawResponse ?? null),
      authMethodUsed: r.authMethodUsed,
      attempts: r.attempts,
    };
  });

export type ApplianceAgeApiResult = {
  ok: boolean;
  source: "appliance_age_api" | "cache" | "local_fallback" | null;
  manufactureYear: number | null;
  manufactureMonth: number | null;
  confidencePercent: number | null;
  alternativeYears: Array<{ year: number; month: number | null; confidencePercent: number; fullDate: string | null }>;
  description: string | null;
  cached: boolean;
  responseTimeMs: number;
  statusCode: number;
  error?: string;
};

/**
 * Server-side helper (not a serverFn) — call from other server functions.
 * Implements the cache-first, API-second flow. On cache miss + API failure
 * returns ok=false and the caller falls back to the local decoder.
 */
export async function lookupApplianceAgeWithCache(opts: {
  supabase: any;
  userId: string;
  brand: string;
  brandKey: string;
  modelNumber: string;
  serialNumber: string;
}): Promise<ApplianceAgeApiResult> {
  const logEvent = async (
    event: "cache_hit" | "api_success" | "api_failure" | "fallback_used",
    extra: { source?: string; statusCode?: number; responseTimeMs?: number; error?: string } = {},
  ) => {
    try {
      await opts.supabase.from("appliance_age_api_log").insert({
        user_id: opts.userId,
        brand: opts.brand,
        model_number: opts.modelNumber,
        serial_number: opts.serialNumber,
        event,
        source: extra.source ?? null,
        status_code: extra.statusCode ?? null,
        response_time_ms: extra.responseTimeMs ?? null,
        error_message: extra.error ?? null,
      });
    } catch (e) {
      console.warn("[appliance-age] log insert failed:", e);
    }
  };

  // 1. Cache lookup (90-day TTL enforced by expires_at filter).
  try {
    const { data: cached } = await opts.supabase
      .from("appliance_age_api_cache")
      .select("*")
      .eq("brand_key", opts.brandKey)
      .eq("model_number", opts.modelNumber)
      .eq("serial_number", opts.serialNumber)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached && cached.success) {
      await logEvent("cache_hit", { source: "cache", statusCode: cached.status_code, responseTimeMs: 0 });
      return {
        ok: true,
        source: "cache",
        manufactureYear: cached.manufacture_year,
        manufactureMonth: cached.manufacture_month,
        confidencePercent: cached.confidence_percent,
        alternativeYears: cached.alternative_years ?? [],
        description: (cached.raw_response?.result?.decoded?.details?.description as string | undefined) ?? null,
        cached: true,
        responseTimeMs: 0,
        statusCode: cached.status_code,
      };
    }
  } catch (e) {
    console.warn("[appliance-age] cache lookup failed:", e);
  }

  // 2. Call API.
  const { callApplianceAgeApi } = await import("./appliance-age-api.server");
  const apiResult = await callApplianceAgeApi({
    make: opts.brand,
    model: opts.modelNumber,
    serial: opts.serialNumber,
  });

  if (apiResult.ok && apiResult.normalized) {
    // 3. Cache the result.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("appliance_age_api_cache")
        .upsert(
          {
            brand_key: opts.brandKey,
            model_number: opts.modelNumber,
            serial_number: opts.serialNumber,
            manufacture_year: apiResult.normalized.manufactureYear,
            manufacture_month: apiResult.normalized.manufactureMonth,
            confidence_percent: apiResult.normalized.confidencePercent,
            alternative_years: apiResult.normalized.alternativeYears,
            raw_response: apiResult.rawResponse as any,
            status_code: apiResult.statusCode,
            success: true,
            response_time_ms: apiResult.responseTimeMs,
            expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
          },
          { onConflict: "brand_key,model_number,serial_number" },
        );
    } catch (e) {
      console.warn("[appliance-age] cache upsert failed:", e);
    }

    await logEvent("api_success", {
      source: "appliance_age_api",
      statusCode: apiResult.statusCode,
      responseTimeMs: apiResult.responseTimeMs,
    });

    return {
      ok: true,
      source: "appliance_age_api",
      manufactureYear: apiResult.normalized.manufactureYear,
      manufactureMonth: apiResult.normalized.manufactureMonth,
      confidencePercent: apiResult.normalized.confidencePercent,
      alternativeYears: apiResult.normalized.alternativeYears,
      description: apiResult.normalized.description ?? null,
      cached: false,
      responseTimeMs: apiResult.responseTimeMs,
      statusCode: apiResult.statusCode,
    };
  }

  // 4. API failed.
  await logEvent("api_failure", {
    source: "appliance_age_api",
    statusCode: apiResult.statusCode,
    responseTimeMs: apiResult.responseTimeMs,
    error: apiResult.error,
  });
  await logEvent("fallback_used", { source: "local_fallback" });

  return {
    ok: false,
    source: null,
    manufactureYear: null,
    manufactureMonth: null,
    confidencePercent: null,
    alternativeYears: [],
    description: null,
    cached: false,
    responseTimeMs: apiResult.responseTimeMs,
    statusCode: apiResult.statusCode,
    error: apiResult.error,
  };
}