import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateCostUsd } from "./ai-cost";

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

// ---------- amOwner (cheap check used by the route gate) ----------
export const amOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    return { isOwner: !!data };
  });

// ---------- Overview ----------
export const getOwnerOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = isoDaysAgo(1);
    const week = isoDaysAgo(7);
    const month = isoDaysAgo(30);

    const [totalUsers, planCounts, activeToday, activeWeek, activeMonth] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("plan"),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("user_id")
        .gte("updated_at", today),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("user_id")
        .gte("updated_at", week),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("user_id")
        .gte("updated_at", month),
    ]);

    const planTotals = { free: 0, pro: 0, master: 0, lifetime: 0 } as Record<string, number>;
    for (const p of planCounts.data ?? []) planTotals[p.plan] = (planTotals[p.plan] ?? 0) + 1;

    const distinct = (rows: { user_id: string | null }[] | null) => {
      const s = new Set<string>();
      for (const r of rows ?? []) if (r.user_id) s.add(r.user_id);
      return s.size;
    };

    return {
      totalUsers: totalUsers.count ?? 0,
      activeToday: distinct(activeToday.data),
      activeWeek: distinct(activeWeek.data),
      activeMonth: distinct(activeMonth.data),
      free: planTotals.free,
      pro: planTotals.pro,
      master: planTotals.master,
      lifetime: planTotals.lifetime,
    };
  });

// ---------- AI Usage ----------
export const getAiUsageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = isoDaysAgo(1);
    const week = isoDaysAgo(7);
    const month = isoDaysAgo(30);

    const [t, w, m, all, byFeature] = await Promise.all([
      supabaseAdmin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", today),
      supabaseAdmin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", week),
      supabaseAdmin.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", month),
      supabaseAdmin.from("ai_usage").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("ai_usage").select("feature, input_tokens, output_tokens"),
    ]);

    const features: Record<string, { calls: number; input: number; output: number }> = {};
    for (const r of byFeature.data ?? []) {
      const f = (features[r.feature] ??= { calls: 0, input: 0, output: 0 });
      f.calls += 1;
      f.input += r.input_tokens ?? 0;
      f.output += r.output_tokens ?? 0;
    }

    return {
      today: t.count ?? 0,
      week: w.count ?? 0,
      month: m.count ?? 0,
      total: all.count ?? 0,
      byFeature: Object.entries(features)
        .map(([feature, v]) => ({ feature, ...v }))
        .sort((a, b) => b.calls - a.calls),
    };
  });

// ---------- AI Cost ----------
export const getAiCostEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = isoDaysAgo(1);
    const month = isoDaysAgo(30);

    const [todayRows, monthRows, allRows, users] = await Promise.all([
      supabaseAdmin.from("ai_usage").select("model, input_tokens, output_tokens").gte("created_at", today),
      supabaseAdmin.from("ai_usage").select("model, input_tokens, output_tokens").gte("created_at", month),
      supabaseAdmin.from("ai_usage").select("user_id, model, input_tokens, output_tokens"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const sum = (rows: { model: string; input_tokens: number; output_tokens: number }[] | null) =>
      (rows ?? []).reduce(
        (acc, r) => acc + estimateCostUsd(r.model || "", r.input_tokens ?? 0, r.output_tokens ?? 0),
        0,
      );

    const perUser = new Map<string, number>();
    for (const r of allRows.data ?? []) {
      if (!r.user_id) continue;
      perUser.set(
        r.user_id,
        (perUser.get(r.user_id) ?? 0) +
          estimateCostUsd(r.model || "", r.input_tokens ?? 0, r.output_tokens ?? 0),
      );
    }
    const userCount = users.count ?? 0;
    const totalAll = Array.from(perUser.values()).reduce((a, b) => a + b, 0);
    const avgPerUser = userCount > 0 ? totalAll / userCount : 0;

    return {
      today: sum(todayRows.data),
      month: sum(monthRows.data),
      avgPerUser,
    };
  });

// ---------- Users list ----------
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional().default("") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, plan, is_suspended, last_login_at, last_activity_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const s = data.search.trim();
    if (s) {
      const like = `%${s}%`;
      q = q.or(`email.ilike.${like},full_name.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let ownerIds = new Set<string>();
    if (ids.length) {
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids)
        .eq("role", "owner");
      ownerIds = new Set((roleRows ?? []).map((r) => r.user_id));
    }

    // Pull last_sign_in_at from auth.admin (limited to first 1000; fine for an owner table)
    const authMap = new Map<string, string | null>();
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) authMap.set(u.id, u.last_sign_in_at ?? null);
    } catch {}

    return (rows ?? []).map((r) => ({
      ...r,
      role: ownerIds.has(r.id) ? ("owner" as const) : ("user" as const),
      last_sign_in_at: authMap.get(r.id) ?? null,
    }));
  });

// ---------- User detail ----------
export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profile, sessions, usage, roleRow] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, plan, is_suspended, last_login_at, last_activity_at, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.userId),
      supabaseAdmin
        .from("ai_usage")
        .select("feature, input_tokens, output_tokens, model")
        .eq("user_id", data.userId),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "owner")
        .maybeSingle(),
    ]);

    if (profile.error) throw new Error(profile.error.message);

    const byFeature: Record<string, { calls: number; input: number; output: number; costUsd: number }> = {};
    let totalCost = 0;
    for (const r of usage.data ?? []) {
      const f = (byFeature[r.feature] ??= { calls: 0, input: 0, output: 0, costUsd: 0 });
      f.calls += 1;
      f.input += r.input_tokens ?? 0;
      f.output += r.output_tokens ?? 0;
      const c = estimateCostUsd(r.model || "", r.input_tokens ?? 0, r.output_tokens ?? 0);
      f.costUsd += c;
      totalCost += c;
    }

    return {
      profile: profile.data,
      role: roleRow.data ? ("owner" as const) : ("user" as const),
      totalDiagnoses: sessions.count ?? 0,
      totalAiCalls: (usage.data ?? []).length,
      totalCostUsd: totalCost,
      byFeature: Object.entries(byFeature)
        .map(([feature, v]) => ({ feature, ...v }))
        .sort((a, b) => b.calls - a.calls),
    };
  });

// ---------- Mutations ----------
export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.enum(["free", "pro", "master", "lifetime"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plan: data.plan })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot suspend yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const banDuration = data.suspended ? "876000h" : "none";
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: banDuration,
    } as never);
    if (aErr) throw new Error(aErr.message);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserOwnerRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), grant: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "owner" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) throw new Error("You cannot revoke your own owner role.");
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "owner");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Feedback (owner views) ----------
export const listFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["bug", "feature", "general", "all"]).optional().default("all"),
        status: z.enum(["open", "reviewed", "closed", "all"]).optional().default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("feedback")
      .select("id, user_id, kind, subject, body, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve emails for display
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)));
    const emailMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ids);
      for (const p of profs ?? []) emailMap.set(p.id, p.email);
    }
    return (rows ?? []).map((r) => ({ ...r, email: emailMap.get(r.user_id) ?? "" }));
  });

export const updateFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "reviewed", "closed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("feedback")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });