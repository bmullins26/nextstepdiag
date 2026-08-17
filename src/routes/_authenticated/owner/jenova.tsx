import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { jenovaStatus, jenovaCompare } from "@/lib/ai/jenova.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/owner/jenova")({
  head: () => ({
    meta: [
      { title: "AI Providers — NextStep Owner Console" },
      {
        name: "description",
        content:
          "Check Jenova agent connectivity and compare Jenova reasoning against the standard NextStep diagnostic provider.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JenovaPage,
});

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="mr-2">
      {label}: {ok ? "Yes" : "No"}
    </Badge>
  );
}

function StepView({ title, result }: { title: string; result: unknown }) {
  const r = result as
    | {
        error?: string;
        provider?: string;
        providerError?: string | null;
        output?: {
          mostLikelyFailures?: string[];
          recommendedNextTest?: string;
          reasoning?: string;
          safetyWarning?: string;
          confidence?: number;
          nextQuestion?: { text?: string };
        };
      }
    | undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {r?.error ? (
          <p className="text-destructive">{r.error}</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Ran on: {r?.provider ?? "—"}
              {r?.providerError ? ` (${r.providerError})` : ""}
            </p>
            <p>
              <span className="font-medium">Likely failures:</span>{" "}
              {r?.output?.mostLikelyFailures?.join(", ") || "—"}
            </p>
            <p>
              <span className="font-medium">Next test:</span> {r?.output?.recommendedNextTest || "—"}
            </p>
            <p>
              <span className="font-medium">Next question:</span> {r?.output?.nextQuestion?.text || "—"}
            </p>
            {r?.output?.reasoning ? (
              <p className="text-muted-foreground">{r.output.reasoning}</p>
            ) : null}
            {r?.output?.safetyWarning ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                {r.output.safetyWarning}
              </p>
            ) : null}
            {typeof r?.output?.confidence === "number" ? (
              <p className="text-xs text-muted-foreground">
                Provider confidence (not verification): {Math.round(r.output.confidence * 100)}%
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function JenovaPage() {
  const status = useServerFn(jenovaStatus);
  const compare = useServerFn(jenovaCompare);
  const statusQuery = useQuery({ queryKey: ["jenova-status"], queryFn: () => status({}) });

  const [form, setForm] = useState({
    manufacturer: "Whirlpool",
    applianceType: "Top-Load Washer",
    modelNumber: "WTW5000DW1",
    complaint: "Washer fills and drains but will not spin.",
    findings: "",
  });

  const run = useMutation({
    mutationFn: () =>
      compare({
        data: {
          manufacturer: form.manufacturer,
          applianceType: form.applianceType,
          modelNumber: form.modelNumber,
          complaint: form.complaint,
          findings: form.findings
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
  });

  const s = statusQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jenova Appliance Repair Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {statusQuery.isLoading ? (
            <p className="text-muted-foreground">Checking…</p>
          ) : (
            <>
              <div className="flex flex-wrap">
                <Flag ok={!!s?.configured} label="Configured" />
                <Flag ok={!!s?.connected} label="Connected" />
                <Flag ok={!!s?.agentAvailable} label="Agent available" />
                <Flag ok={!!s?.enabled} label="Enabled for diagnostics" />
              </div>
              <p className="text-muted-foreground">
                Agent: {s?.agentSlug || "not set"} · Endpoint: {s?.baseUrl}
              </p>
              {s?.error ? <p className="text-destructive">{s.error}</p> : null}
              <p className="text-xs text-muted-foreground">
                The API key is stored server-side only and is never shown here or sent to the browser.
                NextStep's Knowledge Engine remains the source of truth; Jenova only provides reasoning.
              </p>
              <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>
                Re-check
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test mode — compare providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="mfg">Manufacturer</Label>
              <Input
                id="mfg"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="type">Appliance type</Label>
              <Input
                id="type"
                value={form.applianceType}
                onChange={(e) => setForm({ ...form, applianceType: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={form.modelNumber}
                onChange={(e) => setForm({ ...form, modelNumber: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="complaint">Complaint</Label>
            <Textarea
              id="complaint"
              value={form.complaint}
              onChange={(e) => setForm({ ...form, complaint: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="findings">Findings already verified (one per line)</Label>
            <Textarea
              id="findings"
              value={form.findings}
              onChange={(e) => setForm({ ...form, findings: e.target.value })}
            />
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Running both providers…" : "Run comparison"}
          </Button>
          {run.data ? (
            <>
              <p className="text-xs text-muted-foreground">
                Knowledge Engine evidence items supplied to both providers: {run.data.evidenceCount}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <StepView title="Existing provider" result={run.data.lovable} />
                <StepView title="Jenova provider" result={run.data.jenova} />
              </div>
            </>
          ) : null}
          {run.isError ? (
            <p className="text-sm text-destructive">Comparison failed. Check the Jenova status above.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
