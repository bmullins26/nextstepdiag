import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAiUsage } from "./ai-usage-log.server";
import { decodeAge } from "./age-decoder";
import type { DecodeOutcome, Corroboration } from "./age-decoder";
import { resolveBrand } from "./age-decoder";
import { decodeSerial as legacyDecodeSerial, pickBestCandidate as legacyPick } from "./serial-decode.legacy";
import { lookupApplianceAgeWithCache } from "./appliance-age.functions";

const DecodeInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().min(1),
});

const DECODER_VERSION = "v3-homespy-grounded";

async function logAttempt(opts: {
  supabase: any;
  userId: string;
  decoderVersion: string;
  manufacturer: string;
  applianceType?: string | null;
  modelNumber: string;
  serialNumber: string;
  outcome:
    | { status: "ok"; ruleId: string; confidence: string; year: number; month: number | null }
    | { status: "unknown"; ruleId?: string | null; unknownReason: string };
}) {
  try {
    await opts.supabase.from("age_decode_attempts").insert({
      user_id: opts.userId,
      decoder_version: opts.decoderVersion,
      manufacturer: opts.manufacturer,
      appliance_type: opts.applianceType ?? null,
      model_number: opts.modelNumber,
      serial_number: opts.serialNumber,
      status: opts.outcome.status,
      confidence: opts.outcome.status === "ok" ? opts.outcome.confidence : null,
      rule_id: opts.outcome.status === "ok" ? opts.outcome.ruleId : opts.outcome.ruleId ?? null,
      manufacture_year: opts.outcome.status === "ok" ? opts.outcome.year : null,
      manufacture_month: opts.outcome.status === "ok" ? opts.outcome.month : null,
      unknown_reason: opts.outcome.status === "unknown" ? opts.outcome.unknownReason : null,
    });
  } catch (e) {
    console.warn("[age-finder] failed to log decode attempt:", e);
  }
}

/** Load cached corroboration for (brand, model) if it hasn't expired. */
async function loadCorroborationCache(
  supabase: any,
  brandKey: string,
  modelNumber: string,
): Promise<Corroboration | null> {
  try {
    const { data, error } = await supabase
      .from("age_decode_corroborations")
      .select("query, hits, year_scores, expires_at")
      .eq("brand_key", brandKey)
      .eq("model_number", modelNumber)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return {
      used: true,
      cached: true,
      query: data.query,
      hits: data.hits ?? [],
      yearBoosts: data.year_scores ?? {},
    };
  } catch {
    return null;
  }
}

async function saveCorroborationCache(
  brandKey: string,
  modelNumber: string,
  c: Corroboration,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bestTrust = c.hits.reduce<string | null>((best, h) => {
      const rank = { oem: 3, trusted_reference: 2, community: 1 } as const;
      const r = rank[h.trust as keyof typeof rank] ?? 0;
      const b = best ? rank[best as keyof typeof rank] ?? 0 : 0;
      return r > b ? h.trust : best;
    }, null);
    await supabaseAdmin
      .from("age_decode_corroborations")
      .upsert(
        {
          brand_key: brandKey,
          model_number: modelNumber,
          query: c.query ?? "",
          hits: c.hits,
          year_scores: c.yearBoosts,
          source_count: c.hits.length,
          best_trust: bestTrust,
          expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: "brand_key,model_number" },
      );
  } catch (e) {
    console.warn("[age-decoder] failed to cache corroboration:", e);
  }
}

export const decodeAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecodeInput.parse(d))
  .handler(async ({ data, context }) => {
    // === Primary provider: Appliance Age Finder API (cache-first) ===
    const brandKeyForApi = resolveBrand(data.brand) ?? data.brand.toLowerCase();
    const apiLookup = await lookupApplianceAgeWithCache({
      supabase: context.supabase,
      userId: context.userId,
      brand: data.brand,
      brandKey: brandKeyForApi,
      modelNumber: data.modelNumber,
      serialNumber: data.serialNumber,
    });

    // 1) First pass: deterministic decode with no corroboration.
    let outcome: DecodeOutcome = decodeAge({
      brand: data.brand,
      model: data.modelNumber,
      serial: data.serialNumber,
    });

    // 2) If we have >1 candidate (or a single low-confidence one), corroborate
    //    via cached evidence or Firecrawl search.
    const brandKey = resolveBrand(data.brand) ?? data.brand.toLowerCase();
    const candidateYears = outcome.candidates.map((c) => c.year);
    const shouldCorroborate =
      candidateYears.length >= 1 &&
      (outcome.candidates.length > 1 || outcome.confidencePercent < 65) &&
      candidateYears.length <= 8; // sanity cap

    if (shouldCorroborate) {
      let corroboration = await loadCorroborationCache(
        context.supabase,
        brandKey,
        data.modelNumber,
      );
      if (!corroboration) {
        const { corroborateAge } = await import("./age-decoder/corroborate.server");
        corroboration = await corroborateAge({
          brandKey,
          modelNumber: data.modelNumber,
          candidateYears,
        });
        if (corroboration.used && corroboration.hits.length) {
          await saveCorroborationCache(brandKey, data.modelNumber, corroboration);
        }
      }
      // Re-run decode with corroboration injected.
      outcome = decodeAge({
        brand: data.brand,
        model: data.modelNumber,
        serial: data.serialNumber,
        corroboration,
      });
    }

    // 2) AI only describes the appliance — never sees or returns dates/ages.
    const gateway = getGateway();
    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({
        identified: z.boolean(),
        manufacturer: z.string(),
        applianceType: z.string().describe("e.g. Top-Load Washer, Side-by-Side Refrigerator."),
        platform: z.string().describe("Manufacturer's platform/family name if known (e.g. VMW, Direct Drive). Empty if unknown."),
        notes: z.string().describe("Configuration notes or clarifying question for the technician."),
      }),
      system: `You are a senior appliance technician describing an appliance from its data plate.

SAFETY RULE: You MUST NOT state, guess, infer, or imply a manufacture year, manufacture date, or appliance age. The age decoder is a separate deterministic system. Never include a year or age in any field. If asked about age, write: "see age decoder result".

Identify the manufacturer (normalize the brand name), appliance type, and platform/family. If you cannot identify the appliance, set identified=false and ask a clarifying question in notes.`,
      prompt: `Brand: ${data.brand}
Model Number: ${data.modelNumber}
Serial Number: ${data.serialNumber}

Identify the appliance. Do not state any date or age.`,
    });
    await logAiUsage({ userId: context.userId, feature: "decode_appliance", model: DEFAULT_MODEL, usage });

    // 3) DEV comparison mode: run legacy decoder and log differences.
    if (process.env.NODE_ENV !== "production") {
      try {
        const legacy = legacyDecodeSerial(data.brand, data.serialNumber);
        const legacyChosen = legacyPick(legacy.candidates);
        const legacyYear = legacyChosen?.year ?? null;
        const newYear = outcome.status === "ok" ? outcome.manufactureYear : null;
        if (legacyYear !== newYear) {
          console.log(
            `[age-decoder/compare] brand=${data.brand} serial=${data.serialNumber} legacy=${legacyYear ?? "unknown"} new=${newYear ?? "unknown"} ruleId=${outcome.status === "ok" ? outcome.appliedRule.id : "n/a"}`,
          );
        }
        // Also log the legacy result row so success-rate-per-version can be charted.
        await logAttempt({
          supabase: context.supabase,
          userId: context.userId,
          decoderVersion: "v1-legacy",
          manufacturer: object.manufacturer || data.brand,
          applianceType: object.applianceType,
          modelNumber: data.modelNumber,
          serialNumber: data.serialNumber,
          outcome: legacyChosen
            ? {
                status: "ok",
                ruleId: legacy.family,
                confidence: "Legacy",
                year: legacyChosen.year,
                month: legacyChosen.month ?? null,
              }
            : { status: "unknown", unknownReason: "invalid_serial_format" },
        });
      } catch (e) {
        console.warn("[age-decoder/compare] legacy decoder threw:", e);
      }
    }

    // 4) Persist the v2 attempt.
    await logAttempt({
      supabase: context.supabase,
      userId: context.userId,
      decoderVersion: DECODER_VERSION,
      manufacturer: object.manufacturer || data.brand,
      applianceType: object.applianceType,
      modelNumber: data.modelNumber,
      serialNumber: data.serialNumber,
      outcome:
        outcome.status === "ok"
          ? {
              status: "ok",
              ruleId: outcome.appliedRule.id,
              confidence: outcome.confidence,
              year: outcome.manufactureYear,
              month: outcome.manufactureMonth,
            }
          : {
              status: "unknown",
              ruleId: outcome.appliedRule?.id ?? null,
              unknownReason: outcome.unknownReason,
            },
    });

    // 5) Build the response. PRIMARY provider = Appliance Age Finder API.
    //    Local decoder result is used only when the API failed (fallback).
    const localManufactureDate =
      outcome.status === "ok"
        ? {
            year: outcome.manufactureYear,
            month: outcome.manufactureMonth,
            rangeStart: `${outcome.manufactureYear}-${String(outcome.manufactureMonth ?? 1).padStart(2, "0")}`,
            rangeEnd: `${outcome.manufactureYear}-${String(outcome.manufactureMonth ?? 12).padStart(2, "0")}`,
          }
        : null;
    const localAgeYears = outcome.status === "ok" ? outcome.ageYears : null;

    const manufactureDate = apiLookup.ok && apiLookup.manufactureYear
      ? {
          year: apiLookup.manufactureYear,
          month: apiLookup.manufactureMonth,
          rangeStart: `${apiLookup.manufactureYear}-${String(apiLookup.manufactureMonth ?? 1).padStart(2, "0")}`,
          rangeEnd: `${apiLookup.manufactureYear}-${String(apiLookup.manufactureMonth ?? 12).padStart(2, "0")}`,
        }
      : localManufactureDate;
    const ageYears = apiLookup.ok && apiLookup.manufactureYear
      ? (Date.now() - new Date(apiLookup.manufactureYear, (apiLookup.manufactureMonth ?? 1) - 1, 1).getTime()) /
        (365.25 * 24 * 3600 * 1000)
      : localAgeYears;
    const appliedRule = outcome.appliedRule;

    console.log(
      `[age-finder] decoder=${DECODER_VERSION} manufacturer=${object.manufacturer || data.brand} model=${data.modelNumber} serial=${data.serialNumber} rule=${appliedRule?.id ?? "none"} status=${outcome.status} date=${manufactureDate ? `${manufactureDate.year}-${String(manufactureDate.month ?? "??").padStart(2, "0")}` : "unknown"} age=${ageYears != null ? `${ageYears.toFixed(1)}yr` : "unknown"}`,
    );

    return {
      identified: object.identified,
      manufacturer: object.manufacturer,
      applianceType: object.applianceType,
      platform: object.platform,
      confidence: outcome.confidence,
      confidencePercent: outcome.confidencePercent,
      decodedBreakdown: outcome.breakdown,
      notes:
        outcome.status === "ok"
          ? object.notes
          : object.notes ||
            "Could not decode a manufacture date from this serial. Please read the date code directly from the data plate.",
      manufactureDate,
      ageYears,
      ageProvider: apiLookup.ok
        ? {
            source: apiLookup.source ?? "appliance_age_api",
            cached: apiLookup.cached,
            manufactureYear: apiLookup.manufactureYear,
            manufactureMonth: apiLookup.manufactureMonth,
            confidencePercent: apiLookup.confidencePercent,
            alternativeYears: apiLookup.alternativeYears,
            description: apiLookup.description,
            responseTimeMs: apiLookup.responseTimeMs,
          }
        : {
            source: "local_fallback" as const,
            cached: false,
            manufactureYear: null,
            manufactureMonth: null,
            confidencePercent: null,
            alternativeYears: [],
            description: null,
            responseTimeMs: apiLookup.responseTimeMs,
            error: apiLookup.error ?? null,
          },
      brand: data.brand,
      modelNumber: data.modelNumber,
      serialNumber: data.serialNumber,
      ruleFamily: appliedRule?.family ?? "Unknown",
      ruleName: appliedRule?.name ?? "No rule matched",
      ruleBreakdown: outcome.breakdown,
      unknownReason: outcome.status === "unknown" ? outcome.unknownReason : null,
      candidates: outcome.candidates.map((c) => ({
        year: c.year,
        month: c.month ?? null,
        week: c.week ?? null,
        score: c.score ?? 0,
        sourceCount: c.sources?.length ?? 0,
      })),
      corroboration: outcome.corroboration
        ? {
            used: outcome.corroboration.used,
            cached: outcome.corroboration.cached,
            hitCount: outcome.corroboration.hits.length,
            sourceTypes: outcome.corroboration.sourceTypes ?? [],
            retailerSignal: outcome.corroboration.retailerSignal ?? null,
            hits: outcome.corroboration.hits.slice(0, 8),
          }
        : null,
    };
  });
