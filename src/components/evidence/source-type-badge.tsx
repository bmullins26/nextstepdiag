import { Badge } from "@/components/ui/badge";
import type { EvidenceSourceType } from "@/lib/evidence/types";
import { SOURCE_KIND_LABEL } from "@/lib/technician-display";

export function SourceTypeBadge({ sourceType }: { sourceType: EvidenceSourceType }) {
  return (
    <Badge
      variant="outline"
      className="border-border bg-muted text-[10px] font-semibold tracking-wide text-muted-foreground"
    >
      {SOURCE_KIND_LABEL[sourceType]}
    </Badge>
  );
}
