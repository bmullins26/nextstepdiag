import type { EvidenceItem, EvidenceProvider } from "../types";
import { priorityFor } from "../types";
import { candidateModels, normalizeModel } from "@/lib/appliance/model-family";

type DiscussionRow = {
  id: string;
  brand: string;
  appliance_type: string;
  model_number: string;
  family_key: string;
  complaint: string;
  error_code: string | null;
  confirmed_failure: string | null;
  discussion_type: string;
  title: string;
  body: string;
  verified_outcome_id: string | null;
  reply_count: number;
  helpful_count: number;
  confirmed_success_count: number;
  confirmed_failure_count: number;
  success_rate: number | null;
  updated_at: string;
  created_at: string;
};

type Tier = "exact" | "family" | "brand_type" | "brand";

function scoreDiscussion(row: DiscussionRow, matchTier: Tier): number {
  const weight = { exact: 1, family: 0.75, brand_type: 0.5, brand: 0.3 }[matchTier];
  const base = 0.4 * weight;
  const successAdj =
    row.success_rate != null ? (row.success_rate - 0.5) * 0.5 : 0;
  const popularity = Math.min((row.helpful_count || 0) / 20, 0.1);
  return Math.min(0.95, Math.max(0.05, base + successAdj + popularity));
}

function buildItem(row: DiscussionRow, matchTier: Tier, verified: boolean): EvidenceItem {
  const supportingRepairs = (verified ? 1 : 0) + (row.confirmed_success_count || 0);
  return {
    id: `${verified ? "community_verified" : "community_discussion"}:${row.id}`,
    sourceType: verified ? "community_verified" : "community_discussion",
    title: row.title,
    summary: row.confirmed_failure
      ? `Reported cause: ${row.confirmed_failure}.`
      : (row.body || "").slice(0, 160) || "Community discussion.",
    detail:
      `${row.title}\n\n${row.body}`.slice(0, 700) +
      (row.confirmed_failure ? `\n\nConfirmed failure: ${row.confirmed_failure}` : ""),
    confidence: scoreDiscussion(row, matchTier),
    supportingDiscussionCount: 1 + (row.reply_count || 0),
    supportingVerifiedRepairCount: supportingRepairs,
    lastUpdated: row.updated_at,
    link: `/community/${row.id}`,
    metadata: {
      matchTier,
      helpfulCount: row.helpful_count,
      successRate: row.success_rate,
      complaint: row.complaint,
      brand: row.brand,
      model: row.model_number,
      discussionType: row.discussion_type,
      errorCode: row.error_code,
    },
  };
}

async function fetchDiscussions(
  supabase: any,
  brand: string,
  applianceType: string,
  model: string,
  complaint: string,
  verifiedOnly: boolean,
): Promise<EvidenceItem[]> {
  const cand = candidateModels(brand, model);
  const complaintTokens = new Set(
    complaint.toLowerCase().split(/\W+/).filter((t) => t.length >= 4),
  );

  let q = supabase
    .from("community_discussions")
    .select(
      "id,brand,appliance_type,model_number,family_key,complaint,error_code,confirmed_failure,discussion_type,title,body,verified_outcome_id,reply_count,helpful_count,confirmed_success_count,confirmed_failure_count,success_rate,updated_at,created_at",
    )
    .ilike("brand", brand)
    .limit(80);
  if (verifiedOnly) q = q.not("verified_outcome_id", "is", null);

  const { data, error } = await q;
  if (error || !data) return [];

  const items: EvidenceItem[] = [];
  for (const row of data as DiscussionRow[]) {
    const rModel = normalizeModel(row.model_number);
    let tier: Tier = "brand";
    if (rModel === cand.exact) tier = "exact";
    else if (row.family_key === cand.familyKey) tier = "family";
    else if (
      applianceType &&
      row.appliance_type.trim().toLowerCase() === applianceType.trim().toLowerCase()
    )
      tier = "brand_type";

    const rTokens = (row.complaint || "").toLowerCase().split(/\W+/);
    const matchC = rTokens.some((t) => t.length >= 4 && complaintTokens.has(t));
    if (!matchC && tier === "brand") continue;

    const verified = !!row.verified_outcome_id;
    if (verifiedOnly && !verified) continue;
    if (!verifiedOnly && verified) continue;

    // Discussions consistently associated with failed repairs drop below display threshold
    const item = buildItem(row, tier, verified);
    if (item.confidence < 0.2) continue;
    items.push(item);
  }
  return items
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, verifiedOnly ? 5 : 8);
}

export const communityVerifiedProvider: EvidenceProvider = {
  sourceType: "community_verified",
  priority: priorityFor("community_verified"),
  async fetch(q, { supabase }) {
    return fetchDiscussions(supabase, q.brand, q.applianceType, q.model, q.complaint, true);
  },
};

export const communityDiscussionProvider: EvidenceProvider = {
  sourceType: "community_discussion",
  priority: priorityFor("community_discussion"),
  async fetch(q, { supabase }) {
    return fetchDiscussions(supabase, q.brand, q.applianceType, q.model, q.complaint, false);
  },
};