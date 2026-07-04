export type EvidenceSourceType =
  | "manufacturer_doc"
  | "service_bulletin"
  | "tech_sheet"
  | "verified_repair"
  | "community_verified"
  | "community_discussion"
  | "external_repair_guide";

export const EVIDENCE_PRIORITY: Record<EvidenceSourceType, number> = {
  manufacturer_doc: 1,
  tech_sheet: 1.5,
  service_bulletin: 2,
  verified_repair: 3,
  community_verified: 4,
  community_discussion: 5,
  external_repair_guide: 6,
};

export const EVIDENCE_TIER_LABEL: Record<EvidenceSourceType, string> = {
  manufacturer_doc: "Manufacturer Documentation",
  tech_sheet: "Tech Sheet",
  service_bulletin: "Service Bulletin",
  verified_repair: "Verified Repair Outcome",
  community_verified: "Community — Verified Repair",
  community_discussion: "Community — Discussion",
  external_repair_guide: "External Repair Guide",
};

export interface EvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  summary: string;
  detail?: string;
  confidence: number; // 0..1
  supportingDiscussionCount?: number;
  supportingVerifiedRepairCount?: number;
  lastUpdated: string; // ISO
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceQuery {
  brand: string;
  applianceType: string;
  model: string;
  complaint: string;
  errorCode?: string | null;
  sessionId?: string | null;
  userId: string;
}

export interface EvidenceProviderCtx {
  supabase: import("@supabase/supabase-js").SupabaseClient;
}

export interface EvidenceProvider {
  sourceType: EvidenceSourceType;
  priority: number;
  fetch(q: EvidenceQuery, ctx: EvidenceProviderCtx): Promise<EvidenceItem[]>;
}

export function priorityFor(sourceType: EvidenceSourceType): number {
  return EVIDENCE_PRIORITY[sourceType] ?? 99;
}