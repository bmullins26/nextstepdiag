import { Badge } from "@/components/ui/badge";
import { EVIDENCE_TIER_LABEL, type EvidenceSourceType } from "@/lib/evidence/types";

const COLOR: Record<EvidenceSourceType, string> = {
  manufacturer_doc: "border-primary/40 bg-primary/15 text-primary",
  tech_sheet: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  service_bulletin: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  verified_repair: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  community_verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  community_discussion: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  external_repair_guide: "border-border bg-muted text-muted-foreground",
};

export function SourceTypeBadge({ sourceType }: { sourceType: EvidenceSourceType }) {
  return (
    <Badge variant="outline" className={`border ${COLOR[sourceType]} text-[10px] font-bold uppercase tracking-wide`}>
      {EVIDENCE_TIER_LABEL[sourceType]}
    </Badge>
  );
}