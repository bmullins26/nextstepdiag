import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadOutcomeStats, type OutcomeStats } from "./diagnostic-outcomes.server";

const OutcomeKind = z.enum(["confirmed", "incorrect", "partial", "pending_repair"]);

const RecordInput = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  manufacturer: z.string().default(""),
  modelNumber: z.string().default(""),
  applianceType: z.string().default(""),
  platform: z.string().nullable().optional(),
  complaint: z.string().default(""),
  recommendedFailure: z.string().default(""),
  outcome: OutcomeKind,
  actualFailure: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const recordOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecordInput.parse(d))
  .handler(async ({ data, context }) => {
    const insert = {
      user_id: context.userId,
      session_id: data.sessionId ?? null,
      manufacturer: data.manufacturer ?? "",
      model_number: data.modelNumber ?? "",
      appliance_type: data.applianceType ?? "",
      platform: data.platform ?? null,
      complaint: data.complaint ?? "",
      recommended_failure: data.recommendedFailure ?? "",
      actual_failure: data.actualFailure ?? null,
      notes: data.notes ?? null,
      outcome: data.outcome,
      confirmed_at: data.outcome === "confirmed" ? new Date().toISOString() : null,
    };
    const { data: row, error } = await context.supabase
      .from("diagnostic_outcomes")
      .insert(insert)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.sessionId && (data.outcome === "confirmed" || data.outcome === "incorrect" || data.outcome === "partial")) {
      await context.supabase
        .from("diagnostic_sessions")
        .update({ status: "completed" })
        .eq("id", data.sessionId)
        .eq("user_id", context.userId);
    }
    return row;
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  outcome: z.enum(["confirmed", "incorrect", "partial"]),
  actualFailure: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      outcome: data.outcome,
      actual_failure: data.actualFailure ?? null,
      notes: data.notes ?? null,
    };
    if (data.outcome === "confirmed") patch.confirmed_at = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("diagnostic_outcomes")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (row?.session_id) {
      await context.supabase
        .from("diagnostic_sessions")
        .update({ status: "completed" })
        .eq("id", row.session_id)
        .eq("user_id", context.userId);
    }
    return row;
  });

export const listPendingRepairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("diagnostic_outcomes")
      .select("*")
      .eq("user_id", context.userId)
      .eq("outcome", "pending_repair")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const StatsInput = z.object({
  manufacturer: z.string(),
  modelNumber: z.string().nullable().optional(),
  applianceType: z.string(),
  platform: z.string().nullable().optional(),
  complaint: z.string(),
});

export const getOutcomeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatsInput.parse(d))
  .handler(async ({ data, context }): Promise<OutcomeStats> => {
    return loadOutcomeStats(context.supabase, data);
  });

export type OwnerOutcomeMetrics = {
  totals: { confirmed: number; incorrect: number; partial: number; pending: number; total: number };
  accuracyPercent: number | null;
  topConfirmed: Array<{ failure: string; count: number }>;
  topIncorrect: Array<{ failure: string; count: number }>;
  topComplaints: Array<{ complaint: string; count: number }>;
  topApplianceTypes: Array<{ type: string; count: number }>;
  bestModels: Array<{ model: string; resolved: number; accuracyPercent: number }>;
  worstModels: Array<{ model: string; resolved: number; accuracyPercent: number }>;
};

export const getOwnerOutcomeMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerOutcomeMetrics> => {
    // RLS allows owner role to read all rows
    const { data: rows, error } = await context.supabase
      .from("diagnostic_outcomes")
      .select(
        "outcome,recommended_failure,actual_failure,complaint,appliance_type,model_number,manufacturer",
      )
      .limit(10000);
    if (error) throw new Error(error.message);

    const totals = { confirmed: 0, incorrect: 0, partial: 0, pending: 0, total: 0 };
    const confirmedFailures = new Map<string, number>();
    const incorrectFailures = new Map<string, number>();
    const complaints = new Map<string, number>();
    const types = new Map<string, number>();
    type ModelAgg = { resolved: number; confirmed: number };
    const models = new Map<string, ModelAgg>();

    function bump(m: Map<string, number>, key: string) {
      const k = (key ?? "").trim();
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + 1);
    }

    for (const r of rows ?? []) {
      totals.total += 1;
      if (r.outcome === "confirmed") totals.confirmed += 1;
      else if (r.outcome === "incorrect") totals.incorrect += 1;
      else if (r.outcome === "partial") totals.partial += 1;
      else if (r.outcome === "pending_repair") totals.pending += 1;

      if (r.outcome === "confirmed") bump(confirmedFailures, r.recommended_failure ?? "");
      if (r.outcome === "incorrect") bump(incorrectFailures, r.recommended_failure ?? "");
      bump(complaints, r.complaint ?? "");
      bump(types, r.appliance_type ?? "");

      if (r.outcome === "confirmed" || r.outcome === "incorrect" || r.outcome === "partial") {
        const key = `${(r.manufacturer ?? "").trim()} ${(r.model_number ?? "").trim()}`.trim();
        if (key) {
          const agg = models.get(key) ?? { resolved: 0, confirmed: 0 };
          agg.resolved += 1;
          if (r.outcome === "confirmed") agg.confirmed += 1;
          models.set(key, agg);
        }
      }
    }

    const resolved = totals.confirmed + totals.incorrect + totals.partial;
    const accuracyPercent = resolved > 0 ? Math.round((totals.confirmed / resolved) * 100) : null;

    function rankMap(m: Map<string, number>, key: "failure" | "complaint" | "type") {
      return Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({ [key]: label, count } as any));
    }

    const modelRows = Array.from(models.entries())
      .filter(([, v]) => v.resolved >= 5)
      .map(([model, v]) => ({
        model,
        resolved: v.resolved,
        accuracyPercent: Math.round((v.confirmed / v.resolved) * 100),
      }));

    return {
      totals,
      accuracyPercent,
      topConfirmed: rankMap(confirmedFailures, "failure"),
      topIncorrect: rankMap(incorrectFailures, "failure"),
      topComplaints: rankMap(complaints, "complaint"),
      topApplianceTypes: rankMap(types, "type"),
      bestModels: [...modelRows].sort((a, b) => b.accuracyPercent - a.accuracyPercent).slice(0, 10),
      worstModels: [...modelRows].sort((a, b) => a.accuracyPercent - b.accuracyPercent).slice(0, 10),
    };
  });