import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const TECH_TALK_CHANNELS = [
  { id: "general", label: "General" },
  { id: "washer", label: "Washers" },
  { id: "dryer", label: "Dryers" },
  { id: "refrigerator", label: "Refrigerators" },
  { id: "dishwasher", label: "Dishwashers" },
  { id: "range", label: "Ranges & Ovens" },
  { id: "microwave", label: "Microwaves" },
  { id: "ice-maker", label: "Ice Makers" },
] as const;

const CHANNEL_IDS = TECH_TALK_CHANNELS.map((c) => c.id) as [string, ...string[]];

export type TechTalkMessage = {
  id: string;
  user_id: string;
  body: string;
  channel: string;
  parent_id: string | null;
  created_at: string;
  author_name: string | null;
};

export const listTechTalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.enum(CHANNEL_IDS),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TechTalkMessage[]> => {
    const { data: rows, error } = await context.supabase
      .from("tech_talk_messages")
      .select("id, user_id, body, channel, parent_id, created_at")
      .eq("channel", data.channel)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Omit<TechTalkMessage, "author_name">[];
    const userIds = Array.from(new Set(list.map((m) => m.user_id)));
    let names = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, full_name, email")
        .in("id", userIds);
      names = new Map(
        (profs ?? []).map((p: any) => [
          p.id,
          (p.display_name || p.full_name || (p.email ?? "").split("@")[0] || "Tech") as string,
        ]),
      );
    }
    return list
      .map((m) => ({ ...m, author_name: names.get(m.user_id) ?? "Tech" }))
      .reverse();
  });

export const postTechTalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: z.enum(CHANNEL_IDS),
        body: z.string().trim().min(1).max(4000),
        parentId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string } | { error: string }> => {
    const { data: row, error } = await context.supabase
      .from("tech_talk_messages")
      .insert({
        user_id: context.userId,
        channel: data.channel,
        body: data.body,
        parent_id: data.parentId ?? null,
      } as any)
      .select("id")
      .single();
    if (error) {
      const msg = /row-level security/i.test(error.message)
        ? "Tech Talk is a Pro feature. Upgrade to post."
        : error.message;
      return { error: msg };
    }
    return { id: (row as any).id };
  });

export const deleteTechTalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await context.supabase
      .from("tech_talk_messages")
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });