// Server-only Jenova Agent API client.
// The API key is read from process.env INSIDE functions (Workers bind env per
// request) and is NEVER returned, logged, or sent to the browser.
import process from "node:process";

export interface JenovaConfig {
  apiKey: string | null;
  agentSlug: string | null;
  baseUrl: string;
  enabled: boolean;
}

export function getJenovaConfig(): JenovaConfig {
  return {
    apiKey: process.env.JENOVA_API_KEY?.trim() || null,
    agentSlug: process.env.JENOVA_AGENT_ID?.trim() || null,
    baseUrl: (process.env.JENOVA_API_BASE_URL?.trim() || "https://api.jenova.ai/v1").replace(/\/$/, ""),
    enabled: process.env.JENOVA_DIAGNOSTICS_ENABLED === "true",
  };
}

export function isJenovaConfigured(cfg = getJenovaConfig()): boolean {
  return !!cfg.apiKey && !!cfg.agentSlug;
}

export class JenovaError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "JenovaError";
    this.status = status;
  }
}

/** Strip anything that could carry credentials out of an error string. */
function safeMessage(raw: string): string {
  return raw.replace(/jnv_[A-Za-z0-9_\-]+/g, "[redacted]").slice(0, 400);
}

async function jenovaFetch(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<unknown> {
  const cfg = getJenovaConfig();
  if (!cfg.apiKey) throw new JenovaError("Jenova is not configured (missing API key).");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new JenovaError(safeMessage(`Jenova API ${res.status}: ${text}`), res.status);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new JenovaError("Jenova returned a non-JSON response.");
    }
  } catch (err) {
    if (err instanceof JenovaError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new JenovaError(safeMessage(`Jenova request failed: ${msg}`));
  } finally {
    clearTimeout(timer);
  }
}

export interface JenovaAgent {
  agent: string;
  display_name?: string;
  description?: string;
}

export async function listJenovaAgents(): Promise<JenovaAgent[]> {
  const data = (await jenovaFetch("/agents", { timeoutMs: 15_000 })) as
    | { agents?: JenovaAgent[]; data?: JenovaAgent[] }
    | JenovaAgent[];
  if (Array.isArray(data)) return data;
  return data.agents ?? data.data ?? [];
}

export interface JenovaMessageResult {
  content: string;
  sessionId: string | null;
  cost: number | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Send one message to the configured Jenova agent.
 * `sessionId` continues an existing Jenova session (mapped 1:1 to a NextStep
 * diagnostic session). `externalUserId` is an opaque NextStep user id — no
 * Supabase tokens or secrets are ever sent.
 */
export async function sendJenovaMessage(args: {
  message: string;
  sessionId?: string | null;
  externalUserId?: string | null;
  timeoutMs?: number;
}): Promise<JenovaMessageResult> {
  const cfg = getJenovaConfig();
  if (!cfg.agentSlug) throw new JenovaError("Jenova is not configured (missing agent id).");
  const body: Record<string, unknown> = {
    agent: cfg.agentSlug,
    content: args.message,
  };
  if (args.externalUserId) body.user = args.externalUserId;
  const path = args.sessionId ? `/sessions/${encodeURIComponent(args.sessionId)}/messages` : "/messages";
  const raw = (await jenovaFetch(path, {
    method: "POST",
    body,
    timeoutMs: args.timeoutMs ?? 90_000,
  })) as {
    content?: unknown;
    message?: { content?: unknown };
    session_id?: string;
    usage?: { cost?: string | number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };

  const contentRaw = raw.content ?? raw.message?.content ?? "";
  const content =
    typeof contentRaw === "string"
      ? contentRaw
      : Array.isArray(contentRaw)
        ? contentRaw
            .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
            .join("")
        : String(contentRaw ?? "");

  const cost = raw.usage?.cost != null ? Number(raw.usage.cost) : null;
  return {
    content,
    sessionId: raw.session_id ?? args.sessionId ?? null,
    cost: Number.isFinite(cost as number) ? (cost as number) : null,
    inputTokens: Number(raw.usage?.input_tokens ?? raw.usage?.prompt_tokens ?? 0) || 0,
    outputTokens: Number(raw.usage?.output_tokens ?? raw.usage?.completion_tokens ?? 0) || 0,
  };
}

/** Health check that never reveals the key. */
export async function jenovaHealth(): Promise<{
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  agentAvailable: boolean;
  agentSlugConfigured: boolean;
  agents: string[];
  error: string | null;
}> {
  const cfg = getJenovaConfig();
  const base = {
    configured: isJenovaConfigured(cfg),
    enabled: cfg.enabled,
    agentSlugConfigured: !!cfg.agentSlug,
  };
  if (!cfg.apiKey) {
    return { ...base, connected: false, agentAvailable: false, agents: [], error: "Missing JENOVA_API_KEY" };
  }
  try {
    const agents = await listJenovaAgents();
    const slugs = agents.map((a) => a.agent).filter(Boolean);
    return {
      ...base,
      connected: true,
      agentAvailable: !!cfg.agentSlug && slugs.includes(cfg.agentSlug),
      agents: slugs.slice(0, 50),
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      connected: false,
      agentAvailable: false,
      agents: [],
      error: err instanceof JenovaError ? err.message : "Jenova connection failed",
    };
  }
}

/** Deterministic mapping: NextStep diagnostic session -> Jenova session id. */
export async function getMappedJenovaSession(diagnosticSessionId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("jenova_sessions")
    .select("jenova_session_id")
    .eq("diagnostic_session_id", diagnosticSessionId)
    .maybeSingle();
  return data?.jenova_session_id ?? null;
}

export async function saveJenovaSessionMapping(args: {
  diagnosticSessionId: string;
  jenovaSessionId: string;
  userId: string | null;
  agentId: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("jenova_sessions").upsert(
      {
        diagnostic_session_id: args.diagnosticSessionId,
        jenova_session_id: args.jenovaSessionId,
        user_id: args.userId,
        agent_id: args.agentId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "diagnostic_session_id" },
    );
  } catch (err) {
    console.warn("[jenova] session mapping save failed", err);
  }
}
