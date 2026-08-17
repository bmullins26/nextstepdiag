import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "@/lib/ai-gateway.server";

/**
 * AI normalization stage. AI never becomes the authority for a diagnosis — it
 * only restructures material that already exists in an immutable extraction
 * row, and every fact it produces is stamped with an AI origin and capped at
 * `ai_extracted_pending_review` authority by the server pipeline.
 */

const FactSchema = z.object({
  symptom: z.string().nullable(),
  complaint: z.string().nullable(),
  component: z.string().nullable(),
  part: z.string().nullable(),
  part_number: z.string().nullable(),
  test: z.string().nullable(),
  test_condition: z.string().nullable(),
  expected_result: z.string().nullable(),
  actual_result: z.string().nullable(),
  failure: z.string().nullable(),
  repair: z.string().nullable(),
  resolution: z.string().nullable(),
  error_code: z.string().nullable(),
  diagnostic_step: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
  confidence_reason: z.string(),
});

const ResultSchema = z.object({ facts: z.array(FactSchema).max(40) });

export type NormalizedFact = z.infer<typeof FactSchema>;

const SYSTEM = `You normalize appliance service documentation and technician repair records into structured diagnostic facts.

Rules:
- Only restate information present in the supplied text. Never infer a repair the text does not support.
- One fact per distinct symptom/test/failure relationship. Leave a field null when the text does not state it.
- confidence_score reflects how explicitly the source states the relationship: 0.9+ only when component, test and outcome are all stated verbatim; below 0.6 when you are stitching together implied meaning.
- confidence_reason is one short sentence naming what the score is based on.
- Return an empty facts array when the text carries no diagnostic content (covers, legal notices, revision tables).`;

export async function normalizeToFacts(args: {
  brand?: string | null;
  applianceType?: string | null;
  model?: string | null;
  sourceLabel: string;
  text: string;
}): Promise<{ facts: NormalizedFact[]; model: string }> {
  const gateway = getGateway();
  const { object } = await generateObject({
    model: gateway(DEFAULT_MODEL),
    schema: ResultSchema,
    system: SYSTEM,
    prompt: [
      `Source: ${args.sourceLabel}`,
      `Brand: ${args.brand ?? "unknown"}`,
      `Appliance type: ${args.applianceType ?? "unknown"}`,
      `Model: ${args.model ?? "unknown"}`,
      "",
      "TEXT:",
      args.text,
    ].join("\n"),
  });

  return { facts: object.facts, model: DEFAULT_MODEL };
}

/** Human-readable one-line rendering of a fact, used as the chunk content. */
export function factToText(f: Partial<NormalizedFact> & Record<string, unknown>): string {
  const parts: string[] = [];
  const add = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(`${label}: ${v.trim()}`);
  };
  add("Symptom", f["symptom"]);
  add("Complaint", f["complaint"]);
  add("Error code", f["error_code"]);
  add("Component", f["component"]);
  add("Part", f["part"]);
  add("Part number", f["part_number"]);
  add("Test", f["test"]);
  add("Test condition", f["test_condition"]);
  add("Expected", f["expected_result"]);
  add("Actual", f["actual_result"]);
  add("Failure", f["failure"]);
  add("Repair", f["repair"]);
  add("Resolution", f["resolution"]);
  add("Diagnostic step", f["diagnostic_step"]);
  return parts.join("\n");
}