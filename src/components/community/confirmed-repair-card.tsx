import { Link } from "@tanstack/react-router";
import { CheckCircle2, MessagesSquare, ShieldCheck, ThumbsUp } from "lucide-react";
import type { ConfirmedRepair } from "@/lib/confirmed-repairs.functions";

export function ConfirmedRepairCard({ repair }: { repair: ConfirmedRepair }) {
  return (
    <Link
      to="/community/confirmed-repairs/$outcomeId"
      params={{ outcomeId: repair.id }}
      className="block rounded-xl border border-border bg-card/60 p-3 transition hover:border-primary"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
          <ShieldCheck className="h-3 w-3" /> Verified Repair
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {repair.brand} · {repair.applianceType} · {repair.model}
        </span>
      </div>
      <div className="truncate text-sm font-bold">{repair.confirmedFailure || "Confirmed repair"}</div>
      <div className="truncate text-xs text-muted-foreground">{repair.complaint}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {repair.partReplaced && <span>Part: {repair.partReplaced}</span>}
        {repair.confirmingTest && <span>Test: {repair.confirmingTest}</span>}
        {repair.repairSuccessful != null && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {repair.repairSuccessful ? "Repair successful" : "Not resolved"}
          </span>
        )}
        <span>{repair.technician}</span>
        <span>{new Date(repair.confirmedAt).toLocaleDateString()}</span>
        <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {repair.helpfulCount}</span>
        {repair.discussionId && (
          <span className="inline-flex items-center gap-1"><MessagesSquare className="h-3 w-3" /> {repair.replyCount}</span>
        )}
      </div>
    </Link>
  );
}
