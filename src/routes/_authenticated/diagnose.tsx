import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Upload,
  X,
} from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  nextDiagnosticStep,
  askDocumentQuestion,
} from "@/lib/diagnostics.functions";
import { VerifyAppliance, type DecodedAppliance } from "@/components/verify-appliance";
import {
  upsertSession,
  getSession,
  listSessions,
  setSessionStatus,
} from "@/lib/sessions.functions";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/diagnose")({
  head: () => ({
    meta: [
      { title: "Diagnose — NextStep Diagnostics" },
      { name: "description", content: "Guided appliance diagnostic session." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ session: z.string().uuid().optional() }).parse(s),
  component: DiagnosePage,
});

type Appliance = DecodedAppliance;

type QA = { question: string; answer: string };

type Step = {
  done: boolean;
  currentFindings: string;
  mostLikelyFailure: string;
  mostLikelyFailures?: string[];
  recommendedNextTest: string;
  nextQuestion: { text: string; choices: string[]; allowFreeText: boolean };
};

function DiagnosePage() {
  const [phase, setPhase] = useState<1 | 2 | 3>(1);

  // Step 1
  const [appliance, setAppliance] = useState<Appliance | null>(null);

  // Step 2
  const [complaint, setComplaint] = useState("");

  // Step 3
  const [history, setHistory] = useState<QA[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [thinking, setThinking] = useState(false);
  const [freeText, setFreeText] = useState("");
  const next = useServerFn(nextDiagnosticStep);

  // Current Findings (things the tech has already verified before/during the call)
  const [findings, setFindings] = useState<string[]>([]);

  // Document
  const [docText, setDocText] = useState("");
  const [docName, setDocName] = useState("");
  const [docOpen, setDocOpen] = useState(false);
  const [docQ, setDocQ] = useState("");
  const [docA, setDocA] = useState("");
  const [docAsking, setDocAsking] = useState(false);
  const askDoc = useServerFn(askDocumentQuestion);
  const fileRef = useRef<HTMLInputElement>(null);

  async function startDiagnosis() {
    if (!complaint.trim()) {
      toast.error("Describe the customer complaint to begin.");
      return;
    }
    setPhase(3);
    await advance([], findings);
  }

  async function advance(h: QA[], f: string[] = findings) {
    if (!appliance) return;
    setThinking(true);
    try {
      const r = await next({
        data: {
          appliance: {
            manufacturer: appliance.manufacturer || appliance.brand,
            applianceType: appliance.applianceType,
            modelNumber: appliance.modelNumber,
            serialNumber: appliance.serialNumber,
            manufactureYear: appliance.manufactureDate?.year,
            ageYears: appliance.ageYears,
          },
          complaint,
          history: h,
          documentExcerpt: docText,
          currentFindings: f,
        },
      });
      setStep(r as Step);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Diagnostic engine error.");
    } finally {
      setThinking(false);
    }
  }

  async function answerWith(answer: string) {
    if (!step?.nextQuestion.text || !answer.trim()) return;
    const h = [...history, { question: step.nextQuestion.text, answer: answer.trim() }];
    setHistory(h);
    setFreeText("");
    await advance(h);
  }

  async function goBackOneQuestion() {
    if (history.length === 0) return;
    const h = history.slice(0, -1);
    setHistory(h);
    await advance(h);
  }

  async function rewindTo(index: number) {
    const h = history.slice(0, index);
    setHistory(h);
    await advance(h);
  }

  function resetAll() {
    setPhase(1);
    setAppliance(null);
    setComplaint("");
    setHistory([]);
    setStep(null);
    setDocText("");
    setDocName("");
    setFindings([]);
  }

  async function onFile(file: File) {
    const text = await file.text().catch(() => "");
    setDocText(text.slice(0, 20000));
    setDocName(file.name);
    toast.success(`Loaded ${file.name}`);
  }

  async function handleAskDoc() {
    if (!docQ.trim() || !appliance) return;
    setDocAsking(true);
    setDocA("");
    try {
      const r = await askDoc({
        data: {
          appliance: {
            manufacturer: appliance.manufacturer || appliance.brand,
            applianceType: appliance.applianceType,
            modelNumber: appliance.modelNumber,
            serialNumber: appliance.serialNumber,
          },
          complaint: complaint || "(none yet)",
          history,
          documentExcerpt: docText,
          question: docQ,
        },
      });
      setDocA(r.answer);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Document question failed.");
    } finally {
      setDocAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <span className="text-sm font-bold tracking-tight">NextStep</span>
          </div>
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
        <StepBar phase={phase} />
      </header>

      <div className="mx-auto max-w-md px-4 pb-32 pt-5">
        {phase === 1 && (
          <section className="space-y-5">
            <SectionHead step="STEP 1" title="Verify the appliance" />
            <VerifyAppliance
              onConfirm={(a) => {
                setAppliance(a);
                setPhase(2);
              }}
            />
          </section>
        )}

        {phase === 2 && appliance && (
          <Phase2
            appliance={appliance}
            complaint={complaint}
            setComplaint={setComplaint}
            onBack={() => setPhase(1)}
            onStart={startDiagnosis}
            findings={findings}
            setFindings={setFindings}
          />
        )}

        {phase === 3 && appliance && (
          <Phase3
            appliance={appliance}
            complaint={complaint}
            history={history}
            step={step}
            thinking={thinking}
            freeText={freeText}
            setFreeText={setFreeText}
            answerWith={answerWith}
            findings={findings}
            setFindings={setFindings}
            onReevaluate={() => advance(history)}
            onPrevious={goBackOneQuestion}
            onRewindTo={rewindTo}
          />
        )}

        {phase >= 2 && appliance && (
          <DocPanel
            open={docOpen}
            setOpen={setDocOpen}
            docName={docName}
            docText={docText}
            fileRef={fileRef}
            onFile={onFile}
            docQ={docQ}
            setDocQ={setDocQ}
            docA={docA}
            docAsking={docAsking}
            handleAskDoc={handleAskDoc}
          />
        )}
      </div>
    </main>
  );
}

function StepBar({ phase }: { phase: number }) {
  const items = ["Verify", "Complaint", "Diagnose"];
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-3">
      {items.map((label, i) => {
        const idx = i + 1;
        const active = phase === idx;
        const done = phase > idx;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx}
            </div>
            <span className={`text-xs ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
            {i < items.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Phase2(props: {
  appliance: Appliance; complaint: string; setComplaint: (v: string) => void;
  onBack: () => void; onStart: () => void;
  findings: string[]; setFindings: (f: string[]) => void;
}) {
  const { appliance, complaint, setComplaint, onBack, onStart, findings, setFindings } = props;
  const { listening, supported, toggle } = useDictation((t) =>
    setComplaint(complaint ? `${complaint} ${t}` : t),
  );
  const examples = [
    "Washer fills and drains but will not spin.",
    "Refrigerator freezer is cold but fresh food section is warm.",
    "Dryer tumbles but does not heat.",
  ];
  return (
    <section className="space-y-5">
      <SectionHead step="STEP 2" title="Customer complaint" />
      <ApplianceChip appliance={appliance} />
      <CurrentFindings findings={findings} setFindings={setFindings} />
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Label htmlFor="complaint" className="text-sm">In the customer's words</Label>
        <Textarea
          id="complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Describe the symptom the customer reports…"
          className="min-h-32 text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={toggle}
            disabled={!supported}
            className="h-11 flex-1"
          >
            {listening ? <><MicOff className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Voice Input</>}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} className="h-11">Back</Button>
        </div>
        {!supported && (
          <p className="text-xs text-muted-foreground">Voice input not available on this browser.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples</p>
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => setComplaint(ex)}
            className="block w-full rounded-xl border border-border bg-card/60 p-3 text-left text-sm hover:border-primary/60"
          >
            {ex}
          </button>
        ))}
      </div>

      <Button onClick={onStart} className="h-14 w-full text-base font-bold">
        Start Diagnosis <Send className="ml-2 h-4 w-4" />
      </Button>
    </section>
  );
}

function Phase3(props: {
  appliance: Appliance; complaint: string;
  history: QA[]; step: Step | null; thinking: boolean;
  freeText: string; setFreeText: (v: string) => void;
  answerWith: (a: string) => void;
  findings: string[]; setFindings: (f: string[]) => void;
  onReevaluate: () => void;
  onPrevious: () => void;
  onRewindTo: (index: number) => void;
}) {
  const { appliance, complaint, history, step, thinking, freeText, setFreeText, answerWith, findings, setFindings, onReevaluate, onPrevious, onRewindTo } = props;
  const failures = step?.mostLikelyFailures && step.mostLikelyFailures.length > 0
    ? step.mostLikelyFailures
    : step?.mostLikelyFailure ? [step.mostLikelyFailure] : [];
  return (
    <section className="space-y-5">
      <SectionHead step="STEP 3" title="Guided diagnosis" />
      <ApplianceChip appliance={appliance} />
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Complaint</div>
        <p className="mt-1 text-sm">{complaint}</p>
      </div>

      <CurrentFindings findings={findings} setFindings={setFindings} onChange={onReevaluate} />

      {history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Questions Answered ({history.length})
          </div>
          <ol className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Q{i + 1}: {h.question}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-primary">→ {h.answer}</div>
                  <button
                    onClick={() => onRewindTo(i)}
                    className="text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {step && (
        <div className="grid grid-cols-1 gap-3">
          <FindingCard label="Diagnostic Summary" value={step.currentFindings} accent="muted" />
          <div className="rounded-xl border border-primary/50 bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Most Likely Failures</div>
            {failures.length > 0 ? (
              <ol className="mt-2 space-y-1.5">
                {failures.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm font-semibold leading-snug">
                    <span className="text-primary">{i + 1}.</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Gathering evidence…</p>
            )}
          </div>
          <FindingCard label="Recommended Next Test" value={step.recommendedNextTest || "—"} accent="secondary" />
        </div>
      )}

      <div className="rounded-2xl border border-primary/40 bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {step?.done ? "Diagnosis Complete" : `Question ${history.length + 1}`}
          </div>
          {history.length > 0 && !thinking && (
            <button
              onClick={onPrevious}
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Previous Question
            </button>
          )}
        </div>
        {thinking ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Senior tech thinking…
          </div>
        ) : step?.done ? (
          <p className="mt-2 text-base font-semibold">
            You've isolated the failure. Proceed with the recommended next test above.
          </p>
        ) : step ? (
          <>
            <p className="mt-2 text-lg font-bold leading-snug">{step.nextQuestion.text}</p>
            <div className="mt-4 space-y-2">
              {step.nextQuestion.choices.map((c) => (
                <button
                  key={c}
                  onClick={() => answerWith(c)}
                  className="block w-full rounded-xl border border-border bg-background/40 p-4 text-left text-base font-semibold transition hover:border-primary hover:bg-primary/10"
                >
                  {c}
                </button>
              ))}
              {step.nextQuestion.allowFreeText && (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Measured value or note…"
                    className="h-12"
                  />
                  <Button onClick={() => answerWith(freeText)} disabled={!freeText.trim()} className="h-12">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function DocPanel(props: {
  open: boolean; setOpen: (v: boolean) => void;
  docName: string; docText: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  docQ: string; setDocQ: (v: string) => void; docA: string; docAsking: boolean; handleAskDoc: () => void;
}) {
  const { open, setOpen, docName, docText, fileRef, onFile, docQ, setDocQ, docA, docAsking, handleAskDoc } = props;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
      <div className="rounded-2xl border border-border bg-card/95 shadow-[0_-10px_30px_rgba(0,0,0,0.4)] backdrop-blur">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            {docName ? `Tech Sheet: ${docName}` : "Upload Tech Sheet or Wiring Diagram"}
          </div>
          <span className="text-xs text-muted-foreground">{open ? "Hide" : "Optional"}</span>
        </button>
        {open && (
          <div className="space-y-3 border-t border-border p-4">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.html,.htm,.pdf,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> {docName ? "Replace document" : "Choose file"}
            </Button>
            {docText && (
              <>
                <p className="text-xs text-muted-foreground">
                  {docText.length.toLocaleString()} chars loaded — used to ground diagnostics.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Ask about this document</Label>
                  <div className="flex gap-2">
                    <Input
                      value={docQ}
                      onChange={(e) => setDocQ(e.target.value)}
                      placeholder="e.g. What resistance should the drain pump read?"
                      className="h-11"
                    />
                    <Button onClick={handleAskDoc} disabled={docAsking || !docQ.trim()} className="h-11">
                      {docAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {docA && (
                    <p className="rounded-lg border border-border bg-background/40 p-3 text-sm">{docA}</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHead({ step, title }: { step: string; title: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">{step}</div>
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-semibold">{v}</span>
    </div>
  );
}

function FindingCard({ label, value, accent }: { label: string; value: string; accent: "primary" | "secondary" | "muted" }) {
  const ring =
    accent === "primary" ? "border-primary/50" : accent === "secondary" ? "border-secondary/60" : "border-border";
  const tag =
    accent === "primary" ? "text-primary" : accent === "secondary" ? "text-secondary" : "text-muted-foreground";
  return (
    <div className={`rounded-xl border ${ring} bg-card p-4`}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${tag}`}>{label}</div>
      <p className="mt-1 text-sm font-semibold leading-snug">{value}</p>
    </div>
  );
}

function ApplianceChip({ appliance }: { appliance: Appliance }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2.5 text-xs">
      <div>
        <div className="font-bold text-foreground">{appliance.manufacturer || appliance.brand} · {appliance.applianceType}</div>
        <div className="text-muted-foreground">Model {appliance.modelNumber}{appliance.serialNumber ? ` · S/N ${appliance.serialNumber}` : ""}</div>
      </div>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{appliance.confidence}</span>
    </div>
  );
}

const FINDING_SUGGESTIONS = [
  "120 VAC Verified",
  "240 VAC Verified",
  "Control Board Receiving Power",
  "Drain Pump Runs",
  "No Fault Codes Present",
  "Lid Lock Tested Good",
  "Thermistor Tested Good",
  "Heater Tested Good",
  "Compressor Running",
  "Capacitor Tested Good",
  "Motor Windings Test Good",
];

function CurrentFindings({
  findings,
  setFindings,
  onChange,
}: {
  findings: string[];
  setFindings: (f: string[]) => void;
  onChange?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  function commitAdd(value: string) {
    const v = value.trim();
    if (!v) return;
    if (findings.includes(v)) {
      toast.error("Already in findings.");
      return;
    }
    setFindings([...findings, v]);
    setDraft("");
    setAdding(false);
  }

  function remove(i: number) {
    setFindings(findings.filter((_, idx) => idx !== i));
    onChange?.();
  }

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditText(findings[i]);
  }

  function commitEdit() {
    if (editingIdx === null) return;
    const v = editText.trim();
    if (!v) return;
    const copy = [...findings];
    copy[editingIdx] = v;
    setFindings(copy);
    setEditingIdx(null);
    setEditText("");
    onChange?.();
  }

  const unusedSuggestions = FINDING_SUGGESTIONS.filter((s) => !findings.includes(s));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-secondary">
          Current Findings
        </div>
        <span className="text-[10px] uppercase text-muted-foreground">
          {findings.length} verified
        </span>
      </div>

      {findings.length === 0 && !adding && (
        <p className="mt-2 text-xs text-muted-foreground">
          Add anything you've already verified — voltage, fault codes, component tests.
        </p>
      )}

      {findings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {findings.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
            >
              {editingIdx === i ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") {
                        setEditingIdx(null);
                        setEditText("");
                      }
                    }}
                    className="h-9 flex-1"
                  />
                  <button
                    onClick={commitEdit}
                    className="text-xs font-semibold text-primary"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 font-semibold">{f}</span>
                  <button
                    onClick={() => startEdit(i)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit finding"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove finding"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitAdd(draft);
                  onChange?.();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="e.g. F7E1 Fault Code Present"
              className="h-10 flex-1"
            />
            <Button
              onClick={() => {
                commitAdd(draft);
                onChange?.();
              }}
              disabled={!draft.trim()}
              className="h-10"
            >
              Add
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="h-10"
            >
              Cancel
            </Button>
          </div>
          {unusedSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    commitAdd(s);
                    onChange?.();
                  }}
                  className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] hover:border-primary hover:text-primary"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
        >
          <Plus className="h-3.5 w-3.5" /> Add Finding
        </button>
      )}
    </div>
  );
}

// --- Web Speech API dictation ---
function useDictation(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  function toggle() {
    if (!supported) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      onText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  return { listening, supported, toggle };
}