import { createServerFn, getRequest, getRequestHeader } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SentEmailRow = {
  messageId: string;
  recipient: string;
  status: string;
  errorMessage: string | null;
  subject: string | null;
  sentBy: string | null;
  createdAt: string;
};

/** Send a one-to-one message to a single recipient from the owner console. */
export const sendOwnerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        to: z.string().trim().email().max(255),
        recipientName: z.string().trim().max(120).nullable().optional(),
        subject: z.string().trim().min(1).max(150),
        message: z.string().trim().min(1).max(5000),
        replyTo: z.string().trim().email().max(255).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertOwner } = await import("@/lib/owner-admin.server");
    await assertOwner(context.supabase, context.userId);

    const authHeader = getRequestHeader("authorization");
    if (!authHeader) throw new Error("Missing authorization.");

    const origin = new URL(getRequest().url).origin;
    const messageId = `owner-msg-${crypto.randomUUID()}`;

    const res = await fetch(`${origin}/lovable/email/transactional/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        templateName: "owner-message",
        recipientEmail: data.to,
        idempotencyKey: messageId,
        templateData: {
          subject: data.subject,
          message: data.message,
          recipientName: data.recipientName ?? null,
          senderName: "NextStep Diagnostics",
          replyTo: data.replyTo ?? null,
        },
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      reason?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(payload.error || `Send failed (${res.status})`);
    }
    if (payload.success === false) {
      if (payload.reason === "email_suppressed") {
        return {
          ok: false as const,
          reason: "suppressed" as const,
          message: "That address has unsubscribed or previously bounced, so it was not emailed.",
        };
      }
      throw new Error(payload.reason || "Send failed.");
    }

    // Record who sent what, for the sent history.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "owner-message",
      recipient_email: data.to,
      status: "pending",
      metadata: { subject: data.subject, sent_by: context.userId, owner_message: true },
    });

    return { ok: true as const, reason: "queued" as const, message: "Email queued for delivery." };
  });

/** Recent owner-sent messages, deduplicated to the latest status per message. */
export const listOwnerEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SentEmailRow[]> => {
    const { assertOwner } = await import("@/lib/owner-admin.server");
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id, recipient_email, status, error_message, metadata, created_at")
      .eq("template_name", "owner-message")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const byMessage = new Map<string, SentEmailRow>();
    const subjects = new Map<string, string>();
    for (const r of rows ?? []) {
      const key = r.message_id ?? r.recipient_email + r.created_at;
      const meta = (r.metadata ?? {}) as Record<string, any>;
      if (meta.subject && !subjects.has(key)) subjects.set(key, String(meta.subject));
      const existing = byMessage.get(key);
      // Rows are newest-first; prefer the newest non-"pending" status.
      if (!existing || (existing.status === "pending" && r.status !== "pending")) {
        byMessage.set(key, {
          messageId: key,
          recipient: r.recipient_email,
          status: r.status,
          errorMessage: r.error_message,
          subject: null,
          sentBy: meta.sent_by ? String(meta.sent_by) : null,
          createdAt: r.created_at,
        });
      }
    }
    return Array.from(byMessage.values())
      .map((r) => ({ ...r, subject: subjects.get(r.messageId) ?? null }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 100);
  });

/** Search users and beta applicants to pick a recipient in the compose page. */
export const searchRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().trim().max(120).optional().default("") }).parse(d ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ email: string; name: string | null; source: string }[]> => {
      const { assertOwner } = await import("@/lib/owner-admin.server");
      await assertOwner(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const q = data.query.trim();
      const like = `%${q}%`;

      let usersQ = supabaseAdmin
        .from("profiles")
        .select("email, full_name, display_name")
        .order("created_at", { ascending: false })
        .limit(25);
      if (q) usersQ = usersQ.or(`email.ilike.${like},full_name.ilike.${like}`);

      let betaQ = supabaseAdmin
        .from("beta_applications")
        .select("email, first_name, last_name")
        .order("created_at", { ascending: false })
        .limit(25);
      if (q) betaQ = betaQ.or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`);

      const [users, beta] = await Promise.all([usersQ, betaQ]);

      const out: { email: string; name: string | null; source: string }[] = [];
      const seen = new Set<string>();
      for (const u of users.data ?? []) {
        const key = (u.email ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ email: u.email, name: u.display_name ?? u.full_name ?? null, source: "user" });
      }
      for (const b of beta.data ?? []) {
        const key = (b.email ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          email: b.email,
          name: `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || null,
          source: "beta applicant",
        });
      }
      return out.slice(0, 40);
    },
  );
