import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PARTNER_PERKS } from "./perk-rules";

const Partner = z.enum(["freds_academy"]);

async function assertOwner(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "owner").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Owner roster of everyone who claimed a partner perk, with usage and access state. */
export const listPartnerStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partner: Partner }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claims, error } = await supabaseAdmin
      .from("partner_perk_claims")
      .select("user_id, claimed_at, expires_at, verification_status, verified_at, owner_note")
      .eq("partner", data.partner)
      .order("claimed_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const ids = (claims ?? []).map((c) => c.user_id);
    if (!ids.length) return [];
    const [{ data: profiles }, { data: subs }, { data: sessions }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, display_name, last_activity_at, created_at").in("id", ids),
      supabaseAdmin.from("subscriptions").select("user_id, tier, status, plan_type, current_period_end, stripe_customer_id").in("user_id", ids),
      supabaseAdmin.from("diagnostic_sessions").select("user_id").in("user_id", ids).limit(50000),
    ]);
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const sMap = new Map((subs ?? []).map((s) => [s.user_id, s]));
    const counts = new Map<string, number>();
    for (const s of sessions ?? []) counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1);
    return (claims ?? []).map((c) => {
      const p = pMap.get(c.user_id);
      const s = sMap.get(c.user_id);
      return {
        userId: c.user_id,
        email: p?.email ?? "",
        name: p?.display_name || p?.full_name || "",
        signedUpAt: p?.created_at ?? null,
        lastActivityAt: p?.last_activity_at ?? null,
        claimedAt: c.claimed_at,
        expiresAt: c.expires_at,
        verification: c.verification_status as "pending" | "verified" | "rejected",
        verifiedAt: c.verified_at,
        note: c.owner_note,
        planLabel: s?.plan_type === "grandfathered" ? "Permanent Pro" : s?.stripe_customer_id ? "Paid" : s?.tier === "pro" ? "Academy Pro" : "Free",
        proActive: s?.plan_type === "grandfathered" || s?.tier === "pro" && s?.status === "active" && !!s.current_period_end && new Date(s.current_period_end) > new Date(),
        diagnostics: counts.get(c.user_id) ?? 0,
      };
    });
  });

/**
 * Owner marks a student verified or rejected. Rejecting ends only the perk's
 * Pro access (never paid Pro); re-verifying restores it until the original expiry.
 */
export const setPartnerStudentVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partner: Partner,
      userId: z.string().uuid(),
      status: z.enum(["pending", "verified", "rejected"]),
      note: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const planType = PARTNER_PERKS[data.partner].planType;
    const { data: claim, error } = await supabaseAdmin
      .from("partner_perk_claims")
      .update({
        verification_status: data.status,
        verified_at: data.status === "pending" ? null : new Date().toISOString(),
        verified_by: data.status === "pending" ? null : context.userId,
        ...(data.note !== undefined ? { owner_note: data.note } : {}),
      })
      .eq("user_id", data.userId)
      .eq("partner", data.partner)
      .select("expires_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claim) throw new Error("Student claim not found.");

    const now = new Date().toISOString();
    if (data.status === "rejected") {
      await supabaseAdmin.from("subscriptions")
        .update({ tier: "free", status: "canceled", current_period_end: now, updated_at: now })
        .eq("user_id", data.userId).eq("plan_type", planType);
    } else if (new Date(claim.expires_at) > new Date()) {
      await supabaseAdmin.from("subscriptions")
        .update({ tier: "pro", status: "active", current_period_end: claim.expires_at, updated_at: now })
        .eq("user_id", data.userId).eq("plan_type", planType);
    }
    return { ok: true };
  });

/**
 * Owner changes a student's subscription. "free" ends perk Pro; "extend"
 * sets perk Pro to a new end date; "permanent" grants grandfathered Pro.
 * Never touches a paid Stripe subscription.
 */
export const setPartnerStudentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      partner: Partner,
      userId: z.string().uuid(),
      action: z.enum(["free", "extend", "permanent"]),
      endsAt: z.string().datetime().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const planType = PARTNER_PERKS[data.partner].planType;
    const { data: sub } = await supabaseAdmin.from("subscriptions")
      .select("stripe_subscription_id").eq("user_id", data.userId).maybeSingle();
    if (sub?.stripe_subscription_id) throw new Error("This student has a paid subscription. Manage it in Payments.");
    const now = new Date().toISOString();
    let row: Record<string, unknown>;
    if (data.action === "free") {
      row = { tier: "free", status: "canceled", plan_type: planType, current_period_end: now };
    } else if (data.action === "permanent") {
      row = { tier: "pro", status: "grandfathered", plan_type: "grandfathered", current_period_end: null };
    } else {
      if (!data.endsAt || new Date(data.endsAt) <= new Date()) throw new Error("Pick a future end date.");
      row = { tier: "pro", status: "active", plan_type: planType, current_period_end: data.endsAt };
      await supabaseAdmin.from("partner_perk_claims").update({ expires_at: data.endsAt })
        .eq("user_id", data.userId).eq("partner", data.partner);
    }
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      { user_id: data.userId, environment: "live", cancel_at_period_end: false, updated_at: now, ...row } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
