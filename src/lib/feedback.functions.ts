import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubmitInput = z.object({
  kind: z.enum(["bug", "feature", "general"]).default("general"),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("feedback").insert({
      user_id: context.userId,
      kind: data.kind,
      subject: data.subject,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });