import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, HelpCircle, ImagePlus, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type OutcomeFeedbackValue = {
  actualFailure: string;
  partReplaced: string;
  confirmingTest: string;
  repairSuccessful: boolean | null;
  unusualNotes: string;
  verdict: "correct" | "partial" | "incorrect";
  notes: string;
  photoPath: string | null;
};

/**
 * Three-step repair feedback: what was found, whether NextStep got it right,
 * and optional notes/photo. Shared by the diagnose screen and pending repairs.
 */
export function OutcomeFeedbackSteps({
  busy,
  defaultActualFailure,
  onSubmit,
  footer,
}: {
  busy: boolean;
  defaultActualFailure?: string;
  onSubmit: (value: OutcomeFeedbackValue) => void;
  footer?: ReactNode;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [actualFailure, setActualFailure] = useState(defaultActualFailure ?? "");
  const [partReplaced, setPartReplaced] = useState("");
  const [confirmingTest, setConfirmingTest] = useState("");
  const [repairSuccessful, setRepairSuccessful] = useState<boolean | null>(null);
  const [unusualNotes, setUnusualNotes] = useState("");
  const [verdict, setVerdict] = useState<OutcomeFeedbackValue["verdict"] | null>(null);
  const [notes, setNotes] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("You must be signed in to attach a photo.");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("repair-photos").upload(path, file, { upsert: false });
      if (error) throw error;
      setPhotoPath(path);
      toast.success("Photo attached (private).");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function finish(v: OutcomeFeedbackValue["verdict"]) {
    onSubmit({
      actualFailure,
      partReplaced,
      confirmingTest,
      repairSuccessful,
      unusualNotes,
      verdict: v,
      notes,
      photoPath,
    });
  }

  return (
    <div className="space-y-4">
      <StepHeader step={step} />

      {step === 1 && (
        <div className="space-y-3">
          <Field label="Actual failure *">
            <Input
              value={actualFailure}
              onChange={(e) => setActualFailure(e.target.value)}
              placeholder="e.g. Drain pump motor"
              className="h-11"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Part replaced">
              <Input value={partReplaced} onChange={(e) => setPartReplaced(e.target.value)} placeholder="Part number or name" className="h-11" />
            </Field>
            <Field label="Confirming test">
              <Input value={confirmingTest} onChange={(e) => setConfirmingTest(e.target.value)} placeholder="e.g. Ohmed pump — open" className="h-11" />
            </Field>
          </div>
          <Field label="Repair successful?">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={repairSuccessful === true ? "default" : "outline"}
                className="h-11 flex-1"
                onClick={() => setRepairSuccessful(true)}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={repairSuccessful === false ? "default" : "outline"}
                className="h-11 flex-1"
                onClick={() => setRepairSuccessful(false)}
              >
                No
              </Button>
            </div>
          </Field>
          <Field label="Anything unusual? (optional)">
            <Textarea value={unusualNotes} onChange={(e) => setUnusualNotes(e.target.value)} className="min-h-16" />
          </Field>
          <Button
            className="h-11 w-full"
            disabled={!actualFailure.trim() || busy}
            onClick={() => setStep(2)}
          >
            Continue
          </Button>
          {footer}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Did NextStep get it right?</p>
          <VerdictButton
            active={verdict === "correct"}
            onClick={() => { setVerdict("correct"); setStep(3); }}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            label="Yes — correct failure identified"
          />
          <VerdictButton
            active={verdict === "partial"}
            onClick={() => { setVerdict("partial"); setStep(3); }}
            icon={<HelpCircle className="h-4 w-4 text-amber-400" />}
            label="Partially — helped, actual failure differed"
          />
          <VerdictButton
            active={verdict === "incorrect"}
            onClick={() => { setVerdict("incorrect"); setStep(3); }}
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            label="No — recommendation was incorrect"
          />
          <Button variant="ghost" className="h-10 w-full" onClick={() => setStep(1)} disabled={busy}>
            Back
          </Button>
        </div>
      )}

      {step === 3 && verdict && (
        <div className="space-y-3">
          <Field label="Technician notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" placeholder="Anything future techs should know…" />
          </Field>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {photoPath ? "Photo attached" : "Attach photo (private)"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhoto(f);
                }}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button className="h-11 flex-1" disabled={busy} onClick={() => finish(verdict)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save outcome
            </Button>
            <Button variant="ghost" className="h-11" disabled={busy} onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepHeader({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["What did you find?", "Did NextStep get it right?", "Optional detail"];
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">Step {step} of 3</span>
      <span className="truncate">{labels[step - 1]}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function VerdictButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition ${
        active ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
