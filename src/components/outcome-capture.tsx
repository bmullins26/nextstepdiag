import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordOutcome } from "@/lib/diagnostic-outcomes.functions";
import { stitchOutcomeToInsights } from "@/lib/community.functions";
import { OutcomeFeedbackSteps, type OutcomeFeedbackValue } from "@/components/outcome-feedback-steps";
import { ShareRepairPanel } from "@/components/share-repair-panel";

type Kind = "confirmed" | "incorrect" | "partial" | "pending_repair";

/** Maps the technician's verdict onto the existing outcome vocabulary. */
function outcomeFromFeedback(v: OutcomeFeedbackValue): Kind {
  if (v.verdict === "correct") return "confirmed";
  if (v.verdict === "partial") return "partial";
  return "incorrect";
}

export function OutcomeCapture({
  sessionId,
  manufacturer,
  modelNumber,
  applianceType,
  platform,
  complaint,
  recommendedFailure,
  predictedFailures,
  predictedConfidence,
  testsPerformed,
  evidenceSnapshot,
  onRecorded,
}: {
  sessionId: string | null;
  manufacturer: string;
  modelNumber: string;
  applianceType: string;
  platform?: string | null;
  complaint: string;
  recommendedFailure: string;
  predictedFailures?: string[];
  predictedConfidence?: Record<string, unknown>;
  testsPerformed?: unknown[];
  evidenceSnapshot?: unknown[];
  onRecorded: (kind: Kind) => void;
}) {
  const record = useServerFn(recordOutcome);
  const stitch = useServerFn(stitchOutcomeToInsights);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Kind | null>(null);
  const [savedOutcomeId, setSavedOutcomeId] = useState<string | null>(null);
  const [saved, setSaved] = useState<OutcomeFeedbackValue | null>(null);

  async function save(outcome: Kind, v?: OutcomeFeedbackValue) {
    setBusy(true);
    try {
      const row = (await record({
        data: {
          sessionId,
          manufacturer,
          modelNumber,
          applianceType,
          platform: platform ?? null,
          complaint,
          recommendedFailure,
          outcome,
          actualFailure: v?.actualFailure?.trim() || null,
          notes: v?.notes?.trim() || null,
          partReplaced: v?.partReplaced?.trim() || null,
          confirmingTest: v?.confirmingTest?.trim() || null,
          repairSuccessful: v?.repairSuccessful ?? null,
          unusualNotes: v?.unusualNotes?.trim() || null,
          nextstepVerdict: v?.verdict ?? null,
          photoPath: v?.photoPath ?? null,
          // Snapshot of the recommendation the technician actually saw.
          predictedTopFailure: recommendedFailure || null,
          predictedFailures: predictedFailures ?? [],
          predictedConfidence: predictedConfidence ?? {},
          testsPerformed: testsPerformed ?? [],
          evidenceSnapshot: evidenceSnapshot ?? [],
        },
      })) as { id?: string } | null;

      if (sessionId && outcome !== "pending_repair") {
        try {
          await stitch({ data: { sessionId, finalOutcome: outcome } });
        } catch { /* non-fatal — feedback rows may not exist */ }
      }
      setSavedOutcomeId(row?.id ?? null);
      setSaved(v ?? null);
      setDone(outcome);
      onRecorded(outcome);
      toast.success(
        outcome === "pending_repair"
          ? "Repair outcome saved. You can confirm the result later."
          : "Thanks! This helps improve future diagnostics.",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record outcome.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            {done === "confirmed" && "Confirmed — recorded as a successful repair."}
            {done === "incorrect" && "Recorded — actual failure logged for learning."}
            {done === "partial" && "Recorded — partial match captured."}
            {done === "pending_repair" && "Saved as Pending Repair. Confirm the result later from History."}
          </div>
        </div>
        {done === "confirmed" && savedOutcomeId && (
          <ShareRepairPanel
            outcomeId={savedOutcomeId}
            brand={manufacturer}
            applianceType={applianceType}
            model={modelNumber}
            complaint={complaint}
            confirmedFailure={saved?.actualFailure?.trim() || recommendedFailure}
            partReplaced={saved?.partReplaced ?? null}
            confirmingTest={saved?.confirmingTest ?? null}
            onOpenComposer={(search) => navigate({ to: "/community/new", search: search as never })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Repair Outcome</div>
        <p className="mt-1 text-sm font-semibold">
          Likely Cause: <span className="text-primary">{recommendedFailure || "—"}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Takes about 30 seconds and makes future diagnostics sharper.
        </p>
      </div>

      <OutcomeFeedbackSteps
        busy={busy}
        defaultActualFailure={recommendedFailure}
        onSubmit={(v) => save(outcomeFromFeedback(v), v)}
        footer={
          <Button
            onClick={() => save("pending_repair")}
            disabled={busy}
            variant="outline"
            className="h-11 w-full"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4 text-sky-400" />}
            Repair Pending — finish later
          </Button>
        }
      />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <MessagesSquare className="h-3 w-3" /> Confirmed repairs can be shared with the Community afterwards.
      </p>
    </div>
  );
}
