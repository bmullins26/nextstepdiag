import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { getRepairInsights } from "@/lib/repair-insights.functions";

export function RepairInsightsCard({ model }: { model: string }) {
  const fn = useServerFn(getRepairInsights);
  const trimmed = (model || "").trim();

  const { data } = useQuery({
    queryKey: ["repair-insights", trimmed.toUpperCase()],
    queryFn: () => fn({ data: { model: trimmed } }),
    enabled: trimmed.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  if (!data || !("enabled" in data) || !data.enabled) return null;
  if (!("available" in data) || !data.available) return null;
  const insights = data.data;
  if (!insights || insights.repair_count < 3) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-[hsl(var(--accent))]/40 bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--accent))]">
        <History className="h-4 w-4" /> Historical Repair Insights
      </div>

      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Repairs Analyzed</span>
        <span className="text-sm font-semibold tabular-nums">{insights.repair_count}</span>
      </div>

      <Section title="Most Common Failures" items={insights.top_failures} />
      <Section title="Most Common Repairs" items={insights.top_repairs} />
      <Section title="Common Parts" items={insights.top_parts} mono />

      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</span>
        <span className="text-sm font-semibold tabular-nums">{Math.round(insights.confidence_score)}%</span>
      </div>
    </div>
  );
}

function Section({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-0.5 pl-1 text-sm">
        {items.map((it, i) => (
          <li key={`${title}-${i}`} className={mono ? "font-mono" : ""}>
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}