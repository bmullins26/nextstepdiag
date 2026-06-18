import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAiUsage } from "./ai-usage-log.server";

const ApplianceInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().optional().default(""),
});

export const verifyAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplianceInput.parse(d))
  .handler(async ({ data, context }) => {
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
  }),
  complaint: z.string().min(1),
  history: z.array(QAItem).default([]),
  documentExcerpt: z.string().optional().default(""),
  currentFindings: z.array(z.string()).default([]),
});

export const nextDiagnosticStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StepInput.parse(d))
  .handler(async ({ data, context }) => {
    const gateway = getGateway();
    const historyText = data.history.length
      ? data.history.map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`).join("\n")
      : "(no questions answered yet)";

    console.log(
      `[diagnose] mfg=${data.appliance.manufacturer} type=${data.appliance.applianceType} model=${data.appliance.modelNumber} brandSentToAI=${data.appliance.manufacturer}`,
    );

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
      system: `You are a senior appliance repair technician guiding a junior tech on-site. The product question is always: "What should I test next?"

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

${data.documentExcerpt ? `Tech sheet / wiring diagram excerpt:\n${data.documentExcerpt.slice(0, 4000)}\n` : ""}
Decide the single next diagnostic question, or finalize the call. Reminder: answers MUST be specific to ${data.appliance.manufacturer} ${data.appliance.applianceType}.`,
    });
    await logAiUsage({ userId: context.userId, feature: "next_diagnostic_step", model: DEFAULT_MODEL, usage });
    return object;
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