import type { EvidenceProvider } from "./types";
import { techSheetProvider } from "./providers/tech-sheet";
import { verifiedRepairProvider } from "./providers/verified-repair";
import {
  communityDiscussionProvider,
  communityVerifiedProvider,
} from "./providers/community";
import { externalRepairGuideProvider } from "./providers/stubs";
import { externalRepairDataProvider } from "./providers/verified-appliance-data";
import {
  knowledgeManufacturerDocProvider,
  knowledgeRepairRecordProvider,
  knowledgeServiceBulletinProvider,
} from "./providers/knowledge";

export function getEvidenceProviders(): EvidenceProvider[] {
  return [
    knowledgeManufacturerDocProvider,
    techSheetProvider,
    knowledgeServiceBulletinProvider,
    verifiedRepairProvider,
    knowledgeRepairRecordProvider,
    communityVerifiedProvider,
    communityDiscussionProvider,
    externalRepairDataProvider,
    externalRepairGuideProvider,
  ];
}