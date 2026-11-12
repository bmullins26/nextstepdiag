import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decidePerk, PARTNER_PERKS } from "./perk-rules";

const Input = z.object({ partner: z.enum(["freds_academy"]) });

/** Grants a partner perk (free Pro period) to the signed-in user, once per account. */
export const claimPartnerPerk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const perk = PARTNER_PERKS[data.partner];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: claim }, { data: sub }] = await Promise.all([
      supabaseAdmin.from("partner_perk_claims").select("expires_at").eq("user_id", context.userId).eq("partner", data.partner).maybeSingle(),
      supabaseAdmin.from("subscriptions").select("tier, plan_type, stripe_subscription_id, current_period_end").eq("user_id", context.userId).maybeSingle(),
    ]);
    const decision = decidePerk(sub ?? null, !!claim, perk.days);
    if (decision.action === "already_claimed") return { status: "already_claimed" as const, expiresAt: claim!.expires_at };
    if (decision.action === "already_pro") return { status: "already_pro" as const, expiresAt: null };

    const now = new Date().toISOString();
    const expiresAt = decision.expiresAt.toISOString();
    const { error: e1 } = await supabaseAdmin.from("partner_perk_claims").insert({
      user_id: context.userId, partner: data.partner, expires_at: expiresAt,
    });
    if (e1) {
      if (e1.code === "23505") return { status: "already_claimed" as const, expiresAt: null };
      throw new Error("Could not record the offer. Please try again.");
    }
    const { error: e2 } = await supabaseAdmin.from("subscriptions").upsert(
      { user_id: context.userId, tier: "pro", status: "active", plan_type: perk.planType,
        current_period_start: now, current_period_end: expiresAt, cancel_at_period_end: true, updated_at: now },
      { onConflict: "user_id" },
    );
    if (e2) {
      await supabaseAdmin.from("partner_perk_claims").delete().eq("user_id", context.userId).eq("partner", data.partner);
      throw new Error("Could not activate Pro. Please try again.");
    }
    return { status: "granted" as const, expiresAt };
  });
