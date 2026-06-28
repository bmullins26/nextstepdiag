import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { normalizeLocation } from "@/lib/beta/normalize-location";

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
      location_raw: data.location,
      state: normalizeLocation(data.location).state,
      experience_years: data.experienceYears,
      role: data.role,
      calls_per_week: data.callsPerWeek,
      primary_brands: data.primaryBrands,
      reason: data.reason,
      status: "pending" as const,
      application_status: "pending" as const,
      access_status: "not_invited" as const,
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

    // Fire-and-forget Discord notification — never blocks or throws.
    try {
      const { sendDiscordNotification, DISCORD_COLORS } = await import("@/lib/discord.server");
      const roleId = process.env.DISCORD_OWNER_ROLE_ID;
      void sendDiscordNotification({
        webhookUrl: process.env.DISCORD_BETA_WEBHOOK_URL,
        title: "🚀 New Beta Application",
        url: "https://nextstepdiag.com/owner?tab=beta",
        color: DISCORD_COLORS.blue,
        content: roleId ? `<@&${roleId}>` : undefined,
        description: "**Review Application:** https://nextstepdiag.com/owner?tab=beta",
        footer: "NextStep Diagnostics Beta Program",
        fields: [
          { name: "Name", value: `${data.firstName} ${data.lastName}`, inline: true },
          { name: "Email", value: data.email, inline: true },
          { name: "Company", value: data.company || "—", inline: true },
          { name: "Location", value: data.location, inline: true },
          { name: "Experience", value: `${data.experienceYears} yrs`, inline: true },
          { name: "Role", value: data.role, inline: true },
          { name: "Calls / Week", value: String(data.callsPerWeek), inline: true },
          { name: "Brands", value: data.primaryBrands.join(", ") },
          { name: "Reason", value: data.reason },
        ],
      });
    } catch (err) {
      console.warn("[beta] discord notify skipped", err);
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
  applicationStatus: z
    .enum(["pending", "approved", "waitlisted", "declined", "all"])
    .default("all"),
  accessStatus: z
    .enum(["not_invited", "invited", "active", "suspended", "deactivated", "all"])
    .default("all"),
  labels: z.array(z.string()).optional(),
  minRating: z.number().int().min(1).max(5).optional(),
  sort: z
    .enum([
      "newest",
      "oldest",
      "experience",
      "calls",
      "last_login",
      "health",
      "application_status",
      "access_status",
    ])
    .default("newest"),
  wave: z.number().int().min(1).max(50).nullable().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const listBetaApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    let q = context.supabase.from("beta_applications").select("*");
    if (data.applicationStatus !== "all") q = q.eq("application_status", data.applicationStatus);
    if (data.accessStatus !== "all") q = q.eq("access_status", data.accessStatus);
    if (data.wave) q = q.eq("beta_wave", data.wave);
    if (data.minRating) q = q.gte("owner_rating", data.minRating);
    if (data.labels && data.labels.length) q = q.overlaps("owner_labels", data.labels);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      const like = `%${s}%`;
      q = q.or(
        [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `email.ilike.${like}`,
          `company.ilike.${like}`,
          `state.ilike.${like}`,
          `role.ilike.${like}`,
          `primary_brands.cs.["${s}"]`,
        ].join(","),
      );
    }
    switch (data.sort) {
      case "oldest":
        q = q.order("created_at", { ascending: true });
        break;
      case "experience":
        q = q.order("experience_years", { ascending: false });
        break;
      case "calls":
        q = q.order("calls_per_week", { ascending: false });
        break;
      case "application_status":
        q = q.order("application_status").order("created_at", { ascending: false });
        break;
      case "access_status":
        q = q.order("access_status").order("created_at", { ascending: false });
        break;
      default:
        q = q.order("created_at", { ascending: false });
    }
    q = q.limit(data.limit);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Review (application_status) ----------

const ReviewInput = z.object({
  id: z.string().uuid(),
  decision: z.enum(["pending", "approved", "waitlisted", "declined"]),
  reason: z.string().max(500).optional(),
});

export const reviewApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["beta_applications"]["Update"] = {
      application_status: data.decision,
      status: data.decision === "approved" ? "approved" : data.decision,
      reviewed_by: context.userId,
      reviewed_at: now,
    };
    if (data.reason !== undefined) patch.last_status_reason = data.reason;
    if (data.decision === "approved") {
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

// Backward-compat shim: old name some UI/tests may still reference.
export const updateBetaApplicationStatus = reviewApplication;

// ---------- Access status mutations ----------

const IdInput = z.object({ id: z.string().uuid() });
const IdReasonInput = z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() });

async function setAccessStatus(opts: {
  context: { supabase: any; userId: string };
  id: string;
  next: "not_invited" | "invited" | "active" | "suspended" | "deactivated";
  reason?: string;
  globalSignOut?: boolean;
}) {
  await assertOwner(opts.context.supabase, opts.context.userId);
  const patch: Database["public"]["Tables"]["beta_applications"]["Update"] = {
    access_status: opts.next,
  };
  if (opts.reason !== undefined) patch.last_status_reason = opts.reason;
  if (opts.next === "active") {
    patch.activated_at = new Date().toISOString();
  }
  const { data: row, error } = await opts.context.supabase
    .from("beta_applications")
    .update(patch)
    .eq("id", opts.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (opts.globalSignOut && row?.user_id) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.signOut(row.user_id, "global");
    } catch (e) {
      console.warn("[beta] global signOut failed", e);
    }
  }
  return row;
}

export const activateBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(({ data, context }) =>
    setAccessStatus({ context, id: data.id, next: "active" }),
  );

export const suspendBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdReasonInput.parse(d))
  .handler(({ data, context }) =>
    setAccessStatus({ context, id: data.id, next: "suspended", reason: data.reason, globalSignOut: true }),
  );

export const deactivateBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdReasonInput.parse(d))
  .handler(({ data, context }) =>
    setAccessStatus({ context, id: data.id, next: "deactivated", reason: data.reason, globalSignOut: true }),
  );

export const reinstateBetaTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("beta_applications")
      .select("user_id")
      .eq("id", data.id)
      .single();
    const next = row?.user_id ? "active" : "invited";
    return setAccessStatus({ context, id: data.id, next });
  });

export const deleteBetaApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error: readErr } = await context.supabase
      .from("beta_applications")
      .select("id,application_status,user_id")
      .eq("id", data.id)
      .single();
    if (readErr || !row) throw new Error(readErr?.message ?? "Application not found");
    if (!["pending", "waitlisted", "declined"].includes(row.application_status)) {
      throw new Error("Only pending, waitlisted, or declined applications can be deleted.");
    }
    if (row.user_id) {
      throw new Error("Cannot delete: a user account is linked to this application.");
    }
    const { error } = await context.supabase.from("beta_applications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Owner notes / rating / labels / state ----------

export const updateOwnerNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), notes: z.string().max(10000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update({
        owner_notes: data.notes,
        owner_notes_updated_at: new Date().toISOString(),
        owner_notes_updated_by: context.userId,
      })
      .eq("id", data.id)
      .select("owner_notes,owner_notes_updated_at,owner_notes_updated_by")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOwnerRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), rating: z.number().int().min(1).max(5).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update({ owner_rating: data.rating })
      .eq("id", data.id)
      .select("owner_rating")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setOwnerLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), labels: z.array(z.string().max(60)).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update({ owner_labels: data.labels })
      .eq("id", data.id)
      .select("owner_labels")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateApplicantState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), state: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("beta_applications")
      .update({ state: data.state })
      .eq("id", data.id)
      .select("state")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Bulk + CSV ----------

const BulkAction = z.enum([
  "approve",
  "waitlist",
  "decline",
  "invite",
  "activate",
  "suspend",
  "deactivate",
  "delete_pending",
]);

export const bulkApplyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: BulkAction }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of data.ids) {
      try {
        switch (data.action) {
          case "approve":
          case "waitlist":
          case "decline": {
            const decision = data.action === "approve" ? "approved" : data.action === "waitlist" ? "waitlisted" : "declined";
            await context.supabase
              .from("beta_applications")
              .update({
                application_status: decision,
                status: decision,
                reviewed_by: context.userId,
                reviewed_at: new Date().toISOString(),
                ...(decision === "approved" ? { approved_by: context.userId, approved_at: new Date().toISOString() } : {}),
              })
              .eq("id", id);
            break;
          }
          case "invite":
            await sendBetaInvite({ data: { id } });
            break;
          case "activate":
            await setAccessStatus({ context, id, next: "active" });
            break;
          case "suspend":
            await setAccessStatus({ context, id, next: "suspended", globalSignOut: true });
            break;
          case "deactivate":
            await setAccessStatus({ context, id, next: "deactivated", globalSignOut: true });
            break;
          case "delete_pending": {
            const { data: row } = await context.supabase
              .from("beta_applications")
              .select("application_status,user_id")
              .eq("id", id)
              .single();
            if (row && !row.user_id && ["pending", "waitlisted", "declined"].includes(row.application_status)) {
              await context.supabase.from("beta_applications").delete().eq("id", id);
            } else {
              throw new Error("Not eligible for delete");
            }
            break;
          }
        }
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    return { results };
  });

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportBetaApplicationsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    let q = context.supabase
      .from("beta_applications")
      .select(
        "id,first_name,last_name,email,company,state,location_raw,role,experience_years,calls_per_week,primary_brands,application_status,access_status,owner_rating,owner_labels,created_at,invited_at,activated_at",
      )
      .order("created_at", { ascending: false });
    if (data.ids && data.ids.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const headers = [
      "id","first_name","last_name","email","company","state","location_raw","role","experience_years","calls_per_week","primary_brands","application_status","access_status","owner_rating","owner_labels","created_at","invited_at","activated_at",
    ];
    const body = (rows ?? []).map((r) => headers.map((h) => csvEscape((r as any)[h])).join(",")).join("\n");
    return { csv: headers.join(",") + "\n" + body };
  });

// ---------- Access gate ----------

export const hasBetaAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    const isOwner = !!roleRow;
    const { data: app } = await context.supabase
      .from("beta_applications")
      .select("access_status,application_status")
      .eq("user_id", context.userId)
      .maybeSingle();
    const accessStatus = (app?.access_status as string | null) ?? null;
    const ok = isOwner || accessStatus === "active" || accessStatus === null; // null = no application (legacy users) - allow
    return { ok, isOwner, accessStatus, applicationStatus: app?.application_status ?? null };
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
    const startedAt = new Date().toISOString();
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
    const redirectTo = `${siteOrigin}/auth`;
    console.log("[beta-invite] start", {
      applicationId: row.id,
      email: row.email,
      redirectTo,
      startedAt,
      actorUserId: context.userId,
    });

    const inviteRes = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email, {
      data: {
        first_name: row.first_name,
        last_name: row.last_name,
        source: "beta",
        beta_wave: row.beta_wave,
      },
      redirectTo,
    });

    const inviteErr = inviteRes.error;
    const alreadyRegistered = !!inviteErr && /registered|exists|already/i.test(inviteErr.message || "");

    console.log("[beta-invite] inviteUserByEmail response", {
      applicationId: row.id,
      email: row.email,
      ok: !inviteErr,
      alreadyRegistered,
      errorMessage: inviteErr?.message ?? null,
      errorStatus: (inviteErr as { status?: number } | null)?.status ?? null,
      errorCode: (inviteErr as { code?: string } | null)?.code ?? null,
      userId: inviteRes.data?.user?.id ?? null,
      finishedAt: new Date().toISOString(),
    });

    // Do not silently swallow. Re-throw real failures so the UI surfaces them.
    if (inviteErr && !alreadyRegistered) {
      throw new Error(`Supabase inviteUserByEmail failed: ${inviteErr.message}`);
    }

    const { data: updated, error: updErr } = await context.supabase
      .from("beta_applications")
      .update({ status: "invited", invited_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (updErr) {
      console.error("[beta-invite] status update failed", {
        applicationId: row.id,
        email: row.email,
        error: updErr.message,
      });
      throw new Error(updErr.message);
    }
    console.log("[beta-invite] complete", {
      applicationId: row.id,
      email: row.email,
      alreadyRegistered,
      newStatus: updated?.status,
    });
    return { ...updated, _invite: { alreadyRegistered, ok: true } };
  });

// ---------- Program stats ----------

export type BetaProgramStats = {
  totals: Record<string, number> & { total: number };
  applicationTotals: Record<"pending" | "approved" | "waitlisted" | "declined", number>;
  accessTotals: Record<"not_invited" | "invited" | "active" | "suspended" | "deactivated", number>;
  activeTesters: number;
  byWave: Array<{ wave: number; count: number }>;
  byExperience: Array<{ bucket: string; count: number }>;
  byBrand: Array<{ brand: string; count: number }>;
  byRegion: Array<{ region: string; count: number }>;
  avgExperience: number | null;
  avgCallsPerWeek: number | null;
};

export const getBetaProgramStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BetaProgramStats> => {
    await assertOwner(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("beta_applications")
      .select(
        "status,application_status,access_status,user_id,beta_wave,experience_years,calls_per_week,primary_brands,state,location",
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
    const applicationTotals = { pending: 0, approved: 0, waitlisted: 0, declined: 0 } as Record<"pending" | "approved" | "waitlisted" | "declined", number>;
    const accessTotals = { not_invited: 0, invited: 0, active: 0, suspended: 0, deactivated: 0 } as Record<"not_invited" | "invited" | "active" | "suspended" | "deactivated", number>;
    const waves = new Map<number, number>();
    const buckets = { "0-2": 0, "3-5": 0, "6-10": 0, "10+": 0 } as Record<string, number>;
    const brands = new Map<string, number>();
    const regions = new Map<string, number>();
    let expSum = 0;
    let callsSum = 0;
    let activeTesters = 0;
    let activeUserIds: string[] = [];

    for (const r of rows ?? []) {
      totals.total += 1;
      totals[r.status] = (totals[r.status] ?? 0) + 1;
      if (r.application_status && (r.application_status as string) in applicationTotals) {
        applicationTotals[r.application_status as keyof typeof applicationTotals] += 1;
      }
      if (r.access_status && (r.access_status as string) in accessTotals) {
        accessTotals[r.access_status as keyof typeof accessTotals] += 1;
      }
      if (r.access_status === "active" && r.user_id) {
        activeUserIds.push(r.user_id as string);
      }
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
      const region = (r.state ?? "").trim() || (r.location ?? "").split(",").pop()?.trim() || "";
      if (region) regions.set(region, (regions.get(region) ?? 0) + 1);
    }

    // Active testers = access_status='active' AND has logged in at least once.
    if (activeUserIds.length) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const checks = await Promise.all(
          activeUserIds.map((uid) => supabaseAdmin.auth.admin.getUserById(uid)),
        );
        activeTesters = checks.filter((r) => !!r.data?.user?.last_sign_in_at).length;
      } catch {
        activeTesters = activeUserIds.length;
      }
    }

    const n = totals.total || 1;
    return {
      totals: totals as BetaProgramStats["totals"],
      applicationTotals,
      accessTotals,
      activeTesters,
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