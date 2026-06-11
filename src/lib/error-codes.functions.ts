import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  brand: z.string().min(1),
  code: z.string().min(1),
});

export type ErrorCodeRow = {
  id: string;
  brand: string;
  code: string;
  meaning: string;
  common_causes: string[];
  recommended_tests: string[];
};

export const lookupErrorCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("error_codes")
      .select("id, brand, code, meaning, common_causes, recommended_tests")
      .ilike("brand", data.brand)
      .ilike("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { notFound: true as const };
    return { notFound: false as const, row: row as ErrorCodeRow };
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