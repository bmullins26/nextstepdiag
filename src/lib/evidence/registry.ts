import type { EvidenceProvider } from "./types";
import { techSheetProvider } from "./providers/tech-sheet";
import { verifiedRepairProvider } from "./providers/verified-repair";
import {
  communityDiscussionProvider,
  communityVerifiedProvider,
} from "./providers/community";
import {
  externalRepairGuideProvider,
  manufacturerDocProvider,
  serviceBulletinProvider,
} from "./providers/stubs";

export function getEvidenceProviders(): EvidenceProvider[] {
  return [
    manufacturerDocProvider,
    techSheetProvider,
    serviceBulletinProvider,
    verifiedRepairProvider,
    communityVerifiedProvider,
    communityDiscussionProvider,
    externalRepairGuideProvider,
  ];
}