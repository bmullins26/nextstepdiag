import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
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
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  nextDiagnosticStep,
  askDocumentQuestion,
} from "@/lib/diagnostics.functions";
import { VerifyAppliance, type DecodedAppliance } from "@/components/verify-appliance";

export const Route = createFileRoute("/diagnose")({
  head: () => ({
    meta: [
      { title: "Diagnose — NextStep Diagnostics" },
      { name: "description", content: "Guided appliance diagnostic session." },
    ],
  }),
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
}) {
  const { appliance, complaint, setComplaint, onBack, onStart } = props;
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
}) {
  const { appliance, complaint, history, step, thinking, freeText, setFreeText, answerWith } = props;
  return (
    <section className="space-y-5">
      <SectionHead step="STEP 3" title="Guided diagnosis" />
      <ApplianceChip appliance={appliance} />
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Complaint</div>
        <p className="mt-1 text-sm">{complaint}</p>
      </div>

      {step && (
        <div className="grid grid-cols-1 gap-3">
          <FindingCard label="Current Findings" value={step.currentFindings} accent="muted" />
          <FindingCard label="Most Likely Failure" value={step.mostLikelyFailure || "Gathering evidence…"} accent="primary" />
          <FindingCard label="Recommended Next Test" value={step.recommendedNextTest || "—"} accent="secondary" />
        </div>
      )}

      <div className="rounded-2xl border border-primary/40 bg-card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {step?.done ? "Diagnosis Complete" : `Question ${history.length + 1}`}
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

      {history.length > 0 && (
        <details className="rounded-2xl border border-border bg-card/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Questions Answered ({history.length})
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">Q{i + 1}: {h.question}</div>
                <div className="font-semibold text-primary">→ {h.answer}</div>
              </li>
            ))}
          </ol>
        </details>
      )}
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