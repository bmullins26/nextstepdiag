import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_community_discussions",
  title: "Search community discussions",
  description: "Search the technician community for discussions matching a brand, appliance type, model number, or free-text query.",
  inputSchema: {
    query: z.string().optional().describe("Free-text search across title and body."),
    brand: z.string().optional().describe("Filter by brand (e.g. Whirlpool, LG)."),
    appliance_type: z.string().optional().describe("Filter by appliance type (e.g. washer, dryer)."),
    model_number: z.string().optional().describe("Filter by exact model number."),
    limit: z.number().int().optional().describe("Max results to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, brand, appliance_type, model_number, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("community_discussions")
      .select("id, title, brand, appliance_type, model_number, discussion_type, reply_count, like_count, success_rate, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (brand) q = q.ilike("brand", brand);
    if (appliance_type) q = q.ilike("appliance_type", appliance_type);
    if (model_number) q = q.ilike("model_number", model_number);
    if (query && query.trim()) {
      const s = `%${query.trim()}%`;
      q = q.or(`title.ilike.${s},body.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { discussions: data ?? [] },
    };
  },
});