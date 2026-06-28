## Discord Notification Service

Centralized, server-only webhook notifier. Fire-and-forget; never blocks responses or surfaces errors to the user.

### 1. Secrets (via `add_secret`)

- `DISCORD_BETA_WEBHOOK_URL` — wired now
- `DISCORD_BUG_WEBHOOK_URL` — reserved
- `DISCORD_FEATURE_WEBHOOK_URL` — reserved
- `DISCORD_SYSTEM_WEBHOOK_URL` — reserved
- `DISCORD_OWNER_ROLE_ID` — optional; when present, beta notifications prepend `<@&ROLE_ID>` so owners get pinged

The user will paste each value into the secure form; nothing is hardcoded. Already-saved secrets are skipped automatically.

### 2. Helper — `src/lib/discord.server.ts`

`.server.ts` ensures the module is stripped from client bundles.

Exports:

```ts
export const DISCORD_COLORS = {
  blue:   0x3B82F6, // Beta
  green:  0x22C55E, // Confirmed Repair
  red:    0xEF4444, // Bug Report
  amber:  0xF59E0B, // Feature Request
  purple: 0xA855F7, // System Alert
} as const;

export type DiscordField = { name: string; value: string; inline?: boolean };

export async function sendDiscordNotification(opts: {
  webhookUrl: string | undefined;
  title: string;
  description?: string;
  url?: string;                 // makes embed title clickable
  color?: number;               // defaults to blue
  fields?: DiscordField[];
  footer?: string;              // defaults to "NextStep Diagnostics"
  content?: string;             // raw message above embed (used for role mentions)
}): Promise<void>;
```

Behavior:
- If `webhookUrl` is falsy → silently return (no log noise).
- Builds one embed with `timestamp = new Date().toISOString()`, footer text + small NextStep logo icon (`https://nextstepdiag.com/icon.png` or equivalent public asset; falls back to footer text only if asset URL unavailable).
- Enforces Discord limits by truncating: field `name` ≤ 256, field `value` ≤ 1024, `title` ≤ 256, `description` ≤ 4096, max 25 fields, total embed ≤ 6000 chars. Long values get `…` suffix.
- `fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, embeds: [embed], allowed_mentions: { parse: [], roles: content ? extractedRoleIds : [] } }), signal: AbortSignal.timeout(3000) })`.
- Whole thing wrapped in try/catch. Failures → `console.warn("[discord] notify failed", err)`. **Never throws.**
- No retries (best-effort; webhook spam on retry storms is worse than a dropped event).

### 3. Beta Application wiring

Edit `src/lib/beta-applications.functions.ts` → at the end of `submitBetaApplication`'s `.handler()`, **after** the successful insert, fire-and-forget:

```ts
const roleId = process.env.DISCORD_OWNER_ROLE_ID;
void sendDiscordNotification({
  webhookUrl: process.env.DISCORD_BETA_WEBHOOK_URL,
  title: "🚀 New Beta Application",
  url: "https://nextstepdiag.com/owner?tab=beta",
  color: DISCORD_COLORS.blue,
  content: roleId ? `<@&${roleId}>` : undefined,
  description: "**Review Application:** https://nextstepdiag.com/owner?tab=beta",
  fields: [
    { name: "Name",         value: `${firstName} ${lastName}`, inline: true },
    { name: "Email",        value: email, inline: true },
    { name: "Company",      value: company || "—", inline: true },
    { name: "Location",     value: location, inline: true },
    { name: "Experience",   value: `${experienceYears} yrs`, inline: true },
    { name: "Role",         value: role, inline: true },
    { name: "Calls / Week", value: String(callsPerWeek), inline: true },
    { name: "Brands",       value: primaryBrands.join(", ") },
    { name: "Reason",       value: reason },
  ],
  footer: "NextStep Diagnostics Beta Program",
});
```

Key points:
- `void` + no `await` → the response returns immediately; Discord latency never delays the user.
- The helper's internal try/catch guarantees no throw escapes into the server fn.
- Skipped entirely on the duplicate-email branch (only fires on real new inserts).
- `allowed_mentions.roles` is set from the role ID in `content` so role pings actually notify.

### 4. Future event readiness (not implemented)

The generic signature means future wiring is one call per site, no helper changes:

| Event | Webhook | Color | Trigger site |
|---|---|---|---|
| Confirmed Repair | SYSTEM (or dedicated) | green | `diagnostic-outcomes.functions.ts` on `confirmed` |
| Bug Report | BUG | red | `feedback.functions.ts` kind=`bug` |
| Feature Request | FEATURE | amber | `feedback.functions.ts` kind=`feature` |
| High-Value Feedback | SYSTEM | purple | `feedback.functions.ts` (long body / active tester) |
| Tech Sheet Upload | SYSTEM | purple | `tech-sheets/lookup.functions.ts` after upsert |
| New Diagnostic Session | SYSTEM | blue | session-start server fn |
| API Failures | SYSTEM | red | inside existing catch branches (RapidAPI, Firecrawl, AI gateway) |
| Owner Alerts / Health | SYSTEM | purple | future access-gate + health probes |

### Files

- **Add:** `src/lib/discord.server.ts`
- **Edit:** `src/lib/beta-applications.functions.ts` (one call after insert; dynamic `await import("@/lib/discord.server")` inside the handler to keep the server-only module off the client graph)
- **Secrets:** request the 5 listed above via `add_secret`

### Out of scope

- Wiring any non-beta event
- Adding a "Referral Source" field (not in current form/schema)
- Persisting a notification log table — can add later if needed
