// Server-only helper for enforcing free-tier lookup quotas.
// Import ONLY inside server-function handlers (never at module scope of
// client-reachable files).

export type QuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  pro: boolean;
};

export class QuotaExceededError extends Error {
  constructor(public used: number, public limit: number) {
    super("quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

export async function enforceLookupQuota(userId: string): Promise<QuotaResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("increment_lookup", {
    _user_id: userId,
  });
  if (error) {
    console.error("[quota] increment_lookup failed:", error);
    // Fail open so infrastructure errors never block diagnostics.
    return { allowed: true, used: 0, limit: -1, pro: false };
  }
  const result = (data ?? {}) as Partial<QuotaResult>;
  const out: QuotaResult = {
    allowed: !!result.allowed,
    used: Number(result.used ?? 0),
    limit: Number(result.limit ?? 8),
    pro: !!result.pro,
  };
  if (!out.allowed) throw new QuotaExceededError(out.used, out.limit);
  return out;
}

/**
 * Consumes one free diagnostic only the first time a saved session is used.
 * Every later step for that same session is included, including after a
 * month boundary. The database performs the check and insert atomically.
 */
export async function enforceDiagnosticQuota(
  userId: string,
  sessionId: string,
): Promise<QuotaResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_diagnostic", {
    _user_id: userId,
    _session_id: sessionId,
  });
  if (error) {
    // Invalid or foreign session IDs must never become a quota bypass.
    if (error.message.includes("diagnostic_session_")) {
      throw new Error("The diagnostic session could not be verified. Please start again.");
    }
    console.error("[quota] consume_diagnostic failed:", error);
    // Preserve the existing fail-open behavior for infrastructure outages.
    return { allowed: true, used: 0, limit: -1, pro: false };
  }
  const result = (data ?? {}) as Partial<QuotaResult>;
  const out: QuotaResult = {
    allowed: !!result.allowed,
    used: Number(result.used ?? 0),
    limit: Number(result.limit ?? 8),
    pro: !!result.pro,
  };
  if (!out.allowed) throw new QuotaExceededError(out.used, out.limit);
  return out;
}
