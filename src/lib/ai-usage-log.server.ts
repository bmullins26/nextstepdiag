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
  provider?: string;
  agentId?: string | null;
  sessionId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
  costUsd?: number | null;
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
      provider: args.provider ?? "lovable",
      agent_id: args.agentId ?? null,
      session_id: args.sessionId ?? null,
      success: args.success ?? true,
      // Never log credentials or raw provider payloads — message text only.
      error_message: args.errorMessage ? String(args.errorMessage).slice(0, 500) : null,
      cost_usd: args.costUsd ?? null,
    });
  } catch (err) {
    console.error("[ai_usage] log failed", err);
  }
}