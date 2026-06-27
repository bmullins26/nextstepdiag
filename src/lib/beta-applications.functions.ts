import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ---------- Public submission ----------

const BRAND_OPTIONS = [
  "Whirlpool",
  "GE",
  "LG",
  "Samsung",
  "Frigidaire",
  "Bosch",
  "Speed Queen",
  "Other",
] as const;

const ROLE_OPTIONS = [
  "Independent Technician",
  "Service Company Technician",
  "Business Owner",
  "Factory Service",
  "Student",
  "Other",
] as const;

const SubmitInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  location: z.string().trim().min(2).max(120),
  experienceYears: z.number().int().min(0).max(60),
  role: z.enum(ROLE_OPTIONS),
  callsPerWeek: z.number().int().min(0).max(500),
  primaryBrands: z.array(z.enum(BRAND_OPTIONS)).min(1),
  reason: z.string().trim().min(20).max(2000),
  videoInterview: z.enum(["yes", "maybe", "no"]).optional(),
  feedbackConsent: z.literal(true),
  betaAcknowledged: z.literal(true),
});

export const submitBetaApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }) => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const insert = {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email.toLowerCase(),
      company: data.company || null,
      location: data.location,
      experience_years: data.experienceYears,
      role: data.role,
      calls_per_week: data.callsPerWeek,
      primary_brands: data.primaryBrands,
      reason: data.reason,
      video_interview: data.videoInterview ?? null,
      status: "pending" as const,
      beta_wave: 1,
      source: "public_form",
    };
    const { error } = await supabase.from("beta_applications").insert(insert);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || error.code === "23505") {
        return { ok: false as const, reason: "duplicate" as const };
      }
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ---------- Owner helpers ----------

async function assertOwner(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

// ---------- List ----------

const ListInput = z.object({
  status: z
    .enum(["pending", "approved", "invited", "active", "waitlisted", "declined", "all"])
    .default("all"),
  wave: z.number().int().min(1).max(50).nullable().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const listBetaApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    let q = context.supabase
      .from("beta_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.wave) q = q.eq("beta_wave", data.wave);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Update status ----------

const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "waitlisted", "declined", "invited", "active"]),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateBetaApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: data.status,
      reviewed_by: context.userId,
      reviewed_at: now,
    };
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status === "approved") {
      patch.approved_by = context.userId;
      patch.approved_at = now;
    }
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Assign wave ----------

const WaveInput = z.object({
  id: z.string().uuid(),
  wave: z.number().int().min(1).max(50),
});

export const assignBetaWave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WaveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update({ beta_wave: data.wave })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Send / Resend invite ----------

const SendInviteInput = z.object({ id: z.string().uuid() });

export const sendBetaInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInviteInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error: readErr } = await context.supabase
      .from("beta_applications")
      .select("id,email,first_name,last_name,status,beta_wave")
      .eq("id", data.id)
      .single();
    if (readErr || !row) throw new Error(readErr?.message ?? "Application not found");
    if (row.status !== "approved" && row.status !== "invited") {
      throw new Error("Application must be Approved before sending an invite.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const siteOrigin =
      process.env.SITE_URL ?? process.env.PUBLIC_SITE_URL ?? "https://nextstepdiag.com";
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email, {
      data: {
        first_name: row.first_name,
        last_name: row.last_name,
        source: "beta",
        beta_wave: row.beta_wave,
      },
      redirectTo: `${siteOrigin}/auth`,
    });
    if (inviteErr) {
      const msg = inviteErr.message || "";
      // Allow re-inviting an already-registered user — flip to invited anyway
      if (!/registered|exists/i.test(msg)) {
        throw new Error(msg);
      }
    }

    const { data: updated, error: updErr } = await context.supabase
      .from("beta_applications")
      .update({ status: "invited", invited_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    return updated;
  });

// ---------- Program stats ----------

export type BetaProgramStats = {
  totals: Record<string, number> & { total: number };
  byWave: Array<{ wave: number; count: number }>;
  byExperience: Array<{ bucket: string; count: number }>;
  byBrand: Array<{ brand: string; count: number }>;
  byRegion: Array<{ region: string; count: number }>;
  avgExperience: number | null;
  avgCallsPerWeek: number | null;
  videoInterview: { yes: number; maybe: number; no: number };
};

export const getBetaProgramStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BetaProgramStats> => {
    await assertOwner(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("beta_applications")
      .select(
        "status,beta_wave,experience_years,calls_per_week,primary_brands,location,video_interview",
      )
      .limit(10000);
    if (error) throw new Error(error.message);

    const totals: Record<string, number> = {
      pending: 0,
      approved: 0,
      invited: 0,
      active: 0,
      waitlisted: 0,
      declined: 0,
      total: 0,
    };
    const waves = new Map<number, number>();
    const buckets = { "0-2": 0, "3-5": 0, "6-10": 0, "10+": 0 } as Record<string, number>;
    const brands = new Map<string, number>();
    const regions = new Map<string, number>();
    let expSum = 0;
    let callsSum = 0;
    const vi = { yes: 0, maybe: 0, no: 0 };

    for (const r of rows ?? []) {
      totals.total += 1;
      totals[r.status] = (totals[r.status] ?? 0) + 1;
      waves.set(r.beta_wave, (waves.get(r.beta_wave) ?? 0) + 1);
      const yrs = r.experience_years ?? 0;
      expSum += yrs;
      callsSum += r.calls_per_week ?? 0;
      if (yrs <= 2) buckets["0-2"] += 1;
      else if (yrs <= 5) buckets["3-5"] += 1;
      else if (yrs <= 10) buckets["6-10"] += 1;
      else buckets["10+"] += 1;
      const bs = Array.isArray(r.primary_brands) ? (r.primary_brands as string[]) : [];
      for (const b of bs) brands.set(b, (brands.get(b) ?? 0) + 1);
      const loc = (r.location ?? "").trim();
      if (loc) {
        const region = loc.split(",").pop()?.trim() || loc;
        regions.set(region, (regions.get(region) ?? 0) + 1);
      }
      if (r.video_interview && r.video_interview in vi) {
        vi[r.video_interview as "yes" | "maybe" | "no"] += 1;
      }
    }

    const n = totals.total || 1;
    return {
      totals: totals as BetaProgramStats["totals"],
      byWave: Array.from(waves.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([wave, count]) => ({ wave, count })),
      byExperience: Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
      byBrand: Array.from(brands.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([brand, count]) => ({ brand, count })),
      byRegion: Array.from(regions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([region, count]) => ({ region, count })),
      avgExperience: totals.total ? Math.round((expSum / n) * 10) / 10 : null,
      avgCallsPerWeek: totals.total ? Math.round((callsSum / n) * 10) / 10 : null,
      videoInterview: vi,
    };
  });

// ---------- Tester metrics + health score ----------

export type TesterMetrics = {
  applicationId: string;
  userId: string | null;
  email: string;
  lastLogin: string | null;
  accountCreated: string | null;
  totalSessions: number;
  completedSessions: number;
  pendingRepairs: number;
  outcomeConfirmations: number;
  bugReports: number;
  featureRequests: number;
  feedbackEntries: number;
  lastActivity: string | null;
  healthScore: number;
  badge: { stars: number; label: string };
};

function badgeFor(score: number): { stars: number; label: string } {
  if (score >= 80) return { stars: 5, label: "Power Tester" };
  if (score >= 60) return { stars: 4, label: "Active Tester" };
  if (score >= 35) return { stars: 3, label: "Occasional Tester" };
  if (score >= 15) return { stars: 2, label: "Needs Attention" };
  return { stars: 1, label: "Inactive" };
}

const MetricsInput = z.object({ id: z.string().uuid() });

export const getBetaTesterMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MetricsInput.parse(d))
  .handler(async ({ data, context }): Promise<TesterMetrics> => {
    await assertOwner(context.supabase, context.userId);
    const { data: app, error: appErr } = await context.supabase
      .from("beta_applications")
      .select("id,email,user_id")
      .eq("id", data.id)
      .single();
    if (appErr || !app) throw new Error(appErr?.message ?? "Application not found");

    const empty: TesterMetrics = {
      applicationId: app.id,
      userId: app.user_id,
      email: app.email,
      lastLogin: null,
      accountCreated: null,
      totalSessions: 0,
      completedSessions: 0,
      pendingRepairs: 0,
      outcomeConfirmations: 0,
      bugReports: 0,
      featureRequests: 0,
      feedbackEntries: 0,
      lastActivity: null,
      healthScore: 0,
      badge: badgeFor(0),
    };
    if (!app.user_id) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = app.user_id;

    const [authUserRes, sessionsRes, outcomesRes, feedbackRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(uid),
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("status,updated_at")
        .eq("user_id", uid),
      supabaseAdmin
        .from("diagnostic_outcomes")
        .select("outcome,created_at")
        .eq("user_id", uid),
      supabaseAdmin.from("feedback").select("kind,created_at").eq("user_id", uid),
    ]);

    const authUser = authUserRes.data?.user;
    const sessions = sessionsRes.data ?? [];
    const outcomes = outcomesRes.data ?? [];
    const feedback = feedbackRes.data ?? [];

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.status === "completed").length;
    const pendingRepairs = outcomes.filter((o) => o.outcome === "pending_repair").length;
    const confirmations = outcomes.filter((o) => o.outcome === "confirmed").length;
    const bugReports = feedback.filter((f) => f.kind === "bug").length;
    const featureRequests = feedback.filter((f) => f.kind === "feature").length;
    const feedbackEntries = feedback.length;

    const datesMs = [
      authUser?.last_sign_in_at,
      ...sessions.map((s) => s.updated_at),
      ...outcomes.map((o) => o.created_at),
      ...feedback.map((f) => f.created_at),
    ]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime())
      .filter((n) => !isNaN(n));
    const lastActivityMs = datesMs.length ? Math.max(...datesMs) : null;
    const lastActivity = lastActivityMs ? new Date(lastActivityMs).toISOString() : null;

    let recencyBonus = 0;
    let inactivityPenalty = 0;
    if (lastActivityMs) {
      const daysSince = (Date.now() - lastActivityMs) / 86_400_000;
      if (daysSince < 7) recencyBonus = 10;
      else if (daysSince < 30) recencyBonus = 7;
      else if (daysSince < 60) recencyBonus = 3;
      if (daysSince > 60) inactivityPenalty = 10;
    } else {
      inactivityPenalty = 10;
    }

    const raw =
      Math.min(completedSessions, 30) * 1.5 +
      Math.min(confirmations, 20) * 1.0 +
      Math.min(bugReports, 10) * 1.5 +
      Math.min(featureRequests, 10) * 1.0 +
      recencyBonus -
      inactivityPenalty;
    const healthScore = Math.max(0, Math.min(100, Math.round(raw)));

    return {
      applicationId: app.id,
      userId: uid,
      email: app.email,
      lastLogin: authUser?.last_sign_in_at ?? null,
      accountCreated: authUser?.created_at ?? null,
      totalSessions,
      completedSessions,
      pendingRepairs,
      outcomeConfirmations: confirmations,
      bugReports,
      featureRequests,
      feedbackEntries,
      lastActivity,
      healthScore,
      badge: badgeFor(healthScore),
    };
  });

// ---------- Most/least active rosters ----------

export type TesterRosterEntry = {
  id: string;
  name: string;
  email: string;
  lastActivity: string | null;
  totalSessions: number;
  healthScore: number;
  badge: { stars: number; label: string };
};

export const getBetaTesterRosters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: apps, error } = await context.supabase
      .from("beta_applications")
      .select("id,first_name,last_name,email,user_id,status")
      .in("status", ["active", "invited"]);
    if (error) throw new Error(error.message);
    const withUser = (apps ?? []).filter((a) => a.user_id);
    if (withUser.length === 0) {
      return { mostActive: [] as TesterRosterEntry[], inactive: [] as TesterRosterEntry[] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = withUser.map((a) => a.user_id as string);
    const [sessionsRes, outcomesRes, feedbackRes] = await Promise.all([
      supabaseAdmin
        .from("diagnostic_sessions")
        .select("user_id,status,updated_at")
        .in("user_id", userIds),
      supabaseAdmin
        .from("diagnostic_outcomes")
        .select("user_id,outcome,created_at")
        .in("user_id", userIds),
      supabaseAdmin.from("feedback").select("user_id,kind,created_at").in("user_id", userIds),
    ]);
    const byUser = new Map<string, { sessions: any[]; outcomes: any[]; feedback: any[] }>();
    for (const uid of userIds) byUser.set(uid, { sessions: [], outcomes: [], feedback: [] });
    for (const s of sessionsRes.data ?? []) byUser.get(s.user_id!)?.sessions.push(s);
    for (const o of outcomesRes.data ?? []) byUser.get(o.user_id!)?.outcomes.push(o);
    for (const f of feedbackRes.data ?? []) byUser.get(f.user_id!)?.feedback.push(f);

    const rows: TesterRosterEntry[] = withUser.map((a) => {
      const u = byUser.get(a.user_id as string)!;
      const totalSessions = u.sessions.length;
      const completed = u.sessions.filter((s) => s.status === "completed").length;
      const confirmations = u.outcomes.filter((o) => o.outcome === "confirmed").length;
      const bugs = u.feedback.filter((f) => f.kind === "bug").length;
      const features = u.feedback.filter((f) => f.kind === "feature").length;
      const ms = [
        ...u.sessions.map((s) => s.updated_at),
        ...u.outcomes.map((o) => o.created_at),
        ...u.feedback.map((f) => f.created_at),
      ]
        .filter(Boolean)
        .map((d) => new Date(d as string).getTime());
      const lastMs = ms.length ? Math.max(...ms) : null;
      let recency = 0;
      let penalty = 0;
      if (lastMs) {
        const d = (Date.now() - lastMs) / 86_400_000;
        if (d < 7) recency = 10;
        else if (d < 30) recency = 7;
        else if (d < 60) recency = 3;
        if (d > 60) penalty = 10;
      } else penalty = 10;
      const raw =
        Math.min(completed, 30) * 1.5 +
        Math.min(confirmations, 20) +
        Math.min(bugs, 10) * 1.5 +
        Math.min(features, 10) +
        recency -
        penalty;
      const score = Math.max(0, Math.min(100, Math.round(raw)));
      return {
        id: a.id,
        name: `${a.first_name} ${a.last_name}`.trim(),
        email: a.email,
        lastActivity: lastMs ? new Date(lastMs).toISOString() : null,
        totalSessions,
        healthScore: score,
        badge: badgeFor(score),
      };
    });

    const mostActive = [...rows].sort((a, b) => b.healthScore - a.healthScore).slice(0, 10);
    const inactive = [...rows]
      .sort((a, b) => {
        const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return at - bt;
      })
      .slice(0, 10);
    return { mostActive, inactive };
  });