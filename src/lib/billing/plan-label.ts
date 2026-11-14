/** Single source of truth for the plan name shown anywhere in the app (from entitlements). */
export function planLabel(planType: string | null, tier: string): string {
  if (tier !== "pro") return "Free";
  if (planType?.startsWith("partner_") || planType?.startsWith("perk_")) return "Pro (Partner perk)";
  switch (planType) {
    case "grandfathered": return "Pro (Grandfathered)";
    case "week_pass": return "Pro · 7-Day Pass";
    case "monthly": return "Pro Monthly";
    case "annual": return "Pro Annual";
    default: return "Pro";
  }
}
