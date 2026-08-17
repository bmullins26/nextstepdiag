import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestSource, type IngestResult } from "./pipeline.server";

/**
 * Diagnostic sessions -> Knowledge Intelligence Engine.
 *
 * Rules enforced here (server-side only, never by a client):
 *  - A diagnostic session is EVIDENCE. It is ingested as a `service_call`
 *    source at `technician_entered` authority at most. The pipeline still
 *    clamps every AI-derived fact to `ai_extracted_pending_review`.
 *  - Only a CONFIRMED repair outcome may carry `technician_verified_repair`
 *    authority, and it is ingested as its own `repair_record` source.
 *  - The original diagnostic session row is never modified. Knowledge is
 *    linked back through `ref_table` / `ref_id`.
 *  - Idempotent: a session/outcome that already has a knowledge source is
 *    skipped, not re-ingested.
 */

export type SessionRow = Record<string, any>;

export type Eligibility = { eligible: boolean; reason: string };

/** A session is only worth ingesting when it carries real diagnostic signal. */
export function sessionEligibility(s: SessionRow): Eligibility {
  const complaint = String(s["complaint"] ?? "").trim();
  if (!complaint) return { eligible: false, reason: "No complaint recorded" };
  if (!String(s["brand"] ?? "").trim() && !String(s["model_number"] ?? "").trim())
    return { eligible: false, reason: "No appliance identification" };

  const findings = Array.isArray(s["findings"]) ? s["findings"] : [];
  const history = Array.isArray(s["history"]) ? s["history"] : [];
  const failure = String(s["most_likely_failure"] ?? "").trim();
  if (findings.length === 0 && history.length === 0 && !failure)
    return { eligible: false, reason: "No tests, answers or suspected failure yet" };

  if (s["status"] === "active" && history.length < 2 && findings.length === 0)
    return { eligible: false, reason: "Session still in progress" };

  return { eligible: true, reason: "Eligible" };
}

/** Human-readable evidence document built from the untouched session record. */
export function buildSessionContent(s: SessionRow): string {
  const findings: string[] = Array.isArray(s["findings"]) ? s["findings"] : [];
  const history: { question?: string; answer?: string }[] = Array.isArray(s["history"])
    ? s["history"]
    : [];
  const failures: string[] = Array.isArray(s["most_likely_failures"]) ? s["most_likely_failures"] : [];

  const lines = [
    "## Diagnostic session evidence (unconfirmed unless an outcome says otherwise)",
    `Brand: ${s["brand"] ?? ""}`,
    `Appliance: ${s["appliance_type"] ?? ""}`,
    `Model: ${s["model_number"] ?? ""}`,
    s["serial_number"] ? `Serial: ${s["serial_number"]}` : "",
    s["manufacture_year"] ? `Manufacture year: ${s["manufacture_year"]}` : "",
    s["age_years"] != null ? `Appliance age (years): ${s["age_years"]}` : "",
    `Complaint: ${s["complaint"] ?? ""}`,
    "",
    findings.length ? "## Tests performed and results" : "",
    ...findings.map((f) => `- ${f}`),
    "",
    history.length ? "## Diagnostic questions and technician answers" : "",
    ...history.map((h) => `- Q: ${h?.question ?? ""}\n  A: ${h?.answer ?? ""}`),
    "",
    s["current_findings_summary"] ? `## Findings summary\n${s["current_findings_summary"]}` : "",
    "",
    failures.length ? `## Suspected failures (not confirmed)\n${failures.map((f) => `- ${f}`).join("\n")}` : "",
    s["most_likely_failure"] ? `Top suspected failure (not confirmed): ${s["most_likely_failure"]}` : "",
    s["recommended_next_test"] ? `Recommended next test: ${s["recommended_next_test"]}` : "",
  ];

  return lines.filter((l) => l !== "").join("\n").trim();
}

export function buildOutcomeContent(r: SessionRow): string {
  return [
    `## Confirmed technician repair`,
    `Brand: ${r["manufacturer"]}`,
    `Appliance: ${r["appliance_type"]}`,
    `Model: ${r["model_number"]}`,
    r["platform"] ? `Platform: ${r["platform"]}` : "",
    `Complaint: ${r["complaint"]}`,
    r["predicted_top_failure"] ? `Predicted failure: ${r["predicted_top_failure"]}` : "",
    `Confirmed failure: ${r["actual_failure"] ?? r["recommended_failure"]}`,
    r["confirming_test"] ? `Confirming test: ${r["confirming_test"]}` : "",
    r["part_replaced"] ? `Part replaced: ${r["part_replaced"]}` : "",
    typeof r["repair_successful"] === "boolean"
      ? `Repair successful: ${r["repair_successful"] ? "yes" : "no"}`
      : "",
    r["unusual_notes"] ? `Unusual notes: ${r["unusual_notes"]}` : "",
    r["public_notes"] ? `Technician notes: ${r["public_notes"]}` : "",
    r["notes"] ? `Notes: ${r["notes"]}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function alreadyIngested(admin: SupabaseClient, refTable: string, refId: string) {
  const { data } = await admin
    .from("knowledge_sources")
    .select("id")
    .eq("ref_table", refTable)
    .eq("ref_id", refId)
    .limit(1);
  return (data?.[0] as { id: string } | undefined) ?? null;
}

export type SessionIngestOutcome =
  | ({ sessionId: string; state: "processed" } & IngestResult)
  | { sessionId: string; state: "skipped" | "not_eligible" | "failed"; reason: string };

/**
 * Ingest a single diagnostic session as evidence. Safe to call repeatedly.
 * `uploadedBy` is the server-resolved actor, never a client-supplied value.
 */
export async function ingestDiagnosticSession(
  admin: SupabaseClient,
  sessionId: string,
  uploadedBy: string,
): Promise<SessionIngestOutcome> {
  const { data: session, error } = await admin
    .from("diagnostic_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) return { sessionId, state: "failed", reason: error.message };
  if (!session) return { sessionId, state: "failed", reason: "Session not found" };

  const elig = sessionEligibility(session as SessionRow);
  if (!elig.eligible) return { sessionId, state: "not_eligible", reason: elig.reason };

  const existing = await alreadyIngested(admin, "diagnostic_sessions", sessionId);
  if (existing) {
    const { data: job } = await admin
      .from("knowledge_processing_jobs")
      .select("id,status")
      .eq("source_id", existing.id)
      .in("status", ["completed", "needs_review", "processing"])
      .limit(1);
    if (job?.[0]) return { sessionId, state: "skipped", reason: "Already processed" };
  }

  const s = session as SessionRow;
  const content = buildSessionContent(s);
  if (content.length < 80) return { sessionId, state: "not_eligible", reason: "Too little content" };

  try {
    const res = await ingestSource(admin, {
      source_type: "service_call",
      // Evidence only. The pipeline clamps AI-derived facts to pending review.
      source_authority: "technician_entered",
      title: `${s["brand"] ?? ""} ${s["model_number"] ?? ""} — ${s["complaint"] ?? "diagnostic session"}`.trim(),
      brand: s["brand"] ?? null,
      manufacturer: s["brand"] ?? null,
      appliance_type: s["appliance_type"] ?? null,
      model_number: s["model_number"] ?? null,
      ref_table: "diagnostic_sessions",
      ref_id: sessionId,
      metadata: {
        session_id: sessionId,
        session_status: s["status"],
        technician_user_id: s["user_id"],
        evidence_only: true,
      },
      uploaded_by: uploadedBy,
      content,
    });
    if (res.status === "failed")
      return { sessionId, state: "failed", reason: res.error ?? "Pipeline failed" };
    return { sessionId, state: "processed", ...res };
  } catch (e) {
    return { sessionId, state: "failed", reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ingest a confirmed repair outcome as its own higher-authority source.
 * Non-confirmed outcomes stay out of the trusted corpus entirely.
 */
export async function ingestConfirmedOutcome(
  admin: SupabaseClient,
  outcomeId: string,
  uploadedBy: string,
): Promise<SessionIngestOutcome> {
  const { data: row, error } = await admin
    .from("diagnostic_outcomes")
    .select("*")
    .eq("id", outcomeId)
    .maybeSingle();
  if (error) return { sessionId: outcomeId, state: "failed", reason: error.message };
  if (!row) return { sessionId: outcomeId, state: "failed", reason: "Outcome not found" };
  const r = row as SessionRow;
  if (r["outcome"] !== "confirmed")
    return { sessionId: outcomeId, state: "not_eligible", reason: "Outcome not confirmed" };

  const existing = await alreadyIngested(admin, "diagnostic_outcomes", outcomeId);
  if (existing) return { sessionId: outcomeId, state: "skipped", reason: "Already processed" };

  try {
    const res = await ingestSource(admin, {
      source_type: "repair_record",
      source_authority: "technician_verified_repair",
      title: `${r["manufacturer"]} ${r["model_number"]} — ${r["complaint"]}`,
      brand: r["manufacturer"],
      manufacturer: r["manufacturer"],
      appliance_type: r["appliance_type"],
      model_number: r["model_number"],
      ref_table: "diagnostic_outcomes",
      ref_id: outcomeId,
      metadata: { outcome_id: outcomeId, session_id: r["session_id"] ?? null },
      uploaded_by: uploadedBy,
      content: buildOutcomeContent(r),
    });
    if (res.status === "failed")
      return { sessionId: outcomeId, state: "failed", reason: res.error ?? "Pipeline failed" };
    return { sessionId: outcomeId, state: "processed", ...res };
  } catch (e) {
    return { sessionId: outcomeId, state: "failed", reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fire-and-forget trigger used by session/outcome write paths so ingestion
 * never blocks or breaks the technician's request.
 */
export function queueSessionIngest(sessionId: string, uploadedBy: string) {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await ingestDiagnosticSession(supabaseAdmin as any, sessionId, uploadedBy);
      if (res.state === "failed")
        console.error("[knowledge] session ingest failed", sessionId, res.reason);
    } catch (e) {
      console.error("[knowledge] session ingest threw", sessionId, e);
    }
  })();
}

export function queueOutcomeIngest(outcomeId: string, uploadedBy: string) {
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await ingestConfirmedOutcome(supabaseAdmin as any, outcomeId, uploadedBy);
      if (res.state === "failed")
        console.error("[knowledge] outcome ingest failed", outcomeId, res.reason);
    } catch (e) {
      console.error("[knowledge] outcome ingest threw", outcomeId, e);
    }
  })();
}

/** Owner-console rollup: how much real diagnostic activity reached the corpus. */
export async function sessionKnowledgeStats(admin: SupabaseClient) {
  const [{ data: sessions }, { data: sources }] = await Promise.all([
    admin
      .from("diagnostic_sessions")
      .select("id,status,brand,model_number,complaint,findings,history,most_likely_failure")
      .order("updated_at", { ascending: false })
      .limit(2000),
    admin.from("knowledge_sources").select("id,ref_id").eq("ref_table", "diagnostic_sessions"),
  ]);

  const sourceByRef = new Map<string, string>();
  for (const s of (sources ?? []) as { id: string; ref_id: string }[]) sourceByRef.set(s.ref_id, s.id);

  const sourceIds = [...sourceByRef.values()];
  const [{ data: jobs }, { data: facts }, { data: chunks }] = sourceIds.length
    ? await Promise.all([
        admin.from("knowledge_processing_jobs").select("source_id,status").in("source_id", sourceIds),
        admin.from("knowledge_facts").select("source_id,needs_review").in("source_id", sourceIds),
        admin.from("knowledge_chunks").select("id").in("source_id", sourceIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];

  const jobStatus = new Map<string, string>();
  for (const j of (jobs ?? []) as { source_id: string; status: string }[]) {
    const prev = jobStatus.get(j.source_id);
    if (!prev || prev === "failed") jobStatus.set(j.source_id, j.status);
  }

  let eligible = 0;
  let processed = 0;
  let pending = 0;
  let failed = 0;
  let notEligible = 0;

  for (const s of (sessions ?? []) as SessionRow[]) {
    const ok = sessionEligibility(s).eligible;
    if (!ok) {
      notEligible += 1;
      continue;
    }
    eligible += 1;
    const srcId = sourceByRef.get(s["id"]);
    const st = srcId ? jobStatus.get(srcId) : undefined;
    if (st === "completed" || st === "needs_review") processed += 1;
    else if (st === "failed") failed += 1;
    else pending += 1;
  }

  return {
    totalSessions: (sessions ?? []).length,
    eligible,
    processed,
    pending,
    failed,
    notEligible,
    facts: (facts ?? []).length,
    reviewItems: (facts ?? []).filter((f: any) => f.needs_review).length,
    chunks: (chunks ?? []).length,
  };
}

/** Per-session knowledge status, used by the Owner user detail view. */
export async function sessionKnowledgeStatusFor(
  admin: SupabaseClient,
  userId: string,
): Promise<{ processed: number; pending: number; failed: number; not_eligible: number }> {
  const { data: sessions } = await admin
    .from("diagnostic_sessions")
    .select("id,status,brand,model_number,complaint,findings,history,most_likely_failure")
    .eq("user_id", userId);

  const ids = (sessions ?? []).map((s: any) => s.id);
  const out = { processed: 0, pending: 0, failed: 0, not_eligible: 0 };
  if (ids.length === 0) return out;

  const { data: sources } = await admin
    .from("knowledge_sources")
    .select("id,ref_id")
    .eq("ref_table", "diagnostic_sessions")
    .in("ref_id", ids);
  const sourceByRef = new Map<string, string>();
  for (const s of (sources ?? []) as { id: string; ref_id: string }[]) sourceByRef.set(s.ref_id, s.id);

  const sourceIds = [...sourceByRef.values()];
  const { data: jobs } = sourceIds.length
    ? await admin.from("knowledge_processing_jobs").select("source_id,status").in("source_id", sourceIds)
    : { data: [] as any[] };
  const jobStatus = new Map<string, string>();
  for (const j of (jobs ?? []) as { source_id: string; status: string }[]) {
    const prev = jobStatus.get(j.source_id);
    if (!prev || prev === "failed") jobStatus.set(j.source_id, j.status);
  }

  for (const s of (sessions ?? []) as SessionRow[]) {
    if (!sessionEligibility(s).eligible) {
      out.not_eligible += 1;
      continue;
    }
    const srcId = sourceByRef.get(s["id"]);
    const st = srcId ? jobStatus.get(srcId) : undefined;
    if (st === "completed" || st === "needs_review") out.processed += 1;
    else if (st === "failed") out.failed += 1;
    else out.pending += 1;
  }
  return out;
}

/** Batched, idempotent historical backfill. Never processes an unbounded set. */
export async function backfillSessions(
  admin: SupabaseClient,
  opts: { limit: number; dryRun: boolean; retryFailed: boolean; uploadedBy: string },
) {
  const { data: sources } = await admin
    .from("knowledge_sources")
    .select("id,ref_id")
    .eq("ref_table", "diagnostic_sessions");
  const sourceByRef = new Map<string, string>();
  for (const s of (sources ?? []) as { id: string; ref_id: string }[]) sourceByRef.set(s.ref_id, s.id);

  const sourceIds = [...sourceByRef.values()];
  const { data: jobs } = sourceIds.length
    ? await admin.from("knowledge_processing_jobs").select("source_id,status").in("source_id", sourceIds)
    : { data: [] as any[] };
  const jobStatus = new Map<string, string>();
  for (const j of (jobs ?? []) as { source_id: string; status: string }[]) {
    const prev = jobStatus.get(j.source_id);
    if (!prev || prev === "failed") jobStatus.set(j.source_id, j.status);
  }

  // No date cutoff: oldest-first so the whole history drains over batches.
  const { data: sessions, error } = await admin
    .from("diagnostic_sessions")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);

  const queue: SessionRow[] = [];
  for (const s of (sessions ?? []) as SessionRow[]) {
    if (!sessionEligibility(s).eligible) continue;
    const srcId = sourceByRef.get(s["id"]);
    const st = srcId ? jobStatus.get(srcId) : undefined;
    if (st === "completed" || st === "needs_review" || st === "processing") continue;
    if (st === "failed" && !opts.retryFailed) continue;
    queue.push(s);
    if (queue.length >= opts.limit) break;
  }

  if (opts.dryRun) {
    return {
      dryRun: true,
      wouldIngest: queue.map((s) => ({
        id: s["id"],
        label: `${s["brand"] ?? ""} ${s["model_number"] ?? ""} — ${s["complaint"] ?? ""}`.trim(),
      })),
      results: [] as SessionIngestOutcome[],
    };
  }

  const results: SessionIngestOutcome[] = [];
  for (const s of queue) {
    // One bad session must never stop the backfill.
    results.push(await ingestDiagnosticSession(admin, s["id"], opts.uploadedBy));
  }
  return { dryRun: false, wouldIngest: [] as { id: string; label: string }[], results };
}
