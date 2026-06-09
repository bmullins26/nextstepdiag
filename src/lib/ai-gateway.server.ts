import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
    // Gemini-via-Gateway doesn't accept response_format: json_schema (provider-side
    // structured outputs). Telling the adapter the provider doesn't support
    // structured outputs makes generateObject fall back to json_object mode,
    // which the gateway supports.
    supportsStructuredOutputs: false,
  });
}

export function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";