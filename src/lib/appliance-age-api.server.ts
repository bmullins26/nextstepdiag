/**
 * Appliance Age Finder API (RapidAPI) — server-only client.
 *
 * Auth method (verified empirically): BOTH X-RapidAPI-Key/Host headers AND
 * the api_token query parameter are required. Headers-only returns a 302 to
 * a homespy.io login page; api_token-only returns 401.
 */

const API_HOST = "appliance-age-finder.p.rapidapi.com";
const API_BASE = `https://${API_HOST}/`;

export type AuthMethod = "headers" | "api_token" | "both";

export type RawApiResponse = {
  result?: {
    status?: number;
    message?: string;
    decoded?: {
      make?: string;
      model?: string;
      serial?: string;
      mostLikelyYear?: number | null;
      details?: {
        averageListedPrice?: number | null;
        type?: string | null;
        color?: string | null;
        description?: string | null;
      } | null;
      yearOptions?: Record<
        string,
        { year: number; confidence: number; fullDate?: string | null }
      > | null;
      responseTime?: number;
    } | null;
  };
  message?: string;
};

export type NormalizedAgeResult = {
  manufactureYear: number | null;
  manufactureMonth: number | null;
  confidencePercent: number | null;
  alternativeYears: Array<{ year: number; month: number | null; confidencePercent: number; fullDate: string | null }>;
  source: "appliance_age_api" | "local_fallback" | "cache";
  description?: string | null;
  rawProvider: unknown;
};

function buildUrl(params: { make: string; model: string; serial: string; apiToken?: string }) {
  const u = new URL(API_BASE);
  u.searchParams.set("make", params.make);
  u.searchParams.set("model", params.model);
  u.searchParams.set("serial", params.serial);
  if (params.apiToken) u.searchParams.set("api_token", params.apiToken);
  return u.toString();
}

async function callOnce(opts: {
  make: string;
  model: string;
  serial: string;
  authMethod: AuthMethod;
  rapidApiKey?: string;
  apiToken?: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; rawResponse: unknown; responseTimeMs: number }> {
  const useHeaders = opts.authMethod === "headers" || opts.authMethod === "both";
  const useToken = opts.authMethod === "api_token" || opts.authMethod === "both";

  const url = buildUrl({
    make: opts.make,
    model: opts.model,
    serial: opts.serial,
    apiToken: useToken ? opts.apiToken : undefined,
  });

  const headers: Record<string, string> = { Accept: "application/json" };
  if (useHeaders && opts.rapidApiKey) {
    headers["X-RapidAPI-Key"] = opts.rapidApiKey;
    headers["X-RapidAPI-Host"] = API_HOST;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers, redirect: "manual", signal: controller.signal });
    const responseTimeMs = Date.now() - t0;
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    return { statusCode: res.status, rawResponse: parsed, responseTimeMs };
  } finally {
    clearTimeout(timer);
  }
}

function isSuccessfulResponse(statusCode: number, raw: unknown): boolean {
  if (statusCode < 200 || statusCode >= 300) return false;
  // Reject HTML/redirect payloads even when status is 2xx (RapidAPI edge
  // gateway sometimes 200s a login-redirect HTML page when auth is stale).
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s.startsWith("<") || s.includes("<html") || s.includes("homespy")) return false;
  }
  const r = raw as RawApiResponse | null;
  if (!r || typeof r !== "object") return false;
  const decoded = r.result?.decoded;
  if (!decoded) return false;
  // Must have at least one year option or mostLikelyYear.
  if (decoded.mostLikelyYear) return true;
  if (decoded.yearOptions && Object.keys(decoded.yearOptions).length > 0) return true;
  return false;
}

/**
 * testApplianceAgeApi — runs the same request 3 ways to determine which
 * auth scheme the endpoint accepts. Returns the working method (or the last
 * attempt if all fail).
 */
export async function testApplianceAgeApi(input: { make: string; model: string; serial: string }): Promise<{
  success: boolean;
  statusCode: number;
  rawResponse: unknown;
  authMethodUsed: AuthMethod;
  attempts: Array<{ authMethod: AuthMethod; statusCode: number; success: boolean }>;
}> {
  const rapidApiKey = process.env.RAPIDAPI_APPLIANCE_AGE_KEY;
  const apiToken = process.env.RAPIDAPI_APPLIANCE_AGE_TOKEN;
  if (!rapidApiKey || !apiToken) {
    throw new Error("Missing RAPIDAPI_APPLIANCE_AGE_KEY or RAPIDAPI_APPLIANCE_AGE_TOKEN");
  }

  const methods: AuthMethod[] = ["headers", "api_token", "both"];
  const attempts: Array<{ authMethod: AuthMethod; statusCode: number; success: boolean }> = [];
  let chosen: { authMethod: AuthMethod; statusCode: number; rawResponse: unknown; success: boolean } | null = null;

  for (const m of methods) {
    try {
      const r = await callOnce({ ...input, authMethod: m, rapidApiKey, apiToken });
      const success = isSuccessfulResponse(r.statusCode, r.rawResponse);
      attempts.push({ authMethod: m, statusCode: r.statusCode, success });
      console.log(`[appliance-age-api/test] method=${m} status=${r.statusCode} success=${success}`);
      if (success && !chosen) {
        chosen = { authMethod: m, statusCode: r.statusCode, rawResponse: r.rawResponse, success };
      }
    } catch (e) {
      attempts.push({ authMethod: m, statusCode: 0, success: false });
      console.warn(`[appliance-age-api/test] method=${m} threw:`, e);
    }
  }

  if (chosen) {
    return { success: true, statusCode: chosen.statusCode, rawResponse: chosen.rawResponse, authMethodUsed: chosen.authMethod, attempts };
  }
  const last = attempts[attempts.length - 1];
  return { success: false, statusCode: last?.statusCode ?? 0, rawResponse: null, authMethodUsed: last?.authMethod ?? "both", attempts };
}

/**
 * Normalize a raw API response to our internal shape.
 */
export function normalizeApiResponse(raw: unknown, source: NormalizedAgeResult["source"] = "appliance_age_api"): NormalizedAgeResult | null {
  const r = raw as RawApiResponse | null;
  const decoded = r?.result?.decoded;
  if (!decoded) return null;

  const yearOptions = decoded.yearOptions ?? {};
  const entries = Object.values(yearOptions);

  // Sort by confidence desc.
  entries.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const mostLikelyYear = decoded.mostLikelyYear ?? (entries[0]?.year ?? null);
  const best = entries.find((e) => e.year === mostLikelyYear) ?? entries[0];
  const bestDate = best?.fullDate ? new Date(best.fullDate) : null;
  const manufactureMonth =
    bestDate && !Number.isNaN(bestDate.getTime()) ? bestDate.getUTCMonth() + 1 : null;

  const alternativeYears = entries
    .filter((e) => e.year !== mostLikelyYear)
    .map((e) => {
      const d = e.fullDate ? new Date(e.fullDate) : null;
      const month = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : null;
      return {
        year: e.year,
        month,
        confidencePercent: Math.round(e.confidence ?? 0),
        fullDate: e.fullDate ?? null,
      };
    });

  return {
    manufactureYear: mostLikelyYear ?? null,
    manufactureMonth,
    confidencePercent: best ? Math.round(best.confidence ?? 0) : null,
    alternativeYears,
    source,
    description: decoded.details?.description ?? null,
    rawProvider: raw,
  };
}

/**
 * Primary entrypoint used by the decode flow.
 * Calls the API using the "both" auth method (verified working).
 */
export async function callApplianceAgeApi(input: { make: string; model: string; serial: string }): Promise<{
  ok: boolean;
  statusCode: number;
  normalized: NormalizedAgeResult | null;
  rawResponse: unknown;
  responseTimeMs: number;
  error?: string;
  authMethodUsed?: AuthMethod;
}> {
  const rapidApiKey = process.env.RAPIDAPI_APPLIANCE_AGE_KEY;
  const apiToken = process.env.RAPIDAPI_APPLIANCE_AGE_TOKEN;
  if (!rapidApiKey || !apiToken) {
    return {
      ok: false,
      statusCode: 0,
      normalized: null,
      rawResponse: null,
      responseTimeMs: 0,
      error: "Missing RAPIDAPI_APPLIANCE_AGE_KEY/TOKEN",
    };
  }

  // Auth-method fallback: `both` is verified working, but if the provider
  // flips behavior or the plan lapses, try the other two before giving up.
  const methods: AuthMethod[] = ["both", "headers", "api_token"];
  let last: { statusCode: number; rawResponse: unknown; responseTimeMs: number; error?: string; method: AuthMethod } | null = null;
  const totalStart = Date.now();
  for (const method of methods) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await callOnce({ ...input, authMethod: method, rapidApiKey, apiToken });
        last = { ...r, method };
        const ok = isSuccessfulResponse(r.statusCode, r.rawResponse);
        if (ok) {
          const normalized = normalizeApiResponse(r.rawResponse, "appliance_age_api");
          if (normalized?.manufactureYear) {
            return {
              ok: true,
              statusCode: r.statusCode,
              normalized,
              rawResponse: r.rawResponse,
              responseTimeMs: Date.now() - totalStart,
              authMethodUsed: method,
            };
          }
        }
        // Retry only on transient 5xx / 429 / 0; otherwise move to next method.
        if (![0, 429, 500, 502, 503, 504].includes(r.statusCode)) break;
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
      } catch (e) {
        last = {
          statusCode: 0,
          rawResponse: null,
          responseTimeMs: 0,
          method,
          error: e instanceof Error ? e.message : String(e),
        };
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
      }
    }
  }

  return {
    ok: false,
    statusCode: last?.statusCode ?? 0,
    normalized: null,
    rawResponse: last?.rawResponse ?? null,
    responseTimeMs: Date.now() - totalStart,
    error: last?.error ?? `All auth methods failed (last status ${last?.statusCode ?? "n/a"})`,
    authMethodUsed: last?.method,
  };
}