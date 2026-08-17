// Diagnostic AI provider layer.
//
//   NextStep diagnostic session -> NextStep Knowledge retrieval -> PROVIDER -> NextStep response
//
// Providers only reason. NextStep owns diagnostic state, knowledge, provenance
// and verification. Jenova is additive: when disabled or failing, the existing
// Lovable AI Gateway provider handles the request exactly as before.
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
import {
  getJenovaConfig,
  getMappedJenovaSession,
  isJenovaConfigured,
  saveJenovaSessionMapping,
  sendJenovaMessage,
} from "./jenova.server";

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

export function resolveProvider(requested?: DiagnosticProviderName | null): DiagnosticProviderName {
  const cfg = getJenovaConfig();
  if (requested === "jenova") return isJenovaConfigured(cfg) ? "jenova" : "lovable";
  if (requested === "lovable") return "lovable";
  return cfg.enabled && isJenovaConfigured(cfg) ? "jenova" : "lovable";
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

const JENOVA_OUTPUT_CONTRACT = `
Respond with ONE JSON object and nothing else (no prose, no markdown fences):
{
  "done": boolean,
  "currentFindings": string,
  "mostLikelyFailure": string,
  "mostLikelyFailures": string[],
  "recommendedNextTest": string,
  "expectedResult": string,
  "resultInterpretation": string,
  "reasoning": string,
  "safetyWarning": string,
  "supportingEvidence": string[],
  "confidence": number,
  "nextQuestion": { "text": string, "choices": string[], "allowFreeText": boolean }
}
Rules for this JSON:
- Only cite connectors, pins, voltages, resistances or fault codes that appear in the supplied evidence.
- "supportingEvidence" must reference the supplied NextStep evidence entries by their SOURCE/TITLE. Never invent sources.
- Never present an inference as a technician-verified fact. Verified status is owned by NextStep, not by you.
- Keep "confidence" between 0 and 1 and lower it when evidence is thin.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in provider response");
  return JSON.parse(candidate.slice(start, end + 1));
}

const JenovaResponseSchema = StepSchema.extend({
  reasoning: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  resultInterpretation: z.string().optional().default(""),
  safetyWarning: z.string().optional().default(""),
  supportingEvidence: z.array(z.string()).optional().default([]),
  confidence: z.number().optional(),
}).partial({ mostLikelyFailures: true });

function normalize(raw: unknown): DiagnosticStepOutput {
  const parsed = JenovaResponseSchema.parse(raw);
  const failures = parsed.mostLikelyFailures?.length
    ? parsed.mostLikelyFailures
    : parsed.mostLikelyFailure
      ? [parsed.mostLikelyFailure]
      : [];
  return {
    ...parsed,
    mostLikelyFailures: failures,
    mostLikelyFailure: parsed.mostLikelyFailure || failures[0] || "",
  } as DiagnosticStepOutput;
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

async function runJenova(req: DiagnosticStepRequest): Promise<DiagnosticStepOutput> {
  const cfg = getJenovaConfig();
  const existingSession = req.sessionId ? await getMappedJenovaSession(req.sessionId) : null;
  const message = [
    req.system,
    "",
    "=== NEXTSTEP DIAGNOSTIC CONTEXT ===",
    req.prompt,
    req.provenance ? `\n=== NEXTSTEP KNOWLEDGE ENGINE EVIDENCE (authoritative, provenance preserved) ===\n${req.provenance}` : "",
    "",
    JENOVA_OUTPUT_CONTRACT,
  ].join("\n");

  try {
    const res = await sendJenovaMessage({
      message,
      sessionId: existingSession,
      externalUserId: req.userId ? `nextstep:${req.userId}` : null,
    });
    if (req.sessionId && res.sessionId) {
      await saveJenovaSessionMapping({
        diagnosticSessionId: req.sessionId,
        jenovaSessionId: res.sessionId,
        userId: req.userId,
        agentId: cfg.agentSlug,
      });
    }
    const output = normalize(extractJson(res.content));
    await logAiUsage({
      userId: req.userId,
      feature: req.feature,
      model: `jenova:${cfg.agentSlug ?? "unknown"}`,
      usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
      provider: "jenova",
      agentId: cfg.agentSlug,
      sessionId: req.sessionId ?? null,
      success: true,
      costUsd: res.cost,
    });
    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Jenova call failed";
    await logAiUsage({
      userId: req.userId,
      feature: req.feature,
      model: `jenova:${cfg.agentSlug ?? "unknown"}`,
      usage: undefined,
      provider: "jenova",
      agentId: cfg.agentSlug,
      sessionId: req.sessionId ?? null,
      success: false,
      errorMessage: msg,
    });
    throw err;
  }
}

/**
 * Runs one diagnostic reasoning step. Never throws for provider-level failures
 * when a fallback is available — the diagnostic session must survive.
 */
export async function runDiagnosticStep(
  req: DiagnosticStepRequest,
): Promise<DiagnosticProviderResult> {
  const requested = resolveProvider(req.provider);
  if (requested === "jenova") {
    try {
      const output = await runJenova(req);
      return {
        output: applySafetyFramework(output),
        provider: "jenova",
        requestedProvider: "jenova",
        providerError: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Jenova provider error";
      console.warn("[diagnose] jenova provider failed, falling back to lovable:", msg);
      const output = await runLovable(req);
      return {
        output: applySafetyFramework(output),
        provider: "lovable",
        requestedProvider: "jenova",
        providerError: "Jenova reasoning unavailable — used the standard NextStep provider.",
      };
    }
  }
  const output = await runLovable(req);
  return {
    output: applySafetyFramework(output),
    provider: "lovable",
    requestedProvider: "lovable",
    providerError: null,
  };
}
