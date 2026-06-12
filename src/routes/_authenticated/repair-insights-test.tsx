import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRepairInsights, type RepairInsightsResult } from "@/lib/repair-insights.functions";

export const Route = createFileRoute("/_authenticated/repair-insights-test")({
  head: () => ({
    meta: [
      { title: "Repair Insights Test — NextStep Diagnostics" },
      { name: "description", content: "Verify the Repair Insights Engine connection." },
    ],
  }),
  component: RepairInsightsTestPage,
});

function RepairInsightsTestPage() {
  const fn = useServerFn(getRepairInsights);
  const [model, setModel] = useState("");

  const mut = useMutation({
    mutationFn: (m: string) => fn({ data: { model: m } }) as Promise<RepairInsightsResult>,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">Repair Insights Test</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct lookup against the Repair Insights Engine. Use this to verify the integration.
        </p>

        <div className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="rie-model" className="text-xs uppercase tracking-wide text-muted-foreground">
              Model Number
            </Label>
            <Input
              id="rie-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="WTW4816FW3"
              className="h-12 text-base"
            />
          </div>
          <Button
            onClick={() => {
              const m = model.trim();
              if (!m) return;
              mut.mutate(m);
            }}
            disabled={mut.isPending || !model.trim()}
            className="h-12 w-full font-bold"
          >
            {mut.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Looking up…</>
            ) : (
              "Lookup Model"
            )}
          </Button>
        </div>

        {mut.data ? <Result result={mut.data} /> : null}
      </div>
    </main>
  );
}

function Result({ result }: { result: RepairInsightsResult }) {
  if (!result.enabled || !result.available) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Insights Unavailable
      </div>
    );
  }
  const d = result.data;
  return (
    <div className="mt-6 space-y-3 rounded-2xl border border-[hsl(var(--accent))]/40 bg-card p-5">
      <Row k="Repairs Found" v={String(d.repair_count)} />
      <Block title="Top Failures" items={d.top_failures} />
      <Block title="Top Repairs" items={d.top_repairs} />
      <Block title="Top Parts" items={d.top_parts} mono />
      <Row k="Confidence Score" v={`${Math.round(d.confidence_score)}%`} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-sm font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function Block({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      {items.length ? (
        <ul className="space-y-0.5 pl-1 text-sm">
          {items.map((it, i) => (
            <li key={`${title}-${i}`} className={mono ? "font-mono" : ""}>• {it}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}