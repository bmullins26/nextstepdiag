import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";

const FileInput = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg", "image/png"]),
  dataUrl: z.string().min(20),
});

const AnalysisSchema = z.object({
  documentOverview: z.string(),
  visibleText: z.string(),
  componentsIdentified: z.array(z.string()),
  circuitOperation: z.string(),
  voltagePaths: z.array(z.string()),
  testPoints: z.array(
    z.object({
      location: z.string(),
      expectedReading: z.string(),
    }),
  ),
  nextDiagnosticStep: z.string(),
  followUpQuestions: z.array(z.string()),
});

const SYSTEM = `You are a senior appliance repair technician analyzing a tech sheet, wiring diagram, service manual page, or diagnostic document for a junior tech in the field.

ABSOLUTE RULES — violating any of these is a critical failure:
- NEVER invent voltage values, connector numbers, fault codes, wire colors, or part numbers.
- If a piece of information is not visible or not legible on the document, write EXACTLY: "Not visible in this document."
- Only reference components, terminals, and values that are actually printed on the page.
- If unsure whether something is on the page, treat it as not visible.

Goal: help the technician decide the next diagnostic step.`;

type Block =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function buildContent(file: z.infer<typeof FileInput>, text: string): Block[] {
  const media: Block =
    file.mimeType === "application/pdf"
      ? { type: "file", file: { filename: file.fileName, file_data: file.dataUrl } }
      : { type: "image_url", image_url: { url: file.dataUrl } };
  return [{ type: "text", text }, media];
}

export const analyzeDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FileInput.parse(d))
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const { object } = await generateObject({
      model: gateway(DEFAULT_MODEL),
      schema: AnalysisSchema,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          // AI SDK accepts provider-shaped content blocks for passthrough providers.
          content: buildContent(
            data,
            `Analyze this appliance document (filename: ${data.fileName}). Produce the structured analysis. Remember: never invent values — if it's not on the page, write "Not visible in this document."`,
          ) as never,
        },
      ],
    });
    return object;
  });

const QAItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const FollowUpInput = z.object({
  file: FileInput,
  analysisSummary: z.string().default(""),
  history: z.array(QAItem).default([]),
  question: z.string().min(1),
});

export const askDocumentFollowUp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FollowUpInput.parse(d))
  .handler(async ({ data }) => {
    const gateway = getGateway();
    const historyText = data.history.length
      ? data.history
          .map((m) => `${m.role === "user" ? "Tech" : "Assistant"}: ${m.content}`)
          .join("\n\n")
      : "(no prior questions)";

    const { text } = await generateText({
      model: gateway(DEFAULT_MODEL),
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: buildContent(
            data.file,
            `You previously analyzed this document. Summary of your analysis:
${data.analysisSummary || "(no summary)"}

Prior conversation:
${historyText}

Technician's new question: ${data.question}

Answer based ONLY on what is visible on the attached document. If the answer is not visible, say "Not visible in this document." Be concise and reference specific components, terminals, or printed values where applicable.`,
          ) as never,
        },
      ],
    });
    return { answer: text };
  });