import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Download, Search, MoreHorizontal, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getBillingOverview,
  listSubscriptions,
  setUserProAccess,
  exportSubscriptionsCsv,
} from "@/lib/owner-billing.functions";

export const Route = createFileRoute("/_authenticated/owner/payments")({
  head: () => ({
    meta: [
      { title: "Payments & Subscriptions — Owner Console" },
      {
        name: "description",
        content: "Manage Pro subscriptions, revenue and manual access grants.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function PaymentsPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getBillingOverview);
  const listFn = useServerFn(listSubscriptions);
  const accessFn = useServerFn(setUserProAccess);
  const exportFn = useServerFn(exportSubscriptionsCsv);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pro" | "free" | "canceling" | "grandfathered">(
    "all",
  );

  const overview = useQuery({
    queryKey: ["owner", "billing-overview"],
    queryFn: () => overviewFn(),
  });
  const subs = useQuery({
    queryKey: ["owner", "subscriptions", search, filter],
    queryFn: () => listFn({ data: { search, filter } }),
  });

  const mut = useMutation({
    mutationFn: (v: { userId: string; action: "grant_lifetime" | "grant_days" | "revoke"; days?: number }) =>
      accessFn({ data: v }),
    onSuccess: () => {
      toast.success("Subscription updated.");
      qc.invalidateQueries({ queryKey: ["owner", "subscriptions"] });
      qc.invalidateQueries({ queryKey: ["owner", "billing-overview"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const o = overview.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Payments & Subscriptions
        </h2>
      </div>

      {overview.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : o ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active Pro" value={o.activePro} hint={`${o.free} free / expired`} />
          <Stat label="Est. MRR" value={`$${o.estimatedMrr.toFixed(2)}`} hint="Recurring value" />
          <Stat label="Canceling" value={o.canceling} hint="Ends at period end" />
          <Stat
            label="Grandfathered"
            value={o.byPlan["grandfathered"] ?? 0}
            hint={`Monthly ${o.byPlan["monthly"] ?? 0} · Annual ${o.byPlan["annual"] ?? 0} · Week ${o.byPlan["week_pass"] ?? 0}`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="pro">Active Pro</SelectItem>
            <SelectItem value="free">Free / expired</SelectItem>
            <SelectItem value="canceling">Canceling</SelectItem>
            <SelectItem value="grandfathered">Grandfathered</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={async () => {
            const res = await exportFn();
            download("nextstep-subscriptions.csv", res.csv);
            toast.success(`Exported ${res.count} rows.`);
          }}
        >
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Renews / Ends</th>
              <th className="px-3 py-2">Env</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : (subs.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No customers match this filter.
                </td>
              </tr>
            ) : (
              (subs.data ?? []).map((r) => (
                <tr key={r.userId} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.email}</div>
                    {r.fullName ? (
                      <div className="text-xs text-muted-foreground">{r.fullName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={r.isActivePro ? "default" : "secondary"}>
                      {r.isActivePro ? (r.planType ?? "pro") : "free"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.status}
                    {r.cancelAtPeriodEnd ? " · canceling" : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.planType === "grandfathered" ? "Never" : fmtDate(r.currentPeriodEnd)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.environment}</td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={mut.isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            mut.mutate({ userId: r.userId, action: "grant_lifetime" })
                          }
                        >
                          Grant lifetime Pro
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            mut.mutate({ userId: r.userId, action: "grant_days", days: 30 })
                          }
                        >
                          Grant 30 days Pro
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            mut.mutate({ userId: r.userId, action: "grant_days", days: 7 })
                          }
                        >
                          Grant 7 days Pro
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => mut.mutate({ userId: r.userId, action: "revoke" })}
                        >
                          Revoke Pro access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Manual grants write directly to the subscription record and are not billed through the
        payment provider. Stripe-managed plans continue to sync from webhooks.
      </p>
    </div>
  );
}
