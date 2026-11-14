import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { getRepairInsights, type RepairPattern } from "@/lib/repair-insights.functions";

export function RepairInsightsCard({ model, brand }: { model: string; brand?: string }) {
  const fn = useServerFn(getRepairInsights);
  const trimmed = (model || "").trim();
  const { data } = useQuery({
    queryKey: ["repair-insights", trimmed.toUpperCase(), brand ?? ""],
    queryFn: () => fn({ data: { model: trimmed, brand } }),
    enabled: trimmed.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data || !data.enabled || !data.available) return null;
  const insights = data.data;
  if (!insights.repair_count) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-accent/40 bg-card p-5" aria-label="Exact-model repair history">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
        <History className="h-4 w-4" /> Exact-model repair history
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {insights.brand} {insights.model}. Historical imports and technician outcomes only; no similar models are combined.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Service calls" value={insights.repair_count} />
        <Count label="Confirmed success" value={insights.confirmedSuccessCount} />
        <Count label="Reported success" value={insights.reportedSuccessCount} />
        <Count label="Pending / unsuccessful" value={insights.pendingCount + insights.unsuccessfulCount} />
      </div>
      <div className="text-xs text-muted-foreground">
        Sources: {insights.historicalRecordCount} historical · {insights.liveRecordCount} live technician
      </div>
      <Section title="Reported complaints" items={insights.complaints} />
      <Section title="Diagnostic findings" items={insights.findings} />
      <Section title="Error codes" items={insights.errorCodes} />
      <Section title="Parts installed" items={insights.partsInstalled} mono />
      <Section title="Repair actions" items={insights.repairActions} />
      <Section title="Confirmation tests" items={insights.confirmationTests} />
      <p className="border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Counts show what was recorded, not proof that a part caused the failure.
      </p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-background/50 p-2.5"><div className="text-lg font-bold tabular-nums">{value}</div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div></div>;
}

function Section({ title, items, mono }: { title: string; items: RepairPattern[]; mono?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-1 text-sm">
        {items.slice(0, 5).map((item) => (
          <li key={`${title}-${item.label}`} className="flex items-start justify-between gap-3">
            <span className={mono ? "font-mono" : ""}>{item.label}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
