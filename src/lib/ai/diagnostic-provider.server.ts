// Diagnostic AI provider layer.
//
//   NextStep diagnostic session -> NextStep Knowledge retrieval -> PROVIDER -> NextStep response
//
// Providers only reason. NextStep owns diagnostic state, knowledge, provenance
// and verification.
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "../ai-gateway.server";
import { logAiUsage } from "../ai-usage-log.server";
import { applySafetyFramework } from "./safety";
import type {
  DiagnosticProviderName,
  DiagnosticProviderResult,
  DiagnosticStepOutput,
} from "./diagnostic-types";

export const StepSchema = z.object({
  done: z.boolean().describe("True only when you have enough evidence to name the most likely failure with confidence."),
  currentFindings: z.string().describe("One short sentence summarizing what's been ruled in/out so far."),
  mostLikelyFailure: z.string().describe("Best current hypothesis. Empty string only if there's truly nothing yet."),
  mostLikelyFailures: z.array(z.string()).describe("Top 2-3 ranked failure hypotheses, best first."),
  recommendedNextTest: z.string().describe("The specific physical test the tech should perform next."),
  nextQuestion: z.object({
    text: z.string().describe("ONE focused diagnostic question to ask the technician next. Empty if done=true."),
    choices: z.array(z.string()).describe("2-4 short answer choices. Empty if done=true."),
    allowFreeText: z.boolean().describe("True if the tech should also be able to type a measured value or note."),
  }),
});

export function resolveProvider(_requested?: DiagnosticProviderName | null): DiagnosticProviderName {
  return "lovable";
}

export interface DiagnosticStepRequest {
  system: string;
  prompt: string;
  /** Provenance-preserving evidence block from the NextStep Knowledge Engine. */
  provenance?: string;
  userId: string | null;
  sessionId?: string | null;
  feature: string;
  provider?: DiagnosticProviderName | null;
}

async function runLovable(req: DiagnosticStepRequest): Promise<DiagnosticStepOutput> {
  const gateway = getGateway();
  const { object, usage } = await generateObject({
    model: gateway(DEFAULT_MODEL),
    schema: StepSchema,
    system: req.system,
    prompt: req.provenance ? `${req.prompt}\n\n${req.provenance}` : req.prompt,
  });
  await logAiUsage({
    userId: req.userId,
    feature: req.feature,
    model: DEFAULT_MODEL,
    usage,
    provider: "lovable",
    sessionId: req.sessionId ?? null,
  });
  return object as DiagnosticStepOutput;
}

/** Runs one diagnostic reasoning step. */
export async function runDiagnosticStep(
  req: DiagnosticStepRequest,
): Promise<DiagnosticProviderResult> {
  const output = await runLovable(req);
  return {
    output: applySafetyFramework(output),
    provider: "lovable",
    requestedProvider: "lovable",
    providerError: null,
  };
}
