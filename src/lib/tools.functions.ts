import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TOOL_TYPES = [
  "Test Equipment",
  "Hand Tool",
  "Power Tool",
  "Refrigeration",
  "Safety",
  "Consumable",
  "Specialty",
  "Other",
] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

export type ToolRef = { id: string };

export type ToolRow = {
  id: string;
  tool_type: string;
  category: string;
  subcategory: string | null;
  tool_name: string;
  quantity: number;
  affiliate_url: string | null;
  notes: string | null;
  active: boolean;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

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

function friendlyError(err: any): never {
  const msg = err?.message ?? String(err);
  if (err?.code === "23505" || /duplicate key|tools_name_category_ci_uniq/i.test(msg)) {
    throw new Error("A tool with this name and category already exists.");
  }
  throw new Error(msg);
}

const urlOrEmpty = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v && v.length ? v : null))
  .refine(
    (v) => v === null || /^https?:\/\//i.test(v),
    "Affiliate URL must start with http(s)://",
  );

const toolInputSchema = z.object({
  tool_type: z.enum(TOOL_TYPES),
  category: z.string().trim().min(1, "Category is required").max(120),
  subcategory: z.string().trim().max(120).optional().nullable().transform((v) => (v && v.length ? v : null)),
  tool_name: z.string().trim().min(1, "Tool name is required").max(200),
  quantity: z.number().int().min(0).max(9999).default(1),
  affiliate_url: urlOrEmpty,
  notes: z.string().trim().max(4000).optional().nullable().transform((v) => (v && v.length ? v : null)),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

// ---------- list ----------
export const listTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      search?: string;
      toolType?: string;
      category?: string;
      status?: "all" | "active" | "inactive";
      page?: number;
      pageSize?: number;
    }) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, data.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = context.supabase
      .from("tools")
      .select("*", { count: "exact" })
      .order("tool_name", { ascending: true })
      .range(from, to);

    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%_]/g, "\\$&");
      q = q.or(`tool_name.ilike.%${s}%,category.ilike.%${s}%,notes.ilike.%${s}%`);
    }
    if (data.toolType && data.toolType !== "all") q = q.eq("tool_type", data.toolType);
    if (data.category && data.category !== "all") q = q.eq("category", data.category);
    if (data.status === "active") q = q.eq("active", true);
    else if (data.status === "inactive") q = q.eq("active", false);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const { data: allCats } = await context.supabase
      .from("tools")
      .select("category")
      .order("category", { ascending: true });
    const categories = Array.from(
      new Set((allCats ?? []).map((r: any) => r.category).filter(Boolean)),
    ) as string[];

    return {
      rows: (rows ?? []) as ToolRow[],
      total: count ?? 0,
      page,
      pageSize,
      categories,
      toolTypes: [...TOOL_TYPES],
    };
  });

// ---------- get ----------
export const getTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("tools")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Tool not found");
    return row as ToolRow;
  });

// ---------- getToolsByIds (for future modules) ----------
export const getToolsByIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return [] as ToolRow[];
    const { data: rows, error } = await context.supabase
      .from("tools")
      .select("*")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ToolRow[];
  });

// ---------- create ----------
export const createTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => toolInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("tools")
      .insert({ ...data, created_by: context.userId })
      .select("*")
      .single();
    if (error) friendlyError(error);
    return row as ToolRow;
  });

// ---------- update ----------
export const updateTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), patch: toolInputSchema.partial() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("tools")
      .update(data.patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) friendlyError(error);
    return row as ToolRow;
  });

// ---------- duplicate ----------
export const duplicateTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: src, error: e1 } = await context.supabase
      .from("tools")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Tool not found");
    const copy: any = {
      tool_type: src.tool_type,
      category: src.category,
      subcategory: src.subcategory,
      tool_name: `${src.tool_name} (Copy)`,
      quantity: src.quantity,
      affiliate_url: src.affiliate_url,
      notes: src.notes,
      active: src.active,
      metadata: src.metadata ?? {},
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("tools")
      .insert(copy)
      .select("*")
      .single();
    if (error) friendlyError(error);
    return row as ToolRow;
  });

// ---------- setActive ----------
export const setToolActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("tools")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- delete ----------
export const deleteTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error } = await context.supabase.from("tools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- export CSV ----------
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportTools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("tools")
      .select("*")
      .order("tool_type", { ascending: true })
      .order("category", { ascending: true })
      .order("tool_name", { ascending: true });
    if (error) throw new Error(error.message);
    const cols = [
      "tool_type",
      "category",
      "subcategory",
      "tool_name",
      "quantity",
      "affiliate_url",
      "notes",
      "active",
      "metadata",
    ];
    const header = cols.join(",");
    const lines = (rows ?? []).map((r: any) => cols.map((c) => csvEscape(r[c])).join(","));
    return { csv: [header, ...lines].join("\n"), count: rows?.length ?? 0 };
  });