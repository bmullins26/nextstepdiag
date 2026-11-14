import type { EvidenceProvider } from "./types";
import { techSheetProvider } from "./providers/tech-sheet";
import { verifiedRepairProvider } from "./providers/verified-repair";
import { repairHistoryProvider } from "./providers/repair-history";
import {
  communityDiscussionProvider,
  communityVerifiedProvider,
} from "./providers/community";
import { externalRepairGuideProvider } from "./providers/stubs";
import { externalRepairDataProvider } from "./providers/verified-appliance-data";
import {
  knowledgeFallbackProvider,
  knowledgeManufacturerDocProvider,
  knowledgeRepairRecordProvider,
  knowledgeTechnicianReportedProvider,
  knowledgeTechLiteratureProvider,
} from "./providers/knowledge";

export function getEvidenceProviders(): EvidenceProvider[] {
  return [
    knowledgeManufacturerDocProvider,
    techSheetProvider,
    knowledgeTechLiteratureProvider,
    verifiedRepairProvider,
    repairHistoryProvider,
    knowledgeRepairRecordProvider,
    knowledgeTechnicianReportedProvider,
    communityVerifiedProvider,
    communityDiscussionProvider,
    externalRepairDataProvider,
    externalRepairGuideProvider,
    knowledgeFallbackProvider,
  ];
}