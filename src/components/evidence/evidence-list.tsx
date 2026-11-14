import type { EvidenceItem, EvidenceSourceType } from "@/lib/evidence/types";
import { SOURCE_KIND_LABEL } from "@/lib/technician-display";
import { EvidenceCard } from "./evidence-card";

const ORDER: EvidenceSourceType[] = [
  "manufacturer_doc",
  "tech_sheet",
  "service_bulletin",
  "verified_repair",
  "repair_history",
  "community_verified",
  "community_discussion",
  "technician_reported",
  "external_repair_guide",
  "fallback_unreviewed",
];

export function EvidenceList({
  items,
  renderExtras,
}: {
  items: EvidenceItem[];
  renderExtras?: (item: EvidenceItem) => React.ReactNode;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No evidence gathered yet for this diagnosis.
      </div>
    );
  }
  const grouped = new Map<EvidenceSourceType, EvidenceItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.sourceType) ?? [];
    arr.push(item);
    grouped.set(item.sourceType, arr);
  }
  return (
    <div className="space-y-4">
      {ORDER.map((sourceKind) => {
        const arr = grouped.get(sourceKind);
        if (!arr?.length) return null;
        return (
          <section key={sourceKind}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {SOURCE_KIND_LABEL[sourceKind]}
              <div className="h-px flex-1 bg-border" />
              <span className="tabular-nums">{arr.length}</span>
            </div>
            <div className="space-y-2">
              {arr.map((item) => (
                <EvidenceCard key={item.id} item={item}>
                  {renderExtras?.(item)}
                </EvidenceCard>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
