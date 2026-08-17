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
  Pencil,
  Trash2,
  KeyRound,
  Mail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmailComposeDialog, type ComposeTarget } from "@/components/owner/email-compose-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
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
  getOwnerOverview,
  getAiUsageStats,
  getAiCostEstimate,
  listUsers,
  getUserDetail,
  setUserPlan,
  setUserDisplayName,
  deleteUser,
  sendPasswordReset,
  setUserSuspended,
  setUserOwnerRole,
  listFeedback,
  updateFeedbackStatus,
  getAgeDecoderStats,
  getTechSheetCoverageStats,
} from "@/lib/owner.functions";
import {
  listApplianceTypeOverrides,
  deleteApplianceTypeOverride,
} from "@/lib/appliance-type-overrides.functions";
import { getOwnerOutcomeMetrics, getAccuracyMetrics, type AccuracyMetrics } from "@/lib/diagnostic-outcomes.functions";
import { PendingRepairs } from "@/components/pending-repairs";
import { featureLabel, formatUsd } from "@/lib/ai-cost";
import { BetaProgramTab } from "@/components/owner/beta-program-tab";
import { ToolManagerTab } from "@/components/owner/tool-manager-tab";

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

function Loading() {
  return (
    <div className="flex items-center justify-center py-10 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function TypeOverridesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApplianceTypeOverrides);
  const delFn = useServerFn(deleteApplianceTypeOverride);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "type-overrides"],
    queryFn: () => listFn(),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Override deleted.");
      qc.invalidateQueries({ queryKey: ["owner", "type-overrides"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  const rows = data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Brand+model corrections submitted by users. Future decodes for the same brand+model
        automatically use the corrected type. Delete an entry to revert to the decoder's guess.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Corrected Type</th>
              <th className="px-3 py-2">Sub-type</th>
              <th className="px-3 py-2 text-right">Corrections</th>
              <th className="px-3 py-2 text-right">Applied</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium">{r.brand_display}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.model_display}</td>
                <td className="px-3 py-2">{r.appliance_type}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.sub_type || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.correction_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.hit_count}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(r.last_used_at)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => delMut.mutate(r.id)}
                    disabled={delMut.isPending}
                    aria-label="Delete override"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No overrides yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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

export function OwnerPanels() {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
        <TabsTrigger value="ai">AI Usage</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="feedback">Feedback</TabsTrigger>
        <TabsTrigger value="cost">AI Cost</TabsTrigger>
        <TabsTrigger value="age-decoder">Age Decoder</TabsTrigger>
        <TabsTrigger value="tech-sheets">Tech Sheets</TabsTrigger>
        <TabsTrigger value="type-overrides">Type Overrides</TabsTrigger>
        <TabsTrigger value="tools">Tool Manager</TabsTrigger>
        <TabsTrigger value="beta">Beta</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
      <TabsContent value="accuracy" className="mt-6"><AccuracyTab /></TabsContent>
      <TabsContent value="ai" className="mt-6"><AiUsageTab /></TabsContent>
      <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
      <TabsContent value="feedback" className="mt-6"><FeedbackTab /></TabsContent>
      <TabsContent value="cost" className="mt-6"><CostTab /></TabsContent>
      <TabsContent value="age-decoder" className="mt-6"><AgeDecoderTab /></TabsContent>
      <TabsContent value="tech-sheets" className="mt-6"><TechSheetCoverageTab /></TabsContent>
      <TabsContent value="type-overrides" className="mt-6"><TypeOverridesTab /></TabsContent>
      <TabsContent value="tools" className="mt-6"><ToolManagerTab /></TabsContent>
      <TabsContent value="beta" className="mt-6"><BetaProgramTab /></TabsContent>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
        <a
          href="/repair-insights-test"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 font-semibold text-foreground/80 hover:bg-muted/50"
        >
          Repair Insights Test →
        </a>
      </div>
    </Tabs>
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
  const nameFn = useServerFn(setUserDisplayName);
  const deleteFn = useServerFn(deleteUser);
  const resetFn = useServerFn(sendPasswordReset);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; current: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; link: string | null } | null>(null);
  const [emailTarget, setEmailTarget] = useState<ComposeTarget>(null);

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
  const nameMut = useMutation({
    mutationFn: (args: { userId: string; displayName: string | null }) => nameFn({ data: args }),
    onSuccess: () => { toast.success("Display name updated."); setRenameTarget(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted."); setDeleteTarget(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const resetMut = useMutation({
    mutationFn: (userId: string) => resetFn({ data: { userId } }),
    onSuccess: (res) => { setResetLink({ email: res.email, link: res.actionLink }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <EmailComposeDialog target={emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)} />
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
                <th className="px-3 py-2">Display name</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Sessions</th>
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
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setRenameTarget({ id: u.id, current: u.display_name ?? null })}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm hover:bg-muted/50"
                    >
                      <span className={u.display_name ? "" : "italic text-muted-foreground"}>
                        {u.display_name || "—"}
                      </span>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
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
                  <td className="px-3 py-2 text-xs tabular-nums">{u.sessions ?? 0}</td>
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
                        <DropdownMenuItem
                          disabled={!u.email}
                          onClick={() => setEmailTarget({ email: u.email, name: u.display_name ?? u.full_name ?? null })}
                        >
                          <Mail className="mr-2 h-4 w-4"/>Send email
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRenameTarget({ id: u.id, current: u.display_name ?? null })}>
                          <Pencil className="mr-2 h-4 w-4"/>Edit display name
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.plan !== "pro" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "pro" })}>Upgrade to Pro</DropdownMenuItem>}
                        {u.plan === "pro" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "free" })}>Remove Pro</DropdownMenuItem>}
                        {u.plan !== "master" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "master" })}>Grant Master</DropdownMenuItem>}
                        {u.plan !== "lifetime" && <DropdownMenuItem onClick={() => planMut.mutate({ userId: u.id, plan: "lifetime" })}>Grant Lifetime</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => resetMut.mutate(u.id)}>
                          <KeyRound className="mr-2 h-4 w-4"/>Send password reset
                        </DropdownMenuItem>
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
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget({ id: u.id, email: u.email || "this user" })}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4"/>Delete account
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <UserDetailDialog userId={detailId} onClose={() => setDetailId(null)} />
      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={(displayName) =>
          renameTarget && nameMut.mutate({ userId: renameTarget.id, displayName })
        }
        saving={nameMut.isPending}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-semibold">{deleteTarget?.email}</span> and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!resetLink} onOpenChange={(o) => !o && setResetLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link</DialogTitle>
            <DialogDescription>
              Share this link with {resetLink?.email}. It will let them set a new password.
            </DialogDescription>
          </DialogHeader>
          {resetLink?.link ? (
            <div className="space-y-2">
              <Input readOnly value={resetLink.link} onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resetLink.link!);
                  toast.success("Link copied.");
                }}
              >
                Copy link
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Reset email has been queued.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenameDialog({
  target,
  onClose,
  onSave,
  saving,
}: {
  target: { id: string; current: string | null } | null;
  onClose: () => void;
  onSave: (displayName: string | null) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState("");
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setVal("");
          onClose();
        } else if (target) {
          setVal(target.current ?? "");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit display name</DialogTitle>
          <DialogDescription>
            This is how the user is greeted on their dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rename-input">Dashboard name</Label>
          <Input
            id="rename-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            maxLength={80}
            placeholder="Leave blank to clear"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setVal(""); onClose(); }}>Cancel</Button>
          <Button
            onClick={() => onSave(val.trim() || null)}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              <StatCard label="Diagnostic Sessions" value={data.totalDiagnoses} />
              <StatCard label="AI Calls" value={data.totalAiCalls} />
              <StatCard label="Est. Cost" value={formatUsd(data.totalCostUsd)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Completed" value={data.sessionsByStatus.completed} />
              <StatCard label="Active" value={data.sessionsByStatus.active} />
              <StatCard label="Abandoned" value={data.sessionsByStatus.abandoned} />
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
  const [feedbackTarget, setFeedbackTarget] = useState<ComposeTarget>(null);
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
      <EmailComposeDialog
        target={feedbackTarget}
        defaultSubject="Re: your NextStep feedback"
        onOpenChange={(o) => !o && setFeedbackTarget(null)}
      />
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
                <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!f.email}
                  onClick={() => setFeedbackTarget({ email: f.email, name: null })}
                >
                  <Mail className="mr-1.5 h-4 w-4" />Reply by email
                </Button>
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

function AgeDecoderTab() {
  const fn = useServerFn(getAgeDecoderStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "age-decoder"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const trend = data.trend ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Lookups (30d)" value={data.total} />
        <StatCard label="Successful" value={data.successful} />
        <StatCard label="Unknown" value={data.unknown} />
        <StatCard label="Success Rate" value={pct(data.successRate)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Sparkline title="Success Rate Trend (last 30d)" points={trend.map((t) => t.successRate)} labels={trend.map((t) => t.date)} fmt={pct} />
        <Sparkline title="Unknown Rate Trend (last 30d)" points={trend.map((t) => t.unknownRate)} labels={trend.map((t) => t.date)} fmt={pct} />
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Per Manufacturer (v2 = rule engine, v1 = legacy comparison)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Manufacturer</th>
                <th className="py-1 text-right">v2 Lookups</th>
                <th className="py-1 text-right">v2 Success</th>
                <th className="py-1 text-right">v1 Lookups</th>
                <th className="py-1 text-right">v1 Success</th>
              </tr>
            </thead>
            <tbody>
              {data.perManufacturer.map((m) => (
                <tr key={m.manufacturer} className="border-t border-border/40">
                  <td className="py-1 font-medium">{m.manufacturer}</td>
                  <td className="py-1 text-right">{m.v2Total}</td>
                  <td className="py-1 text-right">{m.v2Total ? pct(m.v2SuccessRate) : "—"}</td>
                  <td className="py-1 text-right text-muted-foreground">{m.v1Total}</td>
                  <td className="py-1 text-right text-muted-foreground">{m.v1Total ? pct(m.v1SuccessRate) : "—"}</td>
                </tr>
              ))}
              {!data.perManufacturer.length && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No lookups in the last 30 days.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rule Analytics (per serial format, last 30d)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Rule</th>
                <th className="py-1 text-right">Used</th>
                <th className="py-1 text-right">Successful</th>
                <th className="py-1 text-right">Rejected candidates</th>
                <th className="py-1 text-right">Accuracy</th>
                <th className="py-1 text-right">Avg confidence</th>
              </tr>
            </thead>
            <tbody>
              {(data.perRule ?? []).map((r) => (
                <tr key={r.ruleId} className="border-t border-border/40">
                  <td className="py-1 font-mono text-xs">{r.ruleId}</td>
                  <td className="py-1 text-right">{r.total}</td>
                  <td className="py-1 text-right">{r.successful}</td>
                  <td className="py-1 text-right text-muted-foreground">{r.rejectedCandidates}</td>
                  <td className={`py-1 text-right ${r.accuracy < 0.7 ? "text-amber-300" : ""}`}>
                    {pct(r.accuracy)}
                  </td>
                  <td className="py-1 text-right">{r.avgConfidence ? `${r.avgConfidence}%` : "—"}</td>
                </tr>
              ))}
              {!(data.perRule ?? []).length && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No decodes in the last 30 days.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Top Unknown Reasons
          </div>
          <ul className="space-y-1 text-sm">
            {data.topUnknownReasons.map((r) => (
              <li key={r.reason} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{r.reason}</span>
                <span className="font-semibold">{r.count}</span>
              </li>
            ))}
            {!data.topUnknownReasons.length && (
              <li className="text-muted-foreground">No unknowns 🎉</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last 20 Unknown Serials
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {data.recentUnknowns.map((u, i) => (
              <li key={i} className="border-t border-border/30 py-1 first:border-t-0">
                <div className="font-semibold">{u.manufacturer} · {u.modelNumber}</div>
                <div className="font-mono text-muted-foreground">{u.serialNumber} — {u.reason}</div>
              </li>
            ))}
            {!data.recentUnknowns.length && (
              <li className="text-muted-foreground">No unknowns to show.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Sparkline({
  title,
  points,
  labels,
  fmt,
}: {
  title: string;
  points: number[];
  labels: string[];
  fmt: (n: number) => string;
}) {
  const W = 320;
  const H = 60;
  const max = Math.max(1e-9, ...points, 1);
  const min = 0;
  const last = points[points.length - 1] ?? 0;
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * W;
      const y = H - ((p - min) / (max - min || 1)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-sm font-semibold">{fmt(last)}</div>
      </div>
      {points.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
        </svg>
      ) : (
        <div className="text-xs text-muted-foreground">No data.</div>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function TechSheetCoverageTab() {
  const fn = useServerFn(getTechSheetCoverageStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "tech-sheets"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const trustLabel: Record<string, string> = {
    oem: "OEM",
    trusted_reference: "Trusted Reference",
    community: "Community",
  };
  const confidenceLabel: Record<string, string> = {
    exact_model: "Exact Model",
    platform_family: "Platform Family",
    manufacturer_family: "Manufacturer Family",
    low: "Low / None",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Lookups (30d)" value={data.total} />
        <StatCard label="Cache Hits" value={data.cacheHits} />
        <StatCard label="Cache Hit Rate" value={pct(data.cacheHitRate)} />
        <StatCard label="Sheets Cached" value={data.sheetsCached} />
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Confidence Breakdown (last 30d lookups)
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(data.confidenceCounts).map(([k, v]) => (
            <div key={k} className="rounded border border-border/40 bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{confidenceLabel[k] ?? k}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{v}</div>
              <div className="text-[10px] text-muted-foreground">{data.total ? pct(v / data.total) : "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Source Trust Breakdown (cached corpus)
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.trustBreakdown.map((t) => (
            <div key={t.trust} className="rounded border border-border/40 bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{trustLabel[t.trust] ?? t.trust}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{t.count}</div>
              <div className="text-[10px] text-muted-foreground">{pct(t.percentage)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Cache Misses (manual-seed candidates)
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
          {data.recentMisses.map((m, i) => (
            <li key={i} className="border-t border-border/30 py-1 first:border-t-0">
              <div className="font-semibold">{m.brand} · {m.modelNumber}</div>
              <div className="font-mono text-muted-foreground">
                {m.confidence}{m.sourceTrust ? ` · ${m.sourceTrust}` : ""} — {fmtDate(m.createdAt)}
              </div>
            </li>
          ))}
          {!data.recentMisses.length && (
            <li className="text-muted-foreground">No cache misses to show.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function AccuracyTab() {
  const fn = useServerFn(getOwnerOutcomeMetrics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "diagnostic-accuracy"],
    queryFn: () => fn(),
  });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;
  const accuracy = data.accuracyPercent;
  return (
    <div className="space-y-6">
      <NextStepAccuracySection />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Total Outcomes" value={data.totals.total} />
        <StatCard label="Confirmed" value={data.totals.confirmed} />
        <StatCard label="Incorrect" value={data.totals.incorrect} />
        <StatCard label="Partial" value={data.totals.partial} />
        <StatCard label="Pending" value={data.totals.pending} />
        <StatCard
          label="Accuracy %"
          value={accuracy == null ? "—" : `${accuracy}%`}
          hint="confirmed / resolved"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankList title="Top Confirmed Failures" rows={data.topConfirmed.map((r) => ({ label: r.failure, count: r.count }))} />
        <RankList title="Most Incorrect Recommendations" rows={data.topIncorrect.map((r) => ({ label: r.failure, count: r.count }))} />
        <RankList title="Most Common Complaints" rows={data.topComplaints.map((r) => ({ label: r.complaint, count: r.count }))} />
        <RankList title="Most Common Appliance Types" rows={data.topApplianceTypes.map((r) => ({ label: r.type, count: r.count }))} />
        <ModelList title="Highest Accuracy Models" rows={data.bestModels} />
        <ModelList title="Lowest Accuracy Models" rows={data.worstModels} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
        <div className="mb-3 text-sm font-semibold">Pending Repairs (all technicians' rows you can see)</div>
        <PendingRepairs limit={25} compact />
      </div>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return <RankListInner title={title} rows={rows} />;
}

/** Prediction-vs-actual accuracy from technician verdicts, with filters. */
function NextStepAccuracySection() {
  const fn = useServerFn(getAccuracyMetrics);
  const [brand, setBrand] = useState("");
  const [applianceType, setApplianceType] = useState("");
  const [model, setModel] = useState("");
  const [failure, setFailure] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["owner", "nextstep-accuracy", brand, applianceType, model, failure, from, to],
    queryFn: () =>
      fn({
        data: {
          brand: brand.trim() || undefined,
          applianceType: applianceType.trim() || undefined,
          model: model.trim() || undefined,
          failure: failure.trim() || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
        },
      }) as Promise<AccuracyMetrics>,
  });

  return (
    <div className="rounded-xl border border-primary/40 bg-card/60 p-4 backdrop-blur">
      <div className="mb-3 text-sm font-semibold">NextStep Diagnostic Accuracy</div>
      <div className="mb-3 grid gap-2 md:grid-cols-6">
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" className="h-9" />
        <Input value={applianceType} onChange={(e) => setApplianceType(e.target.value)} placeholder="Appliance type" className="h-9" />
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-9" />
        <Input value={failure} onChange={(e) => setFailure(e.target.value)} placeholder="Failure" className="h-9" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <StatCard label="Completed" value={data.totalCompleted} />
            <StatCard label="Confirmed Repairs" value={data.confirmedRepairs} />
            <StatCard label="With Feedback" value={data.withFeedback} />
            <StatCard label="Correct" value={data.correct} />
            <StatCard label="Partial" value={data.partial} />
            <StatCard label="Incorrect" value={data.incorrect} />
          </div>
          <div className="mt-3 text-sm">
            Accuracy:{" "}
            <span className="font-bold text-primary">
              {data.accuracyPercent == null
                ? `Not enough data (${data.withFeedback}/${data.minSample})`
                : `${data.accuracyPercent}%`}
            </span>
          </div>
          {data.monthly.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left">Month</th>
                    <th className="py-1 text-right">Correct</th>
                    <th className="py-1 text-right">Partial</th>
                    <th className="py-1 text-right">Incorrect</th>
                    <th className="py-1 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.month} className="border-t border-border/40">
                      <td className="py-1">{m.month}</td>
                      <td className="py-1 text-right">{m.correct}</td>
                      <td className="py-1 text-right">{m.partial}</td>
                      <td className="py-1 text-right">{m.incorrect}</td>
                      <td className="py-1 text-right">{m.accuracyPercent == null ? "—" : `${m.accuracyPercent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RankListInner({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex justify-between gap-2 border-t border-border/30 py-1 first:border-t-0">
              <span className="truncate">{r.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModelList({ title, rows }: { title: string; rows: Array<{ model: string; resolved: number; accuracyPercent: number }> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Need at least 5 resolved outcomes per model.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.model} className="flex justify-between gap-2 border-t border-border/30 py-1 first:border-t-0">
              <span className="truncate">{r.model}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {r.accuracyPercent}% · n={r.resolved}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}