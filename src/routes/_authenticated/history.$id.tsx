import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSession, deleteSession } from "@/lib/sessions.functions";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: () => ({ meta: [{ title: "Diagnosis Details — NextStep" }] }),
  component: DetailsPage,
});

type QA = { question: string; answer: string };
type Row = {
  id: string;
  status: "active" | "completed" | "abandoned";
  brand: string;
  appliance_type: string;
  model_number: string;
  serial_number: string;
  manufacture_year: number | null;
  age_years: number | null;
  complaint: string;
  findings: string[];
  history: QA[];
  most_likely_failures: string[];
  most_likely_failure: string;
  recommended_next_test: string;
  updated_at: string;
  created_at: string;
};

function DetailsPage() {
  const { id } = useParams({ from: "/_authenticated/history/$id" });
  const navigate = useNavigate();
  const get = useServerFn(getSession);
  const del = useServerFn(deleteSession);
  const [row, setRow] = useState<Row | null | undefined>(undefined);

  useEffect(() => {
    get({ data: { id } })
      .then((r) => setRow(r as Row | null))
      .catch(() => setRow(null));
  }, [id]);

  async function onDelete() {
    if (!row) return;
    if (!confirm("Delete this diagnosis?")) return;
    await del({ data: { id: row.id } });
    toast.success("Deleted.");
    navigate({ to: "/history" });
  }

  if (row === undefined) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-md px-4 py-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      </main>
    );
  }
  if (!row) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-md px-4 py-10 text-center">Not found.</div>
      </main>
    );
  }

  const failures = row.most_likely_failures?.length ? row.most_likely_failures : row.most_likely_failure ? [row.most_likely_failure] : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      
      <div className="mx-auto max-w-md px-4 pb-20 pt-5 space-y-4">
        <Link to="/history" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to history
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tight">
            {row.appliance_type || "Diagnosis"}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            row.status === "active" ? "bg-primary/15 text-primary" :
            row.status === "completed" ? "bg-emerald-500/15 text-emerald-400" :
            "bg-muted text-muted-foreground"
          }`}>{row.status}</span>
        </div>

        <Card title="Verified Appliance">
          <KV k="Brand" v={row.brand || "—"} />
          <KV k="Model" v={row.model_number || "—"} />
          <KV k="Serial" v={row.serial_number || "—"} />
          {row.age_years != null && <KV k="Age" v={`${Math.round(row.age_years)} yr`} />}
        </Card>

        <Card title="Customer Complaint">
          <p className="text-sm">{row.complaint || "—"}</p>
        </Card>

        <Card title={`Current Findings (${row.findings.length})`}>
          {row.findings.length === 0 ? (
            <p className="text-xs text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {row.findings.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Diagnostic Timeline (${row.history.length})`}>
          {row.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No questions answered yet.</p>
          ) : (
            <ol className="space-y-2">
              {row.history.map((h, i) => (
                <li key={i} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Q{i + 1}: {h.question}</div>
                  <div className="font-semibold text-primary">→ {h.answer}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {failures.length > 0 && (
          <Card title="Most Likely Failures">
            <ol className="space-y-1.5">
              {failures.map((f, i) => (
                <li key={i} className="text-sm font-semibold">{i + 1}. {f}</li>
              ))}
            </ol>
          </Card>
        )}

        {row.recommended_next_test && (
          <Card title="Recommended Next Test">
            <p className="text-sm font-semibold">{row.recommended_next_test}</p>
          </Card>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={() => navigate({ to: "/diagnose", search: { session: row.id } })} className="h-11 flex-1">
            {row.status === "active" ? "Resume" : "Reopen"}
          </Button>
          <Button onClick={onDelete} variant="outline" className="h-11 text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-semibold">{v}</span>
    </div>
  );
}