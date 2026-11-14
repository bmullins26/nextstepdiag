import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Database, FileUp, History, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  getRepairHistoryRecord,
  getRepairIntelligenceOverview,
  importRepairHistory,
  listRepairHistoryRecords,
  previewRepairImport,
  reviewRepairHistoryRecord,
} from "@/lib/repair-intelligence.functions";
import { IMPORT_FIELDS, importFieldLabel, type ColumnMapping, type ImportField } from "@/lib/repair-intelligence";

type Preview = Awaited<ReturnType<typeof previewRepairImport>>;

export function RepairIntelligenceTab() {
  const overviewFn = useServerFn(getRepairIntelligenceOverview);
  const overview = useQuery({ queryKey: ["owner", "repair-intelligence"], queryFn: () => overviewFn() });
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="inline-flex w-max">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
          <TabsTrigger value="records">Source Records</TabsTrigger>
          <TabsTrigger value="history">Import History</TabsTrigger>
        </TabsList>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Raw CSV files, original records, notes, technician identities, review flags, and source management remain owner-only. Technicians receive approved exact-model aggregates only.
      </p>
      {overview.isLoading ? <Loading /> : overview.error ? <ErrorMessage error={overview.error} /> : (
        <>
          <TabsContent value="overview" className="space-y-5"><Overview data={overview.data!} /></TabsContent>
          <TabsContent value="import"><Importer onComplete={() => overview.refetch()} /></TabsContent>
          <TabsContent value="records"><Records /></TabsContent>
          <TabsContent value="history"><ImportHistory batches={overview.data?.batches ?? []} /></TabsContent>
        </>
      )}
    </Tabs>
  );
}

function Overview({ data }: { data: NonNullable<Awaited<ReturnType<typeof getRepairIntelligenceOverview>>> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Imported records" value={data.importedRecords} />
        <Stat label="Live technician records" value={data.liveRecords} />
        <Stat label="Confirmed successes" value={data.confirmedSuccess} />
        <Stat label="Reported, unverified" value={data.reportedSuccess} />
        <Stat label="Pending repairs" value={data.pending} />
        <Stat label="Unsuccessful repairs" value={data.unsuccessful} />
        <Stat label="Review required" value={data.reviewRequired} />
        <Stat label="Duplicate rows" value={data.duplicates} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Ranked title="Records by brand" rows={data.byBrand} />
        <Ranked title="By appliance type" rows={data.byType} />
        <Ranked title="Top exact models" rows={data.byModel} />
      </div>
      <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-xs leading-relaxed text-muted-foreground">
        Data quality: {data.reviewRequired} records await owner review and are excluded from technician intelligence. Success totals never include pending parts, declined work, referrals, unresolved calls, or unsuccessful repairs.
      </div>
    </>
  );
}

function Importer({ onComplete }: { onComplete: () => void }) {
  const previewFn = useServerFn(previewRepairImport);
  const importFn = useServerFn(importRepairHistory);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const previewMut = useMutation({
    mutationFn: (input: { fileName: string; rawCsv: string }) => previewFn({ data: input }),
    onSuccess: (result) => { setPreview(result); setMapping(result.mapping); },
    onError: (error) => toast.error(error.message),
  });
  const importMut = useMutation({
    mutationFn: () => importFn({ data: { batchId: preview!.batchId, mapping } }),
    onSuccess: (result) => {
      toast.success(`Import complete: ${result.importedRows} records added, ${result.duplicateRows} duplicates skipped.`);
      setPreview(null);
      onComplete();
    },
    onError: (error) => toast.error(error.message),
  });

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > 5_000_000) return toast.error("CSV files are limited to 5 MB.");
    const rawCsv = await file.text();
    previewMut.mutate({ fileName: file.name, rawCsv });
  }

  return (
    <div className="space-y-5">
      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-card/50 p-6 text-center hover:bg-card">
        {previewMut.isPending ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <FileUp className="h-7 w-7 text-primary" />}
        <span className="mt-3 text-sm font-semibold">Choose a repair-history CSV</span>
        <span className="mt-1 text-xs text-muted-foreground">Up to 10,000 rows / 5 MB. Preview does not add service records.</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void chooseFile(e.target.files?.[0])} />
      </label>
      {preview && (
        <div className="space-y-5 rounded-2xl border border-border/60 bg-card/60 p-4 sm:p-5">
          <div>
            <h3 className="font-semibold">{preview.fileName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{preview.totalRows} rows · {preview.reviewRows} require review · {preview.withinFileDuplicates} duplicate keys inside this file</p>
            {preview.alreadyImported && <p className="mt-2 text-sm font-medium text-primary">This exact file was already imported. Re-running it will not duplicate records.</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <label key={field} className="space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">{importFieldLabel(field)}</span>
                <Select value={mapping[field] ?? "__none"} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value === "__none" ? undefined : value }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not mapped</SelectItem>
                    {preview.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>
          {preview.unmappedColumns.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <span className="font-semibold">Unmapped source columns preserved for owner review:</span> {preview.unmappedColumns.join(", ")}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2">Row</th><th className="p-2">Brand / model</th><th className="p-2">Complaint</th><th className="p-2">Outcome</th><th className="p-2">Review</th></tr></thead>
              <tbody>{preview.preview.map((row) => <tr key={`${row.rowNumber}-${row.recordHash}`} className="border-t border-border/40"><td className="p-2 tabular-nums">{row.rowNumber}</td><td className="p-2">{row.brand} <span className="font-mono">{row.model}</span></td><td className="max-w-64 truncate p-2">{row.complaint || "—"}</td><td className="p-2">{row.outcome.replaceAll("_", " ")}</td><td className="p-2">{row.reviewStatus === "approved" ? <Badge variant="secondary">Ready</Badge> : <Badge variant="outline" className="border-amber-500/40">{row.reviewFlags.join(", ")}</Badge>}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Preview shows the first 30 rows. Records with review flags remain private and excluded from aggregates until approved.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={importMut.isPending || preview.alreadyImported} onClick={() => importMut.mutate()}>
              {importMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Import {preview.totalRows} rows
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Records() {
  const listFn = useServerFn(listRepairHistoryRecords);
  const detailFn = useServerFn(getRepairHistoryRecord);
  const reviewFn = useServerFn(reviewRepairHistoryRecord);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["owner", "repair-records", search, status], queryFn: () => listFn({ data: { search, reviewStatus: status === "all" ? undefined : status as "pending" | "approved" | "rejected" } }) });
  const detail = useQuery({ queryKey: ["owner", "repair-record", selectedId], queryFn: () => detailFn({ data: { id: selectedId! } }), enabled: !!selectedId });
  const review = useMutation({
    mutationFn: (reviewStatus: "approved" | "rejected" | "pending") => reviewFn({ data: { id: selectedId!, reviewStatus, sourceVerificationStatus: detail.data?.source_verification_status } }),
    onSuccess: () => { toast.success("Review status updated and model intelligence refreshed."); qc.invalidateQueries({ queryKey: ["owner", "repair-records"] }); qc.invalidateQueries({ queryKey: ["owner", "repair-intelligence"] }); detail.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brand, model, or complaint" className="pl-9" /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All review states</SelectItem><SelectItem value="pending">Review required</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select></div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorMessage error={list.error} /> : <div className="overflow-x-auto rounded-xl border border-border/60"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3">Brand / model</th><th className="p-3">Complaint</th><th className="p-3">Outcome</th><th className="p-3">Review</th></tr></thead><tbody>{(list.data ?? []).map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)} className="cursor-pointer border-t border-border/40 hover:bg-muted/30"><td className="p-3">{row.service_date ?? "—"}</td><td className="p-3">{row.brand_display}<div className="font-mono">{row.model_display}</div></td><td className="max-w-64 truncate p-3">{row.complaint}</td><td className="p-3">{row.normalized_outcome.replaceAll("_", " ")}</td><td className="p-3"><Badge variant={row.review_status === "approved" ? "secondary" : "outline"}>{row.review_status}</Badge></td></tr>)}</tbody></table>{!list.data?.length && <p className="p-8 text-center text-sm text-muted-foreground">No imported source records yet.</p>}</div>}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Source record & provenance</DialogTitle><DialogDescription>Owner-only original values and review controls.</DialogDescription></DialogHeader>{detail.isLoading ? <Loading /> : detail.data && <div className="space-y-4 text-xs"><div className="grid gap-2 sm:grid-cols-2"><Detail label="Brand" value={detail.data.brand_raw} /><Detail label="Model" value={detail.data.model_raw} /><Detail label="Original outcome" value={detail.data.original_outcome} /><Detail label="Normalized outcome" value={detail.data.normalized_outcome} /><Detail label="Source URL" value={detail.data.source_url ?? "—"} /><Detail label="Review flags" value={detail.data.review_flags.join(", ") || "None"} /></div><Detail label="Original private repair notes" value={detail.data.original_notes || "—"} /><div><div className="mb-1 font-semibold">Original source record</div><pre className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 whitespace-pre-wrap break-words">{JSON.stringify(detail.data.original_record, null, 2)}</pre></div><div><div className="mb-1 font-semibold">Unmapped fields</div><pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">{JSON.stringify(detail.data.unmapped_fields, null, 2)}</pre></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={review.isPending} onClick={() => review.mutate("rejected")}><X className="mr-1 h-4 w-4" />Reject</Button><Button variant="outline" disabled={review.isPending} onClick={() => review.mutate("pending")}><AlertTriangle className="mr-1 h-4 w-4" />Needs review</Button><Button disabled={review.isPending} onClick={() => review.mutate("approved")}><Check className="mr-1 h-4 w-4" />Approve for aggregates</Button></div></div>}</DialogContent></Dialog>
    </div>
  );
}

function ImportHistory({ batches }: { batches: Array<{ id: string; file_name: string; status: string; total_rows: number; imported_rows: number; duplicate_rows: number; review_rows: number; unmapped_columns: string[]; error_message: string | null; created_at: string }> }) {
  return <div className="space-y-3">{batches.map((batch) => <div key={batch.id} className="rounded-xl border border-border/60 bg-card/50 p-4"><div className="flex items-start gap-3"><History className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{batch.file_name}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(batch.created_at).toLocaleString()} · {batch.status}</div><div className="mt-2 text-xs">{batch.imported_rows} imported · {batch.duplicate_rows} duplicates · {batch.review_rows} review · {batch.total_rows} total</div>{batch.unmapped_columns.length > 0 && <div className="mt-2 text-xs text-muted-foreground">Unmapped: {batch.unmapped_columns.join(", ")}</div>}{batch.error_message && <div className="mt-2 text-xs text-destructive">{batch.error_message}</div>}</div></div></div>)}{!batches.length && <p className="rounded-xl border border-border/60 p-8 text-center text-sm text-muted-foreground">No CSV imports have been previewed or completed.</p>}</div>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-border/60 bg-card/60 p-4"><div className="text-2xl font-bold tabular-nums">{value}</div><div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div></div>; }
function Ranked({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) { return <div className="rounded-xl border border-border/60 bg-card/50 p-4"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3 space-y-2">{rows.slice(0, 8).map((row) => <div key={row.label} className="flex justify-between gap-3 text-xs"><span className="truncate">{row.label}</span><span className="font-semibold tabular-nums">{row.count}</span></div>)}{!rows.length && <p className="text-xs text-muted-foreground">No records yet.</p>}</div></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><div className="font-semibold text-muted-foreground">{label}</div><div className="mt-1 whitespace-pre-wrap break-words">{value}</div></div>; }
function Loading() { return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>; }
function ErrorMessage({ error }: { error: unknown }) { return <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Could not load repair intelligence."}</div>; }
