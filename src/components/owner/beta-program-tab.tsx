import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Star,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Search,
  Download,
  Trash2,
  PlayCircle,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listBetaApplications,
  reviewApplication,
  sendBetaInvite,
  activateBetaTester,
  suspendBetaTester,
  deactivateBetaTester,
  reinstateBetaTester,
  deleteBetaApplication,
  updateOwnerNotes,
  updateOwnerRating,
  setOwnerLabels,
  updateApplicantState,
  bulkApplyAction,
  exportBetaApplicationsCsv,
  getBetaProgramStats,
  getBetaTesterMetrics,
  getBetaTesterRosters,
  type TesterMetrics,
} from "@/lib/beta-applications.functions";

type AppStatus = "all" | "pending" | "approved" | "waitlisted" | "declined";
type AccessStatus = "all" | "not_invited" | "invited" | "active" | "suspended" | "deactivated";
type SortKey =
  | "newest"
  | "oldest"
  | "experience"
  | "calls"
  | "last_login"
  | "health"
  | "application_status"
  | "access_status";

const PRESET_LABELS = [
  "VIP Tester",
  "Factory Tech",
  "Independent Tech",
  "Service Company",
  "Student",
  "Great Feedback",
  "Needs Follow-up",
];

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s as string; }
}

function ApplicationPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    approved: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    waitlisted: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    declined: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status}
    </span>
  );
}
function AccessPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    not_invited: "bg-muted text-muted-foreground border-border",
    invited: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    suspended: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    deactivated: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StarBadge({ stars, label }: { stars: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] font-medium">
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`h-3 w-3 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
        ))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function BetaProgramTab() {
  const [appStatus, setAppStatus] = useState<AppStatus>("all");
  const [accStatus, setAccStatus] = useState<AccessStatus>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ action: string; ids: string[]; copy: string } | null>(null);

  const qc = useQueryClient();
  const listFn = useServerFn(listBetaApplications);
  const statsFn = useServerFn(getBetaProgramStats);
  const rostersFn = useServerFn(getBetaTesterRosters);
  const bulkFn = useServerFn(bulkApplyAction);
  const exportFn = useServerFn(exportBetaApplicationsCsv);

  const statsQ = useQuery({ queryKey: ["beta-stats"], queryFn: () => statsFn({ data: {} as any }) });
  const rostersQ = useQuery({ queryKey: ["beta-rosters"], queryFn: () => rostersFn({ data: {} as any }) });
  const listQ = useQuery({
    queryKey: ["beta-apps", appStatus, accStatus, search, sort, labelFilter.join(","), minRating],
    queryFn: () =>
      listFn({
        data: {
          applicationStatus: appStatus,
          accessStatus: accStatus,
          search: search || undefined,
          sort,
          labels: labelFilter.length ? labelFilter : undefined,
          minRating: minRating ?? undefined,
        },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beta-apps"] });
    qc.invalidateQueries({ queryKey: ["beta-stats"] });
    qc.invalidateQueries({ queryKey: ["beta-rosters"] });
  };

  const rows = listQ.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const bulkMut = useMutation({
    mutationFn: (action: "approve" | "waitlist" | "decline" | "invite" | "activate" | "suspend" | "deactivate" | "delete_pending") =>
      bulkFn({ data: { ids: Array.from(selected), action } }),
    onSuccess: (res) => {
      const fails = res.results.filter((r) => !r.ok);
      if (fails.length) toast.warning(`${res.results.length - fails.length} done, ${fails.length} failed`);
      else toast.success(`${res.results.length} updated`);
      setSelected(new Set());
      setConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function doExport() {
    const ids = selected.size ? Array.from(selected) : undefined;
    const { csv } = await exportFn({ data: { ids } });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beta-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const app = statsQ.data?.applicationTotals;
  const acc = statsQ.data?.accessTotals;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applications</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={statsQ.data?.totals.total ?? 0} />
          <Stat label="Pending" value={app?.pending ?? 0} />
          <Stat label="Approved" value={app?.approved ?? 0} />
          <Stat label="Waitlisted" value={app?.waitlisted ?? 0} />
          <Stat label="Declined" value={app?.declined ?? 0} />
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="Active Testers" value={statsQ.data?.activeTesters ?? 0} />
          <Stat label="Not Invited" value={acc?.not_invited ?? 0} />
          <Stat label="Invited" value={acc?.invited ?? 0} />
          <Stat label="Active" value={acc?.active ?? 0} />
          <Stat label="Suspended" value={acc?.suspended ?? 0} />
          <Stat label="Deactivated" value={acc?.deactivated ?? 0} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <RollupCard title="By Experience" rows={statsQ.data?.byExperience.map((b) => ({ label: b.bucket, count: b.count })) ?? []} />
        <RollupCard title="Primary Brands" rows={statsQ.data?.byBrand.map((b) => ({ label: b.brand, count: b.count })) ?? []} />
        <RollupCard title="By Region" rows={statsQ.data?.byRegion.map((b) => ({ label: b.region, count: b.count })) ?? []} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RosterCard title="Most Active Testers" rows={rostersQ.data?.mostActive ?? []} onOpen={setDetailId} />
        <RosterCard title="Inactive Testers" rows={rostersQ.data?.inactive ?? []} onOpen={setDetailId} />
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application:</div>
          {(["all", "pending", "approved", "waitlisted", "declined"] as AppStatus[]).map((s) => (
            <button key={s} onClick={() => setAppStatus(s)} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${appStatus === s ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access:</div>
          {(["all", "not_invited", "invited", "active", "suspended", "deactivated"] as AccessStatus[]).map((s) => (
            <button key={s} onClick={() => setAccStatus(s)} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${accStatus === s ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company, state, brand, role" className="h-8 w-72 pl-7 text-xs" />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="experience">Experience</SelectItem>
              <SelectItem value="calls">Calls / Week</SelectItem>
              <SelectItem value="application_status">Application Status</SelectItem>
              <SelectItem value="access_status">Access Status</SelectItem>
              <SelectItem value="last_login">Last Login</SelectItem>
              <SelectItem value="health">Health Score</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(minRating ?? "any")} onValueChange={(v) => setMinRating(v === "any" ? null : Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any rating</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>{"★".repeat(n)} +</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={doExport}>
              <Download className="mr-1 h-3 w-3" /> Export {selected.size ? `(${selected.size})` : "All"} CSV
            </Button>
          </div>
        </div>
        {/* Label filter chips */}
        <div className="flex flex-wrap items-center gap-1">
          <div className="text-xs text-muted-foreground mr-1">Labels:</div>
          {PRESET_LABELS.map((l) => {
            const on = labelFilter.includes(l);
            return (
              <button key={l} onClick={() => setLabelFilter((cur) => on ? cur.filter((x) => x !== l) : [...cur, l])} className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                {l}
              </button>
            );
          })}
          {labelFilter.length ? (
            <button onClick={() => setLabelFilter([])} className="text-[11px] text-muted-foreground hover:underline">clear</button>
          ) : null}
        </div>

        {/* Bulk toolbar */}
        {selected.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span className="font-semibold">{selected.size} selected</span>
            <BulkBtn onClick={() => setConfirm({ action: "approve", ids: Array.from(selected), copy: `Approve ${selected.size} applications?` })} label="Approve" />
            <BulkBtn onClick={() => setConfirm({ action: "waitlist", ids: Array.from(selected), copy: `Waitlist ${selected.size} applications?` })} label="Waitlist" />
            <BulkBtn onClick={() => setConfirm({ action: "decline", ids: Array.from(selected), copy: `Decline ${selected.size} applications?` })} label="Decline" />
            <BulkBtn onClick={() => setConfirm({ action: "invite", ids: Array.from(selected), copy: `Send invites to ${selected.size} approved applicants?` })} label="Send Invite" />
            <BulkBtn onClick={() => setConfirm({ action: "activate", ids: Array.from(selected), copy: `Activate ${selected.size} testers?` })} label="Activate" />
            <BulkBtn onClick={() => setConfirm({ action: "suspend", ids: Array.from(selected), copy: `Suspend ${selected.size} testers? They will be signed out.` })} label="Suspend" />
            <BulkBtn onClick={() => setConfirm({ action: "deactivate", ids: Array.from(selected), copy: `Deactivate ${selected.size} testers? They will be signed out.` })} label="Deactivate" />
            <BulkBtn onClick={() => setConfirm({ action: "delete_pending", ids: Array.from(selected), copy: `Delete ${selected.size} applicant${selected.size === 1 ? "" : "s"} from the beta signup list? Linked user accounts and history are preserved.` })} label="Delete Applicants" destructive />
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {listQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No applications match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2 pr-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                  <th className="py-2 pr-2">Applicant</th>
                  <th className="py-2 pr-2">Application</th>
                  <th className="py-2 pr-2">Access</th>
                  <th className="py-2 pr-2">State</th>
                  <th className="py-2 pr-2">Rating</th>
                  <th className="py-2 pr-2">Labels</th>
                  <th className="py-2 pr-2">Submitted</th>
                  <th className="py-2 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <ApplicationRow
                    key={a.id}
                    app={a}
                    onOpen={() => setDetailId(a.id)}
                    selected={selected.has(a.id)}
                    onToggle={() => setSelected((cur) => {
                      const next = new Set(cur);
                      next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                      return next;
                    })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailId ? <BetaTesterDetailDialog id={detailId} onClose={() => setDetailId(null)} /> : null}
      {confirm ? (
        <AlertDialog open onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm</AlertDialogTitle>
              <AlertDialogDescription>{confirm.copy}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkMut.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => bulkMut.mutate(confirm.action as any)} disabled={bulkMut.isPending}>
                {bulkMut.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function BulkBtn({ label, onClick, destructive }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <Button size="sm" variant={destructive ? "destructive" : "outline"} className="h-7 text-xs" onClick={onClick}>
      {label}
    </Button>
  );
}

function RollupCard({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">No data yet.</div> : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="truncate">{r.label || "—"}</span>
              <span className="text-muted-foreground tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RosterCard({ title, rows, onOpen }: { title: string; rows: Array<{ id: string; name: string; email: string; lastActivity: string | null; totalSessions: number; healthScore: number; badge: { stars: number; label: string } }>; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">No active testers yet.</div> : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
              <button onClick={() => onOpen(r.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                {r.name || r.email}
              </button>
              <StarBadge stars={r.badge.stars} label={r.badge.label} />
              <span className="w-16 text-right text-xs text-muted-foreground">{r.totalSessions} sess.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationRow({ app, onOpen, selected, onToggle }: { app: any; onOpen: () => void; selected: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewApplication);
  const inviteFn = useServerFn(sendBetaInvite);
  const activateFn = useServerFn(activateBetaTester);
  const suspendFn = useServerFn(suspendBetaTester);
  const deactivateFn = useServerFn(deactivateBetaTester);
  const reinstateFn = useServerFn(reinstateBetaTester);
  const deleteFn = useServerFn(deleteBetaApplication);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beta-apps"] });
    qc.invalidateQueries({ queryKey: ["beta-stats"] });
    qc.invalidateQueries({ queryKey: ["beta-rosters"] });
  };

  const m = (fn: (vars?: any) => Promise<any>, ok: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => { toast.success(ok); invalidate(); },
      onError: (e: any) => toast.error(e?.message ?? "Failed"),
    });

  const review = m((d: any) => reviewFn({ data: { id: app.id, decision: d } }), "Application updated");
  const invite = m(() => inviteFn({ data: { id: app.id } }), "Invite sent");
  const activate = m(() => activateFn({ data: { id: app.id } }), "Tester activated");
  const suspend = m(() => suspendFn({ data: { id: app.id } }), "Tester suspended");
  const deactivate = m(() => deactivateFn({ data: { id: app.id } }), "Tester deactivated");
  const reinstate = m(() => reinstateFn({ data: { id: app.id } }), "Tester reinstated");
  const del = m(() => deleteFn({ data: { id: app.id } }), "Application deleted");

  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmDeact, setConfirmDeact] = useState(false);

  const busy = review.isPending || invite.isPending || activate.isPending || suspend.isPending || deactivate.isPending || reinstate.isPending || del.isPending;

  const appStatus = app.application_status as string;
  const accStatus = app.access_status as string;
  const labels = (app.owner_labels ?? []) as string[];
  const rating = app.owner_rating as number | null;

  return (
    <tr className="border-t border-border/60 align-middle">
      <td className="py-2 pr-2"><Checkbox checked={selected} onCheckedChange={onToggle} /></td>
      <td className="py-2 pr-2">
        <button onClick={onOpen} className="text-left hover:underline">
          <div className="font-medium">{app.first_name} {app.last_name}</div>
          <div className="text-xs text-muted-foreground">{app.email}</div>
        </button>
      </td>
      <td className="py-2 pr-2"><ApplicationPill status={appStatus} /></td>
      <td className="py-2 pr-2"><AccessPill status={accStatus} /></td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{app.state || "—"}</td>
      <td className="py-2 pr-2">{rating ? <span className="text-amber-400">{"★".repeat(rating)}</span> : <span className="text-muted-foreground/40">—</span>}</td>
      <td className="py-2 pr-2">
        <div className="flex flex-wrap gap-0.5">
          {labels.slice(0, 3).map((l) => <span key={l} className="rounded-full border border-border bg-background/40 px-1.5 py-0 text-[10px]">{l}</span>)}
          {labels.length > 3 ? <span className="text-[10px] text-muted-foreground">+{labels.length - 3}</span> : null}
        </div>
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{fmtDate(app.created_at)}</td>
      <td className="py-2 pr-2 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy} className="h-7 text-xs">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Actions"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>View Application</DropdownMenuItem>
            <DropdownMenuSeparator />
            {appStatus === "pending" || appStatus === "waitlisted" ? (
              <DropdownMenuItem onClick={() => review.mutate("approved")}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </DropdownMenuItem>
            ) : null}
            {appStatus === "pending" || appStatus === "approved" ? (
              <DropdownMenuItem onClick={() => review.mutate("waitlisted")}>
                <PauseCircle className="mr-2 h-4 w-4" /> Waitlist
              </DropdownMenuItem>
            ) : null}
            {appStatus !== "declined" ? (
              <DropdownMenuItem onClick={() => review.mutate("declined")}>
                <XCircle className="mr-2 h-4 w-4" /> Decline
              </DropdownMenuItem>
            ) : null}
            {appStatus === "approved" && (accStatus === "not_invited" || accStatus === "invited") ? (
              <DropdownMenuItem onClick={() => invite.mutate(undefined)}>
                <Send className="mr-2 h-4 w-4" /> {accStatus === "invited" ? "Resend Invite" : "Send Invite"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {accStatus === "invited" || accStatus === "suspended" || accStatus === "deactivated" ? (
              <DropdownMenuItem onClick={() => activate.mutate(undefined)}>
                <PlayCircle className="mr-2 h-4 w-4" /> Activate Tester
              </DropdownMenuItem>
            ) : null}
            {accStatus === "active" || accStatus === "invited" ? (
              <DropdownMenuItem onClick={() => suspend.mutate(undefined)}>
                <Ban className="mr-2 h-4 w-4" /> Suspend Tester
              </DropdownMenuItem>
            ) : null}
            {accStatus === "active" || accStatus === "invited" ? (
              <DropdownMenuItem onClick={() => setConfirmDeact(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Deactivate Tester
              </DropdownMenuItem>
            ) : null}
            {accStatus === "suspended" || accStatus === "deactivated" ? (
              <DropdownMenuItem onClick={() => reinstate.mutate(undefined)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reinstate Tester
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setConfirmDel(true)} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete Applicant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete applicant?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently removes this applicant record from the beta signup list. Any linked user account and diagnostic history are preserved — to also revoke their access, suspend or deactivate them first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate(undefined)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmDeact} onOpenChange={setConfirmDeact}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate this beta tester?</AlertDialogTitle>
              <AlertDialogDescription>
                They will immediately lose access but can be reactivated later. All history is preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deactivate.mutate(undefined)}>Deactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

function BetaTesterDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const metricsFn = useServerFn(getBetaTesterMetrics);
  const listFn = useServerFn(listBetaApplications);
  const notesFn = useServerFn(updateOwnerNotes);
  const ratingFn = useServerFn(updateOwnerRating);
  const labelsFn = useServerFn(setOwnerLabels);
  const stateFn = useServerFn(updateApplicantState);
  const qc = useQueryClient();

  const appQ = useQuery({
    queryKey: ["beta-app", id],
    queryFn: async () => {
      const rows = await listFn({ data: { limit: 200 } as any });
      return rows.find((r) => r.id === id) ?? null;
    },
  });
  const metricsQ = useQuery({ queryKey: ["beta-metrics", id], queryFn: () => metricsFn({ data: { id } }) });

  const app = appQ.data;
  const m: TesterMetrics | undefined = metricsQ.data;

  const brands = useMemo(() => {
    const b = app?.primary_brands as unknown;
    return Array.isArray(b) ? (b as string[]) : [];
  }, [app]);

  const [notes, setNotes] = useState<string>("");
  const [stateInput, setStateInput] = useState<string>("");
  const [labels, setLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (app && !initialized.current) {
      setNotes((app as any).owner_notes ?? "");
      setStateInput((app as any).state ?? "");
      setLabels(((app as any).owner_labels ?? []) as string[]);
      initialized.current = true;
    }
  }, [app]);

  // autosave notes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialized.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      notesFn({ data: { id, notes } })
        .then(() => qc.invalidateQueries({ queryKey: ["beta-app", id] }))
        .catch((e: any) => toast.error(e?.message ?? "Notes save failed"));
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [notes, id, notesFn, qc]);

  function saveState() {
    stateFn({ data: { id, state: stateInput.trim() } })
      .then(() => {
        toast.success("State updated");
        qc.invalidateQueries({ queryKey: ["beta-app", id] });
        qc.invalidateQueries({ queryKey: ["beta-stats"] });
      })
      .catch((e: any) => toast.error(e?.message ?? "Failed"));
  }

  function setRating(n: number | null) {
    ratingFn({ data: { id, rating: n } })
      .then(() => qc.invalidateQueries({ queryKey: ["beta-app", id] }))
      .catch((e: any) => toast.error(e?.message ?? "Failed"));
  }

  function toggleLabel(label: string) {
    const next = labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label];
    setLabels(next);
    labelsFn({ data: { id, labels: next } })
      .then(() => qc.invalidateQueries({ queryKey: ["beta-app", id] }))
      .catch((e: any) => toast.error(e?.message ?? "Failed"));
  }

  function addCustomLabel() {
    const v = customLabel.trim();
    if (!v) return;
    if (labels.includes(v)) return;
    const next = [...labels, v];
    setLabels(next);
    setCustomLabel("");
    labelsFn({ data: { id, labels: next } }).catch((e: any) => toast.error(e?.message ?? "Failed"));
  }

  const currentRating = (app as any)?.owner_rating as number | null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Beta Tester Detail</DialogTitle>
          <DialogDescription>Application, access, activity, and owner-only notes.</DialogDescription>
        </DialogHeader>
        {!app ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Header */}
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">{(app as any).first_name} {(app as any).last_name}</div>
                <ApplicationPill status={(app as any).application_status} />
                <AccessPill status={(app as any).access_status} />
                {m ? <StarBadge stars={m.badge.stars} label={m.badge.label} /> : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{(app as any).email}</div>
            </div>

            {/* Application */}
            <Section title="Application">
              <Field label="Submitted" value={fmtDate((app as any).created_at)} />
              <Field label="Reviewed" value={fmtDate((app as any).reviewed_at)} />
              <Field label="Application Status" value={<ApplicationPill status={(app as any).application_status} />} />
              <Field label="Role" value={(app as any).role} />
              <Field label="Experience" value={`${(app as any).experience_years} yrs`} />
              <Field label="Calls / Week" value={String((app as any).calls_per_week)} />
              <Field label="Company" value={(app as any).company || "—"} />
              <Field label="Primary Brands" value={brands.join(", ") || "—"} />
              <div className="col-span-full">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Original Location</div>
                <div className="text-sm">{(app as any).location_raw || (app as any).location || "—"}</div>
              </div>
              <div className="col-span-full flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Normalized State</div>
                  <Input value={stateInput} onChange={(e) => setStateInput(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button size="sm" onClick={saveState}>Save</Button>
              </div>
              <div className="col-span-full">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Why they want to join</div>
                <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-background/40 p-2 text-sm">{(app as any).reason}</div>
              </div>
            </Section>

            {/* Access */}
            <Section title="Access">
              <Field label="Invite Sent" value={fmtDate((app as any).invited_at)} />
              <Field label="Invite Accepted" value={fmtDate((app as any).invite_accepted_at)} />
              <Field label="Access Status" value={<AccessPill status={(app as any).access_status} />} />
              <Field label="Last Login" value={fmtDate(m?.lastLogin ?? null)} />
              <Field label="Last Activity" value={fmtDate(m?.lastActivity ?? null)} />
              <Field label="Account Created" value={fmtDate(m?.accountCreated ?? null)} />
            </Section>

            {/* Activity */}
            <Section title="Activity">
              <Field label="Diagnostic Sessions" value={m?.totalSessions ?? 0} />
              <Field label="Completed" value={m?.completedSessions ?? 0} />
              <Field label="Confirmed Repairs" value={m?.outcomeConfirmations ?? 0} />
              <Field label="Pending Repairs" value={m?.pendingRepairs ?? 0} />
              <Field label="Bug Reports" value={m?.bugReports ?? 0} />
              <Field label="Feature Requests" value={m?.featureRequests ?? 0} />
              <Field label="Feedback Entries" value={m?.feedbackEntries ?? 0} />
              <Field label="Tech Sheets Uploaded" value={m?.techSheetsUploaded ?? 0} />
              <Field label="Health Score" value={`${m?.healthScore ?? 0} / 100`} />
            </Section>

            {/* Owner */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">Owner-only · Private</div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Rating</div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                      <Star className={`h-5 w-5 ${currentRating && currentRating >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                    </button>
                  ))}
                  {currentRating ? <button onClick={() => setRating(null)} className="ml-2 text-xs text-muted-foreground hover:underline">clear</button> : null}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Labels</div>
                <div className="flex flex-wrap items-center gap-1">
                  {PRESET_LABELS.map((l) => {
                    const on = labels.includes(l);
                    return (
                      <button key={l} onClick={() => toggleLabel(l)} className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                        {l}
                      </button>
                    );
                  })}
                  {labels.filter((l) => !PRESET_LABELS.includes(l)).map((l) => (
                    <button key={l} onClick={() => toggleLabel(l)} className="rounded-full border border-primary bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                      {l} ✕
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Add custom label" className="h-7 text-xs" />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCustomLabel}>Add</Button>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Notes (autosaves) {(app as any).owner_notes_updated_at ? `· last edited ${fmtDate((app as any).owner_notes_updated_at)}` : ""}
                </div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Private notes about this tester…" />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}