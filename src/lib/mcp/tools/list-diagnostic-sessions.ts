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
  name: "list_diagnostic_sessions",
  title: "List diagnostic sessions",
  description:
    "List the signed-in technician's diagnostic sessions. Supports optional text search and status filter.",
  inputSchema: {
    search: z.string().optional().describe("Optional substring match against brand, appliance type, model, serial, or complaint."),
    status: z.enum(["active", "completed", "abandoned", "all"]).optional().describe("Filter by session status. Defaults to all."),
    favoritesOnly: z.boolean().optional().describe("Only return favorited sessions."),
    limit: z.number().int().optional().describe("Max number of sessions to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, favoritesOnly, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("diagnostic_sessions")
      .select("id, status, brand, appliance_type, model_number, serial_number, complaint, updated_at, is_favorite")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 25, 1), 100));
    if (status && status !== "all") q = q.eq("status", status);
    if (favoritesOnly) q = q.eq("is_favorite", true);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(
        `brand.ilike.${s},appliance_type.ilike.${s},model_number.ilike.${s},serial_number.ilike.${s},complaint.ilike.${s}`,
      );
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { sessions: data ?? [] },
    };
  },
});