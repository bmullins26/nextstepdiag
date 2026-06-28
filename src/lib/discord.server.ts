/**
 * Centralized Discord webhook notifier for NextStep.
 *
 * Server-only (.server.ts keeps it out of client bundles).
 * Fire-and-forget: never throws, never blocks. If the webhook URL is
 * missing or Discord is unreachable, the call silently no-ops or logs a
 * warning. Used as the standard event bus for operational alerts.
 */

export const DISCORD_COLORS = {
  blue: 0x3b82f6, // Beta
  green: 0x22c55e, // Confirmed Repair
  red: 0xef4444, // Bug Report
  amber: 0xf59e0b, // Feature Request
  purple: 0xa855f7, // System Alert
} as const;

export type DiscordField = { name: string; value: string; inline?: boolean };

const LOGO_URL = "https://nextstepdiag.com/favicon.ico";

function trunc(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

function extractRoleIds(content: string | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const re = /<@&(\d+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

export async function sendDiscordNotification(opts: {
  webhookUrl: string | undefined;
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: string;
  content?: string;
}): Promise<void> {
  const webhookUrl = opts.webhookUrl;
  if (!webhookUrl) return; // silently skip when not configured

  try {
    const fields = (opts.fields ?? []).slice(0, 25).map((f) => ({
      name: trunc(f.name || "—", 256),
      value: trunc(f.value || "—", 1024),
      inline: f.inline ?? false,
    }));

    const embed: Record<string, unknown> = {
      title: trunc(opts.title, 256),
      color: opts.color ?? DISCORD_COLORS.blue,
      timestamp: new Date().toISOString(),
      footer: {
        text: trunc(opts.footer ?? "NextStep Diagnostics", 2048),
        icon_url: LOGO_URL,
      },
      thumbnail: { url: LOGO_URL },
    };
    if (opts.url) embed.url = opts.url;
    if (opts.description) embed.description = trunc(opts.description, 4096);
    if (fields.length) embed.fields = fields;

    const body = {
      content: opts.content ? trunc(opts.content, 2000) : undefined,
      embeds: [embed],
      allowed_mentions: {
        parse: [] as string[],
        roles: extractRoleIds(opts.content),
      },
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[discord] webhook non-2xx", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.warn("[discord] notify failed", err);
  }
}