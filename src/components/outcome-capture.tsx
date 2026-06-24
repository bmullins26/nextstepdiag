import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, HelpCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordOutcome } from "@/lib/diagnostic-outcomes.functions";

type Choice = "confirmed" | "incorrect" | "partial" | "pending_repair" | null;

export function OutcomeCapture({
  sessionId,
  manufacturer,
  modelNumber,
  applianceType,
  platform,
  complaint,
  recommendedFailure,
  onRecorded,
}: {
  sessionId: string | null;
  manufacturer: string;
  modelNumber: string;
  applianceType: string;
  platform?: string | null;
  complaint: string;
  recommendedFailure: string;
  onRecorded: (kind: Exclude<Choice, null>) => void;
}) {
  const record = useServerFn(recordOutcome);
  const [choice, setChoice] = useState<Choice>(null);
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Exclude<Choice, null> | null>(null);

  async function submit(outcome: Exclude<Choice, null>, extra?: { actualFailure?: string; notes?: string }) {
    setBusy(true);
    try {
      await record({
        data: {
          sessionId,
          manufacturer,
          modelNumber,
          applianceType,
          platform: platform ?? null,
          complaint,
          recommendedFailure,
          outcome,
          actualFailure: extra?.actualFailure ?? null,
          notes: extra?.notes ?? null,
        },
      });
      setDone(outcome);
      onRecorded(outcome);
      if (outcome === "confirmed") toast.success("Thanks! This helps improve future diagnostics.");
      else if (outcome === "pending_repair") toast.success("Repair outcome saved. You can confirm the result later.");
      else toast.success("Outcome recorded.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record outcome.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          {done === "confirmed" && "Confirmed — recorded as a successful repair."}
          {done === "incorrect" && "Recorded — actual failure logged for learning."}
          {done === "partial" && "Recorded — partial fix captured."}
          {done === "pending_repair" && "Saved as Pending Repair. Confirm the result later from History."}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
          Was this the actual failure?
        </div>
        <p className="mt-1 text-sm font-semibold">
          Likely Cause: <span className="text-primary">{recommendedFailure || "—"}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Confirming helps NextStep learn from your real repairs.
        </p>
      </div>

      {choice === null && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            onClick={() => submit("confirmed")}
            disabled={busy}
            className="h-12 w-full bg-emerald-500/90 text-white hover:bg-emerald-500"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Yes, This Fixed It
          </Button>
          <Button
            onClick={() => setChoice("incorrect")}
            disabled={busy}
            variant="outline"
            className="h-12 w-full"
          >
            <XCircle className="mr-2 h-4 w-4 text-destructive" />
            No, This Wasn't It
          </Button>
          <Button
            onClick={() => setChoice("partial")}
            disabled={busy}
            variant="outline"
            className="h-12 w-full"
          >
            <HelpCircle className="mr-2 h-4 w-4 text-amber-400" />
            Partially Correct
          </Button>
          <Button
            onClick={() => submit("pending_repair")}
            disabled={busy}
            variant="outline"
            className="h-12 w-full"
          >
            <Clock className="mr-2 h-4 w-4 text-sky-400" />
            Repair Pending
          </Button>
        </div>
      )}

      {choice === "incorrect" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What was the actual failure?
          </label>
          <Input
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder="e.g. Drain pump motor"
            className="h-11"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              onClick={() => submit("incorrect", { actualFailure: actual.trim() })}
              disabled={busy || !actual.trim()}
              className="h-11 flex-1"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="ghost" onClick={() => setChoice(null)} disabled={busy} className="h-11">Cancel</Button>
          </div>
        </div>
      )}

      {choice === "partial" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What else contributed?
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for future diagnoses…"
            className="min-h-24"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              onClick={() => submit("partial", { notes: notes.trim() })}
              disabled={busy || !notes.trim()}
              className="h-11 flex-1"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="ghost" onClick={() => setChoice(null)} disabled={busy} className="h-11">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}