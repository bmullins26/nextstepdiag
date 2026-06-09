import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { decodeSerial } from "./serial-decode.server";

const DecodeInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().min(1),
});

const ManufactureDate = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional().nullable(),
  rangeStart: z.string().describe("YYYY-MM lower bound."),
  rangeEnd: z.string().describe("YYYY-MM upper bound."),
});

export const decodeAppliance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DecodeInput.parse(d))
  .handler(async ({ data }) => {
    const ruleResult = decodeSerial(data.brand, data.serialNumber);
    const gateway = getGateway();

    const candidateText = ruleResult.candidates.length
      ? ruleResult.candidates
          .map(
            (c, i) =>
              `${i + 1}. year=${c.year}${c.month ? `, month=${c.month}` : ""}${c.week ? `, week=${c.week}` : ""}`,
          )
          .join("\n")
      : "(no rule-based candidates — infer from model number knowledge)";

    const { object } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      mode: "json",
      schema: z.object({
        identified: z.boolean(),
        manufacturer: z.string(),
        applianceType: z.string().describe("e.g. Top-Load Washer, Side-by-Side Refrigerator."),
        platform: z.string().describe("Manufacturer's platform/family name if known (e.g. VMW, Direct Drive). Empty if unknown."),
        manufactureDate: ManufactureDate,
        ageYears: z.number().describe("Approximate age in years from today."),
        confidence: z.enum(["High", "Medium", "Low", "Unknown"]),
        decodedBreakdown: z.string().describe("Plain-English explanation of how the serial was decoded (year code, week code, plant)."),
        notes: z.string().describe("Configuration notes or clarifying question for the technician if confidence is Low."),
      }),
      system: `You are a senior appliance technician decoding an appliance's data plate. You have a rules-based first pass; use it but verify with your knowledge of the model number.

Rules:
- The MODEL NUMBER is the strongest signal for appliance type and platform.
- Pick the most likely manufactureDate from the candidate list using the model number's known production years; if no candidates are given, infer from your knowledge.
- Always populate rangeStart/rangeEnd as YYYY-MM bounds reflecting your uncertainty.
- Set confidence=High only when both the model is recognized AND the year is unambiguous.
- If you cannot identify the appliance, set identified=false and ask a clarifying question in notes.
- Today's year is ${new Date().getFullYear()}.`,
      prompt: `Brand: ${data.brand}
Model Number: ${data.modelNumber}
Serial Number: ${data.serialNumber}

Rule-based decode (${ruleResult.family}):
${ruleResult.breakdown}

Candidate manufacture dates:
${candidateText}

Decide manufacturer, appliance type/configuration, the single most likely manufacture date, and confidence.`,
    });

    return {
      ...object,
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
  .inputValidator((d: unknown) => OcrInput.parse(d))
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const { object } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      mode: "json",
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
    return object;
  });