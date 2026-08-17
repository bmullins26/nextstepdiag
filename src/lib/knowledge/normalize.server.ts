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
  symptom: z.string().optional(),
  complaint: z.string().optional(),
  component: z.string().optional(),
  part: z.string().optional(),
  part_number: z.string().optional(),
  test: z.string().optional(),
  test_condition: z.string().optional(),
  expected_result: z.string().optional(),
  actual_result: z.string().optional(),
  failure: z.string().optional(),
  repair: z.string().optional(),
  resolution: z.string().optional(),
  error_code: z.string().optional(),
  diagnostic_step: z.string().optional(),
  confidence_score: z.number().min(0).max(1),
  confidence_reason: z.string(),
});

// NOTE: Gemini's structured-output compiler rejects array bounds on nested
// object schemas, so the cap is enforced in code instead of in the schema.
const ResultSchema = z.object({ facts: z.array(FactSchema) });
const MAX_FACTS_PER_SEGMENT = 40;

export type NormalizedFact = z.infer<typeof FactSchema>;

/** Models occasionally emit the literal string "null"/"n/a" for empty fields. */
function clean<T extends Record<string, unknown>>(fact: T): T {
  const out: Record<string, unknown> = { ...fact };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || /^(null|n\/a|na|none|unknown|not stated|not specified)$/i.test(t)) {
      delete out[k];
    } else {
      out[k] = t;
    }
  }
  return out as T;
}

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

  const facts = object.facts
    .slice(0, MAX_FACTS_PER_SEGMENT)
    .map((f) => clean(f))
    .filter((f) => Object.keys(f).length > 2);
  return { facts, model: DEFAULT_MODEL };
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