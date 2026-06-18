import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { decodeSerial, pickBestCandidate, computeAgeYears } from "./serial-decode.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAiUsage } from "./ai-usage-log.server";

const DecodeInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().min(1),
});

export const decodeAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecodeInput.parse(d))
  .handler(async ({ data, context }) => {
    const ruleResult = decodeSerial(data.brand, data.serialNumber);
    const gateway = getGateway();

    const candidateText = ruleResult.candidates.length
      ? ruleResult.candidates
          .map(
            (c, i) =>
              `[${i}] year=${c.year}${c.month ? `, month=${c.month}` : ""}${c.week ? `, week=${c.week}` : ""}`,
          )
          .join("\n")
      : "(no rule-based candidates available)";

    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({
        identified: z.boolean(),
        manufacturer: z.string(),
        applianceType: z.string().describe("e.g. Top-Load Washer, Side-by-Side Refrigerator."),
        platform: z.string().describe("Manufacturer's platform/family name if known (e.g. VMW, Direct Drive). Empty if unknown."),
        selectedCandidateIndex: z
          .number()
          .int()
          .nullable()
          .describe(
            "Index into the candidate list that best matches the model number's known production years. null if no candidates or you cannot decide.",
          ),
        confidence: z.enum(["High", "Medium", "Low", "Unknown"]),
        decodedBreakdown: z.string().describe("Plain-English explanation of how the serial was decoded."),
        notes: z.string().describe("Configuration notes or clarifying question for the technician if confidence is Low."),
      }),
      system: `You are a senior appliance technician decoding an appliance's data plate. Your ONLY job for the date is to pick the best candidate index from the rules-based decoder. NEVER invent a date or age — if no candidate fits, return selectedCandidateIndex=null.

Rules:
- The MODEL NUMBER is the strongest signal for appliance type and platform.
- selectedCandidateIndex MUST be an index into the provided candidate list, or null. Do not invent year values.
- If the candidate list is empty, set selectedCandidateIndex=null. Age will be reported as Unknown.
- Set confidence=High only when both the model is recognized AND a single candidate is unambiguous.
- If you cannot identify the appliance, set identified=false and ask a clarifying question in notes.
- Today's year is ${new Date().getFullYear()}.`,
      prompt: `Brand: ${data.brand}
Model Number: ${data.modelNumber}
Serial Number: ${data.serialNumber}

Rule-based decode (${ruleResult.family}):
${ruleResult.breakdown}

Candidate manufacture dates:
${candidateText}

Decide manufacturer, appliance type/configuration, and the index of the best candidate (or null).`,
    });

    await logAiUsage({ userId: context.userId, feature: "decode_appliance", model: DEFAULT_MODEL, usage });

    // Deterministic age computation — never AI-generated.
    let chosen = null as null | { year: number; month?: number };
    const idx = object.selectedCandidateIndex;
    if (idx != null && idx >= 0 && idx < ruleResult.candidates.length) {
      const c = ruleResult.candidates[idx];
      chosen = { year: c.year, month: c.month };
    } else if (ruleResult.candidates.length) {
      const c = pickBestCandidate(ruleResult.candidates);
      if (c) chosen = { year: c.year, month: c.month };
    }

    const manufactureDate = chosen
      ? {
          year: chosen.year,
          month: chosen.month ?? null,
          rangeStart: `${chosen.year}-${String(chosen.month ?? 1).padStart(2, "0")}`,
          rangeEnd: `${chosen.year}-${String(chosen.month ?? 12).padStart(2, "0")}`,
        }
      : null;
    const ageYears = chosen ? computeAgeYears(chosen.year, chosen.month) : null;

    // Server log for traceability.
    console.log(
      `[age-finder] manufacturer=${object.manufacturer || data.brand} model=${data.modelNumber} serial=${data.serialNumber} rule=${ruleResult.family} date=${manufactureDate ? `${manufactureDate.year}-${String(manufactureDate.month ?? "??").padStart(2, "0")}` : "unknown"} age=${ageYears != null ? `${ageYears.toFixed(1)}yr` : "unknown"}`,
    );

    return {
      identified: object.identified,
      manufacturer: object.manufacturer,
      applianceType: object.applianceType,
      platform: object.platform,
      confidence: chosen ? object.confidence : "Unknown",
      decodedBreakdown: object.decodedBreakdown,
      notes:
        chosen
          ? object.notes
          : object.notes ||
            "Could not decode a manufacture date from this serial. Please read the date code directly from the data plate.",
      manufactureDate,
      ageYears,
      brand: data.brand,
      modelNumber: data.modelNumber,
      serialNumber: data.serialNumber,
      ruleFamily: ruleResult.family,
      ruleBreakdown: ruleResult.breakdown,
    };
  });

const OcrInput = z.object({
  imageDataUrl: z.string().min(20).describe("data:image/...;base64,..."),
  brandHint: z.string().optional().default(""),
});

export const extractTagFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OcrInput.parse(d))
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({
        brand: z.string(),
        modelNumber: z.string(),
        serialNumber: z.string(),
        typeHints: z.string().describe("Any text on the tag suggesting appliance type/configuration."),
      }),
      system:
        "You read appliance data plates. Return fields EXACTLY as printed on the tag. If a field is not visible, return an empty string. Do not invent values.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Read this appliance data plate photo and extract brand, model number, and serial number.${data.brandHint ? ` Brand hint from technician: ${data.brandHint}.` : ""}`,
            },
            { type: "image_url", image_url: { url: data.imageDataUrl } } as never,
          ],
        },
      ],
    });
    await logAiUsage({ userId: context.userId, feature: "extract_tag_from_image", model: DEFAULT_MODEL, usage });
    return object;
  });