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