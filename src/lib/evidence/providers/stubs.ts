import type { EvidenceProvider, EvidenceSourceType } from "../types";
import { priorityFor } from "../types";

function emptyProvider(sourceType: EvidenceSourceType): EvidenceProvider {
  return {
    sourceType,
    priority: priorityFor(sourceType),
    async fetch() {
      return [];
    },
  };
}

// Registered so the ranked evidence list already reflects the intended
// hierarchy — concrete data sources will be wired into these providers in
// follow-up phases (OEM APIs, ServiceMatters, MSA, iFixit, etc.).
export const manufacturerDocProvider = emptyProvider("manufacturer_doc");
export const serviceBulletinProvider = emptyProvider("service_bulletin");
export const externalRepairGuideProvider = emptyProvider("external_repair_guide");