// Shared server-only helpers for owner admin server functions.
export async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function isActivePro(row: {
  tier?: string | null;
  plan_type?: string | null;
  current_period_end?: string | null;
}) {
  if (row.tier !== "pro") return false;
  if (row.plan_type === "grandfathered") return true;
  return !!row.current_period_end && new Date(row.current_period_end) > new Date();
}

export const PLAN_MONTHLY_VALUE: Record<string, number> = {
  monthly: 9.99,
  annual: 99 / 12,
  week_pass: 1 * (30 / 7),
  grandfathered: 0,
};
