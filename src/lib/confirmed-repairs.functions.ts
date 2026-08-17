import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Confirmed Repairs — the Community view over `diagnostic_outcomes`.
 * `diagnostic_outcomes` remains the single authoritative repair record; nothing
 * is copied into a second table. Community reads go through the database view
 * `shared_confirmed_repairs`, which exposes only rows the technician explicitly
 * shared and only the safe columns below. Private notes, photos and internal
 * diagnostic evidence are not reachable from that view at all.
 */
const PUBLIC_COLUMNS =
  "id,user_id,manufacturer,appliance_type,model_number,complaint,actual_failure,recommended_failure,part_replaced,confirming_test,repair_successful,public_notes,confirmed_at,shared_at,created_at";

export type ConfirmedRepair = {
  id: string;
  brand: string;
  applianceType: string;
  model: string;
  complaint: string;
  confirmedFailure: string;
  partReplaced: string | null;
  confirmingTest: string | null;
  repairSuccessful: boolean | null;
  publicNotes: string | null;
  technician: string;
  confirmedAt: string;
  discussionId: string | null;
  helpfulCount: number;
  replyCount: number;
};

type Row = Record<string, any>;

function baseMap(r: Row, discussion?: { id: string; helpful_count: number; reply_count: number }, technician = "Technician"): ConfirmedRepair {
  return {
    id: r['id'],
    brand: r['manufacturer'] ?? "",
    applianceType: r['appliance_type'] ?? "",
    model: r['model_number'] ?? "",
    complaint: r['complaint'] ?? "",
    confirmedFailure: r['actual_failure'] || r['recommended_failure'] || "",
    partReplaced: r['part_replaced'] ?? null,
    confirmingTest: r['confirming_test'] ?? null,
    repairSuccessful: r['repair_successful'] ?? null,
    publicNotes: r['public_notes'] ?? null,
    technician,
    confirmedAt: r['confirmed_at'] ?? r['shared_at'] ?? r['created_at'],
    discussionId: discussion?.id ?? null,
    helpfulCount: discussion?.helpful_count ?? 0,
    replyCount: discussion?.reply_count ?? 0,
  };
}

async function decorate(supabase: any, rows: Row[]): Promise<ConfirmedRepair[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r['id']);
  const userIds = Array.from(new Set(rows.map((r) => r['user_id']).filter(Boolean)));
  const [{ data: discussions }, { data: profiles }] = await Promise.all([
    supabase
      .from("community_discussions")
      .select("id,verified_outcome_id,helpful_count,reply_count")
      .in("verified_outcome_id", ids),
    supabase.from("profiles").select("id,display_name,full_name,email").in("id", userIds),
  ]);
  const byOutcome = new Map<string, any>();
  for (const d of discussions ?? []) byOutcome.set(d.verified_outcome_id, d);
  const nameById = new Map<string, string>();
  // The technician here is always the original repair outcome owner (`user_id`).
  // Importers and Knowledge Engine reviewers are tracked separately and never
  // substituted for this identity.
  for (const p of profiles ?? [])
    nameById.set(p.id, p.display_name || p.full_name || p.email || "Technician");
  return rows.map((r) => baseMap(r, byOutcome.get(r['id']), nameById.get(r['user_id']) ?? "Technician"));
}

const ListInput = z.object({
  brand: z.string().optional(),
  applianceType: z.string().optional(),
  model: z.string().optional(),
  complaint: z.string().optional(),
  failure: z.string().optional(),
  part: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["newest", "helpful", "discussed", "confirmed"]).default("newest"),
  limit: z.number().int().min(1).max(60).default(20),
  offset: z.number().int().min(0).default(0),
});

export const listConfirmedRepairs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ items: ConfirmedRepair[]; hasMore: boolean }> => {
    let q = context.supabase
      .from("shared_confirmed_repairs")
      .select(PUBLIC_COLUMNS)
      .order("shared_at", { ascending: false })
      .limit(400);
    if (data.brand) q = q.ilike("manufacturer", data.brand);
    if (data.applianceType) q = q.ilike("appliance_type", data.applianceType);
    if (data.model) q = q.ilike("model_number", `%${data.model}%`);
    if (data.complaint) q = q.ilike("complaint", `%${data.complaint}%`);
    if (data.part) q = q.ilike("part_replaced", `%${data.part}%`);
    if (data.from) q = q.gte("shared_at", data.from);
    if (data.to) q = q.lte("shared_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = (rows ?? []) as Row[];
    if (data.failure) {
      const needle = data.failure.toLowerCase();
      list = list.filter((r) =>
        `${r['actual_failure'] ?? ""} ${r['recommended_failure'] ?? ""}`.toLowerCase().includes(needle),
      );
    }

    let items = await decorate(context.supabase, list);

    if (data.sort === "helpful") items.sort((a, b) => b.helpfulCount - a.helpfulCount);
    else if (data.sort === "discussed") items.sort((a, b) => b.replyCount - a.replyCount);
    else if (data.sort === "confirmed") {
      const counts = new Map<string, number>();
      for (const i of items) {
        const k = `${i.brand}|${i.model}|${i.confirmedFailure}`.toLowerCase();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      items.sort(
        (a, b) =>
          (counts.get(`${b.brand}|${b.model}|${b.confirmedFailure}`.toLowerCase()) ?? 0) -
          (counts.get(`${a.brand}|${a.model}|${a.confirmedFailure}`.toLowerCase()) ?? 0),
      );
    }

    const page = items.slice(data.offset, data.offset + data.limit);
    return { items: page, hasMore: items.length > data.offset + data.limit };
  });

export const getConfirmedRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ outcomeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConfirmedRepair | null> => {
    const { data: row, error } = await context.supabase
      .from("shared_confirmed_repairs")
      .select(PUBLIC_COLUMNS)
      .eq("id", data.outcomeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const [item] = await decorate(context.supabase, [row as Row]);
    return item ?? null;
  });

export const getModelConfirmedRepairStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ brand: z.string(), model: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("shared_confirmed_repairs")
      .select("actual_failure,recommended_failure")
      .ilike("manufacturer", data.brand)
      .ilike("model_number", data.model)
      .limit(500);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of (rows ?? []) as Row[]) {
      const f = (r['actual_failure'] || r['recommended_failure'] || "").trim();
      if (!f) continue;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return {
      confirmedCount: (rows ?? []).length,
      topFailures: Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([failure, count]) => ({ failure, count })),
    };
  });

/** Duplicate guard for the share flow: one outcome, one auto-created post. */
export const getOutcomeDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ outcomeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("community_discussions")
      .select("id,title")
      .eq("verified_outcome_id", data.outcomeId)
      .maybeSingle();
    return row ?? null;
  });

export const shareOutcomeToCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        outcomeId: z.string().uuid(),
        publicNotes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Ownership + confirmed state are enforced by the filter below; RLS also
    // restricts updates to the caller's own rows.
    const { data: row, error } = await context.supabase
      .from("diagnostic_outcomes")
      .update({
        shared_to_community: true,
        shared_at: new Date().toISOString(),
        ...(data.publicNotes !== undefined ? { public_notes: data.publicNotes } : {}),
      })
      .eq("id", data.outcomeId)
      .eq("user_id", context.userId)
      .eq("outcome", "confirmed")
      .select("id,shared_to_community")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Only your own confirmed repairs can be shared.");

    await context.supabase.from("contribution_events").insert({
      user_id: context.userId,
      event_type: "confirmed_repair_shared",
      outcome_id: data.outcomeId,
      weight: 3,
    });
    return { ok: true };
  });
