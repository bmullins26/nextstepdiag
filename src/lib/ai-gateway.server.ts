import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
    // Gemini-via-Gateway rejects the `responseFormat` field and requires the
    // OpenAI-style `structured_outputs` request flag instead. Telling the
    // adapter the provider supports structured outputs makes generateObject
    // send the right shape.
    supportsStructuredOutputs: true,
  });
}

export function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";