import type { EvidenceSourceType } from "@/lib/evidence/types";

/** Neutral source names for technician screens; internal ranking stays server-side. */
export const SOURCE_KIND_LABEL: Record<EvidenceSourceType, string> = {
  manufacturer_doc: "Manufacturer document",
  tech_sheet: "Tech sheet",
  service_bulletin: "Tech sheet",
  verified_repair: "Repair record",
  repair_history: "Repair history",
  community_verified: "Technician community",
  community_discussion: "Community discussion",
  technician_reported: "Technician note",
  external_repair_guide: "Repair guide",
  fallback_unreviewed: "Reference material",
};

export function formatRepairHistoryRow(rawCount: number, sampleSize: number, failure: string): string {
  return `${rawCount} of ${sampleSize} ${sampleSize === 1 ? "repair" : "repairs"}: ${failure}`;
}

export function warrantyRecordLabel(hasSerialRecord: boolean): string {
  return hasSerialRecord ? "Whirlpool serial record" : "Model coverage estimate";
}
