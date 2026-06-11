// Server-only helper: fire-and-forget AI usage logging.
// Never throws. Failures are logged to console only — must not block AI responses.
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined;

export async function logAiUsage(args: {
  userId: string | null;
  feature: string;
  model: string;
  usage: Usage;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const inputTokens = Number(args.usage?.inputTokens ?? 0) || 0;
    const outputTokens = Number(args.usage?.outputTokens ?? 0) || 0;
    await supabaseAdmin.from("ai_usage").insert({
      user_id: args.userId,
      feature: args.feature,
      model: args.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  } catch (err) {
    console.error("[ai_usage] log failed", err);
  }
}