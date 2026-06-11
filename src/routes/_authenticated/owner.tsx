import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Shield,
  ShieldOff,
  UserCog,
  Ban,
  CheckCircle2,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  amOwner,
  getOwnerOverview,
  getAiUsageStats,
  getAiCostEstimate,
  listUsers,
  getUserDetail,
  setUserPlan,
  setUserSuspended,
  setUserOwnerRole,
  listFeedback,
  updateFeedbackStatus,
} from "@/lib/owner.functions";
import { featureLabel, formatUsd } from "@/lib/ai-cost";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({ meta: [{ title: "Owner — NextStep Diagnostics" }] }),
  beforeLoad: async () => {
    try {
      const { isOwner } = await amOwner();
      if (!isOwner) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OwnerPage,
});

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "—";
  }
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function OwnerPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Owner Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Visibility into users, AI usage, feedback, and cost.
            </p>
          </div>
        </header>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ai">AI Usage</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="cost">AI Cost</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
          <TabsContent value="ai" className="mt-6"><AiUsageTab /></TabsContent>
          <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
          <TabsContent value="feedback" className="mt-6"><FeedbackTab /></TabsContent>
          <TabsContent value="cost" className="mt-6"><CostTab /></TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function OverviewTab() {
  const fn = useServerFn(getOwnerOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "overview"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Total Users" value={data.totalUsers} />
      <StatCard label="Active Today" value={data.activeToday} hint="ran a diagnosis" />
      <StatCard label="Active This Week" value={data.activeWeek} />
      <StatCard label="Active This Month" value={data.activeMonth} />
      <StatCard label="Free" value={data.free} />
      <StatCard label="Pro" value={data.pro} />
      <StatCard label="Master" value={data.master} />
      <StatCard label="Lifetime" value={data.lifetime} />
    </div>
  );
}

function AiUsageTab() {
  const fn = useServerFn(getAiUsageStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "ai-usage"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="AI Calls Today" value={data.today} />
        <StatCard label="This Week" value={data.week} />
        <StatCard label="This Month" value={data.month} />
        <StatCard label="Total" value={data.total} />
      </div>
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
        <div className="mb-3 text-sm font-semibold">Breakdown by feature</div>
        {data.byFeature.length === 0 ? (
          <div className="text-sm text-muted-foreground">No AI calls recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2 pr-4">Feature</th><th className="py-2 pr-4">Calls</th><th className="py-2 pr-4">Input tokens</th><th className="py-2">Output tokens</th></tr>
              </thead>
              <tbody>
                {data.byFeature.map((r) => (
                  <tr key={r.feature} className="border-t border-border/40">
                    <td className="py-2 pr-4">{featureLabel(r.feature)}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.calls.toLocaleString()}</td>
                    <td className="py-2 pr-4 tabular-nums">{r.input.toLocaleString()}</td>
                    <td className="py-2 tabular-nums">{r.output.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listUsers);
  const planFn = useServerFn(setUserPlan);
  const suspendFn = useServerFn(setUserSuspended);
  const roleFn = useServerFn(setUserOwnerRole);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["owner", "users", search],
    queryFn: () => fn({ data: { search } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["owner", "users"] });
    qc.invalidateQueries({ queryKey: ["owner", "overview"] });
  };

  const planMut = useMutation({
    mutationFn: (args: { userId: string; plan: "free" | "pro" | "master" | "lifetime" }) =>
      planFn({ data: args }),
    onSuccess: () => { toast.success("Plan updated."); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const suspendMut = useMutation({
    mutationFn: (args: { userId: string; suspended: boolean }) => suspendFn({ data: args }),
    onSuccess: (_d, v) => { toast.success(v.suspended ? "User suspended." : "User reinstated."); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const roleMut = useMutation({
    mutationFn: (args: { userId: string; grant: boolean }) => roleFn({ data: args }),
    onSuccess: () => { toast.success("Role updated."); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </div>

      {isLoading ? <Loading /> : error ? <ErrorBlock error={error} /> : (
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Signup</th>
                <th className="px-3 py-2">Last Login</th>
                <th className="px-3 py-2">Last Activity</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.email || "—"}</div>
                    {u.full_name ? <div className="text-xs text-muted-foreground">{u.full_name}</div> : null}
                    {u.is_suspended ? <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive"><Ban className="h-3 w-3"/>Suspended</div> : null}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    <Select
                      value={u.plan}
                      onValueChange={(v) => planMut.mutate({ userId: u.id, plan: v as "free" | "pro" | "master" | "lifetime" })}
                    >
                      <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="master">Master</SelectItem>
                        <SelectItem value="lifetime">Lifetime</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-xs">{u.role === "owner" ? <span className="inline-flex items-center gap-1 font-semibold text-primary"><Shield className="h-3 w-3"/>Owner</span> : "User"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(u.last_activity_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(u.id)}>View detail</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.plan !== "pro" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "pro" })}>Upgrade to Pro</DropdownMenuItem>}
                        {u.plan === "pro" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "free" })}>Remove Pro</DropdownMenuItem>}
                        {u.plan !== "master" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "master" })}>Grant Master</DropdownMenuItem>}
                        {u.plan !== "lifetime" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "lifetime" })}>Grant Lifetime</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        {u.role === "owner" ? (
                          <DropdownMenuItem onClick={() => roleMut.mutate({ userId: u.id, grant: false })} className="text-destructive"><ShieldOff className="mr-2 h-4 w-4"/>Revoke Owner</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => roleMut.mutate({ userId: u.id, grant: true })}><Shield className="mr-2 h-4 w-4"/>Grant Owner</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {u.is_suspended ? (
                          <DropdownMenuItem onClick={() => suspendMut.mutate({ userId: u.id, suspended: false })}><CheckCircle2 className="mr-2 h-4 w-4"/>Reinstate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => suspendMut.mutate({ userId: u.id, suspended: true })} className="text-destructive"><Ban className="mr-2 h-4 w-4"/>Suspend</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <UserDetailDialog userId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function UserDetailDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const fn = useServerFn(getUserDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "user-detail", userId],
    queryFn: () => fn({ data: { userId: userId! } }),
    enabled: !!userId,
  });
  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5"/>User Detail</DialogTitle>
          <DialogDescription>{data?.profile?.email ?? "Loading…"}</DialogDescription>
        </DialogHeader>
        {isLoading ? <Loading /> : error ? <ErrorBlock error={error} /> : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Plan" value={data.profile?.plan ?? "—"} />
              <StatCard label="Diagnoses" value={data.totalDiagnoses} />
              <StatCard label="AI Calls" value={data.totalAiCalls} />
              <StatCard label="Est. Cost" value={formatUsd(data.totalCostUsd)} />
            </div>
            <div className="text-xs text-muted-foreground">
              Signed up {fmtDate(data.profile?.created_at)} · Last activity {fmtDate(data.profile?.last_activity_at)}
            </div>
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="mb-2 text-sm font-semibold">AI breakdown by feature</div>
              {data.byFeature.length === 0 ? (
                <div className="text-sm text-muted-foreground">No AI activity yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1 pr-4">Feature</th><th className="py-1 pr-4">Calls</th><th className="py-1 pr-4">Tokens</th><th className="py-1">Cost</th></tr>
                  </thead>
                  <tbody>
                    {data.byFeature.map((r) => (
                      <tr key={r.feature} className="border-t border-border/40">
                        <td className="py-1 pr-4">{featureLabel(r.feature)}</td>
                        <td className="py-1 pr-4 tabular-nums">{r.calls}</td>
                        <td className="py-1 pr-4 tabular-nums">{(r.input + r.output).toLocaleString()}</td>
                        <td className="py-1 tabular-nums">{formatUsd(r.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listFeedback);
  const updateFn = useServerFn(updateFeedbackStatus);
  const [kind, setKind] = useState<"all" | "bug" | "feature" | "general">("all");
  const [status, setStatus] = useState<"all" | "open" | "reviewed" | "closed">("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "feedback", kind, status],
    queryFn: () => fn({ data: { kind, status } }),
  });
  const mut = useMutation({
    mutationFn: (args: { id: string; status: "open" | "reviewed" | "closed" }) => updateFn({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "feedback"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature">Feature</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Loading /> : error ? <ErrorBlock error={error} /> : (
        <div className="space-y-2">
          {(data ?? []).length === 0 && (
            <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">No feedback yet.</div>
          )}
          {(data ?? []).map((f) => (
            <div key={f.id} className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">{f.kind}</span>
                    <span className="text-muted-foreground">{fmtDate(f.created_at)}</span>
                    <span className="text-muted-foreground">· {f.email || "unknown user"}</span>
                  </div>
                  <div className="mt-1 font-semibold">{f.subject}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{f.body}</div>
                </div>
                <Select value={f.status} onValueChange={(v) => mut.mutate({ id: f.id, status: v as "open" | "reviewed" | "closed" })}>
                  <SelectTrigger className="h-8 w-[120px]"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostTab() {
  const fn = useServerFn(getAiCostEstimate);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "ai-cost"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Estimated Cost Today" value={formatUsd(data.today)} />
        <StatCard label="Estimated Cost This Month" value={formatUsd(data.month)} />
        <StatCard label="Avg Per User (all time)" value={formatUsd(data.avgPerUser)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Rough estimate based on token usage × current Gemini Flash rates ($0.30 / $2.50 per 1M input/output tokens). Actual billing is by your Lovable AI balance.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function ErrorBlock({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {(error as Error)?.message ?? "Something went wrong."}
    </div>
  );
}