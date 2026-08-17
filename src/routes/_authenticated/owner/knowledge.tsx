import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getKnowledgeSourceDetail,
  ingestOutcomeSample,
  ingestTechSheet,
  listIngestCandidates,
  listKnowledgeSources,
  listReviewQueue,
  reviewKnowledgeFact,
  searchKnowledge,
} from "@/lib/knowledge.functions";
import { AUTHORITY_LABEL, type KnowledgeAuthority } from "@/lib/knowledge/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/owner/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Engine — NextStep Owner Console" },
      {
        name: "description",
        content:
          "Inspect ingested repair documentation, processing status, extracted content, normalized knowledge and review queue.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KnowledgePage,
});

const TABS = ["sources", "inspect", "review", "search"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  sources: "Sources",
  inspect: "Inspect",
  review: "Review queue",
  search: "Retrieval test",
};

function statusTone(status?: string | null) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-500";
    case "needs_review":
      return "bg-amber-500/15 text-amber-500";
    case "failed":
      return "bg-destructive/15 text-destructive";
    case "processing":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function AuthorityBadge({ authority }: { authority: KnowledgeAuthority }) {
  const strong =
    authority === "manufacturer_verified" || authority === "technician_verified_repair";
  return (
    <Badge variant={strong ? "default" : "secondary"} className="text-[10px]">
      {AUTHORITY_LABEL[authority] ?? authority}
    </Badge>
  );
}

function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("sources");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="space-y-6">
      <header className="flex items-start gap-3">
        <Brain className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Knowledge Intelligence Engine</h2>
          <p className="text-sm text-muted-foreground">
            Raw source → extraction → normalization → chunks. Every fact keeps full provenance
            back to the document page or repair record it came from.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-border/60 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              t === tab
                ? "rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "sources" && (
        <SourcesTab
          onInspect={(id) => {
            setSelected(id);
            setTab("inspect");
          }}
        />
      )}
      {tab === "inspect" && <InspectTab sourceId={selected} />}
      {tab === "review" && <ReviewTab />}
      {tab === "search" && <SearchTab />}
    </section>
  );
}

function SourcesTab({ onInspect }: { onInspect: (id: string) => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listKnowledgeSources);
  const candidates = useServerFn(listIngestCandidates);
  const ingestSheet = useServerFn(ingestTechSheet);
  const ingestOutcomes = useServerFn(ingestOutcomeSample);

  const sources = useQuery({ queryKey: ["knowledge", "sources"], queryFn: () => list() });
  const cands = useQuery({ queryKey: ["knowledge", "candidates"], queryFn: () => candidates() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["knowledge"] });
  };

  const sheetMut = useMutation({
    mutationFn: (techSheetId: string) => ingestSheet({ data: { techSheetId } }),
    onSuccess: (r: any) => {
      toast.success(
        r.reused
          ? "Already ingested — showing existing result."
          : `Ingested: ${r.facts} facts, ${r.chunks} chunks, ${r.needs_review} need review.`,
      );
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Ingestion failed"),
  });

  const outcomeMut = useMutation({
    mutationFn: (vars: { limit: number; dryRun: boolean }) => ingestOutcomes({ data: vars }),
    onSuccess: (r: any) => {
      if (r.dryRun) {
        toast.info(`Dry run: ${r.wouldIngest.length} outcome(s) would be ingested.`);
      } else {
        const ok = r.results.filter((x: any) => x.status !== "failed").length;
        toast.success(`Backfilled ${ok}/${r.results.length} confirmed repairs.`);
      }
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Backfill failed"),
  });

  const busy = sheetMut.isPending || outcomeMut.isPending;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/70 bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ingest</h3>
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Step 1: ingest a single tech sheet and inspect every stage. Step 2: backfill a small
          sample of confirmed repairs. Nothing here changes the diagnostic engine.
        </p>

        <div className="space-y-2">
          {(cands.data?.techSheets ?? []).slice(0, 8).map((s: any) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {s.brand} {s.model_number}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.chars.toLocaleString()} chars · {s.source_trust}
                </span>
              </div>
              <Button
                size="sm"
                variant={s.ingested ? "secondary" : "default"}
                disabled={busy}
                onClick={() => sheetMut.mutate(s.id)}
              >
                {sheetMut.isPending && sheetMut.variables === s.id ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {s.ingested ? "Ingested" : "Ingest"}
              </Button>
            </div>
          ))}
          {cands.data && cands.data.techSheets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No stored tech sheets with content yet. Run a tech-sheet lookup first.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-sm font-medium">Confirmed repair backfill</span>
          <span className="text-xs text-muted-foreground">
            {(cands.data?.outcomes ?? []).filter((o: any) => !o.ingested).length} available
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => outcomeMut.mutate({ limit: 10, dryRun: true })}
            >
              Dry run (10)
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => outcomeMut.mutate({ limit: 10, dryRun: false })}
            >
              {outcomeMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Ingest sample (10)
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/40">
        <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Sources ({sources.data?.sources.length ?? 0})
        </div>
        {sources.isLoading && (
          <div className="p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        <ul className="divide-y divide-border/60">
          {(sources.data?.sources ?? []).map((s: any) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.source_type}</span>
                  <AuthorityBadge authority={s.source_authority} />
                  <span>
                    {s.fact_count} facts · {s.chunk_count} chunks
                  </span>
                  {s.pending_count > 0 && (
                    <span className="text-amber-500">{s.pending_count} need review</span>
                  )}
                </div>
              </div>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusTone(s.job?.status)}`}>
                {s.job?.status ?? "no job"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onInspect(s.id)}>
                Inspect <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        {sources.data && sources.data.sources.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing ingested yet.</p>
        )}
      </div>
    </div>
  );
}

function InspectTab({ sourceId }: { sourceId: string | null }) {
  const detailFn = useServerFn(getKnowledgeSourceDetail);
  const q = useQuery({
    queryKey: ["knowledge", "detail", sourceId],
    queryFn: () => detailFn({ data: { sourceId: sourceId! } }),
    enabled: !!sourceId,
  });

  if (!sourceId)
    return (
      <p className="text-sm text-muted-foreground">
        Pick a source from the Sources tab to inspect its pipeline stages.
      </p>
    );
  if (q.isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  if (q.error) return <p className="text-sm text-destructive">{(q.error as any).message}</p>;

  const d = q.data!;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/70 bg-card/40 p-4">
        <h3 className="text-sm font-semibold">{(d.source as any).title}</h3>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <span>Type: {(d.source as any).source_type}</span>
          <span>Authority: {AUTHORITY_LABEL[(d.source as any).source_authority as KnowledgeAuthority]}</span>
          <span>Brand: {(d.source as any).brand ?? "—"}</span>
          <span>Model: {(d.source as any).model_number ?? "—"}</span>
          <span>
            Origin record: {(d.source as any).ref_table ?? (d.source as any).source_url ?? "uploaded file"}
          </span>
          <span>Content hash: {((d.source as any).content_hash ?? "").slice(0, 12)}…</span>
        </div>
      </div>

      <Section title={`Processing jobs (${d.jobs.length})`}>
        {d.jobs.map((j: any) => (
          <div key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
            <span className={`rounded px-2 py-0.5 font-medium ${statusTone(j.status)}`}>{j.status}</span>
            <span className="text-muted-foreground">{j.extraction_method}</span>
            <span className="text-muted-foreground">model: {j.embedding_model}</span>
            {j.extraction_confidence != null && (
              <span className="text-muted-foreground">avg conf {j.extraction_confidence}</span>
            )}
            {j.processing_error && <span className="text-destructive">{j.processing_error}</span>}
          </div>
        ))}
      </Section>

      <Section title={`Raw extractions (${d.extractions.length}) — append-only`}>
        {d.extractions.map((e: any) => (
          <div key={e.id} className="px-4 py-2 text-xs">
            <div className="font-medium">
              {e.heading ?? e.section}
              {e.page_number != null && ` · p.${e.page_number}`}
            </div>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-muted-foreground">
              {e.text.slice(0, 1200)}
            </pre>
          </div>
        ))}
      </Section>

      <Section title={`Normalized facts (${d.facts.length})`}>
        {d.facts.map((f: any) => (
          <FactCard key={f.id} fact={f} />
        ))}
      </Section>

      <Section title={`Chunks (${d.chunks.length})`}>
        {d.chunks.slice(0, 40).map((c: any) => (
          <div key={c.id} className="px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{c.section ?? "—"}</span>
              <span>
                {c.embedding_model} · {c.embedding_dims}d
              </span>
              <AuthorityBadge authority={c.source_authority} />
              {c.needs_review && <span className="text-amber-500">pending review</span>}
            </div>
            <pre className="mt-1 whitespace-pre-wrap">{c.content.slice(0, 400)}</pre>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40">
      <div className="border-b border-border/60 px-4 py-2.5 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function FactCard({ fact, onReviewed }: { fact: any; onReviewed?: () => void }) {
  const reviewFn = useServerFn(reviewKnowledgeFact);
  const mut = useMutation({
    mutationFn: (action: "approved" | "rejected") =>
      reviewFn({ data: { factId: fact.id, action } }),
    onSuccess: () => {
      toast.success("Review recorded");
      onReviewed?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Review failed"),
  });

  const fields: [string, string | null][] = [
    ["Symptom", fact.symptom],
    ["Error code", fact.error_code],
    ["Component", fact.component],
    ["Part", fact.part],
    ["Test", fact.test],
    ["Expected", fact.expected_result],
    ["Actual", fact.actual_result],
    ["Failure", fact.failure],
    ["Repair", fact.repair],
  ];

  return (
    <div className="px-4 py-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AuthorityBadge authority={fact.source_authority} />
        <Badge variant="outline" className="text-[10px]">
          {fact.origin}
        </Badge>
        <span className="text-muted-foreground">
          confidence {Math.round((fact.confidence_score ?? 0) * 100)}%
        </span>
        {fact.needs_review && (
          <span className="inline-flex items-center gap-1 text-amber-500">
            <ShieldAlert className="h-3 w-3" /> needs review
          </span>
        )}
        {fact.knowledge_sources?.title && (
          <span className="text-muted-foreground">· {fact.knowledge_sources.title}</span>
        )}
      </div>
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {fields
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}: </span>
              {v}
            </div>
          ))}
      </div>
      {fact.confidence_reason && (
        <p className="mt-1 italic text-muted-foreground">{fact.confidence_reason}</p>
      )}
      {fact.needs_review && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate("approved")}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={mut.isPending}
            onClick={() => mut.mutate("rejected")}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReviewQueue);
  const q = useQuery({ queryKey: ["knowledge", "review"], queryFn: () => listFn() });

  if (q.isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
      </p>
    );

  const facts = q.data?.facts ?? [];
  if (facts.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>;

  return (
    <Section title={`Pending review (${facts.length})`}>
      {facts.map((f: any) => (
        <FactCard
          key={f.id}
          fact={f}
          onReviewed={() => qc.invalidateQueries({ queryKey: ["knowledge"] })}
        />
      ))}
    </Section>
  );
}

function SearchTab() {
  const searchFn = useServerFn(searchKnowledge);
  const [query, setQuery] = useState("Whirlpool washer fills, agitates, but won't spin");
  const [brand, setBrand] = useState("");
  const [includePending, setIncludePending] = useState(true);

  const mut = useMutation({
    mutationFn: () =>
      searchFn({
        data: { query, brand: brand || null, includePending, limit: 10 },
      }),
    onError: (e: any) => toast.error(e?.message ?? "Search failed"),
  });

  const hits = useMemo(() => (mut.data as any)?.hits ?? [], [mut.data]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card/40 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Technician query"
            className="min-w-[240px] flex-1"
          />
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand filter"
            className="w-40"
          />
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-1.5 h-4 w-4" />
            )}
            Search
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
          />
          Include items still pending review (owner-only preview)
        </label>
      </div>

      {hits.length > 0 && (
        <Section title={`Results (${hits.length})`}>
          {hits.map((h: any) => (
            <div key={h.id} className="px-4 py-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <AuthorityBadge authority={h.source_authority} />
                <span className="text-muted-foreground">
                  similarity {(h.similarity * 100).toFixed(1)}% · score {h.score.toFixed(3)}
                </span>
                <span className="text-muted-foreground">
                  {h.brand ?? "—"} {h.section ? `· ${h.section}` : ""}
                </span>
                {h.needs_review && <span className="text-amber-500">pending</span>}
              </div>
              <pre className="whitespace-pre-wrap">{h.content}</pre>
            </div>
          ))}
        </Section>
      )}
      {mut.isSuccess && hits.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches in the ingested corpus.</p>
      )}
    </div>
  );
}