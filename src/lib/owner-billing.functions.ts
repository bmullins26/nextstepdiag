import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OwnerSubscriptionRow = {
  userId: string;
  email: string;
  fullName: string | null;
  tier: string;
  planType: string | null;
  status: string;
  environment: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  isActivePro: boolean;
  updatedAt: string | null;
};

export const getBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOwner, isActivePro, PLAN_MONTHLY_VALUE } = await import(
      "@/lib/owner-admin.server"
    );
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: subs, error } = await supabaseAdmin
      .from("subscriptions")
      .select("tier, plan_type, status, current_period_end, cancel_at_period_end, environment");
    if (error) throw new Error(error.message);

    const rows = subs ?? [];
    const active = rows.filter((r: any) => isActivePro(r));
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    for (const r of active) {
      const key = (r.plan_type as string) ?? "unknown";
      byPlan[key] = (byPlan[key] ?? 0) + 1;
      mrr += PLAN_MONTHLY_VALUE[key] ?? 0;
    }
    return {
      totalRows: rows.length,
      activePro: active.length,
      free: rows.length - active.length,
      canceling: active.filter((r: any) => r.cancel_at_period_end).length,
      liveRows: rows.filter((r: any) => r.environment === "live").length,
      byPlan,
      estimatedMrr: Math.round(mrr * 100) / 100,
    };
  });

export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional().default(""),
        filter: z
          .enum(["all", "pro", "free", "canceling", "grandfathered"])
          .optional()
          .default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<OwnerSubscriptionRow[]> => {
    const { assertOwner, isActivePro } = await import("@/lib/owner-admin.server");
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (pErr) throw new Error(pErr.message);

    const { data: subs, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "user_id, tier, plan_type, status, environment, current_period_end, cancel_at_period_end, stripe_customer_id, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);

    const subByUser = new Map<string, any>();
    for (const s of subs ?? []) if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, s);

    const term = data.search.trim().toLowerCase();
    const out: OwnerSubscriptionRow[] = [];
    for (const p of profiles ?? []) {
      const s = subByUser.get(p.id);
      const row: OwnerSubscriptionRow = {
        userId: p.id,
        email: p.email,
        fullName: p.full_name ?? null,
        tier: (s?.tier as string) ?? "free",
        planType: (s?.plan_type as string) ?? null,
        status: (s?.status as string) ?? "none",
        environment: (s?.environment as string) ?? "—",
        currentPeriodEnd: (s?.current_period_end as string) ?? null,
        cancelAtPeriodEnd: !!s?.cancel_at_period_end,
        stripeCustomerId: (s?.stripe_customer_id as string) ?? null,
        isActivePro: s ? isActivePro(s) : false,
        updatedAt: (s?.updated_at as string) ?? null,
      };
      if (term && !`${row.email} ${row.fullName ?? ""}`.toLowerCase().includes(term)) continue;
      if (data.filter === "pro" && !row.isActivePro) continue;
      if (data.filter === "free" && row.isActivePro) continue;
      if (data.filter === "canceling" && !(row.isActivePro && row.cancelAtPeriodEnd)) continue;
      if (data.filter === "grandfathered" && row.planType !== "grandfathered") continue;
      out.push(row);
    }
    return out.slice(0, 500);
  });

export const setUserProAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        action: z.enum(["grant_lifetime", "grant_days", "revoke"]),
        days: z.number().int().min(1).max(3650).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertOwner } = await import("@/lib/owner-admin.server");
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const patch =
      data.action === "revoke"
        ? {
            tier: "free",
            status: "canceled",
            plan_type: null,
            current_period_end: now.toISOString(),
            cancel_at_period_end: false,
          }
        : data.action === "grant_lifetime"
          ? {
              tier: "pro",
              status: "active",
              plan_type: "grandfathered",
              current_period_end: null,
              cancel_at_period_end: false,
            }
          : {
              tier: "pro",
              status: "active",
              plan_type: "monthly",
              current_period_start: now.toISOString(),
              current_period_end: new Date(
                now.getTime() + (data.days ?? 30) * 86400000,
              ).toISOString(),
              cancel_at_period_end: true,
            };

    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      { user_id: data.userId, ...patch, updated_at: now.toISOString() },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportSubscriptionsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOwner, csvEscape, isActivePro } = await import("@/lib/owner-admin.server");
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name"),
      supabaseAdmin
        .from("subscriptions")
        .select(
          "user_id, tier, plan_type, status, environment, current_period_end, cancel_at_period_end, stripe_customer_id",
        ),
    ]);
    const byUser = new Map<string, any>();
    for (const s of subs ?? []) byUser.set(s.user_id, s);
    const header =
      "email,full_name,tier,plan_type,status,environment,current_period_end,cancel_at_period_end,active_pro,stripe_customer_id";
    const lines = (profiles ?? []).map((p: any) => {
      const s = byUser.get(p.id) ?? {};
      return [
        p.email,
        p.full_name,
        s.tier ?? "free",
        s.plan_type ?? "",
        s.status ?? "",
        s.environment ?? "",
        s.current_period_end ?? "",
        s.cancel_at_period_end ?? false,
        s.tier ? isActivePro(s) : false,
        s.stripe_customer_id ?? "",
      ]
        .map(csvEscape)
        .join(",");
    });
    return { csv: [header, ...lines].join("\n"), count: lines.length };
  });
