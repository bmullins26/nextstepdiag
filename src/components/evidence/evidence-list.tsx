import type { EvidenceItem, EvidenceSourceType } from "@/lib/evidence/types";
import { EVIDENCE_TIER_LABEL } from "@/lib/evidence/types";
import { EvidenceCard } from "./evidence-card";

const ORDER: EvidenceSourceType[] = [
  "manufacturer_doc",
  "tech_sheet",
  "service_bulletin",
  "verified_repair",
  "community_verified",
  "community_discussion",
  "external_repair_guide",
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
  for (const it of items) {
    const arr = grouped.get(it.sourceType) ?? [];
    arr.push(it);
    grouped.set(it.sourceType, arr);
  }
  return (
    <div className="space-y-4">
      {ORDER.map((tier) => {
        const arr = grouped.get(tier);
        if (!arr?.length) return null;
        return (
          <section key={tier}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {EVIDENCE_TIER_LABEL[tier]}
              <div className="h-px flex-1 bg-border" />
              <span className="tabular-nums">{arr.length}</span>
            </div>
            <div className="space-y-2">
              {arr.map((it) => (
                <EvidenceCard key={it.id} item={it}>
                  {renderExtras?.(it)}
                </EvidenceCard>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}