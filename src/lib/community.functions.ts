import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DISCUSSION_TYPES,
  normalizeComplaint,
  normalizeTags,
} from "@/lib/community/normalize";
import { candidateModels, normalizeBrand, normalizeModel } from "@/lib/appliance/model-family";

// ---------- helpers ----------

const DiscussionTypeEnum = z.enum(DISCUSSION_TYPES);

const ReactionEnum = z.enum(["like", "helpful", "solved", "not_helpful"]);

function normalizeModelInput(m: string): string {
  return (m || "").trim().toUpperCase();
}

// ---------- reads ----------

export const listCommunityHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [recent, popular, verified, trendingModels, newest] = await Promise.all([
      supabase
        .from("community_discussions")
        .select("id,title,brand,appliance_type,model_number,complaint,discussion_type,helpful_count,reply_count,view_count,verified_outcome_id,updated_at,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("community_discussions")
        .select("id,title,brand,appliance_type,model_number,complaint,discussion_type,helpful_count,reply_count,view_count,verified_outcome_id,updated_at,created_at")
        .order("helpful_count", { ascending: false })
        .limit(8),
      supabase
        .from("community_discussions")
        .select("id,title,brand,appliance_type,model_number,complaint,confirmed_failure,discussion_type,helpful_count,reply_count,verified_outcome_id,updated_at,created_at")
        .not("verified_outcome_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("community_discussions")
        .select("brand,appliance_type,model_number,created_at")
        .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
        .limit(400),
      supabase
        .from("community_discussions")
        .select("id,title,brand,appliance_type,model_number,complaint,discussion_type,updated_at,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    // Trending models aggregation
    const modelCounts = new Map<string, { brand: string; type: string; model: string; count: number }>();
    for (const r of (trendingModels.data ?? []) as any[]) {
      const key = `${r.brand}::${r.appliance_type}::${r.model_number}`;
      const cur = modelCounts.get(key);
      if (cur) cur.count += 1;
      else
        modelCounts.set(key, {
          brand: r.brand,
          type: r.appliance_type,
          model: r.model_number,
          count: 1,
        });
    }
    const trending = Array.from(modelCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Most active contributors (last 30d) — join discussions + replies counts
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [{ data: authorDiscussions }, { data: authorReplies }] = await Promise.all([
      supabase
        .from("community_discussions")
        .select("author_id,created_at")
        .gte("created_at", since)
        .limit(500),
      supabase
        .from("community_replies")
        .select("author_id,created_at")
        .gte("created_at", since)
        .limit(1000),
    ]);
    const contribMap = new Map<string, number>();
    for (const r of (authorDiscussions ?? []) as any[]) contribMap.set(r.author_id, (contribMap.get(r.author_id) ?? 0) + 3);
    for (const r of (authorReplies ?? []) as any[]) contribMap.set(r.author_id, (contribMap.get(r.author_id) ?? 0) + 1);
    const contribIds = Array.from(contribMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    let contributors: Array<{ id: string; name: string; score: number }> = [];
    if (contribIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", contribIds);
      const nameFor = (id: string) => {
        const p = (profs ?? []).find((x: any) => x.id === id);
        return p?.full_name || (p?.email ? String(p.email).split("@")[0] : "Technician");
      };
      contributors = contribIds.map((id) => ({
        id,
        name: nameFor(id),
        score: contribMap.get(id) ?? 0,
      }));
    }

    return {
      recent: recent.data ?? [],
      popular: popular.data ?? [],
      verified: verified.data ?? [],
      newest: newest.data ?? [],
      trendingModels: trending,
      contributors,
    };
  });

export const searchKnownModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brand: z.string().default(""),
        applianceType: z.string().default(""),
        q: z.string().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = (data.q || "").trim();
    if (!data.brand) return [] as string[];
    let base = supabase
      .from("diagnostic_sessions")
      .select("model_number")
      .ilike("brand", data.brand)
      .not("model_number", "eq", "")
      .limit(200);
    if (data.applianceType) base = base.ilike("appliance_type", data.applianceType);
    if (q) base = base.ilike("model_number", `${q}%`);
    const { data: rows } = await base;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of (rows ?? []) as any[]) {
      const m = (r.model_number ?? "").trim().toUpperCase();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
      if (out.length >= 20) break;
    }
    return out;
  });

export const listComplaintsForModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brand: z.string().min(1),
        applianceType: z.string().default(""),
        model: z.string().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("diagnostic_sessions")
      .select("complaint")
      .ilike("brand", data.brand)
      .not("complaint", "eq", "")
      .limit(200);
    if (data.model) q = q.ilike("model_number", data.model);
    if (data.applianceType) q = q.ilike("appliance_type", data.applianceType);
    const { data: rows } = await q;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of (rows ?? []) as any[]) {
      const c = normalizeComplaint(r.complaint ?? "");
      if (!c || seen.has(c.toLowerCase())) continue;
      seen.add(c.toLowerCase());
      out.push(c);
      if (out.length >= 12) break;
    }
    return out;
  });

export const browseCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        brand: z.string().optional(),
        applianceType: z.string().optional(),
        model: z.string().optional(),
        complaint: z.string().optional(),
        sort: z.enum(["recent", "helpful", "verified"]).default("recent"),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("community_discussions")
      .select("id,title,brand,appliance_type,model_number,complaint,discussion_type,helpful_count,reply_count,view_count,verified_outcome_id,updated_at,created_at");
    if (data.brand) q = q.ilike("brand", data.brand);
    if (data.applianceType) q = q.ilike("appliance_type", data.applianceType);
    if (data.model) q = q.ilike("model_number", data.model);
    if (data.complaint) q = q.ilike("complaint", `%${data.complaint}%`);
    if (data.sort === "helpful") q = q.order("helpful_count", { ascending: false });
    else if (data.sort === "verified")
      q = q.not("verified_outcome_id", "is", null).order("updated_at", { ascending: false });
    else q = q.order("created_at", { ascending: false });
    q = q.limit(data.limit);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const searchCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().min(1),
        brand: z.string().optional(),
        applianceType: z.string().optional(),
        discussionType: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const term = `%${data.q}%`;
    let q = context.supabase
      .from("community_discussions")
      .select("id,title,brand,appliance_type,model_number,complaint,error_code,discussion_type,helpful_count,reply_count,verified_outcome_id,tags,updated_at,created_at")
      .or(
        `title.ilike.${term},body.ilike.${term},complaint.ilike.${term},model_number.ilike.${term},error_code.ilike.${term},confirmed_failure.ilike.${term}`,
      )
      .limit(50);
    if (data.brand) q = q.ilike("brand", data.brand);
    if (data.applianceType) q = q.ilike("appliance_type", data.applianceType);
    if (data.discussionType) q = q.eq("discussion_type", data.discussionType);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [disc, replies, reactions] = await Promise.all([
      supabase.from("community_discussions").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("community_replies")
        .select("id,discussion_id,author_id,parent_reply_id,body,like_count,helpful_count,not_helpful_count,is_solved,created_at,updated_at,edited_at")
        .eq("discussion_id", data.id)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("community_reactions")
        .select("target_type,target_id,reaction")
        .eq("user_id", userId),
    ]);
    if (disc.error) throw disc.error;
    if (!disc.data) throw new Error("Discussion not found");
    // View count increment (fire-and-forget)
    supabase
      .from("community_discussions")
      .update({ view_count: (disc.data.view_count ?? 0) + 1 })
      .eq("id", data.id)
      .then(() => undefined, () => undefined);

    // Author profile lookups
    const authorIds = new Set<string>();
    authorIds.add(disc.data.author_id);
    for (const r of (replies.data ?? []) as any[]) authorIds.add(r.author_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", Array.from(authorIds));
    const authors = Object.fromEntries(
      (profs ?? []).map((p: any) => [p.id, { name: p.full_name || String(p.email ?? "").split("@")[0] || "Technician" }]),
    );

    // My reactions
    const myReactions: Record<string, string[]> = {};
    for (const r of (reactions.data ?? []) as any[]) {
      const key = `${r.target_type}:${r.target_id}`;
      (myReactions[key] ??= []).push(r.reaction);
    }

    return {
      discussion: disc.data,
      replies: replies.data ?? [],
      authors,
      myReactions,
    };
  });

// ---------- writes ----------

const CreateDiscussionInput = z.object({
  brand: z.string().min(1),
  applianceType: z.string().min(1),
  model: z.string().min(1),
  complaint: z.string().min(1),
  errorCode: z.string().optional().nullable(),
  confirmedFailure: z.string().optional().nullable(),
  discussionType: DiscussionTypeEnum,
  title: z.string().min(3).max(200),
  body: z.string().max(20000).default(""),
  verifiedOutcomeId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const createDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateDiscussionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Strict model check: must exist in diagnostic_sessions OR must be explicit uppercase (>=3 chars).
    const model = normalizeModelInput(data.model);
    if (model.length < 3) throw new Error("Model number is required.");
    const { data: seen } = await supabase
      .from("diagnostic_sessions")
      .select("id")
      .ilike("brand", data.brand)
      .ilike("model_number", model)
      .limit(1);
    // If the model has never been seen we still allow, but we require length >= 4.
    if (!seen?.length && model.length < 4) {
      throw new Error("Model not recognized. Confirm the exact model number.");
    }

    let verifiedOutcomeId: string | null = null;
    if (data.verifiedOutcomeId) {
      const { data: outcome, error: oErr } = await supabase
        .from("diagnostic_outcomes")
        .select("id,user_id,outcome")
        .eq("id", data.verifiedOutcomeId)
        .maybeSingle();
      if (oErr) throw oErr;
      if (outcome && outcome.user_id === userId && outcome.outcome === "confirmed") {
        verifiedOutcomeId = outcome.id;
      }
    }

    const insert = {
      author_id: userId,
      brand: data.brand.trim(),
      appliance_type: data.applianceType.trim(),
      model_number: model,
      complaint: normalizeComplaint(data.complaint),
      error_code: data.errorCode?.trim() || null,
      confirmed_failure: data.confirmedFailure?.trim() || null,
      discussion_type: data.discussionType,
      title: data.title.trim(),
      body: data.body,
      verified_outcome_id: verifiedOutcomeId,
      tags: normalizeTags(data.tags),
    };
    const { data: row, error } = await supabase
      .from("community_discussions")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(3).max(200).optional(),
        body: z.string().max(20000).optional(),
        tags: z.array(z.string()).optional(),
        errorCode: z.string().nullable().optional(),
        confirmedFailure: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title != null) patch.title = data.title.trim();
    if (data.body != null) patch.body = data.body;
    if (data.tags != null) patch.tags = normalizeTags(data.tags);
    if (data.errorCode !== undefined) patch.error_code = data.errorCode?.trim() || null;
    if (data.confirmedFailure !== undefined) patch.confirmed_failure = data.confirmedFailure?.trim() || null;
    const { error } = await context.supabase
      .from("community_discussions")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("community_discussions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const createReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        discussionId: z.string().uuid(),
        parentReplyId: z.string().uuid().nullable().optional(),
        body: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("community_replies")
      .insert({
        discussion_id: data.discussionId,
        parent_reply_id: data.parentReplyId ?? null,
        author_id: context.userId,
        body: data.body,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().min(1).max(20000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_replies")
      .update({ body: data.body, edited_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("community_replies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetType: z.enum(["discussion", "reply"]),
        targetId: z.string().uuid(),
        reaction: ReactionEnum,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Check if it exists — toggle.
    const { data: existing } = await supabase
      .from("community_reactions")
      .select("id")
      .eq("user_id", userId)
      .eq("target_type", data.targetType)
      .eq("target_id", data.targetId)
      .eq("reaction", data.reaction)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("community_reactions").delete().eq("id", existing.id);
      if (error) throw error;
      return { active: false };
    }
    const { error } = await supabase.from("community_reactions").insert({
      user_id: userId,
      target_type: data.targetType,
      target_id: data.targetId,
      reaction: data.reaction,
    });
    if (error) throw error;
    return { active: true };
  });

export const markSolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ discussionId: z.string().uuid(), replyId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("community_discussions")
      .update({ solved_reply_id: data.replyId })
      .eq("id", data.discussionId);
    if (error) throw error;
    if (data.replyId) {
      await context.supabase
        .from("community_replies")
        .update({ is_solved: true })
        .eq("id", data.replyId);
    }
    return { ok: true };
  });

// ---------- learning loop ----------

export const recordInsightFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid().nullable().optional(),
        discussionId: z.string().uuid(),
        userResponse: z.enum(["helpful", "not_helpful"]),
        insightSnapshot: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      session_id: data.sessionId ?? null,
      discussion_id: data.discussionId,
      user_response: data.userResponse,
      insight_snapshot: data.insightSnapshot ?? {},
    };
    const { error } = await supabase
      .from("community_insight_feedback")
      .upsert(payload, { onConflict: "session_id,discussion_id" });
    if (error) throw error;
    return { ok: true };
  });

// Called from outcome-capture when the tech confirms/rejects the diagnosis;
// stitches the final outcome back onto any insight-feedback rows for the session.
export const stitchOutcomeToInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        finalOutcome: z.enum(["confirmed", "incorrect", "partial", "pending_repair"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_insight_feedback")
      .update({ final_outcome: data.finalOutcome })
      .eq("session_id", data.sessionId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

void candidateModels;
void normalizeBrand;
void normalizeModel;