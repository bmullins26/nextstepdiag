// Owner-only management of model production windows (list + delete).
// Technicians never see window provenance; this is owner console only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwner } from "@/lib/owner-admin.server";

export const listModelWindows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("model_production_windows")
      .select("id, brand_key, manufacturer, model_prefix, introduced_year, discontinued_year, source, evidence_count, observed_min_year, observed_max_year, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteModelWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error } = await context.supabase.from("model_production_windows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
