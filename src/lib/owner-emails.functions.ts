import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EMAIL_SEGMENTS = [
  "all_users",
  "pro_users",
  "free_users",
  "beta_approved",
  "beta_pending",
  "beta_all",
] as const;

export type EmailSegment = (typeof EMAIL_SEGMENTS)[number];

export type EmailRecipient = {
  email: string;
  name: string | null;
  segment: string;
};

export const exportEmailList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segment: z.enum(EMAIL_SEGMENTS).optional().default("all_users"),
        excludeSuppressed: z.boolean().optional().default(true),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ recipients: EmailRecipient[]; csv: string; suppressed: number }> => {
      const { assertOwner, csvEscape, isActivePro } = await import("@/lib/owner-admin.server");
      await assertOwner(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const recipients: EmailRecipient[] = [];

      if (data.segment.startsWith("beta")) {
        let q = supabaseAdmin
          .from("beta_applications")
          .select("email, first_name, last_name, application_status");
        if (data.segment === "beta_approved") q = q.eq("application_status", "approved");
        if (data.segment === "beta_pending") q = q.eq("application_status", "pending");
        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) {
          recipients.push({
            email: r.email,
            name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
            segment: r.application_status ?? "beta",
          });
        }
      } else {
        const [{ data: profiles, error }, { data: subs }] = await Promise.all([
          supabaseAdmin.from("profiles").select("id, email, full_name, display_name"),
          supabaseAdmin
            .from("subscriptions")
            .select("user_id, tier, plan_type, current_period_end"),
        ]);
        if (error) throw new Error(error.message);
        const byUser = new Map<string, any>();
        for (const s of subs ?? []) byUser.set(s.user_id, s);
        for (const p of profiles ?? []) {
          const s = byUser.get(p.id);
          const pro = s ? isActivePro(s) : false;
          if (data.segment === "pro_users" && !pro) continue;
          if (data.segment === "free_users" && pro) continue;
          recipients.push({
            email: p.email,
            name: p.display_name ?? p.full_name ?? null,
            segment: pro ? "pro" : "free",
          });
        }
      }

      // De-duplicate on lowercase email.
      const seen = new Set<string>();
      let deduped = recipients.filter((r) => {
        const key = (r.email ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      let suppressedCount = 0;
      if (data.excludeSuppressed) {
        const { data: sup } = await supabaseAdmin.from("suppressed_emails").select("email");
        const supSet = new Set((sup ?? []).map((s: any) => (s.email ?? "").toLowerCase()));
        const before = deduped.length;
        deduped = deduped.filter((r) => !supSet.has(r.email.toLowerCase()));
        suppressedCount = before - deduped.length;
      }

      const csv = [
        "email,name,segment",
        ...deduped.map((r) => [r.email, r.name, r.segment].map(csvEscape).join(",")),
      ].join("\n");

      return { recipients: deduped, csv, suppressed: suppressedCount };
    },
  );
