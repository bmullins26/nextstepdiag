export type EvidenceSourceType =
  | "manufacturer_doc"
  | "service_bulletin"
  | "tech_sheet"
  | "verified_repair"
  | "repair_history"
  | "community_verified"
  | "community_discussion"
  | "technician_reported"
  | "external_repair_guide"
  | "fallback_unreviewed";

export const EVIDENCE_PRIORITY: Record<EvidenceSourceType, number> = {
  manufacturer_doc: 1,
  tech_sheet: 1.5,
  service_bulletin: 2,
  verified_repair: 3,
  repair_history: 3.5,
  community_verified: 4,
  technician_reported: 4.25,
  community_discussion: 5,
  external_repair_guide: 6,
  fallback_unreviewed: 7,
};

export const EVIDENCE_TIER_LABEL: Record<EvidenceSourceType, string> = {
  manufacturer_doc: "Manufacturer Documentation",
  tech_sheet: "Tech Sheet",
  service_bulletin: "Service Bulletin",
  verified_repair: "Verified Repair Outcome",
  repair_history: "Approved Repair History Pattern",
  community_verified: "Community — Verified Repair",
  community_discussion: "Community — Discussion",
  technician_reported: "Technician note",
  external_repair_guide: "External Repair Guide",
  fallback_unreviewed: "Reference material",
};

/** Internal prompt/audit codes only. Never render these as technician labels. */
export const INTERNAL_TIER_CODE: Record<EvidenceSourceType, string> = {
  manufacturer_doc: "T1_OEM",
  tech_sheet: "T2_LIT",
  service_bulletin: "T2_LIT",
  verified_repair: "T3_REPAIR",
  repair_history: "T3_PATTERN",
  community_verified: "T4_COMMUNITY",
  community_discussion: "T4_DISCUSSION",
  technician_reported: "T4_TECHNOTE",
  external_repair_guide: "T4_EXTERNAL",
  fallback_unreviewed: "T5_FALLBACK",
};

export const TIER_WEIGHT_CAP: Record<EvidenceSourceType, number> = {
  manufacturer_doc: 1.0,
  tech_sheet: 0.9,
  service_bulletin: 0.9,
  verified_repair: 0.8,
  repair_history: 0.6,
  community_verified: 0.5,
  community_discussion: 0.3,
  technician_reported: 0.4,
  external_repair_guide: 0.4,
  fallback_unreviewed: 0.25,
};

export type EvidenceMetaValue =
  | string
  | number
  | boolean
  | null
  | EvidenceMetaValue[]
  | { [k: string]: EvidenceMetaValue };

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
  metadata?: { [k: string]: EvidenceMetaValue };
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

/** Live literature is strongest only for an exact-model manufacturer document. */
export function internalTierFor(item: EvidenceItem): string {
  if (item.sourceType !== "tech_sheet") return INTERNAL_TIER_CODE[item.sourceType];
  if (item.metadata?.["confidence"] === "exact_model") {
    return item.metadata?.["sourceTrust"] === "oem" ? "T1_OEM" : "T2_LIT";
  }
  if (item.metadata?.["confidence"] || item.metadata?.["sourceTrust"]) return "T5_EXTERNAL";
  return "T2_LIT";
}

export function confidenceCapFor(item: EvidenceItem): number {
  return internalTierFor(item) === "T5_EXTERNAL" ? 0.25 : TIER_WEIGHT_CAP[item.sourceType];
}

export function priorityFor(sourceType: EvidenceSourceType): number {
  return EVIDENCE_PRIORITY[sourceType] ?? 99;
}
