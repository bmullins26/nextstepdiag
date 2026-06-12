import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InsightsSchema = z.object({
  repair_count: z.number(),
  top_failures: z.array(z.string()),
  top_repairs: z.array(z.string()),
  top_parts: z.array(z.string()),
  confidence_score: z.number(),
});

export type RepairInsightsData = z.infer<typeof InsightsSchema>;

export type RepairInsightsResult =
  | { enabled: false }
  | { enabled: true; available: false }
  | { enabled: true; available: true; data: RepairInsightsData };

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const DOWN_TTL_MS = 60 * 1000;

const successCache = new Map<string, { at: number; data: RepairInsightsData }>();
let engineDownUntil = 0;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const getRepairInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ model: z.string().trim().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<RepairInsightsResult> => {
    try {
      if (process.env.FORCE_DISABLE_REPAIR_INSIGHTS === "true") {
        return { enabled: false };
      }
      if (process.env.ENABLE_REPAIR_INSIGHTS !== "true") {
        return { enabled: false };
      }

      const base = (process.env.RIE_BASE_URL || "").replace(/\/$/, "");
      if (!base) return { enabled: true, available: false };

      const model = data.model.toUpperCase();

      const cached = successCache.get(model);
      if (cached && Date.now() - cached.at < SUCCESS_TTL_MS) {
        return { enabled: true, available: true, data: cached.data };
      }

      const now = Date.now();
      if (now < engineDownUntil) {
        return { enabled: true, available: false };
      }

      // Health check
      try {
        const health = await fetchWithTimeout(`${base}/api/v1/health`, 2000);
        if (!health.ok) {
          engineDownUntil = Date.now() + DOWN_TTL_MS;
          return { enabled: true, available: false };
        }
        const hj = (await health.json().catch(() => null)) as { status?: string } | null;
        if (!hj || hj.status !== "ok") {
          engineDownUntil = Date.now() + DOWN_TTL_MS;
          return { enabled: true, available: false };
        }
      } catch {
        engineDownUntil = Date.now() + DOWN_TTL_MS;
        return { enabled: true, available: false };
      }

      // Model lookup
      try {
        const res = await fetchWithTimeout(
          `${base}/api/v1/models/${encodeURIComponent(model)}`,
          2000,
        );
        if (!res.ok) return { enabled: true, available: false };
        const json = await res.json().catch(() => null);
        const parsed = InsightsSchema.safeParse(json);
        if (!parsed.success) return { enabled: true, available: false };
        successCache.set(model, { at: Date.now(), data: parsed.data });
        return { enabled: true, available: true, data: parsed.data };
      } catch {
        return { enabled: true, available: false };
      }
    } catch {
      return { enabled: true, available: false };
    }
  });