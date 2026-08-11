import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { listPendingRepairs, updateOutcome } from "@/lib/diagnostic-outcomes.functions";
import { OutcomeFeedbackSteps } from "@/components/outcome-feedback-steps";

type Row = {
  id: string;
  session_id: string | null;
  manufacturer: string;
  model_number: string;
  appliance_type: string;
  complaint: string;
  recommended_failure: string;
  created_at: string;
};

export function PendingRepairs({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listPendingRepairs);
  const update = useServerFn(updateOutcome);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pending-repairs", limit ?? "all"],
    queryFn: () => list({ data: { limit: limit ?? 50 } }) as Promise<Row[]>,
  });

  const mutate = useMutation({
    mutationFn: (args: Record<string, unknown> & { id: string; outcome: "confirmed" | "incorrect" | "partial" }) =>
      update({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-repairs"] });
      qc.invalidateQueries({ queryKey: ["owner", "diagnostic-accuracy"] });
      setOpenRowId(null);
      toast.success("Outcome updated.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No pending repairs. Diagnoses you mark "Repair Pending" will appear here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-card/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">
                {r.manufacturer || "Unknown"} · {r.appliance_type || "—"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                Model {r.model_number || "—"} · {new Date(r.created_at).toLocaleDateString()}
              </div>
              {r.complaint && (
                <div className="mt-1 line-clamp-2 text-xs text-foreground/80">
                  <span className="text-muted-foreground">Complaint:</span> {r.complaint}
                </div>
              )}
              <div className="mt-1 text-xs">
                <span className="text-muted-foreground">Likely cause:</span>{" "}
                <span className="font-semibold text-primary">{r.recommended_failure || "—"}</span>
              </div>
            </div>
            {!compact && r.session_id && (
              <Link
                to="/diagnose"
                search={{ session: r.session_id }}
                className="shrink-0 text-xs font-semibold text-primary"
              >
                Open <ChevronRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>

          {openRowId === r.id ? (
            <div className="mt-3 rounded-xl border border-border bg-background/40 p-3">
              <OutcomeFeedbackSteps
                busy={mutate.isPending}
                defaultActualFailure={r.recommended_failure}
                onSubmit={(v) =>
                  mutate.mutate({
                    id: r.id,
                    outcome: v.verdict === "correct" ? "confirmed" : v.verdict === "partial" ? "partial" : "incorrect",
                    actualFailure: v.actualFailure.trim() || null,
                    notes: v.notes.trim() || null,
                    partReplaced: v.partReplaced.trim() || null,
                    confirmingTest: v.confirmingTest.trim() || null,
                    repairSuccessful: v.repairSuccessful,
                    unusualNotes: v.unusualNotes.trim() || null,
                    nextstepVerdict: v.verdict,
                    photoPath: v.photoPath,
                  })
                }
                footer={
                  <Button variant="ghost" className="h-10 w-full" onClick={() => setOpenRowId(null)}>
                    Cancel
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-8 bg-emerald-500/90 hover:bg-emerald-500"
                disabled={mutate.isPending}
                onClick={() => setOpenRowId(r.id)}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Complete Repair
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}