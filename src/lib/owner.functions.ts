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

// ---------- Age decoder stats ----------
export const getAgeDecoderStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = isoDaysAgo(30);
    const { data: rows, error } = await supabaseAdmin
      .from("age_decode_attempts")
      .select(
        "decoder_version, manufacturer, status, confidence, confidence_percent, rejected_count, rejection_reason, rule_id, unknown_reason, model_number, serial_number, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    type Row = NonNullable<typeof rows>[number];
    const all: Row[] = rows ?? [];

    // Totals (v2 only — v1 rows are for comparison logging).
    // Everything that isn't the legacy comparison logger is the current engine.
    const v2 = all.filter((r) => r.decoder_version !== "v1-legacy");
    const total = v2.length;
    const successful = v2.filter((r) => r.status === "ok").length;
    const unknown = total - successful;
    const successRate = total ? successful / total : 0;

    // Per-day trend (last 30 days), v2 only.
    const dayBuckets: Record<string, { total: number; ok: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const k = d.toISOString().slice(0, 10);
      dayBuckets[k] = { total: 0, ok: 0 };
    }
    for (const r of v2) {
      const k = (r.created_at ?? "").slice(0, 10);
      if (!dayBuckets[k]) continue;
      dayBuckets[k].total += 1;
      if (r.status === "ok") dayBuckets[k].ok += 1;
    }
    const trend = Object.entries(dayBuckets).map(([date, v]) => ({
      date,
      total: v.total,
      successRate: v.total ? v.ok / v.total : 0,
      unknownRate: v.total ? 1 - v.ok / v.total : 0,
    }));

    // Per-manufacturer + per-decoder-version breakdown.
    const mfrMap = new Map<string, { mfr: string; v1: { total: number; ok: number }; v2: { total: number; ok: number } }>();
    for (const r of all) {
      const key = (r.manufacturer || "Unknown").toLowerCase();
      const e = mfrMap.get(key) ?? {
        mfr: r.manufacturer || "Unknown",
        v1: { total: 0, ok: 0 },
        v2: { total: 0, ok: 0 },
      };
      const bucket = r.decoder_version !== "v1-legacy" ? e.v2 : e.v1;
      bucket.total += 1;
      if (r.status === "ok") bucket.ok += 1;
      mfrMap.set(key, e);
    }
    const perManufacturer = Array.from(mfrMap.values())
      .map((e) => ({
        manufacturer: e.mfr,
        v2Total: e.v2.total,
        v2SuccessRate: e.v2.total ? e.v2.ok / e.v2.total : 0,
        v1Total: e.v1.total,
        v1SuccessRate: e.v1.total ? e.v1.ok / e.v1.total : 0,
      }))
      .sort((a, b) => b.v2Total - a.v2Total);

    // Top 5 unknown reasons (v2).
    const reasonMap = new Map<string, number>();
    for (const r of v2) {
      if (r.status !== "unknown" || !r.unknown_reason) continue;
      reasonMap.set(r.unknown_reason, (reasonMap.get(r.unknown_reason) ?? 0) + 1);
    }
    const topUnknownReasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Last 20 unknown serials (v2).
    const recentUnknowns = v2
      .filter((r) => r.status === "unknown")
      .slice(0, 20)
      .map((r) => ({
        manufacturer: r.manufacturer,
        modelNumber: r.model_number,
        serialNumber: r.serial_number,
        reason: r.unknown_reason ?? "unknown",
        createdAt: r.created_at,
      }));

    // Per-rule analytics — surfaces weak decoding rules so they can be improved.
    const ruleMap = new Map<
      string,
      { ruleId: string; total: number; ok: number; rejected: number; confSum: number; confN: number }
    >();
    for (const r of v2) {
      const key = r.rule_id || "(no rule matched)";
      const e = ruleMap.get(key) ?? { ruleId: key, total: 0, ok: 0, rejected: 0, confSum: 0, confN: 0 };
      e.total += 1;
      if (r.status === "ok") e.ok += 1;
      e.rejected += (r as any).rejected_count ?? 0;
      const cp = (r as any).confidence_percent as number | null;
      if (cp != null) {
        e.confSum += cp;
        e.confN += 1;
      }
      ruleMap.set(key, e);
    }
    const perRule = Array.from(ruleMap.values())
      .map((e) => ({
        ruleId: e.ruleId,
        total: e.total,
        successful: e.ok,
        rejectedCandidates: e.rejected,
        accuracy: e.total ? e.ok / e.total : 0,
        avgConfidence: e.confN ? Math.round(e.confSum / e.confN) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total,
      successful,
      unknown,
      successRate,
      trend,
      perManufacturer,
      topUnknownReasons,
      recentUnknowns,
      perRule,
    };
  });

// ---------- Tech sheet coverage ----------
export const getTechSheetCoverageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = isoDaysAgo(30);

    const [lookupsRes, sheetsRes] = await Promise.all([
      supabaseAdmin
        .from("tech_sheet_lookups")
        .select("brand, model_number, outcome, cache_hit, confidence, source_trust, source_url, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("tech_sheets")
        .select("source_trust, confidence")
        .limit(5000),
    ]);

    if (lookupsRes.error) throw new Error(lookupsRes.error.message);
    if (sheetsRes.error) throw new Error(sheetsRes.error.message);

    const lookups = lookupsRes.data ?? [];
    const sheets = sheetsRes.data ?? [];

    const total = lookups.length;
    const cacheHits = lookups.filter((r) => r.cache_hit).length;
    const cacheHitRate = total ? cacheHits / total : 0;

    const confidenceCounts = {
      exact_model: 0,
      platform_family: 0,
      manufacturer_family: 0,
      low: 0,
    } as Record<string, number>;
    for (const r of lookups) {
      confidenceCounts[r.confidence] = (confidenceCounts[r.confidence] ?? 0) + 1;
    }

    // Source trust breakdown across cached sheets (not lookup events) — represents corpus quality.
    const trustCounts: Record<string, number> = { oem: 0, trusted_reference: 0, community: 0 };
    for (const s of sheets) {
      trustCounts[s.source_trust] = (trustCounts[s.source_trust] ?? 0) + 1;
    }
    const trustTotal = sheets.length;
    const trustBreakdown = Object.entries(trustCounts).map(([trust, count]) => ({
      trust,
      count,
      percentage: trustTotal ? count / trustTotal : 0,
    }));

    // Recent cache misses (so the team can manually seed)
    const recentMisses = lookups
      .filter((r) => r.outcome === "miss_low" || r.outcome === "miss_fetched")
      .slice(0, 20)
      .map((r) => ({
        brand: r.brand,
        modelNumber: r.model_number,
        confidence: r.confidence,
        sourceTrust: r.source_trust,
        createdAt: r.created_at,
      }));

    return {
      total,
      cacheHits,
      cacheHitRate,
      confidenceCounts,
      trustBreakdown,
      trustTotal,
      sheetsCached: sheets.length,
      recentMisses,
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
      .select("id, email, full_name, display_name, plan, is_suspended, last_login_at, last_activity_at, created_at")
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

    // Derive diagnostic session counts from the authoritative session records.
    const sessionCounts = new Map<string, number>();
    if (ids.length) {
      const { data: sessionRows } = await supabaseAdmin
        .from("diagnostic_sessions")
        .select("user_id")
        .in("user_id", ids)
        .limit(50000);
      for (const s of sessionRows ?? []) {
        sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) ?? 0) + 1);
      }
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
      sessions: sessionCounts.get(r.id) ?? 0,
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
        .select("id, email, full_name, display_name, plan, is_suspended, last_login_at, last_activity_at, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("status")
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

    const { sessionKnowledgeStatusFor } = await import("@/lib/knowledge/session-ingest.server");
    const knowledgeStatus = await sessionKnowledgeStatusFor(supabaseAdmin as any, data.userId);

    const sessionRows = sessions.data ?? [];
    const sessionsByStatus = { completed: 0, active: 0, abandoned: 0 };
    for (const s of sessionRows) {
      if (s.status === "completed") sessionsByStatus.completed += 1;
      else if (s.status === "active") sessionsByStatus.active += 1;
      else if (s.status === "abandoned") sessionsByStatus.abandoned += 1;
    }

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
      totalDiagnoses: sessionRows.length,
      sessionsByStatus,
      knowledgeStatus,
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

export const setUserDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        displayName: z.string().trim().max(80).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const display_name = data.displayName && data.displayName.length > 0 ? data.displayName : null;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.email) throw new Error("User has no email on file.");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: prof.email,
    });
    if (error) throw new Error(error.message);
    return {
      ok: true,
      email: prof.email,
      actionLink: link?.properties?.action_link ?? null,
    };
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