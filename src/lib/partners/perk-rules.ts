// Pure rules for partner perks (e.g. Fred's Appliance Academy: 3 months free Pro).
// Kept separate from the server function so it can be unit tested.
export const PARTNER_PERKS = {
  freds_academy: { label: "Fred's Appliance Academy", days: 90, planType: "partner_freds_academy" },
} as const;
export type PartnerKey = keyof typeof PARTNER_PERKS;

export type ExistingSub = {
  tier: string | null;
  plan_type: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
} | null;

export type PerkDecision =
  | { action: "grant"; expiresAt: Date }
  | { action: "already_claimed" }
  | { action: "already_pro" };

export function decidePerk(sub: ExistingSub, alreadyClaimed: boolean, days: number, now = new Date()): PerkDecision {
  if (alreadyClaimed) return { action: "already_claimed" };
  if (sub && sub.tier === "pro") {
    const paidActive = !!sub.stripe_subscription_id && !!sub.current_period_end && new Date(sub.current_period_end) > now;
    if (sub.plan_type === "grandfathered" || paidActive) return { action: "already_pro" };
  }
  return { action: "grant", expiresAt: new Date(now.getTime() + days * 86_400_000) };
}
