import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAiUsage } from "./ai-usage-log.server";
import { getTechSheet } from "./tech-sheets/lookup.functions";
import type { GroundingResult } from "./tech-sheets/types";
import { loadOutcomeStats } from "./diagnostic-outcomes.server";
import { gatherEvidence, tieredPromptBlock, provenanceBlock } from "./evidence/engine";
import type { EvidenceItem } from "./evidence/types";
import { enforceLookupQuota, QuotaExceededError } from "./billing/quota.server";
import { runDiagnosticStep } from "./ai/diagnostic-provider.server";

const ApplianceInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().optional().default(""),
});

export const verifyAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplianceInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      await enforceLookupQuota(context.userId);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return {
          identified: false,
          manufacturer: "",
          applianceType: "",
          confidence: "Unknown" as const,
          notes: "",
          brand: data.brand,
          modelNumber: data.modelNumber,
          serialNumber: data.serialNumber,
          quotaExceeded: true as const,
          quota: { used: e.used, limit: e.limit },
        };
      }
      throw e;
    }
    const gateway = getGateway();
    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({
        identified: z.boolean().describe("True only if you can confidently identify the appliance type from brand + model."),
        manufacturer: z.string(),
        applianceType: z.string().describe("e.g. Top-Load Washer, Side-by-Side Refrigerator, Electric Dryer. Empty string if unidentified."),
        confidence: z.enum(["High", "Medium", "Low", "Unknown"]),
        notes: z.string().describe("Brief note on configuration or platform. If unidentified, ask a clarifying question for the technician."),
      }),
      system:
        "You are a senior appliance technician verifying equipment from brand, model, and serial numbers. Never guess. If you cannot identify the appliance type confidently, set identified=false and put a clarifying question in notes (e.g. 'Is this a top-load or front-load washer?').",
      prompt: `Brand: ${data.brand}\nModel Number: ${data.modelNumber}\nSerial Number: ${data.serialNumber || "(not provided)"}`,
    });
    await logAiUsage({ userId: context.userId, feature: "verify_appliance", model: DEFAULT_MODEL, usage });
    return { ...object, brand: data.brand, modelNumber: data.modelNumber, serialNumber: data.serialNumber };
  });

const QAItem = z.object({ question: z.string(), answer: z.string() });

const StepInput = z.object({
  appliance: z.object({
    manufacturer: z.string().min(1, "Manufacturer is required for diagnostics."),
    applianceType: z.string().min(1, "Appliance type is required for diagnostics."),
    modelNumber: z.string().min(1, "Model number is required for diagnostics."),
    serialNumber: z.string().optional().default(""),
    manufactureYear: z.number().int().optional(),
    ageYears: z.number().optional(),
    platform: z.string().nullable().optional(),
  }),
  complaint: z.string().min(1),
  history: z.array(QAItem).default([]),
  documentExcerpt: z.string().optional().default(""),
  currentFindings: z.array(z.string()).default([]),
  sessionId: z.string().uuid().nullable().optional(),
  provider: z.enum(["lovable", "jenova"]).nullable().optional(),
});

export const nextDiagnosticStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StepInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      await enforceLookupQuota(context.userId);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        return {
          done: true,
          currentFindings: "",
          mostLikelyFailure: "",
          mostLikelyFailures: [] as string[],
          recommendedNextTest: "",
          nextQuestion: { text: "", choices: [] as string[], allowFreeText: false },
          groundingMode: "unknown" as const,
          groundingSource: null,
          historicalOutcomes: null,
          evidence: [] as EvidenceItem[],
          provider: "lovable" as const,
          providerError: null as string | null,
          quotaExceeded: true as const,
          quota: { used: e.used, limit: e.limit },
        };
      }
      throw e;
    }
    const historyText = data.history.length
      ? data.history.map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`).join("\n")
      : "(no questions answered yet)";

    console.log(
      `[diagnose] mfg=${data.appliance.manufacturer} type=${data.appliance.applianceType} model=${data.appliance.modelNumber} brandSentToAI=${data.appliance.manufacturer}`,
    );

    // --- Tech-sheet grounding -------------------------------------------------
    let grounding: GroundingResult | null = null;
    try {
      grounding = await getTechSheet({
        data: {
          brand: data.appliance.manufacturer,
          modelNumber: data.appliance.modelNumber,
          applianceType: data.appliance.applianceType,
        },
      });
    } catch (err) {
      console.warn("[diagnose] grounding lookup failed:", err);
    }

    // --- Historical technician outcomes (weighted prior) ----------------------
    let outcomeStats: Awaited<ReturnType<typeof loadOutcomeStats>> | null = null;
    try {
      outcomeStats = await loadOutcomeStats(context.supabase, {
        manufacturer: data.appliance.manufacturer,
        modelNumber: data.appliance.modelNumber,
        applianceType: data.appliance.applianceType,
        platform: data.appliance.platform ?? null,
        complaint: data.complaint,
      });
    } catch (err) {
      console.warn("[diagnose] outcome stats lookup failed:", err);
    }
    const historicalBlock =
      outcomeStats && outcomeStats.sampleSize >= 3 && outcomeStats.ranked.length > 0
        ? `\n\nHISTORICAL TECHNICIAN OUTCOMES\nScope: ${outcomeStats.scopeLabel}   Sample Size: ${outcomeStats.sampleSize}   Exact-model repairs: ${outcomeStats.exactModelCount}\n${outcomeStats.ranked
            .slice(0, 5)
            .map((r) => `- ${r.failure}: ${r.share}%`)
            .join("\n")}\nUse these outcomes as historical evidence. Prioritize exact-model data over platform-family data; prioritize platform-family over manufacturer-family. Current diagnostic evidence may override historical trends when appropriate.`
        : "";

    const rawConfidence = grounding?.confidence ?? "low";
    // Map grounding result to a diagnostic mode. Grounding IMPROVES diagnostics,
    // it never blocks them. When no verified literature is available we fall back
    // to symptom-based reasoning so the tech always gets useful guidance.
    const hasManufacturer = !!data.appliance.manufacturer?.trim();
    const hasApplianceType = !!data.appliance.applianceType?.trim();
    type Mode =
      | "exact_model"
      | "platform_family"
      | "manufacturer_family"
      | "symptom_based"
      | "unknown";
    let mode: Mode;
    if (rawConfidence === "exact_model") mode = "exact_model";
    else if (rawConfidence === "platform_family") mode = "platform_family";
    else if (rawConfidence === "manufacturer_family") mode = "manufacturer_family";
    else if (hasManufacturer && hasApplianceType) mode = "symptom_based";
    else mode = "unknown";

    console.log(
      `[diagnose] grounding confidence=${rawConfidence} mode=${mode} trust=${grounding?.sourceTrust ?? "n/a"} cacheHit=${grounding?.cacheHit ?? false} url=${grounding?.sourceUrl ?? "(none)"}`,
    );

    // Build grounding excerpt only when we actually have a sheet.
    const sheet = grounding?.sheet ?? null;
    let groundingExcerpt = "";
    if (sheet && (mode === "exact_model" || mode === "platform_family" || mode === "manufacturer_family")) {
      const mdSlice = (sheet.contentMarkdown || "").slice(0, 4500);
      const codesText = sheet.faultCodes.length
        ? `\n\nFAULT CODES:\n${sheet.faultCodes
            .slice(0, 25)
            .map((c) => `- ${c.code}: ${c.meaning}${c.test ? ` — ${c.test}` : ""}`)
            .join("\n")}`
        : "";
      const tpText = sheet.testPoints.length
        ? `\n\nTEST POINTS:\n${sheet.testPoints
            .slice(0, 25)
            .map(
              (t) =>
                `- ${t.label}${t.connector ? ` @ ${t.connector}` : ""}${t.pins ? ` pins ${t.pins}` : ""}${t.expected ? ` → expect ${t.expected}` : ""}${t.condition ? ` (${t.condition})` : ""}`,
            )
            .join("\n")}`
        : "";
      groundingExcerpt = `${mdSlice}${codesText}${tpText}`.trim();
    }

    const modeNote: Record<Mode, string> = {
      exact_model:
        "MODE=exact_model. Grounding is from exact-model service literature. Provide full grounded diagnostics, citing specific connectors, pins, voltages, resistances, and fault codes from the grounding data.",
      platform_family:
        "MODE=platform_family. Grounding is from platform-family service literature (not exact model). Provide full diagnostics but prefix specific technical references with a brief platform disclaimer (e.g. 'On this platform family ...').",
      manufacturer_family:
        "MODE=manufacturer_family. No model-specific literature found. You MAY suggest likely failures and general diagnostic direction based on manufacturer architecture. You MUST NOT cite specific connector names, pin numbers, resistance values, voltage values, or fault-code definitions (none are grounded). Speak in component-level terms (e.g. 'drain pump', 'door lock assembly', 'main control board').",
      symptom_based:
        "MODE=symptom_based. No grounded service data available. Reason purely from the reported symptoms and any technician findings. Produce: (1) Most Likely Failures (top 2-3 ranked), (2) one Recommended Next Check at the component level, (3) one Clarifying Question to narrow the fault. Do NOT cite connectors, pins, voltages, resistances, or fault codes.",
      unknown:
        "MODE=unknown. Manufacturer or appliance type is unclear. Ask a clarifying question to identify the appliance before giving component-level guidance. Still provide best-effort generic next-check guidance based on the complaint.",
    };
    const confidenceNote = modeNote[mode];

    const trustNote = grounding?.sourceTrust
      ? `Source trust tier: ${grounding.sourceTrust} (${grounding.trustLabel}).`
      : "No verified source — operating in symptom-based mode.";

    // --- Unified evidence pipeline (community + verified repairs + docs) ----
    let evidence: EvidenceItem[] = [];
    try {
      evidence = await gatherEvidence(
        {
          brand: data.appliance.manufacturer,
          applianceType: data.appliance.applianceType,
          model: data.appliance.modelNumber,
          complaint: data.complaint,
          userId: context.userId,
        },
        { supabase: context.supabase },
      );
    } catch (err) {
      console.warn("[diagnose] evidence pipeline failed:", err);
    }
    const evidenceBlock = tieredPromptBlock(evidence);
    const hierarchyRule = `\nEVIDENCE HIERARCHY (weight in this exact order):\n1) Manufacturer Documentation  2) Tech Sheet  3) Service Bulletins  4) Verified Repair Outcomes  5) Community — Verified Repairs  6) Community — Discussions  7) External Repair Guides.\nCommunity evidence may strengthen a recommendation when it corroborates higher-tier sources but MUST NEVER override manufacturer documentation or a verified repair outcome. When higher-tier evidence conflicts with community evidence, follow the higher tier and note the disagreement.\n`;

    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({
        done: z.boolean().describe("True only when you have enough evidence to name the most likely failure with confidence."),
        currentFindings: z.string().describe("One short sentence summarizing what's been ruled in/out so far."),
        mostLikelyFailure: z.string().describe("Best current hypothesis. Empty string only if there's truly nothing yet."),
        mostLikelyFailures: z.array(z.string()).describe("Top 2-3 ranked failure hypotheses, best first. Empty array only if nothing yet."),
        recommendedNextTest: z.string().describe("The specific physical test the tech should perform next (e.g. 'Verify amp draw of drain pump at J5')."),
        nextQuestion: z.object({
          text: z.string().describe("ONE focused diagnostic question to ask the technician next. Empty if done=true."),
          choices: z.array(z.string()).describe("2-4 short answer choices (Yes/No, measured values, observations). Empty if done=true."),
          allowFreeText: z.boolean().describe("True if the tech should also be able to type a measured value or note."),
        }),
      }),
      system: `You are an appliance diagnostic assistant guiding a senior tech on-site. The product question is always: "What should I test next?"
${hierarchyRule}

CRITICAL OUTPUT RULE:
- mostLikelyFailures MUST contain at least one entry. Never return it empty.
- recommendedNextTest MUST be a non-empty actionable check. Never return it empty.
- Grounding IMPROVES diagnostics, it never BLOCKS diagnostics. Even with zero grounding data, give the technician useful symptom-based guidance.

GROUNDING:
- ${confidenceNote}
- You may ONLY reference connector names, pin numbers, test points, resistance values, voltage values, and fault-code definitions when those values are explicitly present in the grounding data below. If absent, speak at the component level instead — do not invent technical details.
- ${trustNote} When sources conflict: OEM > trusted reference > community.

MANUFACTURER LOCK (CRITICAL):
- The appliance is a ${data.appliance.manufacturer} ${data.appliance.applianceType} (model ${data.appliance.modelNumber}).
- Every recommended test, terminal name (e.g. J-numbers), fault code, component reference, and service procedure MUST match ${data.appliance.manufacturer}'s service literature for this model family.
- NEVER apply procedures from another manufacturer. Do NOT cite Whirlpool VMW/Direct-Drive procedures on a GE appliance. Do NOT cite Samsung error codes on an LG appliance. Do NOT cite GE Triton procedures on a Whirlpool dishwasher. When in doubt, ask a clarifying question instead of guessing across brands.

Rules:
- You are JOINING an active service call already in progress. The technician has likely already performed tests — those are listed under "Already verified".
- Treat "Already verified" findings as ground truth. NEVER ask a question that re-tests anything in that list (no asking about voltage if voltage is verified, no asking if the pump runs if pump operation is verified, no asking about fault codes if codes are listed).
- Ask exactly ONE diagnostic question at a time. Never dump a checklist.
- Each question must be chosen based on the prior answer to narrow the fault.
- Be specific: reference real components, terminals, voltages, resistances appropriate to the appliance type.
- Always populate mostLikelyFailure, mostLikelyFailures (top 2-3 ranked), and recommendedNextTest with your current best hypothesis (update as evidence comes in).
- recommendedNextTest MUST be specific: name the connector/pin (e.g. "J16-4"), component, expected reading, and condition (e.g. "during spin", "at room temperature"). NEVER write generic advice like "check the wiring" or "inspect the pump".
- Set done=true only when the failure is conclusively isolated; then leave nextQuestion fields empty.
- If a tech sheet excerpt is provided, ground your reasoning in it.
- Never guess wildly; if the appliance type is too vague to proceed, ask a clarifying question first.`,
      prompt: `MANUFACTURER: ${data.appliance.manufacturer}
APPLIANCE: ${data.appliance.applianceType}
MODEL: ${data.appliance.modelNumber}${data.appliance.serialNumber ? `\nSERIAL: ${data.appliance.serialNumber}` : ""}${data.appliance.manufactureYear ? `\nMANUFACTURED: ${data.appliance.manufactureYear}${data.appliance.ageYears != null ? ` (~${Math.round(data.appliance.ageYears)} yr old — factor wear-related failures accordingly)` : ""}` : ""}

Customer Complaint: ${data.complaint}

Already verified by the technician (do NOT ask them to repeat these tests):
${data.currentFindings.length ? data.currentFindings.map((f) => `- ${f}`).join("\n") : "(none — technician is starting fresh)"}

Q&A so far:
${historyText}

GROUNDING DATA (mode=${mode}, confidence=${rawConfidence}, source=${grounding?.sourceUrl ?? grounding?.displayLabel ?? "(none — symptom-based)"}):
${groundingExcerpt || "(no extracted content — reason from symptoms and architecture only; still output failures + next test)"}

RANKED EVIDENCE (grouped by tier):
${evidenceBlock}

${data.documentExcerpt ? `Additional tech sheet / wiring diagram excerpt (uploaded by technician):\n${data.documentExcerpt.slice(0, 4000)}\n` : ""}
Decide the single next diagnostic question, or finalize the call. Reminder: answers MUST be specific to ${data.appliance.manufacturer} ${data.appliance.applianceType}.${historicalBlock}`,
    });
    await logAiUsage({ userId: context.userId, feature: "next_diagnostic_step", model: DEFAULT_MODEL, usage });

    // Persist which evidence items informed this diagnosis
    try {
      const evidenceIds = evidence.slice(0, 20).map((e) => ({
        id: e.id,
        sourceType: e.sourceType,
        confidence: e.confidence,
      }));
      if (evidenceIds.length && (data as { sessionId?: string }).sessionId) {
        // Best-effort — do not fail the diagnosis on write errors.
        await context.supabase
          .from("diagnostic_sessions")
          .update({ evidence_used: evidenceIds })
          .eq("id", (data as { sessionId?: string }).sessionId!);
      }
    } catch (err) {
      console.warn("[diagnose] evidence_used update failed:", err);
    }

    return {
      ...object,
      groundingMode: mode,
      groundingSource: grounding
        ? {
            url: grounding.sourceUrl,
            confidence: grounding.confidence,
            sourceType: grounding.sourceType,
            sourceTrust: grounding.sourceTrust,
            platformFamily: grounding.platformFamily,
            displayLabel: grounding.displayLabel,
            trustLabel: grounding.trustLabel,
          }
        : null,
      historicalOutcomes:
        outcomeStats && outcomeStats.sampleSize > 0
          ? {
              scope: outcomeStats.scope,
              scopeLabel: outcomeStats.scopeLabel,
              sampleSize: outcomeStats.sampleSize,
              exactModelCount: outcomeStats.exactModelCount,
              totals: outcomeStats.totals,
              ranked: outcomeStats.ranked.slice(0, 5),
            }
          : null,
      evidence: evidence.slice(0, 12),
    };
  });

const DocQInput = StepInput.extend({ question: z.string().min(1) });

export const askDocumentQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DocQInput.parse(d))
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const { object, usage } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: z.object({ answer: z.string() }),
      system:
        "You are a senior appliance tech answering a follow-up question about a tech sheet or wiring diagram. Be concise, cite component names, terminals, and expected values. If the document does not contain the answer, say so.",
      prompt: `Appliance: ${data.appliance.manufacturer} ${data.appliance.applianceType} (Model ${data.appliance.modelNumber})
Complaint: ${data.complaint}

Document excerpt:
${(data.documentExcerpt || "").slice(0, 6000)}

Technician question: ${data.question}`,
    });
    await logAiUsage({ userId: context.userId, feature: "ask_document_question", model: DEFAULT_MODEL, usage });
    return object;
  });