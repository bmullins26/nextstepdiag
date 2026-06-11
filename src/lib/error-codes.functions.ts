import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brand: z.string().min(1),
  applianceType: z.string().min(1),
  modelNumber: z.string().optional().default(""),
  code: z.string().min(1),
});

export type ErrorCodeRow = {
  id: string;
  brand: string;
  appliance_type: string;
  model_number: string;
  code: string;
  meaning: string;
  common_causes: string[];
  recommended_tests: string[];
  affected_components: string[];
  service_notes: string;
};

export type LookupConfidence = "exact-model" | "brand-appliance" | "brand";

const SELECT_COLS =
  "id, brand, appliance_type, model_number, code, meaning, common_causes, recommended_tests, affected_components, service_notes";

export const lookupErrorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const model = (data.modelNumber ?? "").trim();

    // 1) Exact model match
    if (model) {
      const { data: row, error } = await context.supabase
        .from("error_codes")
        .select(SELECT_COLS)
        .ilike("brand", data.brand)
        .ilike("appliance_type", data.applianceType)
        .ilike("model_number", model)
        .ilike("code", data.code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row)
        return {
          notFound: false as const,
          confidence: "exact-model" as LookupConfidence,
          row: row as ErrorCodeRow,
        };
    }

    // 2) Brand + appliance type (no model)
    {
      const { data: row, error } = await context.supabase
        .from("error_codes")
        .select(SELECT_COLS)
        .ilike("brand", data.brand)
        .ilike("appliance_type", data.applianceType)
        .eq("model_number", "")
        .ilike("code", data.code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row)
        return {
          notFound: false as const,
          confidence: "brand-appliance" as LookupConfidence,
          row: row as ErrorCodeRow,
        };
    }

    // 3) Brand only
    {
      const { data: row, error } = await context.supabase
        .from("error_codes")
        .select(SELECT_COLS)
        .ilike("brand", data.brand)
        .eq("appliance_type", "")
        .eq("model_number", "")
        .ilike("code", data.code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row)
        return {
          notFound: false as const,
          confidence: "brand" as LookupConfidence,
          row: row as ErrorCodeRow,
        };
    }

    return { notFound: true as const };
  });

export const listErrorCodesByBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ brand: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("error_codes")
      .select("code, meaning")
      .ilike("brand", data.brand)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });