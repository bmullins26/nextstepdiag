// Approximate Lovable AI Gateway pricing for the models this app uses.
// Values are USD per 1,000,000 tokens and are labeled "estimate" in the UI.
// Update when Lovable adjusts billing.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview": { input: 0.3, output: 2.5 },
};

export const DEFAULT_PRICING = { input: 0.3, output: 2.5 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const p = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export function formatUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  next_diagnostic_step: "Diagnostic step",
  decode_appliance: "Decode appliance",
  extract_tag_from_image: "OCR data plate",
  analyze_document: "Analyze document",
  ask_document_question: "Document Q&A",
  ask_document_followup: "Document follow-up",
  verify_appliance: "Verify appliance",
  error_code_research: "Error code research",
};

export function featureLabel(feature: string) {
  return AI_FEATURE_LABELS[feature] ?? feature;
}