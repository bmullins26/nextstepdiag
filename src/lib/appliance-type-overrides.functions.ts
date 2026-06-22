import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const norm = (s: string) => s.trim().toLowerCase();

const UpsertInput = z.object({
  brand: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  applianceType: z.string().min(1).max(120),
  subType: z.string().max(120).nullable().optional(),
});

const LookupInput = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
});

export type ApplianceTypeOverride = {
  applianceType: string;
  subType: string | null;
  correctionCount: number;
  hitCount: number;
};

export const lookupApplianceTypeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LookupInput.parse(d))
  .handler(async ({ data, context }): Promise<ApplianceTypeOverride | null> => {
    const { data: row, error } = await context.supabase
      .from("appliance_type_overrides")
      .select("appliance_type, sub_type, correction_count, hit_count")
      .eq("brand_key", norm(data.brand))
      .eq("model_key", norm(data.model))
      .maybeSingle();
    if (error || !row) return null;
    return {
      applianceType: row.appliance_type,
      subType: row.sub_type,
      correctionCount: row.correction_count,
      hitCount: row.hit_count,
    };
  });

export const upsertApplianceTypeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const brand_key = norm(data.brand);
    const model_key = norm(data.model);
    const { data: existing } = await context.supabase
      .from("appliance_type_overrides")
      .select("id, correction_count")
      .eq("brand_key", brand_key)
      .eq("model_key", model_key)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("appliance_type_overrides")
        .update({
          appliance_type: data.applianceType,
          sub_type: data.subType ?? null,
          brand_display: data.brand,
          model_display: data.model,
          corrected_by: context.userId,
          correction_count: (existing.correction_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existing.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("appliance_type_overrides")
      .insert({
        brand_key,
        model_key,
        brand_display: data.brand,
        model_display: data.model,
        appliance_type: data.applianceType,
        sub_type: data.subType ?? null,
        corrected_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const listApplianceTypeOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("appliance_type_overrides")
      .select("id, brand_display, model_display, appliance_type, sub_type, correction_count, hit_count, last_used_at, created_at, updated_at, corrected_by")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteApplianceTypeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appliance_type_overrides")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Server-side helper used by decodeAppliance to apply learned override (no auth ctx needed; uses admin). */
export async function applyTypeOverrideServerSide(brand: string, model: string): Promise<ApplianceTypeOverride | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const brand_key = norm(brand);
    const model_key = norm(model);
    const { data: row } = await supabaseAdmin
      .from("appliance_type_overrides")
      .select("id, appliance_type, sub_type, correction_count, hit_count")
      .eq("brand_key", brand_key)
      .eq("model_key", model_key)
      .maybeSingle();
    if (!row) return null;
    // bump hit_count / last_used_at (best-effort, do not block on errors)
    void supabaseAdmin
      .from("appliance_type_overrides")
      .update({ hit_count: (row.hit_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", row.id);
    return {
      applianceType: row.appliance_type,
      subType: row.sub_type,
      correctionCount: row.correction_count,
      hitCount: row.hit_count,
    };
  } catch {
    return null;
  }
}
