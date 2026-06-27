import { useMemo, useState } from "react";
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
  UserMinus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listBetaApplications,
  updateBetaApplicationStatus,
  assignBetaWave,
  sendBetaInvite,
  getBetaProgramStats,
  getBetaTesterMetrics,
  getBetaTesterRosters,
  type TesterMetrics,
} from "@/lib/beta-applications.functions";

type Status = "pending" | "approved" | "invited" | "active" | "waitlisted" | "declined" | "all";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    approved: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    invited: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    waitlisted: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    declined: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
        map[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status}
    </span>
  );
}

function StarBadge({ stars, label }: { stars: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] font-medium">
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          />
        ))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

export function BetaProgramTab() {
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [waveFilter, setWaveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const listFn = useServerFn(listBetaApplications);
  const statsFn = useServerFn(getBetaProgramStats);
  const rostersFn = useServerFn(getBetaTesterRosters);

  const statsQ = useQuery({
    queryKey: ["beta-stats"],
    queryFn: () => statsFn({ data: {} as any }),
  });
  const rostersQ = useQuery({
    queryKey: ["beta-rosters"],
    queryFn: () => rostersFn({ data: {} as any }),
  });
  const listQ = useQuery({
    queryKey: ["beta-apps", statusFilter, waveFilter, search],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter,
          wave: waveFilter === "all" ? null : parseInt(waveFilter, 10),
          search: search || undefined,
        },
      }),
  });

  const totals = statsQ.data?.totals;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Applications" value={totals?.total ?? 0} />
        <Stat label="Pending" value={totals?.pending ?? 0} />
        <Stat label="Approved" value={totals?.approved ?? 0} />
        <Stat label="Invited" value={totals?.invited ?? 0} />
        <Stat label="Active" value={totals?.active ?? 0} />
        <Stat label="Waitlisted" value={totals?.waitlisted ?? 0} />
        <Stat label="Declined" value={totals?.declined ?? 0} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          label="Avg Experience (yrs)"
          value={statsQ.data?.avgExperience ?? "—"}
        />
        <Stat
          label="Avg Calls / week"
          value={statsQ.data?.avgCallsPerWeek ?? "—"}
        />
        <Stat
          label="Waves"
          value={statsQ.data?.byWave.length ?? 0}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <RollupCard
          title="By Experience"
          rows={
            statsQ.data?.byExperience.map((b) => ({ label: b.bucket, count: b.count })) ?? []
          }
        />
        <RollupCard
          title="Primary Brands"
          rows={statsQ.data?.byBrand.map((b) => ({ label: b.brand, count: b.count })) ?? []}
        />
        <RollupCard
          title="By Region"
          rows={statsQ.data?.byRegion.map((b) => ({ label: b.region, count: b.count })) ?? []}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RosterCard
          title="Most Active Testers"
          rows={rostersQ.data?.mostActive ?? []}
          onOpen={setDetailId}
        />
        <RosterCard
          title="Inactive Testers"
          rows={rostersQ.data?.inactive ?? []}
          onOpen={setDetailId}
        />
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">Applications</div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name/email"
                className="h-8 w-48 pl-7 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="waitlisted">Waitlisted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
            <Select value={waveFilter} onValueChange={setWaveFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All waves</SelectItem>
                {(statsQ.data?.byWave ?? []).map((w) => (
                  <SelectItem key={w.wave} value={String(w.wave)}>
                    Wave {w.wave}
                  </SelectItem>
                ))}
                <SelectItem value="1">Wave 1</SelectItem>
                <SelectItem value="2">Wave 2</SelectItem>
                <SelectItem value="3">Wave 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {listQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !listQ.data || listQ.data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No applications match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2">Applicant</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Wave</th>
                  <th className="py-2 pr-2">Exp.</th>
                  <th className="py-2 pr-2">Submitted</th>
                  <th className="py-2 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.map((a) => (
                  <ApplicationRow key={a.id} app={a} onOpen={() => setDetailId(a.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailId ? (
        <BetaTesterDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </div>
  );
}

function RollupCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between">
              <span className="truncate">{r.label || "—"}</span>
              <span className="text-muted-foreground">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RosterCard({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: Array<{
    id: string;
    name: string;
    email: string;
    lastActivity: string | null;
    totalSessions: number;
    healthScore: number;
    badge: { stars: number; label: string };
  }>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No active testers yet.</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
            >
              <button
                onClick={() => onOpen(r.id)}
                className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
              >
                {r.name || r.email}
              </button>
              <StarBadge stars={r.badge.stars} label={r.badge.label} />
              <span className="w-16 text-right text-xs text-muted-foreground">
                {r.totalSessions} sess.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationRow({ app, onOpen }: { app: any; onOpen: () => void }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateBetaApplicationStatus);
  const inviteFn = useServerFn(sendBetaInvite);
  const waveFn = useServerFn(assignBetaWave);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beta-apps"] });
    qc.invalidateQueries({ queryKey: ["beta-stats"] });
    qc.invalidateQueries({ queryKey: ["beta-rosters"] });
  };

  const update = useMutation({
    mutationFn: (vars: { status: any }) =>
      updateFn({ data: { id: app.id, status: vars.status } }),
    onSuccess: (_d, vars) => {
      toast.success(`Application set to ${vars.status}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { id: app.id } }),
    onSuccess: () => {
      toast.success("Invite sent");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Invite failed"),
  });

  const wave = useMutation({
    mutationFn: (n: number) => waveFn({ data: { id: app.id, wave: n } }),
    onSuccess: () => {
      toast.success("Wave updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const busy = update.isPending || invite.isPending || wave.isPending;

  return (
    <tr className="border-t border-border/60 align-middle">
      <td className="py-2 pr-2">
        <button onClick={onOpen} className="text-left hover:underline">
          <div className="font-medium">
            {app.first_name} {app.last_name}
          </div>
          <div className="text-xs text-muted-foreground">{app.email}</div>
        </button>
      </td>
      <td className="py-2 pr-2">
        <StatusPill status={app.status} />
      </td>
      <td className="py-2 pr-2">
        <Select value={String(app.beta_wave)} onValueChange={(v) => wave.mutate(parseInt(v, 10))}>
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                Wave {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{app.experience_years} yrs</td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{fmtDate(app.created_at)}</td>
      <td className="py-2 pr-2 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy} className="h-7 text-xs">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Actions"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {app.status === "pending" || app.status === "waitlisted" ? (
              <DropdownMenuItem onClick={() => update.mutate({ status: "approved" })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
              </DropdownMenuItem>
            ) : null}
            {app.status === "approved" || app.status === "invited" ? (
              <DropdownMenuItem onClick={() => invite.mutate()}>
                <Send className="mr-2 h-4 w-4" />
                {app.status === "invited" ? "Resend Invite" : "Send Invite"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => update.mutate({ status: "waitlisted" })}>
              <PauseCircle className="mr-2 h-4 w-4" /> Move to Waitlist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => update.mutate({ status: "declined" })}>
              <XCircle className="mr-2 h-4 w-4" /> Decline
            </DropdownMenuItem>
            {app.status === "active" ? (
              <DropdownMenuItem onClick={() => update.mutate({ status: "waitlisted" })}>
                <UserMinus className="mr-2 h-4 w-4" /> Deactivate Tester
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function BetaTesterDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const metricsFn = useServerFn(getBetaTesterMetrics);
  const listFn = useServerFn(listBetaApplications);
  const appQ = useQuery({
    queryKey: ["beta-app", id],
    queryFn: async () => {
      const rows = await listFn({ data: { limit: 200 } as any });
      return rows.find((r) => r.id === id) ?? null;
    },
  });
  const metricsQ = useQuery({
    queryKey: ["beta-metrics", id],
    queryFn: () => metricsFn({ data: { id } }),
  });

  const app = appQ.data;
  const m: TesterMetrics | undefined = metricsQ.data;

  const brands = useMemo(() => {
    const b = app?.primary_brands as unknown;
    return Array.isArray(b) ? (b as string[]) : [];
  }, [app]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Beta Tester Detail</DialogTitle>
          <DialogDescription>
            Application data and engagement metrics for the linked user account.
          </DialogDescription>
        </DialogHeader>
        {!app ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">
                  {app.first_name} {app.last_name}
                </div>
                <StatusPill status={app.status} />
                <span className="text-xs text-muted-foreground">Wave {app.beta_wave}</span>
                {m ? <StarBadge stars={m.badge.stars} label={m.badge.label} /> : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{app.email}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">Company</div>
                  <div>{app.company || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Location</div>
                  <div>{app.location || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Role</div>
                  <div>{app.role || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Experience</div>
                  <div>{app.experience_years} yrs</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Calls / week</div>
                  <div>{app.calls_per_week}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Video Interview</div>
                  <div className="capitalize">{app.video_interview ?? "—"}</div>
                </div>
              </div>
              <div className="mt-2 text-xs">
                <div className="text-muted-foreground">Primary brands</div>
                <div className="flex flex-wrap gap-1">
                  {brands.length
                    ? brands.map((b) => (
                        <span
                          key={b}
                          className="rounded-full border border-border bg-background/60 px-2 py-0.5"
                        >
                          {b}
                        </span>
                      ))
                    : "—"}
                </div>
              </div>
              <div className="mt-2 text-xs">
                <div className="text-muted-foreground">Why they want to join</div>
                <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-background/40 p-2">
                  {app.reason}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Engagement
              </div>
              {!m ? (
                <div className="text-sm text-muted-foreground">Loading metrics…</div>
              ) : !m.userId ? (
                <div className="text-sm text-muted-foreground">
                  Account not created yet. Metrics will appear after the tester signs up.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <Metric label="Last Login" value={fmtDate(m.lastLogin)} />
                  <Metric label="Account Created" value={fmtDate(m.accountCreated)} />
                  <Metric label="Last Activity" value={fmtDate(m.lastActivity)} />
                  <Metric label="Total Sessions" value={m.totalSessions} />
                  <Metric label="Completed" value={m.completedSessions} />
                  <Metric label="Pending Repairs" value={m.pendingRepairs} />
                  <Metric label="Outcome Confirmations" value={m.outcomeConfirmations} />
                  <Metric label="Bug Reports" value={m.bugReports} />
                  <Metric label="Feature Requests" value={m.featureRequests} />
                  <Metric label="Feedback Entries" value={m.feedbackEntries} />
                  <Metric label="Health Score" value={`${m.healthScore} / 100`} />
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}