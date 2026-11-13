import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmailComposeDialog, type ComposeTarget } from "@/components/owner/email-compose-dialog";
import { listPartnerStudents, setPartnerStudentVerification } from "@/lib/partners/partner-students.functions";

type Filter = "all" | "pending" | "verified" | "rejected";
const DAY = 86_400_000;

/** Reusable owner roster for a partner program (currently Fred's Appliance Academy). */
export function PartnerStudentsTab({ partner = "freds_academy" as const }: { partner?: "freds_academy" }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPartnerStudents);
  const setFn = useServerFn(setPartnerStudentVerification);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [emailTarget, setEmailTarget] = useState<ComposeTarget>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["owner", "partner-students", partner],
    queryFn: () => listFn({ data: { partner } }),
    refetchInterval: 60_000,
  });

  const mut = useMutation({
    mutationFn: (a: { userId: string; status: "pending" | "verified" | "rejected" }) =>
      setFn({ data: { partner, ...a } }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "verified" ? "Student verified." : v.status === "rejected" ? "Rejected — free Pro ended." : "Moved back to pending.");
      qc.invalidateQueries({ queryKey: ["owner", "partner-students", partner] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const now = Date.now();
  const stats = useMemo(() => ({
    total: data.length,
    pending: data.filter((s) => s.verification === "pending").length,
    active7: data.filter((s) => s.lastActivityAt && now - new Date(s.lastActivityAt).getTime() < 7 * DAY).length,
    diagnostics: data.reduce((n, s) => n + s.diagnostics, 0),
  }), [data, now]);

  const rows = data.filter((s) => {
    if (filter !== "all" && s.verification !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <EmailComposeDialog target={emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Students", stats.total], ["Awaiting check", stats.pending], ["Active last 7 days", stats.active7], ["Diagnostics run", stats.diagnostics]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or name…" className="pl-9" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(["all", "pending", "verified", "rejected"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {data.length === 0 ? "No students have claimed the offer yet. They'll appear here as soon as they activate." : "No students match."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const daysLeft = Math.max(0, Math.ceil((new Date(s.expiresAt).getTime() - now) / DAY));
            return (
              <div key={s.userId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name || s.email}</span>
                    <Badge variant={s.verification === "verified" ? "default" : s.verification === "rejected" ? "destructive" : "secondary"} className="capitalize">{s.verification}</Badge>
                    {s.proActive ? <Badge variant="outline">Pro · {daysLeft}d left</Badge> : <Badge variant="outline">Pro ended</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{s.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Claimed {new Date(s.claimedAt).toLocaleDateString()} · {s.diagnostics} diagnostics · {s.lastActivityAt ? `last active ${new Date(s.lastActivityAt).toLocaleString()}` : "not active yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.verification !== "verified" && (
                    <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate({ userId: s.userId, status: "verified" })}><CheckCircle2 className="mr-1 h-4 w-4" />Verify</Button>
                  )}
                  {s.verification !== "rejected" && (
                    <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => { if (confirm(`Reject ${s.email}? Their free Pro ends now.`)) mut.mutate({ userId: s.userId, status: "rejected" }); }}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
                  )}
                  {s.verification !== "pending" && (
                    <Button size="sm" variant="ghost" disabled={mut.isPending} onClick={() => mut.mutate({ userId: s.userId, status: "pending" })}><RotateCcw className="mr-1 h-4 w-4" />Reset</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEmailTarget({ email: s.email, name: s.name || null })}><Mail className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
