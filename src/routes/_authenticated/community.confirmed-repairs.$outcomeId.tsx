import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConfirmedRepair, type ConfirmedRepair } from "@/lib/confirmed-repairs.functions";

export const Route = createFileRoute("/_authenticated/community/confirmed-repairs/$outcomeId")({
  head: () => ({
    meta: [
      { title: "Verified Repair — Community — NextStep" },
      { name: "description", content: "A repair confirmed in the field by a NextStep technician." },
    ],
  }),
  component: ConfirmedRepairDetail,
});

function ConfirmedRepairDetail() {
  const { outcomeId } = Route.useParams();
  const get = useServerFn(getConfirmedRepair);
  const { data, isLoading } = useQuery({
    queryKey: ["community", "confirmed-repair", outcomeId],
    queryFn: () => get({ data: { outcomeId } }) as Promise<ConfirmedRepair | null>,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <Link to="/community/confirmed-repairs" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Confirmed Repairs
        </Link>
        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !data ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            This repair is not available.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Verified Repair
              </span>
              <h1 className="mt-2 text-xl font-bold">{data.confirmedFailure}</h1>
              <p className="text-sm text-muted-foreground">
                {data.brand} · {data.applianceType} · {data.model}
              </p>
            </div>
            <dl className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <Row label="Complaint" value={data.complaint} />
              <Row label="Confirmed failure" value={data.confirmedFailure} />
              <Row label="Part replaced" value={data.partReplaced ?? "—"} />
              <Row label="Confirming test" value={data.confirmingTest ?? "—"} />
              <Row label="Repair successful" value={data.repairSuccessful == null ? "—" : data.repairSuccessful ? "Yes" : "No"} />
              <Row label="Technician" value={data.technician} />
              <Row label="Confirmed" value={new Date(data.confirmedAt).toLocaleDateString()} />
              {data.publicNotes && <Row label="Notes" value={data.publicNotes} />}
            </dl>
            {data.discussionId && (
              <Link to="/community/$discussionId" params={{ discussionId: data.discussionId }}>
                <Button variant="outline" className="h-11 w-full">
                  Open discussion · {data.replyCount} {data.replyCount === 1 ? "reply" : "replies"}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="flex-1 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
