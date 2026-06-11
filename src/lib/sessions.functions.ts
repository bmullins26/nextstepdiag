import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QA = z.object({ question: z.string(), answer: z.string() });

const SessionPayload = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(["active", "completed", "abandoned"]).optional(),
  is_favorite: z.boolean().optional(),
  brand: z.string().default(""),
  appliance_type: z.string().default(""),
  model_number: z.string().default(""),
  serial_number: z.string().default(""),
  manufacture_year: z.number().int().nullable().optional(),
  age_years: z.number().nullable().optional(),
  complaint: z.string().default(""),
  findings: z.array(z.string()).default([]),
  history: z.array(QA).default([]),
  most_likely_failures: z.array(z.string()).default([]),
  most_likely_failure: z.string().default(""),
  recommended_next_test: z.string().default(""),
  current_findings_summary: z.string().default(""),
  appliance: z.record(z.string(), z.any()).default({}),
});

export const upsertSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionPayload.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const row = { ...rest, user_id: context.userId };
    if (id) {
      const { data: r, error } = await context.supabase
        .from("diagnostic_sessions")
        .update(row)
        .eq("id", id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      void context.supabase
        .from("profiles")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", context.userId);
      return r;
    }
    const { data: r, error } = await context.supabase
      .from("diagnostic_sessions")
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    void context.supabase
      .from("profiles")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", context.userId);
    return r;
  });

export const listSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional(),
        status: z.enum(["active", "completed", "abandoned", "all"]).optional(),
        favoritesOnly: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("diagnostic_sessions")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.favoritesOnly) q = q.eq("is_favorite", true);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(
        `brand.ilike.${s},appliance_type.ilike.${s},model_number.ilike.${s},serial_number.ilike.${s},complaint.ilike.${s}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("diagnostic_sessions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const setSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "completed", "abandoned"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("diagnostic_sessions")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_favorite: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("diagnostic_sessions")
      .update({ is_favorite: data.is_favorite })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("diagnostic_sessions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });