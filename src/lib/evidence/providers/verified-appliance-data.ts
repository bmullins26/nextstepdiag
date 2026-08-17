import type { EvidenceProvider } from "../types";
import { priorityFor } from "../types";
import { knowledgeExternalRepairHits } from "./knowledge";

/**
 * External published repair references (currently Verified Appliance Data)
 * retrieved from the Knowledge Engine.
 *
 * Deliberately its own evidence class: it is neither a manufacturer service
 * procedure nor a technician-verified repair, so the diagnostic engine can
 * weigh it below both.
 */
export const externalRepairDataProvider: EvidenceProvider = {
  sourceType: "external_repair_guide",
  priority: priorityFor("external_repair_guide"),
  async fetch(q) {
    return knowledgeExternalRepairHits(q);
  },
};
