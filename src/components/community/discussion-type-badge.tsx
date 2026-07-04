import { Badge } from "@/components/ui/badge";
import { DISCUSSION_TYPE_LABEL, type DiscussionType } from "@/lib/community/normalize";

const COLOR: Record<DiscussionType, string> = {
  general: "bg-muted text-foreground",
  repair_tip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  question: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  confirmed_repair: "bg-primary/20 text-primary border-primary/40",
  diagnostic_advice: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  part_recommendation: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  installation_tip: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  tech_sheet: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  service_bulletin: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

export function DiscussionTypeBadge({ type }: { type: string }) {
  const t = (type as DiscussionType) in DISCUSSION_TYPE_LABEL ? (type as DiscussionType) : "general";
  return (
    <Badge variant="outline" className={`border ${COLOR[t]} font-semibold`}>
      {DISCUSSION_TYPE_LABEL[t]}
    </Badge>
  );
}